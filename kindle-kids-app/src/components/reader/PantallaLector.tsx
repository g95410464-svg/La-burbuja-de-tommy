/**
 * components/reader/PantallaLector.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Pantalla del LECTOR DE CUENTOS: experiencia visual de e-reader / libro
 * digital limpia, enfocada y responsive.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Libro, ProgresoLectura } from '../../types/libro';
import { usePdfReader } from '../../hooks/usePdfReader';
import { guardarProgreso } from '../../lib/storageManager';
import { CargandoCuento } from '../shared/CargandoCuento';
import { AvisoError } from '../shared/AvisoError';

interface PropiedadesPantallaLector {
  libro: Libro;
  onCerrar: () => void;
  onProgresoActualizado: (progreso: ProgresoLectura) => void;
}

export function PantallaLector({ libro, onCerrar, onProgresoActualizado }: PropiedadesPantallaLector) {
  const {
    estadoCarga,
    totalPaginas,
    paginaActual,
    imagenPaginaActual,
    cargandoPagina,
    mensajeError,
    paginaSiguiente,
    paginaAnterior,
  } = usePdfReader(libro.fuente, libro.id);

  const [errorGuardado, setErrorGuardado] = useState('');
  const [controlesVisibles, setControlesVisibles] = useState(true);

  useEffect(() => {
    if (estadoCarga !== 'listo' || totalPaginas === 0) return;

    const progreso: ProgresoLectura = {
      libroId: libro.id,
      paginaActual,
      ultimaLectura: new Date().toISOString(),
      completado: paginaActual >= totalPaginas,
    };

    guardarProgreso(progreso).catch(() => setErrorGuardado('No se pudo guardar el avance. Comprueba el espacio disponible.'));
    onProgresoActualizado(progreso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginaActual, estadoCarga, totalPaginas, libro.id]);

  useEffect(() => {
    const manejarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'ArrowRight') paginaSiguiente();
      if (evento.key === 'ArrowLeft') paginaAnterior();
      if (evento.key === 'Escape') onCerrar();
    };

    window.addEventListener('keydown', manejarTecla);
    return () => window.removeEventListener('keydown', manejarTecla);
  }, [paginaSiguiente, paginaAnterior, onCerrar]);

  const alternarControles = useCallback(() => {
    setControlesVisibles((previo) => !previo);
  }, []);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className="fixed inset-0 z-40 min-h-screen flex flex-col bg-stone-900 text-stone-100 font-serif leading-relaxed overflow-hidden">
      {errorGuardado && <p role="alert" className="fixed top-16 left-4 right-4 z-50 mensaje-error">{errorGuardado}</p>}
      {/* ── Header superior ─────────────────────────────────────────── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 gradient-header flex items-center gap-4 px-4 sm:px-6 py-3 backdrop-blur-md transition-transform duration-300 ease-out ${
          controlesVisibles ? 'translate-y-0' : '-translate-y-full'
        } pointer-events-auto`}
      >
        <button
          onClick={onCerrar}
          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cuento-amarillo shadow-none"
          aria-label="Cerrar y volver a la biblioteca"
        >
          <X size={24} />
        </button>

        <h1 className="font-cuento font-bold text-white text-sm sm:text-base truncate flex-1">
          {libro.titulo}
        </h1>
      </header>

      {/* ── Área de lectura principal ───────────────────────────────── */}
      <div
        className="flex-1 relative overflow-hidden flex flex-col items-center justify-center pt-14 pb-12 select-none"
        onClick={alternarControles}
      >
        {estadoCarga === 'cargando' && (
          <div className="text-white">
            <CargandoCuento mensaje="Abriendo las páginas..." />
          </div>
        )}

        {estadoCarga === 'error' && (
          <div className="bg-cuento-crema rounded-blob mx-4">
            <AvisoError
              mensaje={mensajeError ?? 'No se pudo abrir este cuento.'}
              onVolver={onCerrar}
            />
          </div>
        )}

        {estadoCarga === 'listo' && totalPaginas > 0 && (
          <div className="w-full h-full flex items-center justify-center p-2 sm:p-6">
            <div className="relative max-w-4xl max-h-[calc(100vh-100px)] bg-[#fdfbf7] shadow-2xl rounded-md overflow-hidden flex items-center justify-center border border-stone-800">
              {imagenPaginaActual ? (
                <img
                  src={imagenPaginaActual}
                  alt={`Página ${paginaActual}`}
                  className="max-w-full max-h-[calc(100vh-120px)] object-contain pointer-events-none"
                />
              ) : (
                <div className="p-12 text-stone-500 text-sm font-sans">
                  Cargando página...
                </div>
              )}
            </div>
          </div>
        )}

        {cargandoPagina && imagenPaginaActual && (
          <div className="absolute bottom-14 right-6 bg-stone-800/90 text-stone-200 border border-stone-700 rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg z-30">
            Cargando...
          </div>
        )}

        {/* ── Botones de navegación laterales ─────────────────────── */}
        {!isMobile && (
          <>
            <button
              onClick={(evento) => {
                evento.stopPropagation();
                paginaAnterior();
              }}
              className="absolute top-1/2 -translate-y-1/2 left-4 z-30 w-14 h-14 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center shadow-xl transition-all duration-150 ease-out active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-cuento-amarillo"
              aria-label="Página anterior"
            >
              <ChevronLeft size={30} />
            </button>
            <button
              onClick={(evento) => {
                evento.stopPropagation();
                paginaSiguiente();
              }}
              className="absolute top-1/2 -translate-y-1/2 right-4 z-30 w-14 h-14 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center shadow-xl transition-all duration-150 ease-out active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-cuento-amarillo"
              aria-label="Página siguiente"
            >
              <ChevronRight size={30} />
            </button>
          </>
        )}

        {/* ── Indicador de página inferior ────────────────────────────── */}
        <footer
          className={`fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between px-4 sm:px-6 py-2.5 bg-stone-950/80 backdrop-blur-md text-stone-300 text-xs font-sans border-t border-stone-800/50 transition-transform duration-300 ease-out ${
            controlesVisibles ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <span>
            Página <strong className="text-white">{paginaActual}</strong> de{' '}
            <strong className="text-white">{totalPaginas}</strong>
          </span>
          <span className="text-stone-400 text-[11px]">
            Usa las flechas o los botones laterales
          </span>
        </footer>
      </div>
    </div>
  );
}