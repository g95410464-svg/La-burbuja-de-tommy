import { useCallback, useEffect, useState } from 'react';
import type { Libro, ProgresoLectura, Resultado } from '../types/libro';
import { bibliotecaLocal, usuarioActual } from '../lib/storageManager';
import { sincronizarBiblioteca, descargarLibro } from '../lib/cloudSync';
export function useBiblioteca() {
  const [uid] = useState(usuarioActual);
  const [local] = useState(() => bibliotecaLocal(uid));
  const [libros,setLibros]=useState<Libro[]>([]);
  const [progresoPorLibro,setProgreso]=useState<Record<string,ProgresoLectura>>({});
  const [cargando,setCargando]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [sincronizando,setSincronizando]=useState(false);
  const [enLinea,setEnLinea]=useState(navigator.onLine);
  const recargar=useCallback(async()=>{
    try {
      const [l,p]=await Promise.all([local.libros(),local.progresos()]);
      setLibros(l.sort((a,b)=>b.fechaAgregado.localeCompare(a.fechaAgregado)));
      setProgreso(Object.fromEntries(p.map(r=>[r.libroId,r])));
    }catch { setError('No se pudo leer el almacenamiento local. Comprueba el espacio y los permisos del navegador.'); }
    finally {setCargando(false);}
  },[local]);
  const sincronizar=useCallback(async()=>{
    if(!uid || !navigator.onLine)return;
    setSincronizando(true);setError(null);
    try {await sincronizarBiblioteca(uid);await recargar();}
    catch(e) {setError(e instanceof Error ? e.message : 'No se pudo sincronizar. Tus cambios locales están guardados; puedes reintentar.');}
    finally {setSincronizando(false);}
  },[uid,recargar]);
  useEffect(()=>{
    void recargar();void sincronizar();
    const conectar=()=>{setEnLinea(navigator.onLine);if(navigator.onLine)void sincronizar();};
    const cambio=()=>void recargar();
    window.addEventListener('online',conectar);window.addEventListener('offline',conectar);
    window.addEventListener('biblioteca-cambio',cambio);
    const timer=window.setInterval(()=>void sincronizar(),30000);
    return()=>{window.removeEventListener('online',conectar);window.removeEventListener('offline',conectar);window.removeEventListener('biblioteca-cambio',cambio);clearInterval(timer);};
  },[recargar,sincronizar]);
  const agregarLibro=async(libro:Libro,blob:Blob):Promise<Resultado<void>>=>{
    try {await local.guardar(libro,blob);await recargar();void sincronizar();return {ok:true,valor:undefined};}
    catch {return {ok:false,error:'No se pudo guardar el cuento. Comprueba el espacio disponible.'};}
  };
  const eliminarLibro=async(id:string):Promise<Resultado<void>>=>{
    try {await local.eliminar(id);await recargar();void sincronizar();return {ok:true,valor:undefined};}
    catch {return {ok:false,error:'No se pudo eliminar el cuento.'};}
  };
  const descargar=async(libro:Libro)=>{
    if(libro.fuente.tipo==='blob')return libro;
    if(!uid)throw new Error('Inicia sesión para descargar.');
    const descargado=await descargarLibro(uid,libro.id);await recargar();return descargado;
  };
  const quitarDescarga=async(id:string)=>{await local.quitarDescarga(id);await recargar();};
  return {libros,progresoPorLibro,cargando,error,agregarLibro,eliminarLibro,recargar,sincronizar,sincronizando,enLinea,descargar,quitarDescarga};
}
