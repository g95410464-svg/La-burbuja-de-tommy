import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Libro } from './types/libro';
import { PantallaBiblioteca } from './components/library/PantallaBiblioteca';
import { PantallaLector } from './components/reader/PantallaLector';
import { LimiteDeError } from './components/shared/LimiteDeError';
import { Acceso } from './components/auth/Acceso';
import { supabase } from './lib/supabase';
import { seleccionarBiblioteca } from './lib/storageManager';
import { sincronizarBiblioteca } from './lib/cloudSync';
type IdentidadLocal = { id:string; nombre:string };
const CLAVE='cuentitos-lector-offline';
function identidadGuardada():IdentidadLocal|null {
  try {const r=JSON.parse(localStorage.getItem(CLAVE)||'null');return r && typeof r.id==='string' && typeof r.nombre==='string' ? r : null;} catch {return null;}
}
function App() {
  const [offline,setOffline]=useState<IdentidadLocal|null>(()=>navigator.onLine?null:identidadGuardada());
  const [session,setSession]=useState<Session|null>(null);
  const [cargando,setCargando]=useState(!!supabase && !offline);
  const [preview,setPreview]=useState(false);
  const [recuperando,setRecuperando]=useState(false);
  const [libro,setLibro]=useState<Libro|null>(null);
  const [error,setError]=useState('');
  const identidadRef=useRef<string|null>(offline?.id??null);
  // Before mounting a local library, select its remembered account (not a cloud credential).
  seleccionarBiblioteca(session?.user.id??offline?.id??null);
  useEffect(()=>{
    if(!supabase)return;
    const {data:{subscription}}=supabase.auth.onAuthStateChange((evento,nueva)=>{
      const id=nueva?.user.id??null;
      if(id && nueva?.user.email_confirmed_at) {
        const recuerdo={id,nombre:String(nueva.user.user_metadata?.nombre||'lector')};
        try {localStorage.setItem(CLAVE,JSON.stringify(recuerdo));}catch {/* Local downloads still work for this session. */}
        setOffline(null);setSession(nueva);
        if(identidadRef.current!==id)setLibro(null);
        identidadRef.current=id;
      } else if(evento==='SIGNED_OUT') {
        setSession(null);
        // Server expiry while offline must not discard local reading access.
        if(!navigator.onLine)setOffline(identidadGuardada());
        else {setOffline(null);try{localStorage.removeItem(CLAVE);}catch{}setLibro(null);}
      }
      setCargando(false);
      if(evento==='PASSWORD_RECOVERY')setRecuperando(true);
    });
    const actualizarRed=()=>{
      if(!navigator.onLine) {setOffline(identidadGuardada());setCargando(false);}
      else void supabase!.auth.getSession().then(({data})=>{if(!data.session)setError('Conéctate a tu cuenta para sincronizar; puedes seguir leyendo tus descargas.');});
    };
    window.addEventListener('offline',actualizarRed);window.addEventListener('online',actualizarRed);
    return()=>{subscription.unsubscribe();window.removeEventListener('offline',actualizarRed);window.removeEventListener('online',actualizarRed);};
  },[]);
  const uid=session?.user.id??offline?.id;
  useEffect(()=>{
    if(!uid)return;
    const sincronizar=()=>{if(navigator.onLine)void sincronizarBiblioteca(uid).catch(()=>{/* Library provides status and retry. */});};
    const timer=setInterval(sincronizar,30000);window.addEventListener('online',sincronizar);
    return()=>{clearInterval(timer);window.removeEventListener('online',sincronizar);};
  },[uid]);
  const salir=async()=>{
    if(preview){setPreview(false);setLibro(null);return;}
    // Remove remembered local access before the SDK emits SIGNED_OUT.
    try {localStorage.removeItem(CLAVE);}catch{}
    setOffline(null);setLibro(null);setRecuperando(false);
    const resultado=await supabase?.auth.signOut({scope:'local'});
    if(resultado?.error)setError('No pudimos cerrar la sesión. Reintenta cuando haya conexión.');
    else {setSession(null);identidadRef.current=null;seleccionarBiblioteca(null);}
  };
  return <LimiteDeError>{cargando?<div className="inicio-cargando" role="status">Abriendo tu rincón de lectura…</div>
    :(!session&&!offline&&!preview)||recuperando?<Acceso onPreview={()=>{seleccionarBiblioteca(null);setPreview(true);}} recuperando={recuperando} onRecuperado={()=>setRecuperando(false)}/>
    :libro?<PantallaLector key={`${uid}-${libro.id}`} libro={libro} onCerrar={()=>setLibro(null)} onProgresoActualizado={()=>{}}/>
    :<><PantallaBiblioteca key={uid??'preview'} nombre={session?.user.user_metadata?.nombre||offline?.nombre||'lector'} preview={preview} onSalir={salir} onAbrirLibro={setLibro}/>{error&&<div role="alert" className="mensaje-error">{error}</div>}</>}
  </LimiteDeError>;
}
export default App;
