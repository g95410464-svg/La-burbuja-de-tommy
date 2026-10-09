import { createClient, type Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { bibliotecaLocal, avisarCambio, type RegistroLibro } from './storageManager';
import { sincronizarCuenta, type NubeBiblioteca } from './syncCore';
import type { ProgresoLectura } from '../types/libro';
const BUCKET = 'cuentitos-books';
type FilaLibro = {id:string;title:string;author?:string;pages:number;cover:string;accent:string;bytes:number;created_at:string;deleted_at:string|null};
type FilaProgreso = {book_id:string;page:number;completed:boolean;read_at:string};
const progresoDe = (r: FilaProgreso): ProgresoLectura => ({libroId:r.book_id,paginaActual:r.page,completado:r.completed,ultimaLectura:new Date(r.read_at).toISOString()});
export function crearNube(session: Session): NubeBiblioteca {
  // Freeze credentials for this operation. An account switch cannot change its owner.
  const client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    accessToken: async () => session.access_token,
  });
  const uid = session.user.id;
  const path = (id:string) => `${uid}/${id}.pdf`;
  async function todas<T>(tabla:string): Promise<T[]> {
    const rows:T[]=[];
    for(let offset=0;;offset+=200) {
      const {data,error}=await client.from(tabla).select('*').eq('user_id',uid).order(tabla==='cuentitos_books'?'id':'book_id').range(offset,offset+199);
      if(error)throw error;
      rows.push(...data as T[]);
      if(data.length<200)return rows;
    }
  }
  return {
    async libros() {
      return (await todas<FilaLibro>('cuentitos_books')).map((r):RegistroLibro => ({id:r.id,titulo:r.title,autor:r.author,totalPaginas:r.pages,portadaUrl:r.cover,colorAcento:r.accent,tamanoBytes:r.bytes,fechaAgregado:r.created_at,origen:'subido-por-usuario',sincronizado:true,borrado:!!r.deleted_at}));
    },
    async subir(r) {
      if(!r.pdfBlob)throw new Error('Falta el PDF local.');
      if(r.pdfBlob.size>50*1024*1024)throw new Error('Este PDF supera los 50 MB permitidos en la nube. La copia local se conserva.');
      const archivo=await client.storage.from(BUCKET).upload(path(r.id),r.pdfBlob,{contentType:'application/pdf',upsert:true});
      if(archivo.error)throw archivo.error;
      const {error}=await client.from('cuentitos_books').insert({user_id:uid,id:r.id,title:r.titulo,author:r.autor??null,pages:r.totalPaginas,cover:r.portadaUrl,accent:r.colorAcento,bytes:r.pdfBlob.size,created_at:r.fechaAgregado});
      if(error && error.code!=='23505')throw error;
    },
    async eliminar(id) {
      const {error}=await client.from('cuentitos_books').update({deleted_at:new Date().toISOString()}).eq('user_id',uid).eq('id',id);
      if(error)throw error;
      const borrado=await client.storage.from(BUCKET).remove([path(id)]);
      if(borrado.error)throw borrado.error;
    },
    async progresos() { return (await todas<FilaProgreso>('cuentitos_progress')).map(progresoDe); },
    async guardarProgreso(p) {
      const {data,error}=await client.rpc('cuentitos_merge_progress',{p_book_id:p.libroId,p_page:p.paginaActual,p_completed:p.completado,p_read_at:p.ultimaLectura});
      if(error)throw error;
      return data?.[0] ? progresoDe(data[0]) : null;
    },
    async descargar(id) {
      const {data,error}=await client.storage.from(BUCKET).download(path(id));
      if(error)throw error;
      return data;
    },
  };
}
const ejecuciones=new Map<string,Promise<void>>();
export async function sincronizarBiblioteca(uid:string) {
  if(!supabase || !navigator.onLine)return;
  const actual=ejecuciones.get(uid); if(actual)return actual;
  const trabajo=(async()=>{
    const ejecutar=async()=>{
      const {data,error}=await supabase!.auth.getSession();
      if(error || !data.session || data.session.user.id!==uid)throw new Error('Inicia sesión para sincronizar. Tus descargas siguen disponibles.');
      await sincronizarCuenta(bibliotecaLocal(uid),crearNube(data.session));
      avisarCambio();
    };
    if(navigator.locks)await navigator.locks.request(`cuentitos-sync-${uid}`,ejecutar); else await ejecutar();
  })();
  ejecuciones.set(uid,trabajo);
  try { await trabajo; } finally { ejecuciones.delete(uid); }
}
export async function descargarLibro(uid:string,id:string) {
  if(!supabase || !navigator.onLine)throw new Error('Necesitas internet para descargar este cuento por primera vez.');
  const {data,error}=await supabase.auth.getSession();
  if(error || data.session?.user.id!==uid)throw new Error('Inicia sesión de nuevo para descargar.');
  const blob=await crearNube(data.session).descargar(id);
  const libro=await bibliotecaLocal(uid).guardarDescarga(id,blob);
  await navigator.storage?.persist?.().catch(()=>false);
  return libro;
}
