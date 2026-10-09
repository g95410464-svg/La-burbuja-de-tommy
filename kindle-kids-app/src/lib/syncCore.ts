import type { ProgresoLectura } from '../types/libro';
import { bibliotecaLocal, type RegistroLibro } from './storageManager';
export interface NubeBiblioteca {
  libros(): Promise<RegistroLibro[]>;
  subir(libro: RegistroLibro): Promise<void>;
  eliminar(libroId: string): Promise<void>;
  progresos(): Promise<ProgresoLectura[]>;
  guardarProgreso(p: ProgresoLectura): Promise<ProgresoLectura | null>;
  descargar(libroId: string): Promise<Blob>;
}
export async function sincronizarCuenta(local: ReturnType<typeof bibliotecaLocal>, nube: NubeBiblioteca) {
  // Pull tombstones before pushing: stale devices must never recreate removed books.
  const remotos = await nube.libros();
  for (const r of remotos) {
    const anterior = await local.registro(r.id);
    if (r.borrado && anterior?.borrado && !anterior.sincronizado) await nube.eliminar(r.id);
    await local.recibir(r);
  }
  for (const r of await local.registros()) {
    if (r.sincronizado) continue;
    if (r.borrado) {
      await nube.eliminar(r.id);
      await local.recibir({ ...r, sincronizado:true, borrado:true });
    } else if (r.pdfBlob) {
      await nube.subir(r);
      await local.confirmarSubida(r.id);
    }
  }
  for (const p of await local.progresos()) {
    if (!p.pendiente && p.revision) continue;
    const respuesta = await nube.guardarProgreso(p);
    if (respuesta) await local.recibirProgreso(respuesta,p.revision);
  }
  for (const p of await nube.progresos()) await local.recibirProgreso(p);
}
