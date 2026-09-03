/**
 * lib/ocr/ServicioOcr.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CAPA DE APLICACIÓN / SERVICIO: coordinador de la extracción OCR.
 *
 * Este servicio es el corazón de la FASE 1. Conecta:
 *  - Un motor OCR abstracto (MotorOcr → TesseractOcr).
 *  - El cache en IndexedDB (storageManager).
 *  - La cola de prioridad (actual → siguiente → anterior).
 *  - El texto manual prioritario para cuentos oficiales.
 *  - La protección contra condiciones de carrera.
 *
 * La UI (PantallaLector / hooks) NUNCA llama a Tesseract directamente:
 * siempre pasa por este servicio, que a su vez habla con la interfaz
 * `MotorOcr`.
 *
 * ESTRATEGIA DE PRECARGA:
 *  - Cuando el niño está en la página N:
 *      1. Página N (prioridad: actual) se OCR lo antes posible.
 *      2. Página N+1 (prioridad: siguiente) cuando quede libre el worker.
 *      3. Página N-1 (prioridad: anterior) si resulta útil.
 *  - NO se procesa todo el libro: la cola solo contiene las páginas
 *    cercanas a la actual. Un libro de muchas páginas no bloquea.
 *
 * CONDICIONES DE CARRERA:
 *  - Cada tarea captura la `generacion` vigente al encolarse.
 *  - `cambiarLibro()` incrementa la generación y descarta la cola.
 *  - Si una tarea en vuelo termina con una generación distinta a la
 *    actual (cambió el libro), su resultado se guarda en cache pero su
 *    callback NO se dispara → nunca contamina la UI del nuevo libro.
 *  - El lector, además, solo aplica resultados de la página que está
 *    mostrando ahora (el resultado de la página 4 no sustituye el
 *    estado de la 5 aunque llegue después).
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  VERSION_PROCESADOR_OCR,
  type MotorOcr,
  type PrioridadOcr,
  type ResultadoOcrPagina,
} from '../../types/ocr';
import { limpiarTextoCuento } from './limpiarTextoCuento';
import { guardarOcrCache, obtenerOcrCache } from '../storageManager';

/** Orden numérico de las prioridades (menor = mayor prioridad). */
const ORDEN_PRIORIDAD: Record<PrioridadOcr, number> = {
  actual: 0,
  siguiente: 1,
  anterior: 2,
  background: 3,
};

/**
 * Proveedor de imagen de una página para OCR.
 * El servicio no sabe renderizar PDFs: recibe una función que devuelve
 * la Data URL de la página (renderizada a resolución adecuada para OCR)
 * o `null` si no se pudo renderizar. Esto desacopla el servicio de pdfjs.
 */
export type ProveedorImagenPagina = () => Promise<string | null>;

/** Una tarea dentro de la cola. */
interface TareaCola {
  libroId: string;
  pagina: number;
  prioridad: number;
  generacion: number;
  proveedorImagen: ProveedorImagenPagina;
}

/** Callbacks que el consumidor (hook) registra en el servicio. */
export interface CallbacksServicioOcr {
  /** Se dispara cuando una página tiene texto OCR (o manual) disponible. */
  onResultadoOcr: (resultado: ResultadoOcrPagina) => void;
}

/**
 * Servicio coordinador de OCR. Se instancia UNA vez por lector (hook)
 * y se destruye al desmontar, liberando el worker de Tesseract.
 */
export class ServicioOcr {
  private readonly motor: MotorOcr;
  private readonly idioma: string;
  private readonly callbacks: CallbacksServicioOcr;

  private inicializado = false;
  private generacionGlobal = 0;
  private libroActivo: string | null = null;

  /** Cola de tareas pendientes, deduplicada por `${libroId}:${pagina}`. */
  private cola = new Map<string, TareaCola>();

  /** Texto manual priorizado por `${libroId}:${pagina}` (cuentos oficiales). */
  private textosManuales = new Map<string, string>();

  private procesando = false;

  constructor(motor: MotorOcr, callbacks: CallbacksServicioOcr, idioma = 'spa') {
    this.motor = motor;
    this.callbacks = callbacks;
    this.idioma = idioma;
  }

  /**
   * Establece el texto manual revisado para una página de un cuento
   * oficial. Tiene PRIORIDAD sobre cache y OCR: si existe, se usa tal
   * cual. FASE 1 solo deja la arquitectura lista; aún no hay
   * transcripciones cargadas.
   */
  establecerTextoManual(libroId: string, pagina: number, texto: string): void {
    this.textosManuales.set(`${libroId}:${pagina}`, texto);
  }

  /**
   * Marca el libro activo y limpia la cola del libro anterior.
   * Debe llamarse al abrir un libro (o al cambiar de libro).
   */
  cambiarLibro(libroId: string): void {
    this.generacionGlobal += 1;
    this.libroActivo = libroId;
    this.cola.clear();
    // Los textos manuales se conservan (son datos del cuento, no estado
    // transitorio), pero las tareas de OCR del libro anterior se descartan.
  }

  /**
   * Encola (o actualiza) una página para OCR con su prioridad.
   *
   * - Si la página ya está en la cola, solo se refina su prioridad
   *   (subimos la suya si la nueva es más alta). No duplica trabajo.
   * - El `proveedorImagen` se invoca SOLO cuando a la tarea le toca
   *   procesarse (renderizado perezoso), evitando renderizar páginas
   *   que quizá nunca lleguen a procesarse.
   */
  solicitarPagina(
    libroId: string,
    pagina: number,
    prioridad: PrioridadOcr,
    proveedorImagen: ProveedorImagenPagina
  ): void {
    // Solo encolamos trabajo del libro activo.
    if (this.libroActivo !== null && this.libroActivo !== libroId) return;

    const clave = `${libroId}:${pagina}`;
    const prioridadNum = ORDEN_PRIORIDAD[prioridad];
    const existente = this.cola.get(clave);

    if (existente) {
      // Refinamos prioridad si la nueva petición es más urgente.
      if (prioridadNum < existente.prioridad) {
        existente.prioridad = prioridadNum;
        existente.proveedorImagen = proveedorImagen;
      }
      return;
    }

    this.cola.set(clave, {
      libroId,
      pagina,
      prioridad: prioridadNum,
      generacion: this.generacionGlobal,
      proveedorImagen,
    });

    void this.procesarCola();
  }

  /**
   * Limpia el estado transitorio sin destruir el worker. Se llama al
   * desmontar el lector: se descarta la cola y se incrementa la
   * generación para que cualquier tarea en vuelo no dispare callbacks.
   */
  limpiar(): void {
    this.generacionGlobal += 1;
    this.libroActivo = null;
    this.cola.clear();
  }

  /**
   * Destruye el servicio: libera el worker de Tesseract y todo el
   * estado. Seguro llamar varias veces. Se llama al desmontar el lector.
   */
  async destruir(): Promise<void> {
    this.limpiar();
    this.inicializado = false;
    await this.motor.destruir();
  }

  /* ── Procesamiento de la cola ─────────────────────────────────────── */

  /** Procesa la cola de forma serial (un OCR a la vez). */
  private async procesarCola(): Promise<void> {
    if (this.procesando) return;
    this.procesando = true;

    try {
      // Bucle: mientras haya tareas, tomamos la de mayor prioridad.
      while (this.cola.size > 0) {
        const tarea = this.extraerSiguiente();
        if (!tarea) break;
        await this.procesarTarea(tarea);
      }
    } finally {
      this.procesando = false;
    }
  }

  /** Devuelve y quita de la cola la tarea de mayor prioridad. */
  private extraerSiguiente(): TareaCola | null {
    let mejor: TareaCola | null = null;
    let mejorClave = '';
    for (const [clave, tarea] of this.cola) {
      if (!mejor || tarea.prioridad < mejor.prioridad) {
        mejor = tarea;
        mejorClave = clave;
      }
    }
    if (mejor) this.cola.delete(mejorClave);
    return mejor;
  }

  /** Procesa una única tarea (manual → cache → OCR). */
  private async procesarTarea(tarea: TareaCola): Promise<void> {
    const clave = `${tarea.libroId}:${tarea.pagina}`;

    // 1. TEXTO MANUAL PRIORITARIO (cuentos oficiales revisados).
    const manual = this.textosManuales.get(clave);
    if (manual !== undefined) {
      const resultado = this.construirResultado(
        tarea.libroId,
        tarea.pagina,
        manual,
        null
      );
      await this.entregarResultado(resultado, tarea.generacion);
      return;
    }

    // 2. CACHE (evita repetir OCR costoso sobre páginas ya procesadas).
    const cacheado = await obtenerOcrCache(
      tarea.libroId,
      tarea.pagina,
      VERSION_PROCESADOR_OCR
    );
    if (cacheado) {
      await this.entregarResultado(cacheado, tarea.generacion);
      return;
    }

    // 3. OCR real (solo si hace falta).
    await this.ejecutarOcr(tarea);
  }

  /** Ejecuta el OCR real sobre la página. */
  private async ejecutarOcr(tarea: TareaCola): Promise<void> {
    try {
      await this.asegurarInicializado();

      // Renderizado perezoso: obtenemos la imagen SOLO ahora.
      const imagen = await tarea.proveedorImagen();
      if (imagen === null) {
        // No se pudo renderizar (p. ej. documento ya destruido). No es
        // un error fatal: simplemente no hay OCR para esta página.
        return;
      }

      const crudo = await this.motor.extraerTexto(imagen);

      const resultado: ResultadoOcrPagina = {
        libroId: tarea.libroId,
        pagina: tarea.pagina,
        textoBruto: crudo.textoBruto,
        textoLimpio: crudo.textoLimpio,
        confianza: crudo.confianza,
        tieneTexto: crudo.tieneTexto,
        fechaProcesamiento: new Date().toISOString(),
        versionProcesador: VERSION_PROCESADOR_OCR,
      };

      // Guardamos en cache SIEMPRE (aunque el libro ya no esté activo,
      // el resultado sigue siendo válido para la próxima vez).
      await guardarOcrCache(resultado);

      // Solo entregamos (callback) si la generación sigue vigente.
      await this.entregarResultado(resultado, tarea.generacion);
    } catch (error) {
      console.warn(
        `[ServicioOcr] Error en OCR de ${tarea.libroId}:${tarea.pagina}:`,
        error
      );
      // No propagamos: un fallo de OCR no debe romper la lectura.
    }
  }

  /**
   * Entrega un resultado al consumidor, PERO solo si la generación
   * capturada por la tarea sigue siendo la vigente. Esto impide que el
   * resultado de un libro anterior (o de una cola ya limpiada) dispare
   * callbacks sobre la UI del libro actual.
   */
  private async entregarResultado(
    resultado: ResultadoOcrPagina,
    generacionCapturada: number
  ): Promise<void> {
    if (generacionCapturada !== this.generacionGlobal) return;
    if (this.libroActivo !== null && this.libroActivo !== resultado.libroId) return;
    this.callbacks.onResultadoOcr(resultado);
  }

  /** Asegura que el motor OCR esté inicializado (carga idioma español). */
  private async asegurarInicializado(): Promise<void> {
    if (this.inicializado) return;
    await this.motor.inicializar(this.idioma);
    this.inicializado = true;
  }

  /** Construye un ResultadoOcrPagina a partir de un texto. */
  private construirResultado(
    libroId: string,
    pagina: number,
    textoBruto: string,
    confianza: number | null
  ): ResultadoOcrPagina {
    const textoLimpio = limpiarTextoCuento(textoBruto);
    return {
      libroId,
      pagina,
      textoBruto,
      textoLimpio,
      confianza,
      tieneTexto: textoLimpio.trim().length > 0,
      fechaProcesamiento: new Date().toISOString(),
      versionProcesador: VERSION_PROCESADOR_OCR,
    };
  }
}
