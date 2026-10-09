import { useState } from 'react';
import { ArrowRight, BookOpen, Eye, EyeOff, Monitor, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { VerificarCorreo } from './VerificarCorreo';
import { MundoLibros } from '../shared/MundoLibros';

export function Acceso({ onPreview, recuperando, onRecuperado }: {
  onPreview: () => void; recuperando: boolean; onRecuperado: () => void;
}) {
  const [correoPendiente, setCorreoPendiente] = useState('');
  const [modo, setModo] = useState<'login' | 'registro' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [visible, setVisible] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const cambiar = (nuevo: typeof modo) => { setModo(nuevo); setError(''); setMensaje(''); setPassword(''); };
  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setOcupado(true); setError(''); setMensaje('');
    try {
      const redirectTo = window.location.origin;
      if (recuperando) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        onRecuperado();
      } else if (modo === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        setMensaje('Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.');
      } else if (modo === 'registro') {
        const { data, error } = await supabase.auth.signUp({ email, password,
          options: { data: { nombre: nombre.trim() }, emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (!data.session) { setCorreoPendiente(email.trim()); setPassword(''); }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error?.code === 'email_not_confirmed') { setCorreoPendiente(email.trim()); setPassword(''); }
        else if (error) throw error;
      }
    } catch {
      setError(modo === 'login' && !recuperando
        ? 'No pudimos iniciar sesión. Revisa tu correo, contraseña y conexión; confirma tu cuenta si acabas de registrarte.'
        : 'No pudimos completar la solicitud. Comprueba tu conexión e inténtalo nuevamente en unos minutos.');
    } finally { setOcupado(false); }
  };
  return <div className="acceso">
    <section className="acceso-historia">
      <a className="marca" href="/" aria-label="Cuentitos, inicio"><span className="marca-icono"><BookOpen size={23} /></span><span>Cuentitos<span className="marca-punto">.</span></span></a>
      <div className="acceso-presentacion"><span className="etiqueta"><Sparkles size={15} /> PEQUEÑOS LECTORES, GRANDES MUNDOS</span>
        <h1>Una historia. <br />Mil lugares <br /><em>por descubrir.</em></h1>
        <p>Un rincón para imaginar, aprender y volver a tus cuentos favoritos.</p>
        <MundoLibros />
      </div>
      <p className="nota-local"><Monitor size={17} /> Tus cuentos en la nube, tus descargas siempre contigo.</p>
    </section>
    <section className="acceso-panel"><div className="formulario-acceso">
      <span className="etiqueta">TU PRÓXIMA AVENTURA EMPIEZA AQUÍ</span>
      <h2>{recuperando ? 'Una nueva contraseña' : modo === 'registro' ? 'Hagamos espacio a la imaginación' : modo === 'reset' ? 'Volvamos a tu biblioteca' : 'Qué lindo verte por aquí'}</h2>
      <p>{recuperando ? 'Elige una contraseña de al menos 8 caracteres.' : modo === 'registro' ? 'Crea una cuenta con ayuda de tu familia o docente.' : modo === 'reset' ? 'Te enviaremos un enlace para recuperar el acceso.' : 'Entra a tu cuenta y encuentra tu próxima historia.'}</p>
      {!recuperando && !correoPendiente && <div className="acceso-pestanas" aria-label="Acceso a la cuenta"><button className={modo === 'login' ? 'activo' : ''} onClick={() => cambiar('login')}>Iniciar sesión</button><button className={modo === 'registro' ? 'activo' : ''} onClick={() => cambiar('registro')}>Crear cuenta</button></div>}
      {correoPendiente && !recuperando ? <VerificarCorreo email={correoPendiente} onVolver={() => { setCorreoPendiente(''); cambiar('login'); }} /> : <form onSubmit={enviar}>
        {modo === 'registro' && !recuperando && <label>¿Cómo te llamas?<input required maxLength={40} autoComplete="nickname" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre o apodo" /></label>}
        {!recuperando && <label>Correo electrónico<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@correo.com" /></label>}
        {(modo !== 'reset' || recuperando) && <label>Contraseña<div className="campo-password"><input required minLength={modo === 'registro' || recuperando ? 8 : undefined} type={visible ? 'text' : 'password'} autoComplete={modo === 'registro' || recuperando ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Tu contraseña" /><button type="button" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></label>}
        {modo === 'login' && !recuperando && <button type="button" className="enlace olvido" onClick={() => cambiar('reset')}>Olvidé mi contraseña</button>}
        {error && <p role="alert" className="mensaje-error">{error}</p>}
        {mensaje && <p role="status" className="mensaje-exito">{mensaje}</p>}
        <button className="boton-principal ancho" disabled={ocupado || !supabase} type="submit">{ocupado ? 'Un momento…' : recuperando ? 'Guardar contraseña' : modo === 'registro' ? 'Crear mi cuenta' : modo === 'reset' ? 'Enviar enlace' : 'Entrar a mi biblioteca'}<ArrowRight size={19} /></button>
      </form>}
      {!supabase && <div className="aviso-config"><p>Las cuentas aún no están activadas. Puedes explorar la biblioteca en una vista previa local.</p><button className="enlace" onClick={onPreview}>Explorar vista previa <ArrowRight size={16} /></button></div>}
      <p className="pie-acceso">Hecho para leer a tu ritmo, una página a la vez.</p>
    </div></section>
  </div>;
}
