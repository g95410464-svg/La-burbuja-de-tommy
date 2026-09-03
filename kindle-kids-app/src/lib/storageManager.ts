/**
 * lib/storageManager.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CAPA DE INFRAESTRUCTURA: persistencia local con IndexedDB.
 *
 * ¿Por qué IndexedDB y no LocalStorage?
 * LocalStorage tiene un límite muy bajo (~5MB) y es síncrono/bloqueante,
 * además de que solo admite strings. Los PDFs de libros ilustrados pesan
 * varios MB cada uno, así que LocalStorage sería inviable e insuficiente.
 * IndexedDB permite guardar Blobs binarios de forma asíncrona y con
 * cuotas de almacenamiento mucho mayores (habitualmente cientos de MB o
 * más, según el navegador).
 *
 * Usamos la librería `idb` (de Jake Archibald) porque envuelve la API
 * nativa de IndexedDB —basada en eventos y bastante verbosa— en una
 * interfaz moderna basada en Promesas, sin añadir lógica de negocio.
 *
 * Principio SOLID aplicado: "Single Responsibility". Este módulo SOLO
 * sabe leer/escribir en IndexedDB. No sabe nada de PDF.js, ni de React,
 * ni de cómo se ve un Libro en pantalla.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { Libro, ProgresoLectura, Resultado } from '../types/libro';
import type { ResultadoOcrPagina } from '../types/ocr';

/**
 * Definición tipada del esquema de la base de datos. Usar `DBSchema` de
 * `idb` nos da autocompletado y chequeo de tipos en cada operación,
 * evitando errores de "typo" en nombres de almacenes (object stores).
 *
 * Almacenes:
 *  - `libros`:   libros subidos (id → LibroPersistido).
 *  - `progreso`: progreso de lectura (libroId → ProgresoLectura).
 *  - `ocrCache`: resultados OCR cacheados por página, con una clave
 *    única tipo string "libroId:pagina" (un `IDBValidKey`).
 */
interface EsquemaBibliotecaDB extends DBSchema {
  libros: {
    key: string;
    value: LibroPersistido;
  };
  progreso: {
    key: string;
    value: ProgresoLectura;
  };
  ocrCache: {
    key: string;
    value: ResultadoOcrCacheado;
  };
}

/**
 * Resultado OCR tal como se guarda en IndexedDB: el `ResultadoOcrPagina`
 * más el campo `clave` que actúa como keyPath del almacén. La clave es
 * una cadena única `"libroId:pagina"` (un `IDBValidKey` válido), y
 * `libroId`/`pagina` se conservan como campos para poder filtrar.
 */
export interface ResultadoOcrCacheado extends ResultadoOcrPagina {
  clave: string;
}

/**
 * Construye la clave única del cache OCR para un libro y una página.
 * Usamos `JSON.stringify` de un par para evitar colisiones si el
 * `libroId` contuviera el carácter separador.
 */
function claveOcrDe(libroId: string, pagina: number): string {
  return JSON.stringify([libroId, pagina]);
}

/**
 * Representación de un libro TAL COMO se guarda en IndexedDB. Es distinta
 * del tipo `Libro` del dominio porque aquí el PDF se guarda siempre como
 * Blob nativo (nunca como URL), y no persistimos el campo `fuente`
 * genérico sino directamente el blob binario, más eficiente para IndexedDB.
 */
interface LibroPersistido extends Omit<Libro, 'fuente'> {
  pdfBlob: Blob;
}

const NOMBRE_DB = 'kindle-kids-biblioteca';
const VERSION_DB = 2;
const ALMACEN_LIBROS = 'libros';
const ALMACEN_PROGRESO = 'progreso';
const ALMACEN_OCR_CACHE = 'ocrCache';

/**
 * Promesa singleton de la conexión a la base de datos. La inicializamos
 * una única vez (patrón "lazy singleton") y la reutilizamos en todas las
 * operaciones, evitando abrir conexiones redundantes.
 */
let promesaDB: Promise<IDBPDatabase<EsquemaBibliotecaDB>> | null = null;

function obtenerConexionDB(): Promise<IDBPDatabase<EsquemaBibliotecaDB>> {
  if (!promesaDB) {
    promesaDB = openDB<EsquemaBibliotecaDB>(NOMBRE_DB, VERSION_DB, {
      upgrade(db) {
        // `upgrade` solo se ejecuta si la versión de la DB cambia (o en
        // la primera creación). Aquí definimos los "almacenes" (tablas).
        //
        // MIGRACIÓN COMPATIBLE HACIA ATRÁS: los almacenes existentes
        // (`libros`, `progreso`) se conservan intactos si ya existen
        // (comprobación `if`). La única adición es `ocrCache`, que se
        // crea de forma no destructiva. Los libros y el progreso ya
        // guardados NO se tocan.
        if (!db.objectStoreNames.contains(ALMACEN_LIBROS)) {
          db.createObjectStore(ALMACEN_LIBROS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(ALMACEN_PROGRESO)) {
          db.createObjectStore(ALMACEN_PROGRESO, { keyPath: 'libroId' });
        }
        if (!db.objectStoreNames.contains(ALMACEN_OCR_CACHE)) {
          db.createObjectStore(ALMACEN_OCR_CACHE, { keyPath: 'clave' });
        }
      },
    });
  }
  return promesaDB;
}

/**
 * Guarda (crea o actualiza) un libro subido por el usuario, incluyendo su
 * PDF binario. Devuelve un `Resultado` para que la UI pueda mostrar un
 * mensaje amigable si el navegador rechaza la escritura (por ejemplo,
 * por cuota de almacenamiento agotada).
 */
export async function guardarLibro(
  libro: Libro,
  pdfBlob: Blob
): Promise<Resultado<void>> {
  try {
    const db = await obtenerConexionDB();

    // Separamos `fuente` del objeto porque no queremos persistir una
    // referencia a un Blob "en memoria" dos veces; el blob real va en
    // su propio campo `pdfBlob`, ya adaptado al esquema de persistencia.
    const { fuente: _fuenteIgnorada, ...datosLibro } = libro;

    const libroPersistido: LibroPersistido = {
      ...datosLibro,
      pdfBlob,
    };

    await db.put(ALMACEN_LIBROS, libroPersistido);
    return { ok: true, valor: undefined };
  } catch (error) {
    console.error('[storageManager] Error al guardar el libro:', error);
    return {
      ok: false,
      error:
        'No se pudo guardar el libro en tu dispositivo. Es posible que no quede espacio de almacenamiento.',
    };
  }
}

/**
 * Recupera todos los libros subidos por el usuario y guardados en
 * IndexedDB, ya reconstruidos como entidades `Libro` del dominio (con su
 * `fuente` de tipo 'blob' lista para usar).
 *
 * Si la base de datos está vacía o inaccesible, devuelve un array vacío
 * en lugar de lanzar una excepción: la biblioteca simplemente se muestra
 * sin libros adicionales, sin romper la aplicación.
 */
export async function obtenerLibrosGuardados(): Promise<Libro[]> {
  try {
    const db = await obtenerConexionDB();
    const registros = await db.getAll(ALMACEN_LIBROS);

    return registros.map((registro) => {
      const { pdfBlob, ...resto } = registro;
      const libro: Libro = {
        ...resto,
        fuente: { tipo: 'blob', blob: pdfBlob },
      };
      return libro;
    });
  } catch (error) {
    console.error('[storageManager] Error al leer libros guardados:', error);
    return [];
  }
}

/**
 * Elimina un libro guardado y su progreso asociado. Usamos una
 * transacción única para que ambas operaciones sean atómicas: o se
 * borran las dos cosas, o no se borra ninguna, evitando estados
 * inconsistentes (por ejemplo, progreso "huérfano" de un libro borrado).
 */
export async function eliminarLibro(libroId: string): Promise<Resultado<void>> {
  try {
    const db = await obtenerConexionDB();

    // Eliminamos el libro, su progreso y su cache OCR de forma
    // coordinada. El cache OCR se borra aparte (no comparte clave con
    // los otros dos), pero la operación no es crítica si falla.
    const tx = db.transaction([ALMACEN_LIBROS, ALMACEN_PROGRESO], 'readwrite');

    await Promise.all([
      tx.objectStore(ALMACEN_LIBROS).delete(libroId),
      tx.objectStore(ALMACEN_PROGRESO).delete(libroId),
      tx.done,
    ]);

    // Limpieza del cache OCR asociado (best-effort, no bloqueante).
    await eliminarOcrDeLibro(libroId);

    return { ok: true, valor: undefined };
  } catch (error) {
    console.error('[storageManager] Error al eliminar el libro:', error);
    return { ok: false, error: 'No se pudo eliminar el libro.' };
  }
}

/**
 * Guarda o actualiza el progreso de lectura de un libro. Se llama con
 * frecuencia (cada cambio de página), por lo que la operación se
 * mantiene deliberadamente ligera (un único `put`).
 */
export async function guardarProgreso(progreso: ProgresoLectura): Promise<void> {
  try {
    const db = await obtenerConexionDB();
    await db.put(ALMACEN_PROGRESO, progreso);
  } catch (error) {
    // El progreso de lectura es "nice to have", no crítico: si falla el
    // guardado, solo lo registramos en consola sin interrumpir la
    // experiencia de lectura del niño o niña con un mensaje de error.
    console.warn('[storageManager] No se pudo guardar el progreso:', error);
  }
}

/**
 * Recupera el progreso de lectura guardado para un libro concreto, o
 * `null` si nunca se ha leído.
 */
export async function obtenerProgreso(
  libroId: string
): Promise<ProgresoLectura | null> {
  try {
    const db = await obtenerConexionDB();
    const progreso = await db.get(ALMACEN_PROGRESO, libroId);
    return progreso ?? null;
  } catch (error) {
    console.warn('[storageManager] No se pudo leer el progreso:', error);
    return null;
  }
}

/**
 * Recupera TODO el progreso guardado, indexado por libroId, para poder
 * mostrar barras de progreso en las tarjetas de la biblioteca sin hacer
 * una consulta por cada libro individualmente.
 */
export async function obtenerTodoElProgreso(): Promise<Record<string, ProgresoLectura>> {
  try {
    const db = await obtenerConexionDB();
    const registros = await db.getAll(ALMACEN_PROGRESO);
    return Object.fromEntries(registros.map((p) => [p.libroId, p]));
  } catch (error) {
    console.warn('[storageManager] No se pudo leer el progreso completo:', error);
    return {};
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * CACHE OCR
 * ─────────────────────────────────────────────────────────────────────
 * El OCR es costoso. Nunca repetimos OCR sobre una página cuyo
 * resultado ya se obtuvo correctamente.
 *
 * Almacenamos el resultado por `libroId + numeroPagina` (clave
 * compuesta). La `versionProcesador` permite invalidar OCR antiguo
 * cuando mejoremos el algoritmo: si la versión guardada no coincide
 * con la actual, se ignora el cache (se trata como si no existiera).
 *
 * Estructura del registro guardado:
 *  { libroId, pagina, textoBruto, textoLimpio, confianza, tieneTexto,
 *    fechaProcesamiento, versionProcesador }
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Guarda (o actualiza) el resultado OCR de una página en el cache.
 * La versión del procesador se lee del propio resultado.
 */
export async function guardarOcrCache(
  resultado: ResultadoOcrPagina
): Promise<Resultado<void>> {
  try {
    const db = await obtenerConexionDB();
    const registro: ResultadoOcrCacheado = {
      ...resultado,
      clave: claveOcrDe(resultado.libroId, resultado.pagina),
    };
    await db.put(ALMACEN_OCR_CACHE, registro);
    return { ok: true, valor: undefined };
  } catch (error) {
    // El cache OCR es "nice to have": si falla, simplemente se repetirá
    // el OCR la próxima vez. No debe romper el flujo de lectura.
    console.warn('[storageManager] No se pudo guardar el OCR en cache:', error);
    return { ok: false, error: 'No se pudo guardar el OCR en cache.' };
  }
}

/**
 * Recupera el resultado OCR cacheado de una página, PERO solo si la
 * `versionProcesador` guardada coincide con la versión actual del
 * procesador. Si no coincide (algoritmo mejorado) o no existe, devuelve
 * `null` para que el llamador ejecute OCR de nuevo.
 */
export async function obtenerOcrCache(
  libroId: string,
  pagina: number,
  versionProcesador: number
): Promise<ResultadoOcrPagina | null> {
  try {
    const db = await obtenerConexionDB();
    const resultado = await db.get(ALMACEN_OCR_CACHE, claveOcrDe(libroId, pagina));
    if (!resultado) return null;

    // Invalidación por versión del procesador.
    if (resultado.versionProcesador !== versionProcesador) return null;

    return resultado;
  } catch (error) {
    // Si IndexedDB falla, tratamos como "sin cache" (ejecutar OCR).
    console.warn('[storageManager] No se pudo leer el OCR cacheado:', error);
    return null;
  }
}

/**
 * Elimina todos los resultados OCR cacheados de un libro. Útil cuando
 * se borra un libro (junto con `eliminarLibro`) para no dejar datos
 * huérfanos.
 */
export async function eliminarOcrDeLibro(libroId: string): Promise<void> {
  try {
    const db = await obtenerConexionDB();
    const registros = await db.getAll(ALMACEN_OCR_CACHE);
    const clavesA_Eliminar = registros
      .filter((r) => r.libroId === libroId)
      .map((r) => r.clave);

    if (clavesA_Eliminar.length === 0) return;

    const tx = db.transaction(ALMACEN_OCR_CACHE, 'readwrite');
    await Promise.all([
      ...clavesA_Eliminar.map((clave) => tx.objectStore(ALMACEN_OCR_CACHE).delete(clave)),
      tx.done,
    ]);
  } catch (error) {
    // No es crítico: los datos huérfanos solo ocupan espacio.
    console.warn('[storageManager] No se pudo limpiar el OCR de un libro borrado:', error);
  }
}
