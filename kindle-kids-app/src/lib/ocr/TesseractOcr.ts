/**
 * lib/ocr/TesseractOcr.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CAPA DE INFRAESTRUCTURA: implementación concreta del motor OCR con
 * Tesseract.js.
 *
 * RESPONSABILIDADES:
 *  1. Gestionar UN worker reutilizable de Tesseract (no se crea un
 *     worker nuevo por página). `createWorker` de Tesseract.js crea su
 *     propio Web Worker internamente, por lo que el OCR pesado corre
 *     FUERA del hilo principal de React (la UI sigue respondiendo).
 *  2. Cargar el modelo de idioma español ('spa') una sola vez.
 *  3. Preprocesar la imagen (aumentar resolución / grises / contraste)
 *     sobre una COPIA, sin tocar la imagen que ve el usuario.
 *  4. Devolver el resultado crudo (textoBruto + textoLimpio + confianza).
 *  5. Permitir `destruir()` para liberar el worker al cerrar el lector.
 *
 * La UI NUNCA importa tesseract.js directamente: solo a través de la
 * interfaz `MotorOcr`.
 *
 * ─── FASE 1.5 · OCR 100% OFFLINE ─────────────────────────────────────────
 * Todo el runtime de Tesseract.js (worker, core WASM y datos de idioma)
 * está empaquetado localmente bajo `public/tesseract/`. workerPath,
 * corePath y langPath apuntan a recursos del MISMO ORIGEN, por lo que el
 * OCR funciona sin conexión y puede empaquetarse en APK/PWA. NO hay
 * dependencia de CDN (jsdelivr/unpkg/GitHub/Naptha/Hugging Face). Si los
 * recursos locales no están disponibles, NO se cae a CDN: se devuelve el
 * error controlado OCR_RECURSO_LOCAL_NO_DISPONIBLE.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { preprocesarImagen } from './preprocesarImagen';
import { limpiarTextoCuento } from './limpiarTextoCuento';
import type { MotorOcr, OpcionesOcr, ResultadoOcrCrudo } from '../../types/ocr';

/**
 * Tipo del worker de Tesseract. Se importa SOLO como tipo (borrado en
 * tiempo de compilación): el código real de tesseract.js se carga con
 * un `import()` dinámico dentro de `inicializar()`. Esto hace que Vite
 * emita Tesseract en un chunk aparte que solo se descarga cuando el OCR
 * se usa por primera vez, manteniendo ligera la carga inicial de la
 * biblioteca.
 */
import type { Worker as TesseractWorker } from 'tesseract.js';

/** Idioma por defecto: español (los cuentos de la app son en español). */
const IDIOMA_POR_DEFECTO = 'spa';

/**
 * Raíz de despliegue de la app (Vite). Se usa para construir las rutas
 * locales de Tesseract relativas al ORIGEN, de modo que funcionen igual
 * en dev, build y preview, y bajo cualquier sub-ruta (BASE_URL), sin
 * hardcodear dominios ni asumir que la app vive en la raíz del dominio.
 */
const RUTA_BASE = import.meta.env.BASE_URL;

/**
 * Rutas locales de los recursos de Tesseract empaquetados bajo
 * `public/tesseract/`. Son rutas absolutas desde el origen (empiezan por
 * "/"), así que el navegador las resuelve contra el propio dominio:
 *
 *  - worker: worker.min.js (worker-script de tesseract.js minificado).
 *  - core:   tesseract-core-lstm.wasm.js. Es un core LSTM AUTOCONTENIDO:
 *            el binario WASM va embebido en base64 dentro del propio
 *            archivo (no se necesita el .wasm aparte). Al terminar en
 *            ".js", getCore() de tesseract.js lo carga directamente sin
 *            selección SIMD, lo que lo hace universalmente compatible.
 *  - lang:   spa.traineddata.gz (datos de idioma español comprimidos;
 *            el worker los descomprime y cachea en IndexedDB).
 */
const RUTA_WORKER = `${RUTA_BASE}tesseract/worker/worker.min.js`;
const RUTA_CORE = `${RUTA_BASE}tesseract/core/tesseract-core-lstm.wasm.js`;
const RUTA_LANG = `${RUTA_BASE}tesseract/lang`;

/**
 * Código de error controlado que devuelve el motor cuando los recursos
 * locales de OCR (worker/core/idioma) no están disponibles. Es un
 * identificador estable que la UI puede detectar para mostrar un aviso.
 * NO existe fallback a CDN: si faltan los archivos locales, el OCR se
 * considera no disponible.
 */
export const ERROR_OCR_RECURSO_LOCAL_NO_DISPONIBLE =
  'OCR_RECURSO_LOCAL_NO_DISPONIBLE';

/**
 * Patrones de error típicos al cargar un recurso local (fetch 404,
 * importScripts fallido, "Failed to load TesseractCore", etc.). Se usan
 * para clasificar el fallo como "recurso local no disponible" en lugar
 * de otro tipo de error.
 */
const PATRONES_FALLO_RECURSO: RegExp[] = [
  /failed to fetch/i,
  /networkerror/i,
  /load timed out/i,
  /failed to load/i,
  /importscripts/i,
  /error loading/i,
  /404/i,
  /not found/i,
  /unexpected token/i,
];

/** ¿El error parece producido por no poder cargar un recurso local? */
function esErrorDeRecursoLocal(error: unknown): boolean {
  const mensaje = String(error);
  return PATRONES_FALLO_RECURSO.some((patron) => patron.test(mensaje));
}

/**
 * Implementación de `MotorOcr` basada en Tesseract.js.
 *
 * El worker de Tesseract se crea perezosamente en `inicializar()` y se
 * reutiliza en todas las llamadas a `extraerTexto()`. Solo se libera con
 * `destruir()`.
 *
 * NOTA SOBRE EL WORKER: Tesseract.js ya se ejecuta en su propio Web
 * Worker interno (creado por `createWorker`), por lo que el OCR no
 * bloquea el hilo principal de React. Por eso no envolvemos Tesseract
 * en un worker custom adicional: sería una capa redundante. El requisito
 * "worker reutilizable y destruible" queda cubierto por el worker que
 * gestiona Tesseract.js.
 */
export class TesseractOcr implements MotorOcr {
  readonly nombre = 'tesseract.js';

  private worker: TesseractWorker | null = null;
  private idiomaCargado: string | null = null;
  private inicializado = false;

  /**
   * Inicializa (o reinicializa) el worker con el idioma indicado.
   * Idempotente: si ya está cargado el mismo idioma, no hace nada.
   * Si cambia el idioma, recrea el worker para no acumular modelos.
   */
  async inicializar(idioma: string = IDIOMA_POR_DEFECTO): Promise<void> {
    if (this.inicializado && this.worker && this.idiomaCargado === idioma) {
      return;
    }

    // Si ya había un worker con otro idioma, lo liberamos antes de
    // crear uno nuevo (evita acumular modelos en memoria).
    if (this.worker && this.idiomaCargado !== idioma) {
      await this.destruirWorker();
    }

    try {
      // Cargamos el código de tesseract.js de forma perezosa (chunk
      // separado) y creamos el worker con el modelo de idioma. Pasamos
      // EXPLÍCITAMENTE las rutas locales (worker/core/lang) y el OEM
      // LSTM_ONLY (el core empaquetado es el -lstm). `gzip: true` hace
      // que el worker busque "spa.traineddata.gz" (el archivo local).
      const { createWorker, OEM } = await import('tesseract.js');
      this.worker = await createWorker(idioma, OEM.LSTM_ONLY, {
        workerPath: RUTA_WORKER,
        corePath: RUTA_CORE,
        langPath: RUTA_LANG,
        gzip: true,
      });
      this.idiomaCargado = idioma;
      this.inicializado = true;
    } catch (error) {
      // FASE 1.5: SIN fallback a CDN. Si el fallo viene de no poder
      // cargar un recurso local (worker/core/idioma), devolvemos el
      // error controlado OCR_RECURSO_LOCAL_NO_DISPONIBLE para que la UI
      // pueda mostrarlo. Cualquier otro fallo se propaga como antes.
      this.inicializado = false;
      if (esErrorDeRecursoLocal(error)) {
        throw new Error(ERROR_OCR_RECURSO_LOCAL_NO_DISPONIBLE);
      }
      throw new Error(`No se pudo cargar el idioma OCR "${idioma}": ${String(error)}`);
    }
  }

  /**
   * Extrae texto de una imagen Data URL.
   * Preprocesa la imagen (copia) y luego reconoce con Tesseract.
   */
  async extraerTexto(
    imagenDataUrl: string,
    _opciones?: OpcionesOcr
  ): Promise<ResultadoOcrCrudo> {
    if (!this.worker) {
      throw new Error('El motor OCR no está inicializado. Llama a inicializar() primero.');
    }

    // Preprocesamos UNA COPIA de la imagen (nunca la del usuario).
    const imagenPreprocesada = await preprocesarImagen(imagenDataUrl);

    const { data } = await this.worker.recognize(imagenPreprocesada);

    const textoBruto = data.text ?? '';
    const textoLimpio = limpiarTextoCuento(textoBruto);
    const confianza = typeof data.confidence === 'number' ? data.confidence : null;

    return {
      textoBruto,
      textoLimpio,
      confianza,
      tieneTexto: textoLimpio.trim().length > 0,
    };
  }

  /**
   * Libera el worker de Tesseract. Seguro llamar varias veces.
   */
  async destruir(): Promise<void> {
    await this.destruirWorker();
  }

  private async destruirWorker(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    this.inicializado = false;
    this.idiomaCargado = null;

    if (!worker) return;

    try {
      await worker.terminate();
    } catch (error) {
      // Un fallo al terminar el worker no debe propagarse: en el peor
      // caso el navegador liberará la memoria al cerrar la pestaña.
      console.warn('[TesseractOcr] Aviso al terminar el worker:', error);
    }
  }
}
