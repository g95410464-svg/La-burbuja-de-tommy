/**
 * types/narracion.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CAPA DE DOMINIO: contratos del sistema de narración.
 *
 * Define los tipos para generación y reproducción de voz a partir de
 * texto extraído de cuentos infantiles. Este archivo prepara la
 * arquitectura para las fases futuras sin implementar nada todavía.
 *
 * FASE 2: Kokoro-82M (motor neural principal) + Web Speech API (fallback)
 * FASE 3: Reproducción continua, cache de audio, selector de voces
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Motor de narración abstracto.
 *
 * Las implementaciones concretas serán:
 *  - KokoroNarradorEngine  (Kokoro-82M vía Web Worker + WebGPU)
 *  - WebSpeechFallbackEngine (speechSynthesis nativo)
 *
 * La UI NUNCA debe llamar directamente a speechSynthesis ni a Kokoro;
 * siempre pasará por esta interfaz.
 */
export interface MotorNarracion {
  /** Nombre legible del motor (para debugging y selector de voz). */
  readonly nombre: string;

  /**
   * Inicializa el motor (carga de modelos, permisos, etc.).
   */
  inicializar(): Promise<void>;

  /**
   * Genera audio a partir de texto.
   * Devuelve los datos de audio generados.
   */
  narrar(texto: string, opciones?: OpcionesNarracion): Promise<AudioGenerado>;

  /**
   * Libera recursos (models, workers, etc.).
   */
  destruir(): Promise<void>;
}

/**
 * Opciones para la generación de audio.
 */
export interface OpcionesNarracion {
  /** Velocidad de habla (1.0 = normal, 0.8 = más lento para niños). */
  velocidad?: number;
  /** Tono de voz. */
  tono?: number;
  /** Voz específica a utilizar (nombre o ID). */
  voz?: string;
}

/**
 * Audio generado por un motor de narración.
 */
export interface AudioGenerado {
  /** Datos de audio como ArrayBuffer. */
  datos: ArrayBuffer;
  /** MIME type del audio (e.g. 'audio/wav', 'audio/mpeg'). */
  tipoMime: string;
  /** Duración estimada en segundos. */
  duracionSegundos: number;
  /** Nombre del motor que lo generó. */
  motorUsado: string;
}

/**
 * Estado de reproducción de audio.
 */
export type EstadoReproduccion =
  | 'inactivo'
  | 'cargando'
  | 'reproduciendo'
  | 'pausado'
  | 'error';

/**
 * Resultado de resolución de texto narrable.
 *
 * Cuando exista texto manual, se usa directamente.
 * Si no, se usa el cache OCR.
 * Si no hay cache, se ejecuta OCR.
 */
export interface TextoNarrable {
  texto: string;
  fuente: 'manual' | 'ocr_cache' | 'ocr_reciente';
  tieneContenido: boolean;
}
