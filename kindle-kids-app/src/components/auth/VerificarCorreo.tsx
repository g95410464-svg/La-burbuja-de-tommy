import { useEffect, useState } from 'react';
import { ArrowLeft, Clock3, MailCheck, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export function VerificarCorreo({ email, onVolver }: { email: string; onVolver: () => void }) {
  const otpActivado = import.meta.env.VITE_REGISTRATION_OTP_ENABLED === 'true';
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [reintentarDesde, setReintentarDesde] = useState(() => Date.now() + 60000);
  const [ahora, setAhora] = useState(Date.now);
  const [enfocado, setEnfocado] = useState(false);
  const espera = Math.max(0, Math.ceil((reintentarDesde - ahora) / 1000));
  useEffect(() => {
    const timer = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const verificar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || ocupado || codigo.length < 6) return;
    setOcupado(true); setError(''); setMensaje('');
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'email' });
      if (error) throw error;
    } catch { setError('El código no es válido o ya venció. Revisa el correo o solicita uno nuevo.'); }
    finally { setOcupado(false); }
  };
  const reenviar = async () => {
    if (!supabase || espera || ocupado) return;
    setOcupado(true); setError(''); setMensaje('');
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: window.location.origin } });
      if (error) throw error;
      setCodigo(''); setMensaje('Solicitud enviada. Revisa tu bandeja de entrada y spam.');
    } catch { setError('No se pudo reenviar. Espera un momento y comprueba tu conexión.'); }
    finally { const ahora = Date.now(); setAhora(ahora); setReintentarDesde(ahora + 60000); setOcupado(false); }
  };
  // One real field preserves paste, mobile autofill and screen-reader navigation.
  // Expand beyond six cells for projects configured with longer email codes.
  const casillas = Math.max(6, codigo.length);
  return <main className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-violet-100 flex items-center justify-center p-4 sm:p-6">
    <div className="w-full max-w-md">
      <button type="button" onClick={onVolver} disabled={ocupado} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900 disabled:opacity-50"><ArrowLeft size={16} aria-hidden="true" />Volver al acceso</button>
      <section aria-labelledby="verificacion-titulo" className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="text-center">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-600"><MailCheck size={28} aria-hidden="true" /></span>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-violet-600">Cuentitos</p>
          <h1 id="verificacion-titulo" className="text-3xl font-bold text-slate-900">Verifica tu correo</h1>
          <p id="codigo-ayuda" className="mt-3 text-sm leading-6 text-slate-500">{otpActivado ? 'Escribe el código de verificación enviado a' : 'Abre el enlace de confirmación enviado a'}</p>
          <p className="mt-1 break-all text-sm font-bold text-slate-800">{email}</p>
        </div>
        <form onSubmit={verificar} className="mt-8 space-y-6">
          {otpActivado && <div>
            <label htmlFor="codigo-verificacion" className="mb-3 block text-center text-sm font-semibold text-slate-700">Código de verificación</label>
            <div className="relative">
              <div aria-hidden="true" className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${casillas}, minmax(0, 1fr))` }}>
                {Array.from({ length: casillas }, (_, i) => <span key={i} className={`flex h-14 items-center justify-center rounded-xl border text-xl font-bold text-slate-900 transition ${enfocado && i === Math.min(codigo.length, casillas - 1) ? 'border-violet-500 bg-violet-50 ring-4 ring-violet-100' : 'border-slate-200 bg-white'}`}>{codigo[i] || ''}</span>)}
              </div>
              <input id="codigo-verificacion" className="absolute inset-0 h-full w-full cursor-text rounded-xl opacity-0" autoFocus required type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} value={codigo} disabled={ocupado} aria-describedby="codigo-ayuda codigo-mensaje" aria-invalid={!!error} onFocus={() => setEnfocado(true)} onBlur={() => setEnfocado(false)} onChange={e => { setCodigo(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); }} />
            </div>
          </div>}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Clock3 size={19} className="shrink-0 text-violet-600" aria-hidden="true" />{espera ? 'Puedes reenviar en' : 'Puedes pedir otro código'}</span>
              <span className="text-sm font-bold tabular-nums text-violet-600">{espera ? `${String(Math.floor(espera / 60)).padStart(2, '0')}:${String(espera % 60).padStart(2, '0')}` : 'Listo'}</span>
            </div>
          </div>
          <div id="codigo-mensaje">{error && <p role="alert" className="text-sm text-red-700">{error}</p>}{mensaje && <p role="status" className="text-sm text-emerald-700">{mensaje}</p>}</div>
          {otpActivado && <button type="submit" disabled={ocupado || codigo.length < 6} className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{ocupado ? 'Un momento…' : 'Verificar mi cuenta'}</button>}
        </form>
        <div className="mt-8 text-center">
          <p className="text-sm text-slate-500">¿No recibiste el correo? Revisa también spam.</p>
          <button type="button" onClick={reenviar} disabled={ocupado || espera > 0} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-violet-600 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw size={16} aria-hidden="true" />{otpActivado ? 'Reenviar código' : 'Reenviar confirmación'}</button>
        </div>
      </section>
    </div>
  </main>;
}

