/**
 * components/library/TarjetaLibro.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Tarjeta individual de la grilla de biblioteca. Componente de
 * presentación: recibe datos ya resueltos por props y solo se encarga de
 * pintarlos con una estética atractiva (portada + halo de color +
 * indicador de progreso tipo "estrellas").
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import type { Libro, ProgresoLectura } from '../../types/libro';

interface PropiedadesTarjetaLibro {
  libro: Libro;
  ocupado?: boolean;
  onDescargar?: (libro: Libro) => void;
  onQuitarDescarga?: (id: string) => void;
  progreso?: ProgresoLectura;
  onAbrir: (libro: Libro) => void;
  onEliminar?: (libro: Libro) => void;
  /** Índice dentro de la grilla, usado para escalonar la animación de entrada. */
  indice?: number;
}

export function TarjetaLibro({
  libro,
  ocupado,
  onDescargar,
  onQuitarDescarga,
  progreso,
  onAbrir,
  onEliminar,
  indice = 0,
}: PropiedadesTarjetaLibro) {
  // Fallback visual defensivo: si la imagen de portada falla al cargar
  // (por ejemplo un Data URL corrupto), mostramos un marcador de
  // posición ilustrado en vez de un ícono roto del navegador.
  const [errorPortada, setErrorPortada] = useState(false);

  const porcentajeProgreso =
    progreso && libro.totalPaginas > 0
      ? Math.min(100, Math.round((progreso.paginaActual / libro.totalPaginas) * 100))
      : 0;

  const esLibroSubido = libro.origen === 'subido-por-usuario';

  return (
    <div
      className="group relative flex flex-col animate-aparecer"
      style={{ animationDelay: `${Math.min(indice * 60, 600)}ms` }}
    >
      <button
        disabled={ocupado}
        onClick={() => onAbrir(libro)}
        className="relative rounded-blob overflow-hidden aspect-[3/4] w-full shadow-libro
                   transition-transform duration-300 ease-out
                   hover:-translate-y-2 hover:rotate-1
                   focus:outline-none focus-visible:ring-4 focus-visible:ring-cuento-amarillo"
        style={{
          background: `linear-gradient(160deg, ${libro.colorAcento}55, ${libro.colorAcento}22)`,
        }}
        aria-label={`Abrir el cuento ${libro.titulo}`}
      >
        {!errorPortada ? (
          <img
            src={libro.portadaUrl}
            alt={`Portada de ${libro.titulo}`}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setErrorPortada(true)}
          />
        ) : (
          // Fallback visual para portada rota: nunca dejamos un hueco vacío.
          <div className="w-full h-full flex items-center justify-center bg-cuento-crema">
            <span className="text-5xl" aria-hidden="true">
              📚
            </span>
          </div>
        )}

        {/* Barra de progreso tipo "listón" en la parte inferior de la portada */}
        {porcentajeProgreso > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-2 bg-black/20">
            <div
              className="h-full bg-cuento-amarillo transition-all duration-500"
              style={{ width: `${porcentajeProgreso}%` }}
            />
          </div>
        )}

        {/* Insignia de "Completado" */}
        {progreso?.completado && (
          <div className="absolute top-2 right-2 bg-cuento-verde text-white rounded-full w-9 h-9 flex items-center justify-center text-lg shadow-md">
            ⭐
          </div>
        )}
      </button>

      <div className="mt-3 px-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-cuento font-bold text-cuento-tinta text-base leading-tight truncate">
            {libro.titulo}
          </h3>
          {libro.autor && (
            <p className="font-cuento text-xs text-cuento-tintaSuave truncate">{libro.autor}</p>
          )}
        </div>

        {esLibroSubido && onEliminar && (
          <button
            onClick={(evento) => {
              evento.stopPropagation();
              onEliminar(libro);
            }}
            className="shrink-0 text-cuento-tintaSuave hover:text-cuento-coral transition-colors
                       w-8 h-8 flex items-center justify-center rounded-full hover:bg-cuento-coral/10
                       opacity-0 group-hover:opacity-100 focus:opacity-100"
            aria-label={`Eliminar ${libro.titulo} de la biblioteca`}
            title="Eliminar de mi biblioteca"
          >
            🗑️
          </button>
        )}
      </div>
      <div className="acciones-nube">
        <span>{ocupado ? 'Descargando…' : libro.sincronizado ? libro.disponibleLocal ? 'Disponible sin conexión' : 'En la nube' : 'Pendiente de sincronizar'}</span>
        {!libro.disponibleLocal && onDescargar && <button disabled={ocupado} onClick={() => onDescargar(libro)}>Descargar para leer sin conexión</button>}
        {libro.disponibleLocal && libro.sincronizado && onQuitarDescarga && <button disabled={ocupado} onClick={() => onQuitarDescarga(libro.id)}>Quitar descarga</button>}
      </div>
    </div>
  );
}
