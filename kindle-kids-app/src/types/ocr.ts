/**
 * types/ocr.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CAPA DE DOMINIO: contratos de la capa OCR.
 *
 * Define los tipos para extracción de texto de páginas de cuentos
 * infantiles renderizadas como imagen. Estos tipos son consumidos por:
 *  - El motor OCR abstracto (MotorOcr)
 *  - La implementación concreta (TesseractOcr)
 *  - El hook de narración (usarNarradorCuento)
 *  - El servicio de narración (ServicioNarracion)
 *
 * Diseñado para soportar:
 *  - OCR en tiempo real (página actual)
 *  - Precarga en background (página siguiente)
 *  - Texto manual revisado (cuentos oficiales)
 *  - Cache en IndexedDB con invalidación por versión
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Resultado del OCR para una página concreta del libro.
 *
 * `textoBruto`: texto tal cual lo devuelve Tesseract.js, sin normalizar.
 * `textoLimpio`: texto tras pasar por limpiarTextoCuento().
 * `confianza`: valor 0-100 de la confianza de Tesseract (null si no disponible).
 * `tieneTexto`: booleano rápido para saber si hay contenido narrable.
 *   Une `textoLimpio.length > 0` en un solo campo para consumidores.
 */
export interface ResultadoOcrPagina {
  libroId: string;
  pagina: number;
  textoBruto: string;
  textoLimpio: string;
  confianza: number | null;
  tieneTexto: boolean;
  fechaProcesamiento: string;
  versionProcesador: number;
}

/**
 * Prioridad de una tarea OCR en la cola.
 *
 * `actual`: la página que el usuario está viendo ahora.
 * `siguiente`: la página que probablemente pedirá a continuación.
 * `anterior`: la página que acaba de dejar (útil para volver rápido).
 * `background`: precarga de páginas lejanas (futuro).
 */
export type PrioridadOcr = 'actual' | 'siguiente' | 'anterior' | 'background';

/**
 * Estado de una tarea en la cola OCR.
 */
export type EstadoTareaOcr =
  | 'pendiente'
  | 'en_proceso'
  | 'completada'
  | 'error';

/**
 * Una tarea de OCR en la cola.
 */
export interface TareaOcr {
  libroId: string;
  pagina: number;
  prioridad: PrioridadOcr;
  estado: EstadoTareaOcr;
  imagenDataUrl: string | null;
  resultado: ResultadoOcrPagina | null;
  error: string | null;
}

/**
 * Resultado "crudo" del motor OCR: el texto sin limpiar, el texto
 * limpiado, y la confianza. No incluye `libroId`/`pagina` porque el
 * motor OCR no conoce esos datos (pertenecen al contexto del libro);
 * el coordinador (servicio/hook) los añade al construir el
 * `ResultadoOcrPagina` final.
 */
export interface ResultadoOcrCrudo {
  textoBruto: string;
  textoLimpio: string;
  confianza: number | null;
  tieneTexto: boolean;
}

/**
 * Interfaz abstracta del motor OCR.
 *
 * Cualquier implementación futura (Tesseract.js, otro motor, etc.)
 * debe cumplir este contrato.
 *
 * La aplicación NUNCA debe llamar directamente a Tesseract.js;
 * siempre pasará por esta interfaz.
 */
export interface MotorOcr {
  /** Nombre legible del motor (para debugging). */
  readonly nombre: string;

  /**
   * Inicializa el motor con el idioma especificado.
   * Puede tardar (carga de modelos). Seguro llamar múltiples veces.
   */
  inicializar(idioma: string): Promise<void>;

  /**
   * Extrae texto de una imagen Data URL.
   * Devuelve el resultado crudo (texto bruto + limpio).
   */
  extraerTexto(
    imagenDataUrl: string,
    opciones?: OpcionesOcr
  ): Promise<ResultadoOcrCrudo>;

  /**
   * Libera recursos del worker/motor.
   * Llamar al cerrar el lector o al cambiar de idioma.
   */
  destruir(): Promise<void>;
}

/**
 * Opciones opcionales para el OCR.
 */
export interface OpcionesOcr {
  /** Idioma override (si no se usa el configurado al inicializar). */
  idioma?: string;
  /** Callback de progreso (0-100). */
  onProgreso?: (progreso: number) => void;
}

/**
 * Versión del procesador OCR actual.
 *
 * Se usa para invalidar el cache cuando mejoramos el algoritmo.
 * Incrementar este número invalida TODO el OCR cacheado anterior.
 *
 * Actual: 1 — Tesseract.js v7, preprocesamiento básico.
 */
export const VERSION_PROCESADOR_OCR = 1;
