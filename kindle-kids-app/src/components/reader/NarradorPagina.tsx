import { useEffect, useRef, useState } from 'react';
import { Headphones, LoaderCircle } from 'lucide-react';
import { bibliotecaLocal, usuarioActual } from '../../lib/storageManager';
import { supabase } from '../../lib/supabase';

export function NarradorPagina({ libroId, pagina, texto, listo, error, origen }: {
  libroId: string; pagina: number; texto: string | null; listo: boolean; error: string; origen: 'pdf' | 'ocr';
}) {
  const [estado, setEstado] = useState<'inactivo' | 'cargando' | 'listo'>('inactivo');
  const [mensaje, setMensaje] = useState('');
  const [url, setUrl] = useState('');
  const [verTexto, setVerTexto] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const ciclo = useRef<{ control: AbortController; url: string; ocupado: boolean } | null>(null);
  useEffect(() => {
    const actual = { control: new AbortController(), url: '', ocupado: false };
    ciclo.current = actual;
    const reproductor = audio.current;
    return () => {
      actual.control.abort(); reproductor?.pause();
      if (actual.url) URL.revokeObjectURL(actual.url);
    };
  }, []);

  async function escuchar() {
    const actual = ciclo.current;
    if (!actual || actual.ocupado || !texto?.trim()) return;
    actual.ocupado = true; setEstado('cargando'); setMensaje('Preparando la voz…');
    const local = bibliotecaLocal();
    const vigente = () => !actual.control.signal.aborted && usuarioActual() === local.id;
    try {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`azure-dalia-lenta-v1:${texto}`));
      const huella = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
      const guardado = await local.narracion(libroId, pagina).catch(() => undefined);
      if (!vigente()) return;
      let blob = guardado?.huella === huella ? guardado.audio : null;
      let conservado = !!blob;
      if (!blob) {
        if (!navigator.onLine) throw new Error('Esta página aún no tiene audio guardado. Conéctate una vez para prepararlo.');
        if (!supabase) throw new Error('Falta conectar el servicio de narración.');
        const { data, error: errorSesion } = await supabase.auth.getSession();
        if (errorSesion || !data.session || data.session.user.id !== local.id) throw new Error('Inicia sesión para preparar la voz del cuento.');
        if (!vigente()) return;
        const respuesta = await fetch('/.netlify/functions/narrar', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
          body: JSON.stringify({ texto }), signal: AbortSignal.any([actual.control.signal, AbortSignal.timeout(45000)]),
        });
        if (!respuesta.ok) {
          const detalle = await respuesta.json().catch(() => null);
          throw new Error(detalle?.error ?? (respuesta.status === 429 ? 'Espera un minuto antes de preparar otra narración.' : 'No se pudo preparar la narración. Inténtalo de nuevo.'));
        }
        if (!respuesta.headers.get('content-type')?.includes('audio/')) throw new Error('El servicio de voz aún no está disponible.');
        blob = await respuesta.blob();
        if (!blob.size) throw new Error('No se recibió audio. Vuelve a intentarlo.');
        if (!vigente()) return;
        conservado = await local.guardarNarracion(libroId, pagina, huella, blob).catch(() => false);
      }
      if (!vigente()) return;
      actual.url = URL.createObjectURL(blob); setUrl(actual.url); setEstado('listo');
      setMensaje(conservado ? 'Audio guardado en este dispositivo para escucharlo sin conexión.' : 'Puedes escucharlo ahora, pero no se pudo guardar para usarlo sin conexión.');
      // The element stays mounted so playback can start after generation. Some mobile browsers
      // require a second tap after an async download; native controls remain available.
      if (audio.current) {
        audio.current.src = actual.url;
        await audio.current.play().catch(() => {
          if (vigente()) setMensaje(conservado ? 'Audio guardado. Pulsa reproducir; también funciona sin conexión.' : 'Pulsa reproducir. Este audio no se pudo guardar sin conexión.');
        });
      }
    } catch (e) {
      if (vigente()) { setEstado('inactivo'); setMensaje(e instanceof Error ? e.message : 'No se pudo preparar la voz.'); }
    } finally { actual.ocupado = false; }
  }

  return <section aria-label={`Narración de la página ${pagina}`} className="w-full max-w-3xl mx-auto text-left">
    <div className="flex items-center gap-3">
      {estado !== 'listo' && <button type="button" onClick={escuchar} disabled={!listo || !texto?.trim() || !!error || estado === 'cargando'}
        className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-violet-200 px-4 text-sm font-bold text-violet-950 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white">
        {estado === 'cargando' ? <LoaderCircle size={18} className="animate-spin" /> : <Headphones size={18} />}
        {estado === 'cargando' ? 'Preparando…' : 'Escuchar página'}
      </button>}
      <audio ref={audio} src={url || undefined} controls preload="none" aria-label="Escuchar, pausar o recorrer la narración" className={url ? 'h-10 min-w-0 flex-1' : 'hidden'}
        onError={() => { if (url) { setMensaje('No se pudo reproducir el audio. Vuelve a abrir esta página para reintentar.'); } }} />
      {url && <label className="text-xs">Velocidad<select aria-label="Velocidad de la narración" defaultValue="1" onChange={e => { if (audio.current) audio.current.playbackRate = Number(e.target.value); }} className="block mt-1 rounded bg-stone-800 p-1 text-white">
        <option value="0.85">Más lenta</option><option value="1">Tranquila</option><option value="1.15">Más rápida</option>
      </select></label>}
      <button type="button" onClick={() => setVerTexto(!verTexto)} aria-expanded={verTexto} className="ml-auto min-h-11 px-2 text-xs text-violet-200 underline">{verTexto ? 'Ocultar texto' : 'Ver texto'}</button>
    </div>
    <p role="status" className="mt-1 text-[11px] leading-4 text-stone-300">{error || (!listo ? 'Preparando el texto de esta página…' : !texto?.trim() ? 'No se encontró texto para leer en esta página.' : mensaje || 'Voz en español. La primera preparación necesita internet.')}</p>
    {verTexto && <div className="mt-2 max-h-[25dvh] overflow-y-auto rounded-xl bg-white p-3 text-sm leading-relaxed text-stone-900 select-text" tabIndex={0}>
      {origen === 'ocr' && <p className="mb-2 text-xs text-stone-600">Texto reconocido de la imagen: puede contener errores.</p>}
      {texto || 'Todavía no hay texto disponible.'}
    </div>}
  </section>;
}
