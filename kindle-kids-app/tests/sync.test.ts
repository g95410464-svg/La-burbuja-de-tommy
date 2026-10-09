import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bibliotecaLocal, seleccionarBiblioteca, type RegistroLibro } from '../src/lib/storageManager.ts';
import { sincronizarCuenta, type NubeBiblioteca } from '../src/lib/syncCore.ts';
import type { Libro, ProgresoLectura } from '../src/types/libro.ts';
const blob=new Blob(['%PDF-1.4 fixture'],{type:'application/pdf'});
const libro:Libro={id:'prueba',titulo:'Historia',totalPaginas:10,portadaUrl:'data:image/png;base64,AA==',origen:'subido-por-usuario',fuente:{tipo:'blob',blob},colorAcento:'#123456',fechaAgregado:'2026-10-09T00:00:00.000Z'};
const progreso=(pagina:number,fecha:string):ProgresoLectura=>({libroId:libro.id,paginaActual:pagina,completado:pagina===10,ultimaLectura:fecha});
function nubeFalsa() {
 const libros=new Map<string,RegistroLibro>();const progresos=new Map<string,ProgresoLectura>();const archivos=new Map<string,Blob>();
 let fallo=false;
 const nube:NubeBiblioteca={
  async libros(){return structuredClone([...libros.values()]);},
  async subir(r){if(fallo)throw new Error('Sin red');archivos.set(r.id,r.pdfBlob!);const {pdfBlob:_,...meta}=r;libros.set(r.id,{...meta,sincronizado:true});},
  async eliminar(id){const r=libros.get(id);if(r)libros.set(id,{...r,borrado:true});archivos.delete(id);progresos.delete(id);},
  async progresos(){return structuredClone([...progresos.values()]);},
  async guardarProgreso(p){if(!libros.has(p.libroId)||libros.get(p.libroId)?.borrado)return null;const anterior=progresos.get(p.libroId);const nuevo=anterior&&anterior.ultimaLectura>p.ultimaLectura?anterior:p;const merged={...nuevo,completado:!!anterior?.completado||p.completado};progresos.set(p.libroId,merged);return merged;},
  async descargar(id){const b=archivos.get(id);if(!b)throw new Error('No existe');return b;},
 };
 return {nube,libros,archivos,fallar:(valor:boolean)=>{fallo=valor;}};
}
const local=()=>bibliotecaLocal(crypto.randomUUID());
test('una subida fallida conserva PDF y cola; otro dispositivo descarga tras reintentar',async()=>{
 const a=local(),b=local(),n=nubeFalsa();await a.guardar(libro,blob);n.fallar(true);
 await assert.rejects(sincronizarCuenta(a,n.nube));assert.equal((await a.registro(libro.id))?.sincronizado,false);assert.equal((await a.libros())[0].fuente.tipo,'blob');
 n.fallar(false);await sincronizarCuenta(a,n.nube);await sincronizarCuenta(b,n.nube);
 assert.equal((await b.libros())[0].disponibleLocal,false);
 const descargado=await b.guardarDescarga(libro.id,await n.nube.descargar(libro.id));assert.equal(descargado.fuente.tipo,'blob');
 await b.quitarDescarga(libro.id);assert.equal((await b.libros())[0].disponibleLocal,false);assert.equal(n.archivos.size,1);
});
test('no se permite quitar la única copia antes de sincronizar',async()=>{
 const a=local();await a.guardar(libro,blob);await assert.rejects(a.quitarDescarga(libro.id));assert.equal((await a.libros())[0].fuente.tipo,'blob');
});
test('una eliminación remota no reaparece al conectar un dispositivo atrasado',async()=>{
 const a=local(),b=local(),n=nubeFalsa();await a.guardar(libro,blob);await sincronizarCuenta(a,n.nube);await sincronizarCuenta(b,n.nube);
 await b.guardarDescarga(libro.id,blob);await a.eliminar(libro.id);await sincronizarCuenta(a,n.nube);await sincronizarCuenta(b,n.nube);
 assert.equal((await b.libros()).length,0);assert.equal(n.archivos.size,0);assert.equal(n.libros.get(libro.id)?.borrado,true);
});
test('eliminar sin red persiste después de volver a crear el adaptador',async()=>{
 const id=crypto.randomUUID(),a=bibliotecaLocal(id),n=nubeFalsa();await a.guardar(libro,blob);await sincronizarCuenta(a,n.nube);await a.eliminar(libro.id);
 assert.equal((await a.libros()).length,0);await sincronizarCuenta(bibliotecaLocal(id),n.nube);assert.equal(n.libros.get(libro.id)?.borrado,true);
});
test('una confirmación antigua no borra un cambio de página durante la sincronización',async()=>{
 const a=local();await a.guardar(libro,blob);await a.guardarProgreso(progreso(2,'2026-10-09T01:00:00.000Z'));const viejo=(await a.progreso(libro.id))!;
 await a.guardarProgreso(progreso(7,'2026-10-09T02:00:00.000Z'));await a.recibirProgreso(viejo,viejo.revision);
 assert.equal((await a.progreso(libro.id))?.paginaActual,7);assert.equal((await a.progreso(libro.id))?.pendiente,true);
});
test('se conserva la lectura más reciente y el logro de libro terminado',async()=>{
 const a=local(),b=local(),n=nubeFalsa();await a.guardar(libro,blob);await a.guardarProgreso(progreso(10,'2026-10-09T02:00:00.000Z'));await sincronizarCuenta(a,n.nube);await sincronizarCuenta(b,n.nube);
 await b.guardarProgreso(progreso(3,'2026-10-09T01:00:00.000Z'));await sincronizarCuenta(b,n.nube);
 assert.equal((await b.progreso(libro.id))?.paginaActual,10);assert.equal((await b.progreso(libro.id))?.completado,true);
});
test('un adaptador en vuelo conserva su cuenta aunque cambie el usuario activo',async()=>{
 const aId=crypto.randomUUID(),bId=crypto.randomUUID();seleccionarBiblioteca(aId);const a=bibliotecaLocal();seleccionarBiblioteca(bId);await a.guardar(libro,blob);
 assert.equal((await bibliotecaLocal(bId).libros()).length,0);assert.equal((await bibliotecaLocal(aId).libros()).length,1);
});
test('una eliminación durante la subida permanece pendiente',async()=>{
 const a=local(),n=nubeFalsa();await a.guardar(libro,blob);const subir=n.nube.subir;n.nube.subir=async r=>{await subir(r);await a.eliminar(r.id);};
 await sincronizarCuenta(a,n.nube);assert.equal((await a.registro(libro.id))?.borrado,true);assert.equal((await a.registro(libro.id))?.sincronizado,false);
 await sincronizarCuenta(a,n.nube);assert.equal(n.archivos.size,0);
});
