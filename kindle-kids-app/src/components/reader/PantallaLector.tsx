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
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Libro, ProgresoLectura } from '../../types/libro';
import { usePdfReader } from '../../hooks/usePdfReader';
import { guardarProgreso } from '../../lib/storageManager';
import { CargandoCuento } from '../shared/CargandoCuento';
import { HojaAnimada } from './HojaAnimada';
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

  const [girando, setGirando] = useState(false);
  const navegacionOcupada = cargandoPagina || girando;

  const gesto = useRef<{ id: number; x: number; y: number } | null>(null);
  const omitirClick = useRef(false);
  const [arrastre, setArrastre] = useState(0);

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
      if (!navegacionOcupada && evento.key === 'ArrowRight') paginaSiguiente();
      if (!navegacionOcupada && evento.key === 'ArrowLeft') paginaAnterior();
      if (evento.key === 'Escape') onCerrar();
    };

    window.addEventListener('keydown', manejarTecla);
    return () => window.removeEventListener('keydown', manejarTecla);
  }, [paginaSiguiente, paginaAnterior, onCerrar, navegacionOcupada]);

  const alternarControles = useCallback(() => {
    if (omitirClick.current) { omitirClick.current = false; return; }
    setControlesVisibles((previo) => !previo);
  }, []);


  const iniciarGesto = (evento: ReactPointerEvent<HTMLDivElement>) => {
    if (!evento.isPrimary) {
      gesto.current = null; setArrastre(0); omitirClick.current = true;
      return;
    }
    omitirClick.current = false;
    if (estadoCarga !== 'listo' || navegacionOcupada || evento.button !== 0 ||
        (evento.target as HTMLElement).closest('button, a, input')) return;
    gesto.current = { id: evento.pointerId, x: evento.clientX, y: evento.clientY };
    evento.currentTarget.setPointerCapture(evento.pointerId);
  };
  const moverGesto = (evento: ReactPointerEvent<HTMLDivElement>) => {
    const inicio = gesto.current;
    if (!inicio || inicio.id !== evento.pointerId) return;
    const dx = evento.clientX - inicio.x;
    const dy = evento.clientY - inicio.y;
    if (Math.hypot(dx, dy) > 10) omitirClick.current = true;
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.3) {
      gesto.current = null; setArrastre(0); return;
    }
    if (Math.abs(dx) > Math.abs(dy) * 1.3) {
      const limite = (dx > 0 && paginaActual <= 1) || (dx < 0 && paginaActual >= totalPaginas);
      setArrastre(Math.max(-140, Math.min(140, dx * (limite ? 0.15 : 0.6))));
    }
  };
  const terminarGesto = (evento: ReactPointerEvent<HTMLDivElement>) => {
    const inicio = gesto.current;
    if (!inicio || inicio.id !== evento.pointerId) return;
    gesto.current = null; setArrastre(0);
    const dx = evento.clientX - inicio.x;
    const dy = evento.clientY - inicio.y;
    if (Math.hypot(dx, dy) > 10) omitirClick.current = true;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.3 && !navegacionOcupada) {
      if (dx < 0 && paginaActual < totalPaginas) paginaSiguiente();
      if (dx > 0 && paginaActual > 1) paginaAnterior();
    }
  };
  const cancelarGesto = () => {
    gesto.current = null; setArrastre(0); omitirClick.current = true;
  };


  return (
    <div className="fixed inset-0 z-40 h-[100dvh] flex flex-col bg-stone-900 text-stone-100 font-serif leading-relaxed overflow-hidden">
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
        className="flex-1 relative overflow-hidden flex flex-col items-center justify-center min-h-0 pt-20 pb-24 select-none"
        onClick={alternarControles}
        style={{ touchAction: 'pan-y pinch-zoom' }}
        onPointerDown={iniciarGesto}
        onPointerMove={moverGesto}
        onPointerUp={terminarGesto}
        onPointerCancel={cancelarGesto}
        onLostPointerCapture={() => { gesto.current = null; setArrastre(0); }}
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
            {imagenPaginaActual ? (
              <HojaAnimada imagen={imagenPaginaActual} numero={paginaActual} arrastre={arrastre} onAnimando={setGirando} />
            ) : <div className="p-12 text-stone-300 text-sm font-sans">Cargando página...</div>}
          </div>
        )}

        {cargandoPagina && imagenPaginaActual && (
          <div className="absolute bottom-14 right-6 bg-stone-800/90 text-stone-200 border border-stone-700 rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg z-30">
            Cargando...
          </div>
        )}

        {/* ── Botones de navegación laterales ─────────────────────── */}
        {estadoCarga === 'listo' && (
          <>
            <button
              onClick={(evento) => {
                evento.stopPropagation();
                paginaAnterior();
              }}
              className="hidden md:flex absolute top-1/2 -translate-y-1/2 left-4 z-30 w-14 h-14 rounded-full bg-black/50 hover:bg-black/75 text-white items-center justify-center shadow-xl transition-all duration-150 ease-out active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-cuento-amarillo"
              disabled={paginaActual <= 1 || navegacionOcupada}
              aria-label="Página anterior"
            >
              <ChevronLeft size={30} />
            </button>
            <button
              onClick={(evento) => {
                evento.stopPropagation();
                paginaSiguiente();
              }}
              className="hidden md:flex absolute top-1/2 -translate-y-1/2 right-4 z-30 w-14 h-14 rounded-full bg-black/50 hover:bg-black/75 text-white items-center justify-center shadow-xl transition-all duration-150 ease-out active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-cuento-amarillo"
              disabled={paginaActual >= totalPaginas || navegacionOcupada}
              aria-label="Página siguiente"
            >
              <ChevronRight size={30} />
            </button>
          </>
        )}

        {/* Always available on touch screens, even when the header is hidden. */}
        <footer
          onClick={evento => evento.stopPropagation()}
          className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-3 px-4 sm:px-6 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] bg-stone-950/95 text-stone-300 text-xs font-sans border-t border-stone-800"
        >
          <button type="button" onClick={paginaAnterior}
            disabled={estadoCarga !== 'listo' || paginaActual <= 1 || navegacionOcupada}
            aria-label="Ir a la página anterior"
            className="flex min-h-12 min-w-12 items-center justify-center gap-1 rounded-xl bg-white/10 px-3 text-white disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-cuento-amarillo">
            <ChevronLeft size={24} /><span className="hidden sm:inline">Anterior</span>
          </button>
          <span role="status" aria-live="polite" className="text-center">
            Página <strong className="text-white">{paginaActual}</strong> de <strong className="text-white">{totalPaginas}</strong>
            <span className="block text-[10px] text-stone-400">Desliza a izquierda o derecha</span>
          </span>
          <button type="button" onClick={paginaSiguiente}
            disabled={estadoCarga !== 'listo' || paginaActual >= totalPaginas || navegacionOcupada}
            aria-label="Ir a la página siguiente"
            className="flex min-h-12 min-w-12 items-center justify-center gap-1 rounded-xl bg-white/10 px-3 text-white disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-cuento-amarillo">
            <span className="hidden sm:inline">Siguiente</span><ChevronRight size={24} />
          </button>
        </footer>
      </div>
    </div>
  );
}
