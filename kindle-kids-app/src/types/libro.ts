/**
 * types/libro.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CAPA DE DOMINIO (Clean Architecture)
 *
 * Este archivo define el "contrato" central de la aplicación: qué es un
 * Libro, qué es su Progreso de lectura y qué representa una fuente de PDF.
 *
 * Principio SOLID aplicado: "Dependency Inversion" — el resto del código
 * (componentes de React, hooks, storage) depende de ESTAS interfaces
 * abstractas, nunca de detalles concretos como "un Blob de IndexedDB" o
 * "un archivo estático en /public". Así, si mañana cambiamos el motor de
 * persistencia (por ejemplo de IndexedDB a un backend real), el resto de
 * la app no se entera: solo cambia la implementación de StorageManager.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Origen del libro. Nos permite tratar de forma distinta (pero unificada)
 * los libros que vienen precargados con la app (bundle estático) frente a
 * los que el usuario sube y persistimos nosotros en el navegador.
 */
export type OrigenLibro = 'biblioteca-base' | 'subido-por-usuario';

/**
 * Representa la fuente binaria de un PDF de forma agnóstica.
 * - Para libros base: una URL pública (servida desde /public).
 * - Para libros subidos: un Blob guardado en IndexedDB.
 *
 * Usamos una unión discriminada ("tipo") para que TypeScript nos obligue,
 * en tiempo de compilación, a manejar ambos casos sin olvidarnos de
 * ninguno (exhaustividad).
 */
export type FuentePdf =
  | { tipo: 'url'; url: string }
  | { tipo: 'blob'; blob: Blob };

/**
 * Entidad principal: Libro.
 * Es una estructura de datos "plana" e inmutable por convención: cualquier
 * cambio (por ejemplo actualizar el progreso) genera un nuevo objeto en
 * lugar de mutar el existente, siguiendo buenas prácticas de estado en React.
 */
export interface Libro {
  /** Identificador único (uuid para subidos, slug fijo para los base). */
  id: string;
  /** Título mostrado en la biblioteca y en el lector. */
  titulo: string;
  /** Autor o autora (opcional: no todos los PDFs subidos lo tendrán). */
  autor?: string;
  /** Número total de páginas del PDF. Se calcula al procesar el archivo. */
  totalPaginas: number;
  /**
   * Imagen de portada en formato Data URL (base64) generada a partir de
   * la primera página del PDF, o una URL estática para libros base.
   * Se guarda ya renderizada para no tener que re-procesar el PDF cada
   * vez que se pinta la biblioteca (importante para el rendimiento).
   */
  portadaUrl: string;
  /** De dónde proviene el libro (ver OrigenLibro). */
  origen: OrigenLibro;
  /** Fuente binaria real del PDF (ver FuentePdf). */
  fuente: FuentePdf;
  /** Paleta de color dominante de la portada, para fondos degradados. */
  colorAcento: string;
  /** Fecha de incorporación a la biblioteca (ISO string), para ordenar. */
  fechaAgregado: string;
  /** Tamaño aproximado en bytes (solo informativo, para libros subidos). */
  tamanoBytes?: number;
}

/**
 * Progreso de lectura de un libro concreto. Se persiste por separado del
 * Libro para poder actualizarlo con alta frecuencia (cada cambio de
 * página) sin tener que reescribir el objeto Libro completo (que puede
 * incluir un Blob pesado).
 */
export interface ProgresoLectura {
  libroId: string;
  paginaActual: number;
  /** Marca temporal de la última vez que se leyó, útil para "Continuar leyendo". */
  ultimaLectura: string;
  /** Si el usuario llegó a la última página al menos una vez. */
  completado: boolean;
}

/**
 * Resultado tipado para operaciones que pueden fallar de forma controlada
 * (Result Pattern). Evitamos usar excepciones para errores "esperables"
 * como "PDF corrupto" o "archivo no soportado", reservando los `throw`
 * reales para errores de programación genuinos.
 *
 * Esto es clave para cumplir el requisito de lógica "indestructible":
 * cada capa declara explícitamente cómo puede fallar y quien la consume
 * está obligado (por tipos) a considerar el caso de error.
 */
export type Resultado<T> =
  | { ok: true; valor: T }
  | { ok: false; error: string };
