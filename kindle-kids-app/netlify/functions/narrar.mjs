// Credentials are runtime environment variables. Never use a VITE_ prefix for secrets.
const json = (status, error) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
export const escaparXml = texto => texto.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

export function crearNarrador(env, solicitar = fetch) {
  return async request => {
    if (request.method !== 'POST') return json(405, 'Usa POST.');
    if (!request.headers.get('authorization')?.startsWith('Bearer ')) return json(401, 'Inicia sesión para preparar la narración.');
    if (!env.AZURE_SPEECH_KEY || !/^[a-z0-9]+$/.test(env.AZURE_SPEECH_REGION ?? '') || env.AZURE_SPEECH_TIER !== 'F0') {
      return json(503, 'La voz del cuento aún no está activada. Falta conectar Azure Speech Free F0.');
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
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-MX"><voice name="es-MX-DaliaNeural"><prosody rate="-10%">${escaparXml(texto)}</prosody></voice></speak>`;
      const respuesta = await solicitar(`https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'Cuentitos' },
        body: ssml, signal: AbortSignal.timeout(25000),
      });
      if (respuesta.status === 429) return json(429, 'La voz alcanzó un límite temporal o la cuota gratuita. Puedes escuchar las páginas ya guardadas.');
      if (!respuesta.ok) return json(502, 'No se pudo generar la voz. Revisa la configuración del servicio o inténtalo más tarde.');
      const audio = await respuesta.arrayBuffer();
      if (!audio.byteLength || audio.byteLength > 5 * 1024 * 1024) return json(502, 'El servicio no devolvió un audio válido.');
      return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store' } });
    } catch { return json(503, 'La narración tardó demasiado o no hay conexión con el servicio. Inténtalo de nuevo.'); }
  };
}

export default request => crearNarrador(process.env)(request);
// Platform rate limit caps repeated generation before the function/provider is called.
export const config = { rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
