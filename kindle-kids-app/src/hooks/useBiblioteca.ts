/**
 * hooks/useBiblioteca.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CAPA DE APLICACIÓN (orquestación de casos de uso).
 *
 * Este hook es el "cerebro" de la biblioteca: combina los libros base
 * (estáticos, del bundle) con los libros que el usuario ha subido y
 * persistido en IndexedDB, junto con el progreso de lectura de cada uno.
 *
 * Al vivir en un hook (y no directamente dentro de un componente),
 * cualquier componente que necesite la biblioteca —la pantalla principal,
 * una futura pantalla de "favoritos", etc.— puede reutilizar esta misma
 * lógica sin duplicarla. Esto es el principio "Don't Repeat Yourself"
 * combinado con "Separation of Concerns": los componentes de UI solo
 * pintan, este hook decide QUÉ hay que pintar.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Libro, ProgresoLectura, Resultado } from '../types/libro';
import { LIBROS_BASE } from '../data/bibliotecaBase';
import {
  obtenerLibrosGuardados,
  obtenerTodoElProgreso,
  guardarLibro as guardarLibroEnDB,
  eliminarLibro as eliminarLibroEnDB,
} from '../lib/storageManager';

interface EstadoBiblioteca {
  /** Todos los libros (base + subidos), ya combinados y ordenados. */
  libros: Libro[];
  /** Progreso de lectura indexado por id de libro. */
  progresoPorLibro: Record<string, ProgresoLectura>;
  /** true mientras se hace la carga inicial desde IndexedDB. */
  cargando: boolean;
  /** Mensaje de error no bloqueante (p. ej. fallo puntual de lectura de DB). */
  error: string | null;
}

/**
 * Hook principal de la biblioteca.
 *
 * Devuelve el estado combinado y funciones de mutación (agregar/eliminar
 * libro) que mantienen sincronizados IndexedDB y el estado en memoria de
 * React, para que la UI se actualice de forma inmediata y optimista.
 */
export function useBiblioteca() {
  const [estado, setEstado] = useState<EstadoBiblioteca>({
    libros: [],
    progresoPorLibro: {},
    cargando: true,
    error: null,
  });

  /**
   * Carga inicial: combina la biblioteca base (siempre disponible, sin
   * async real) con los libros guardados por el usuario en IndexedDB
   * (async, puede tardar y puede fallar).
   */
  const cargarBiblioteca = useCallback(async () => {
    setEstado((previo) => ({ ...previo, cargando: true, error: null }));

    try {
      const [librosGuardados, progreso] = await Promise.all([
        obtenerLibrosGuardados(),
        obtenerTodoElProgreso(),
      ]);

      // Orden: primero los subidos por el usuario más recientes, luego
      // los libros base. Esto imita el comportamiento de apps reales
      // donde "lo último que agregaste" aparece primero.
      const librosCombinados = [
        ...librosGuardados.sort(
          (a, b) =>
            new Date(b.fechaAgregado).getTime() -
            new Date(a.fechaAgregado).getTime()
        ),
        ...LIBROS_BASE,
      ];

      setEstado({
        libros: librosCombinados,
        progresoPorLibro: progreso,
        cargando: false,
        error: null,
      });
    } catch (error) {
      // Blindaje: incluso si algo inesperado falla aquí, mostramos al
      // menos la biblioteca base para que la app siga siendo usable.
      console.error('[useBiblioteca] Error al cargar la biblioteca:', error);
      setEstado({
        libros: [...LIBROS_BASE],
        progresoPorLibro: {},
        cargando: false,
        error:
          'No se pudieron cargar tus libros guardados. Se muestra la biblioteca principal.',
      });
    }
  }, []);

  useEffect(() => {
    cargarBiblioteca();
  }, [cargarBiblioteca]);

  /**
   * Agrega un nuevo libro subido: lo persiste en IndexedDB y luego
   * actualiza el estado en memoria de forma optimista (sin tener que
   * releer toda la biblioteca de la base de datos).
   */
  const agregarLibro = useCallback(
    async (libro: Libro, pdfBlob: Blob): Promise<Resultado<void>> => {
      const resultado = await guardarLibroEnDB(libro, pdfBlob);

      if (resultado.ok) {
        setEstado((previo) => ({
          ...previo,
          libros: [libro, ...previo.libros],
        }));
      }

      return resultado;
    },
    []
  );

  /**
   * Elimina un libro de la biblioteca (solo aplica a libros subidos por
   * el usuario; los libros base nunca se pueden eliminar, ver UI).
   */
  const eliminarLibro = useCallback(
    async (libroId: string): Promise<Resultado<void>> => {
      const resultado = await eliminarLibroEnDB(libroId);

      if (resultado.ok) {
        setEstado((previo) => ({
          ...previo,
          libros: previo.libros.filter((l) => l.id !== libroId),
        }));
      }

      return resultado;
    },
    []
  );

  /**
   * Actualiza en memoria el progreso de un libro concreto, para que la
   * barra de progreso de la biblioteca refleje al instante los cambios
   * hechos dentro del lector, sin esperar a un refresco completo.
   */
  const actualizarProgresoEnMemoria = useCallback((progreso: ProgresoLectura) => {
    setEstado((previo) => ({
      ...previo,
      progresoPorLibro: {
        ...previo.progresoPorLibro,
        [progreso.libroId]: progreso,
      },
    }));
  }, []);

  // `useMemo` evita recalcular estadísticas derivadas en cada render si
  // el estado base no cambió (por ejemplo, mientras el usuario navega
  // dentro del lector y este hook sigue "vivo" en un componente padre).
  const totalLibros = useMemo(() => estado.libros.length, [estado.libros]);

  return {
    libros: estado.libros,
    progresoPorLibro: estado.progresoPorLibro,
    cargando: estado.cargando,
    error: estado.error,
    totalLibros,
    agregarLibro,
    eliminarLibro,
    actualizarProgresoEnMemoria,
    recargar: cargarBiblioteca,
  };
}
