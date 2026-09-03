/**
 * data/bibliotecaBase.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Catálogo de libros PRECARGADOS con la aplicación ("Biblioteca Base").
 *
 * Estos libros viven como archivos PDF estáticos en `/public/books/` y se
 * describen aquí como metadatos. Al arrancar, esta app no necesita ningún
 * backend ni proceso de subida para tener contenido: funciona "out of the
 * box", tal como pide el requisito de negocio.
 *
 * IMPORTANTE: las portadas (`portadaUrl`) de estos libros NO se generan en
 * tiempo de ejecución a partir del PDF (a diferencia de los libros que
 * sube el usuario). Usamos imágenes ya renderizadas en `/public/covers/`
 * para que la biblioteca aparezca instantáneamente, sin tener que
 * descargar y procesar cada PDF solo para mostrar su portada.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Libro } from '../types/libro';

export const LIBROS_BASE: Libro[] = [
  {
    id: 'base-luna-estrellas',
    titulo: 'Luna y las Estrellas Curiosas',
    autor: 'Biblioteca Cuentitos',
    totalPaginas: 7,
    portadaUrl: '/covers/luna-estrellas.png',
    origen: 'biblioteca-base',
    fuente: { tipo: 'url', url: '/books/luna-estrellas.pdf' },
    colorAcento: '#3B4A8C',
    fechaAgregado: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'base-bosque-amigos',
    titulo: 'El Bosque de los Amigos',
    autor: 'Biblioteca Cuentitos',
    totalPaginas: 7,
    portadaUrl: '/covers/bosque-amigos.png',
    origen: 'biblioteca-base',
    fuente: { tipo: 'url', url: '/books/bosque-amigos.pdf' },
    colorAcento: '#4C9A6B',
    fechaAgregado: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'base-granja-feliz',
    titulo: 'Un Día en la Granja Feliz',
    autor: 'Biblioteca Cuentitos',
    totalPaginas: 7,
    portadaUrl: '/covers/granja-feliz.png',
    origen: 'biblioteca-base',
    fuente: { tipo: 'url', url: '/books/granja-feliz.pdf' },
    colorAcento: '#6BB7E0',
    fechaAgregado: '2026-01-01T00:00:00.000Z',
  },
];
