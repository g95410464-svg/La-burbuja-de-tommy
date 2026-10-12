import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearNarrador } from '../netlify/functions/narrar.mjs';
import { unirTextoPdf } from '../src/lib/textoPdf.ts';
import { bibliotecaLocal, seleccionarBiblioteca } from '../src/lib/storageManager.ts';
import type { Libro } from '../src/types/libro.ts';

const env = { AZURE_SPEECH_KEY: 'private-test-key', AZURE_SPEECH_REGION: 'eastus', AZURE_SPEECH_TIER: 'F0', SUPABASE_URL: 'https://auth.example', SUPABASE_PUBLISHABLE_KEY: 'public-test-key' };
const request = (texto = 'Había una vez un pequeño conejo.', token = 'test-token') => new Request('https://cuento.example/.netlify/functions/narrar', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify({ texto }) });

test('voz requiere configuración gratuita, sesión verificada y correo confirmado antes de llamar Azure', async () => {
  let llamadas = 0;
  const nunca = async () => { llamadas++; throw new Error('No debe llamarse'); };
  assert.equal((await crearNarrador(env, nunca)(request('cuento', ''))).status, 401);
  assert.equal((await crearNarrador({ ...env, AZURE_SPEECH_TIER: 'S0' }, nunca)(request())).status, 503);
  assert.equal((await crearNarrador(env, nunca)(request('a'.repeat(5001)))).status, 400);
  assert.equal(llamadas, 0);
  const invalido = await crearNarrador(env, async () => { llamadas++; return Response.json({}, { status: 401 }); })(request());
  assert.equal(invalido.status, 401); assert.equal(llamadas, 1);
  const sinConfirmar = await crearNarrador(env, async () => Response.json({ id: 'a' }))(request());
  assert.equal(sinConfirmar.status, 403);
});

test('voz convierte texto literal en SSML seguro y devuelve audio privado sin claves', async () => {
  const llamadas: Array<{ url: string; opciones: RequestInit }> = [];
  const servicio = crearNarrador(env, async (url: string, opciones: RequestInit) => {
    llamadas.push({ url, opciones });
    return llamadas.length === 1 ? Response.json({ id: 'a', email_confirmed_at: '2026-01-01' }) : new Response(new Uint8Array([1, 2, 3]));
  });
  const respuesta = await servicio(request('<audio src="evil"/> & cuento'));
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('content-type'), 'audio/mpeg');
  assert.equal(respuesta.headers.get('cache-control'), 'private, no-store');
  assert.match(String(llamadas[1].opciones.body), /&lt;audio src=&quot;evil&quot;\/&gt; &amp; cuento/);
  assert.equal(llamadas[1].url, 'https://eastus.tts.speech.microsoft.com/cognitiveservices/v1');
  assert.deepEqual([...new Uint8Array(await respuesta.arrayBuffer())], [1,2,3]);
});

test('agotamiento de cuota y errores del proveedor no exponen respuestas internas ni activan pago', async () => {
  for (const codigo of [429, 401, 500]) {
    let n = 0;
    const respuesta = await crearNarrador(env, async () => ++n === 1 ? Response.json({ id: 'a', email_confirmed_at: 'yes' }) : new Response('private-test-key', { status: codigo }))(request());
    assert.equal(respuesta.status, codigo === 429 ? 429 : 502);
    assert.equal((await respuesta.text()).includes('private-test-key'), false);
    assert.equal(n, 2);
  }
});

test('texto PDF une palabras partidas y mantiene acentos y el orden original', () => {
  assert.equal(unirTextoPdf([{ str: 'El peque-', hasEOL: true }, { str: 'ño búho' }, {}, { str: 'voló.' }]), 'El pequeño búho voló.');
  assert.equal(unirTextoPdf([{}]), '');
});

test('audio queda aislado por cuenta, reemplaza una página y se elimina junto con el libro', async () => {
  const a = bibliotecaLocal('audio-a'), b = bibliotecaLocal('audio-b');
  const blob = new Blob(['pdf']);
  const libro: Libro = { id: 'audio-libro', titulo: 'Cuento', totalPaginas: 2, portadaUrl: '', origen: 'subido-por-usuario', fuente: { tipo: 'blob', blob }, colorAcento: '#123456', fechaAgregado: new Date().toISOString() };
  await a.guardar(libro, blob);
  seleccionarBiblioteca('audio-b');
  assert.equal(await a.guardarNarracion(libro.id, 1, 'huella', new Blob(['audio'])), true);
  assert.equal(await b.narracion(libro.id, 1), undefined);
  assert.equal((await a.narracion(libro.id, 1))?.huella, 'huella');
  await a.guardarNarracion(libro.id, 1, 'revision', new Blob(['nuevo']));
  assert.equal((await a.narracion(libro.id, 1))?.huella, 'revision');
  await a.eliminar(libro.id);
  assert.equal(await a.narracion(libro.id, 1), undefined);
  assert.equal(await a.guardarNarracion(libro.id, 1, 'tardio', new Blob(['audio'])), false);
});

test('el límite local conserva audios anteriores y quitar la descarga limpia los audios', async () => {
  const local = bibliotecaLocal('audio-limite');
  const blob = new Blob(['pdf']);
  const libro: Libro = { id: 'limite', titulo: 'Cuento', totalPaginas: 2, portadaUrl: '', origen: 'subido-por-usuario', fuente: { tipo: 'blob', blob }, colorAcento: '#123456', fechaAgregado: new Date().toISOString() };
  await local.guardar(libro, blob);
  const grande = new Blob([new Uint8Array(33 * 1024 * 1024)]);
  assert.equal(await local.guardarNarracion(libro.id, 1, 'primero', grande), true);
  assert.equal(await local.guardarNarracion(libro.id, 2, 'segundo', grande), false);
  assert.equal((await local.narracion(libro.id, 1))?.huella, 'primero');
  await local.confirmarSubida(libro.id);
  await local.quitarDescarga(libro.id);
  assert.equal(await local.narracion(libro.id, 1), undefined);
  assert.equal(await local.guardarNarracion(libro.id, 1, 'tardio', grande), false);
});
