import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seleccionarBiblioteca, guardarLibro, obtenerLibrosGuardados, guardarProgreso, obtenerTodoElProgreso, eliminarLibro } from '../src/lib/storageManager.ts';
import { LIBROS_BASE } from '../src/data/bibliotecaBase.ts';
import type { Libro } from '../src/types/libro.ts';

test('las colecciones y el progreso se separan por cuenta sin borrar la biblioteca anterior', async () => {
  const blob = new Blob(['test'], { type: 'application/pdf' });
  const libro: Libro = { id:'cuento', titulo:'Mi cuento', totalPaginas:2, portadaUrl:'', origen:'subido-por-usuario', fuente:{tipo:'blob',blob}, colorAcento:'#123456', fechaAgregado:new Date().toISOString() };
  seleccionarBiblioteca(null);
  assert.equal((await guardarLibro({...libro, id:'anterior'}, blob)).ok, true);
  seleccionarBiblioteca('cuenta-a');
  assert.deepEqual(await obtenerLibrosGuardados(), []);
  await guardarLibro(libro, blob);
  await guardarProgreso({libroId:'cuento', paginaActual:2, completado:true, ultimaLectura:new Date().toISOString()});
  seleccionarBiblioteca('cuenta-b');
  assert.deepEqual(await obtenerLibrosGuardados(), []);
  assert.deepEqual(await obtenerTodoElProgreso(), {});
  seleccionarBiblioteca('cuenta-a');
  assert.equal((await obtenerLibrosGuardados())[0].titulo, 'Mi cuento');
  assert.equal((await obtenerTodoElProgreso()).cuento.paginaActual, 2);
  assert.equal((await eliminarLibro('cuento')).ok, true);
  assert.deepEqual(await obtenerTodoElProgreso(), {});
  assert.deepEqual(await obtenerLibrosGuardados(), []);
  seleccionarBiblioteca(null);
  assert.equal((await obtenerLibrosGuardados())[0].id, 'anterior');
});

test('el catálogo no anuncia los libros de prueba retirados', () => {
  assert.deepEqual(LIBROS_BASE, []);
});
