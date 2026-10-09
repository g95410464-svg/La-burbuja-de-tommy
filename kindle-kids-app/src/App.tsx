import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Libro } from './types/libro';
import { PantallaBiblioteca } from './components/library/PantallaBiblioteca';
import { PantallaLector } from './components/reader/PantallaLector';
import { LimiteDeError } from './components/shared/LimiteDeError';
import { Acceso } from './components/auth/Acceso';
import { supabase } from './lib/supabase';
import { seleccionarBiblioteca } from './lib/storageManager';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(!!supabase);
  const [preview, setPreview] = useState(false);
  const [recuperando, setRecuperando] = useState(false);
  const [libro, setLibro] = useState<Libro | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!supabase) return;
    let activo = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, nueva) => {
      if (!activo) return;
      seleccionarBiblioteca(nueva?.user.id ?? null);
      setSession(nueva); setLibro(null); setCargando(false);
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true);
      if (evento === 'SIGNED_OUT') setRecuperando(false);
    });
    // INITIAL_SESSION is emitted by the SDK after restoring the session.
    return () => { activo = false; subscription.unsubscribe(); };
  }, []);
  const salir = async () => {
    if (preview) { setPreview(false); setLibro(null); return; }
    const resultado = await supabase?.auth.signOut({ scope: 'local' });
    if (resultado?.error) setError('No pudimos cerrar sesión. Inténtalo nuevamente.');
  };
  return <LimiteDeError>{cargando ? <div className="inicio-cargando" role="status">Abriendo tu rincón de lectura…</div>
    : (!session && !preview) || recuperando ? <Acceso onPreview={() => { seleccionarBiblioteca(null); setPreview(true); }} recuperando={recuperando} onRecuperado={() => setRecuperando(false)} />
    : libro ? <PantallaLector key={libro.id} libro={libro} onCerrar={() => setLibro(null)} onProgresoActualizado={() => {}} />
    : <><PantallaBiblioteca key={session?.user.id ?? 'preview'} nombre={session?.user.user_metadata?.nombre || 'lector'} preview={preview} onSalir={salir} onAbrirLibro={setLibro} />{error && <div role="alert" className="mensaje-error">{error}</div>}</>}
  </LimiteDeError>;
}
export default App;
