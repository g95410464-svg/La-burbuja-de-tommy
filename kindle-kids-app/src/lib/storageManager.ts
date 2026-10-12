import { openDB, type DBSchema } from 'idb';
import type { Libro, ProgresoLectura, Resultado } from '../types/libro';
import type { ResultadoOcrPagina } from '../types/ocr';

export interface RegistroLibro extends Omit<Libro, 'fuente'> {
  pdfBlob?: Blob;
  sincronizado?: boolean;
  borrado?: boolean;
}
export interface ProgresoLocal extends ProgresoLectura { revision?: string; pendiente?: boolean }
export interface ResultadoOcrCacheado extends ResultadoOcrPagina { clave: string }
export interface NarracionLocal { clave: string; libroId: string; pagina: number; huella: string; audio: Blob; fecha: number }
interface Esquema extends DBSchema {
  narraciones: { key: string; value: NarracionLocal };
  libros: { key: string; value: RegistroLibro };
  progreso: { key: string; value: ProgresoLocal };
  ocrCache: { key: string; value: ResultadoOcrCacheado };
}
const conexiones = new Map<string, ReturnType<typeof openDB<Esquema>>>();
let usuario: string | null = null;
export function seleccionarBiblioteca(id: string | null) { usuario = id; }
export function usuarioActual() { return usuario; }
export const avisarCambio = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('biblioteca-cambio')); };
export const convertirLibro = (r: RegistroLibro): Libro => {
  const { pdfBlob, ...datos } = r;
  return { ...datos, disponibleLocal: !!pdfBlob, fuente: pdfBlob ? { tipo: 'blob', blob: pdfBlob } : { tipo: 'url', url: '' } };
};

// Each operation captures its account database before awaiting: switching accounts
// must never redirect an in-flight read, upload or acknowledgement to another user.
export function bibliotecaLocal(id: string | null = usuario) {
  const nombre = id ? `kindle-kids-biblioteca-${id}` : 'kindle-kids-biblioteca';
  const conexion = conexiones.get(nombre) ?? openDB<Esquema>(nombre, 3, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('narraciones')) db.createObjectStore('narraciones', { keyPath: 'clave' });
      if (!db.objectStoreNames.contains('libros')) db.createObjectStore('libros', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('progreso')) db.createObjectStore('progreso', { keyPath: 'libroId' });
      if (!db.objectStoreNames.contains('ocrCache')) db.createObjectStore('ocrCache', { keyPath: 'clave' });
    },
  });
  conexiones.set(nombre, conexion);
  return {
    id,
    async registros() { return (await conexion).getAll('libros'); },
    async registro(libroId: string) { return (await conexion).get('libros', libroId); },
    async libros() { return (await this.registros()).filter(r => !r.borrado).map(convertirLibro); },
    async guardar(libro: Libro, blob: Blob) {
      const { fuente: _, ...datos } = libro;
      await (await conexion).put('libros', { ...datos, pdfBlob: blob, sincronizado: false });
      avisarCambio();
    },
    async recibir(remoto: RegistroLibro) {
      const db = await conexion;
      const tx = db.transaction(['libros','progreso','ocrCache','narraciones'], 'readwrite');
      const anterior = await tx.objectStore('libros').get(remoto.id);
      if (remoto.borrado) {
        for (const r of await tx.objectStore('narraciones').getAll()) if (r.libroId === remoto.id) await tx.objectStore('narraciones').delete(r.clave);
        // Keep the tombstone so another device cannot resurrect this ID.
        await tx.objectStore('libros').put({ ...remoto, pdfBlob: undefined, sincronizado: true });
        await tx.objectStore('progreso').delete(remoto.id);
        for (const r of await tx.objectStore('ocrCache').getAll()) if (r.libroId === remoto.id) await tx.objectStore('ocrCache').delete(r.clave);
      } else if (!anterior?.borrado) {
        await tx.objectStore('libros').put({ ...remoto, pdfBlob: anterior?.pdfBlob, sincronizado: true });
      }
      await tx.done;
    },
    async confirmarSubida(libroId: string) {
      const tx = (await conexion).transaction('libros','readwrite');
      const r = await tx.store.get(libroId);
      if (r && !r.borrado) await tx.store.put({ ...r, sincronizado: true });
      await tx.done;
    },
    async guardarDescarga(libroId: string, blob: Blob) {
      const tx = (await conexion).transaction('libros','readwrite');
      const r = await tx.store.get(libroId);
      if (!r || r.borrado) { await tx.done; throw new Error('Este cuento ya no está en tu biblioteca.'); }
      await tx.store.put({ ...r, pdfBlob: blob });
      await tx.done;
      avisarCambio();
      return convertirLibro({ ...r, pdfBlob: blob });
    },
    async quitarDescarga(libroId: string) {
      const tx = (await conexion).transaction(['libros','ocrCache','narraciones'],'readwrite');
      const r = await tx.objectStore('libros').get(libroId);
      if (!r?.sincronizado || r.borrado) { await tx.done; throw new Error('Espera a que el cuento se guarde en la nube.'); }
      await tx.objectStore('libros').put({ ...r, pdfBlob: undefined });
      for (const r of await tx.objectStore('narraciones').getAll()) if (r.libroId === libroId) await tx.objectStore('narraciones').delete(r.clave);
      for (const ocr of await tx.objectStore('ocrCache').getAll()) if (ocr.libroId === libroId) await tx.objectStore('ocrCache').delete(ocr.clave);
      await tx.done;
      avisarCambio();
    },
    async eliminar(libroId: string) {
      const tx = (await conexion).transaction(['libros','progreso','ocrCache','narraciones'],'readwrite');
      const r = await tx.objectStore('libros').get(libroId);
      if (r) await tx.objectStore('libros').put({ ...r, borrado: true, sincronizado: false, pdfBlob: undefined });
      await tx.objectStore('progreso').delete(libroId);
      for (const r of await tx.objectStore('narraciones').getAll()) if (r.libroId === libroId) await tx.objectStore('narraciones').delete(r.clave);
      for (const ocr of await tx.objectStore('ocrCache').getAll()) if (ocr.libroId === libroId) await tx.objectStore('ocrCache').delete(ocr.clave);
      await tx.done;
      avisarCambio();
    },
    async progresos() { return (await conexion).getAll('progreso'); },
    async progreso(libroId: string) { return (await conexion).get('progreso',libroId); },
    async guardarProgreso(p: ProgresoLectura) {
      const tx = (await conexion).transaction(['progreso','libros'],'readwrite');
      if ((await tx.objectStore('libros').get(p.libroId))?.borrado) { await tx.done; return; }
      const anterior = await tx.objectStore('progreso').get(p.libroId);
      await tx.objectStore('progreso').put({ ...p, completado: p.completado || !!anterior?.completado, pendiente: true, revision: crypto.randomUUID() });
      await tx.done;
      avisarCambio();
    },
    async recibirProgreso(p: ProgresoLectura, revisionConfirmada?: string) {
      const tx = (await conexion).transaction(['progreso','libros'],'readwrite');
      const libro = await tx.objectStore('libros').get(p.libroId);
      if (!libro || libro.borrado) { await tx.done; return; }
      const anterior = await tx.objectStore('progreso').get(p.libroId);
      const masReciente = anterior && anterior.ultimaLectura > p.ultimaLectura ? anterior : p;
      // Acknowledging an older upload cannot erase a new offline page change.
      const pendiente = !!anterior?.pendiente && anterior.revision !== revisionConfirmada;
      await tx.objectStore('progreso').put({ ...masReciente, completado: p.completado || !!anterior?.completado, pendiente, revision: anterior?.revision });
      await tx.done;
    },
    async narracion(libroId: string, pagina: number) {
      return (await conexion).get('narraciones', JSON.stringify([libroId, pagina]));
    },
    async guardarNarracion(libroId: string, pagina: number, huella: string, audio: Blob) {
      const limite = 64 * 1024 * 1024;
      if (audio.size > limite) throw new Error('Audio demasiado grande para guardar.');
      const tx = (await conexion).transaction(['libros','narraciones'], 'readwrite');
      const libro = await tx.objectStore('libros').get(libroId);
      // Do not resurrect audio after a concurrent deletion or removal of the local PDF.
      if (!libro || libro.borrado || !libro.pdfBlob) { await tx.done; return false; }
      const store = tx.objectStore('narraciones');
      const clave = JSON.stringify([libroId, pagina]);
      const anteriores = (await store.getAll()).filter(r => r.clave !== clave);
      const bytes = anteriores.reduce((n,r) => n + r.audio.size, audio.size);
      if (bytes > limite) { await tx.done; return false; }
      await store.put({ clave, libroId, pagina, huella, audio, fecha: Date.now() });
      await tx.done;
      return true;
    },
    async guardarOcr(r: ResultadoOcrPagina) { await (await conexion).put('ocrCache',{ ...r, clave: JSON.stringify([r.libroId,r.pagina]) }); },
    async ocr(libroId: string, pagina: number) { return (await conexion).get('ocrCache',JSON.stringify([libroId,pagina])); },
    async borrarOcr(libroId: string) {
      const tx = (await conexion).transaction('ocrCache','readwrite');
      for (const r of await tx.store.getAll()) if (r.libroId === libroId) await tx.store.delete(r.clave);
      await tx.done;
    },
  };
}
export async function guardarLibro(libro: Libro, blob: Blob): Promise<Resultado<void>> {
  try { await bibliotecaLocal().guardar(libro,blob); return { ok:true, valor:undefined }; }
  catch { return {ok:false,error:'No se pudo guardar el PDF. Comprueba el espacio disponible en este dispositivo.'}; }
}
export const obtenerLibrosGuardados = () => bibliotecaLocal().libros();
export async function eliminarLibro(id: string): Promise<Resultado<void>> {
  try { await bibliotecaLocal().eliminar(id); return {ok:true,valor:undefined}; }
  catch { return {ok:false,error:'No se pudo eliminar el cuento.'}; }
}
export const guardarProgreso = (p: ProgresoLectura) => bibliotecaLocal().guardarProgreso(p);
export const obtenerProgreso = async (id: string) => (await bibliotecaLocal().progreso(id)) ?? null;
export const obtenerTodoElProgreso = async () => Object.fromEntries((await bibliotecaLocal().progresos()).map(p => [p.libroId,p]));
export async function guardarOcrCache(r: ResultadoOcrPagina): Promise<Resultado<void>> {
  try { await bibliotecaLocal().guardarOcr(r); return {ok:true,valor:undefined}; }
  catch { return {ok:false,error:'No se pudo guardar OCR.'}; }
}
export async function obtenerOcrCache(id: string,pagina: number,version: number) {
  const r=await bibliotecaLocal().ocr(id,pagina); return r?.versionProcesador===version ? r : null;
}
export const eliminarOcrDeLibro = (id: string) => bibliotecaLocal().borrarOcr(id);
