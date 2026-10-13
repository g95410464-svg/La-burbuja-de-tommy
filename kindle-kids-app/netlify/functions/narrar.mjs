// Credentials are runtime environment variables. Never use a VITE_ prefix for secrets.
const json = (status, error) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
export function crearNarrador(env, solicitar = fetch) {
  return async request => {
    if (request.method !== 'POST') return json(405, 'Usa POST.');
    if (!request.headers.get('authorization')?.startsWith('Bearer ')) return json(401, 'Inicia sesión para preparar la narración.');
    if (!env.ELEVENLABS_API_KEY) {
      return json(503, 'La voz del cuento aún no está activada. Falta conectar ElevenLabs.');
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return json(503, 'Falta configurar el acceso a la narración.');
    // Read a bounded body even when Content-Length is missing or dishonest.
    const reader = request.body?.getReader();
    if (!reader) return json(400, 'Falta el texto.');
    let cuerpo = '', bytes = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 32000) { await reader.cancel(); return json(413, 'Esta página contiene demasiado texto.'); }
        cuerpo += decoder.decode(value, { stream: true });
      }
      cuerpo += decoder.decode();
    } catch { return json(400, 'No se pudo leer la solicitud.'); }
    let texto;
    try { texto = JSON.parse(cuerpo).texto; } catch { return json(400, 'Solicitud no válida.'); }
    if (typeof texto !== 'string' || !texto.trim() || texto.length > 5000 || Array.from(texto).some(c => c.charCodeAt(0) < 32 && !'\t\n\r'.includes(c))) return json(400, 'La página debe tener entre 1 y 5.000 caracteres de texto.');
    try {
      // Verify the token against Auth; never trust a client-provided user ID or JWT payload.
      const auth = await solicitar(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: request.headers.get('authorization'), apikey: env.SUPABASE_PUBLISHABLE_KEY },
        signal: AbortSignal.timeout(10000),
      });
      if (!auth.ok) return json(auth.status >= 500 ? 503 : 401, 'No se pudo verificar tu sesión. Vuelve a entrar e inténtalo.');
      const user = await auth.json();
      if (!user.id || user.is_anonymous || !user.email_confirmed_at) return json(403, 'Confirma tu correo antes de generar una narración.');
      const respuesta = await solicitar('https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128', {
        method: 'POST', headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text: texto, model_id: 'eleven_multilingual_v2', voice_settings: {
          stability: 0.65, similarity_boost: 0.75, style: 0, speed: 0.9, use_speaker_boost: true,
        } }), signal: AbortSignal.timeout(25000),
      });
      if (!respuesta.ok) {
        // ElevenLabs reports quota_exceeded as HTTP 401, not always 429.
        // Translate known codes without forwarding upstream bodies or credentials.
        const detalle = await respuesta.json().catch(() => null);
        const codigo = detalle?.detail?.status;
        if (codigo === 'quota_exceeded') return json(429, 'La clave de ElevenLabs no tiene créditos disponibles. Revisa su límite y la cuota gratuita. Puedes escuchar los audios ya guardados.');
        if (respuesta.status === 429) return json(429, 'El servicio de voz está ocupado. Espera un minuto e inténtalo de nuevo.');
        if (codigo === 'missing_permissions') return json(503, 'La clave de ElevenLabs necesita el permiso Text to Speech.');
        if (codigo === 'invalid_api_key' || respuesta.status === 401) return json(503, 'No se pudo autorizar el servicio de voz. Revisa la clave de ElevenLabs.');
        return json(502, 'No se pudo generar la voz. Inténtalo más tarde o revisa el servicio.');
      }
      if (!respuesta.headers.get('content-type')?.includes('audio/')) return json(502, 'El servicio no devolvió un audio válido.');
      const audio = await respuesta.arrayBuffer();
      if (!audio.byteLength || audio.byteLength > 5 * 1024 * 1024) return json(502, 'El servicio no devolvió un audio válido.');
      return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store' } });
    } catch { return json(503, 'La narración tardó demasiado o no hay conexión con el servicio. Inténtalo de nuevo.'); }
  };
}

export default request => crearNarrador(process.env)(request);
// Platform rate limit caps repeated generation before the function/provider is called.
export const config = { rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
