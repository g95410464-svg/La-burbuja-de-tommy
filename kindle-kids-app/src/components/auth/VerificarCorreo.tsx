import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
export function VerificarCorreo({email,onVolver}:{email:string;onVolver:()=>void}) {
  const otpActivado = import.meta.env.VITE_REGISTRATION_OTP_ENABLED === 'true';
  const [codigo,setCodigo]=useState('');
  const [error,setError]=useState('');
  const [mensaje,setMensaje]=useState('');
  const [ocupado,setOcupado]=useState(false);
  const [espera,setEspera]=useState(60);
  useEffect(()=>{const timer=setInterval(()=>setEspera(s=>Math.max(0,s-1)),1000);return()=>clearInterval(timer);},[]);
  const verificar=async(e:React.FormEvent)=>{
    e.preventDefault();if(!supabase)return;setOcupado(true);setError('');
    try {
      const {error}=await supabase.auth.verifyOtp({email,token:codigo.trim(),type:'email'});
      if(error)throw error;
    } catch {setError('El código no es válido o ya venció. Revisa el correo o solicita uno nuevo.');}
    finally {setOcupado(false);}
  };
  const reenviar=async()=>{
    if(!supabase||espera||ocupado)return;
    setOcupado(true);setError('');setMensaje('');
    try {
      const {error}=await supabase.auth.resend({type:'signup',email,options:{emailRedirectTo:window.location.origin}});
      if(error)throw error;
      setEspera(60);setMensaje('Solicitud enviada. Revisa tu bandeja de entrada y spam.');
    }catch {setError('No se pudo reenviar. Espera un momento y comprueba tu conexión.');setEspera(60);}
    finally {setOcupado(false);}
  };
  return <section className="verificar-correo"><h3>Confirma tu correo</h3><p>{otpActivado ? 'Escribe el código enviado a ' : 'Abre el enlace de confirmación enviado a '}<strong>{email}</strong>. Revisa también la carpeta de spam.</p>{otpActivado && <form onSubmit={verificar}><label>Código de verificación<input autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} value={codigo} onChange={e=>setCodigo(e.target.value.replace(/\D/g,''))} placeholder="Código del correo" /></label>{error&&<p className="mensaje-error" role="alert">{error}</p>}{mensaje&&<p className="mensaje-exito" role="status">{mensaje}</p>}<button className="boton-principal ancho" disabled={ocupado||codigo.length<6}>{ocupado?'Verificando…':'Verificar y entrar'}</button></form>}<button className="enlace" disabled={ocupado||espera>0} onClick={reenviar}>{espera>0?`Reenviar en ${espera} s`:otpActivado ? 'Reenviar código' : 'Reenviar confirmación'}</button><button className="enlace ancho" disabled={ocupado} onClick={onVolver}>Volver al acceso</button></section>;
}
