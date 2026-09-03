/**
 * components/library/PantallaBiblioteca.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Pantalla raíz de la biblioteca. Compone el hook `useBiblioteca` con los
 * componentes de presentación (`TarjetaLibro`, `ModalSubirLibro`) y
 * gestiona la navegación hacia el lector (delegada al componente padre
 * `App` mediante `onAbrirLibro`, siguiendo un patrón simple de "levantar
 * el estado" sin necesidad de introducir un router para una app de una
 * sola vista principal + lector).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { useBiblioteca } from '../../hooks/useBiblioteca';
import { TarjetaLibro } from './TarjetaLibro';
import { ModalSubirLibro } from '../upload/ModalSubirLibro';
import { CargandoCuento } from '../shared/CargandoCuento';
import { BotonGrande } from '../shared/BotonGrande';
import type { Libro } from '../../types/libro';

interface PropiedadesPantallaBiblioteca {
  onAbrirLibro: (libro: Libro) => void;
}

export function PantallaBiblioteca({ onAbrirLibro }: PropiedadesPantallaBiblioteca) {
  const {
    libros,
    progresoPorLibro,
    cargando,
    error,
    agregarLibro,
    eliminarLibro,
  } = useBiblioteca();

  const [modalSubidaAbierto, setModalSubidaAbierto] = useState(false);
  const [libroAEliminar, setLibroAEliminar] = useState<Libro | null>(null);

  const confirmarEliminacion = async () => {
    if (!libroAEliminar) return;
    await eliminarLibro(libroAEliminar.id);
    setLibroAEliminar(null);
  };

  return (
    <div className="min-h-screen bg-cuento-bg">
      {/* Encabezado */}
      <header className="sticky top-0 z-20 bg-cuento-bg/90 backdrop-blur-sm border-b border-cuento-morado/10">
        <div className="max-w-6xl mx-auto px-5 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl" aria-hidden="true">
              🦉
            </span>
            <div>
              <h1 className="font-cuento text-2xl sm:text-3xl font-extrabold text-cuento-tinta leading-none">
                Cuentitos
              </h1>
              <p className="font-cuento text-xs sm:text-sm text-cuento-tintaSuave">
                Tu biblioteca de historias mágicas
              </p>
            </div>
          </div>

          <BotonGrande variante="turquesa" compacto onClick={() => setModalSubidaAbierto(true)}>
            <span className="flex items-center gap-2">
              <span aria-hidden="true">➕</span>
              <span className="hidden sm:inline">Agregar cuento</span>
              <span className="sm:hidden">Agregar</span>
            </span>
          </BotonGrande>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8">
        {error && (
          <div className="mb-6 bg-cuento-amarillo/20 border-2 border-cuento-amarillo rounded-2xl px-4 py-3 font-cuento text-sm text-cuento-tinta">
            ⚠️ {error}
          </div>
        )}

        {cargando ? (
          <CargandoCuento mensaje="Abriendo tu biblioteca..." />
        ) : libros.length === 0 ? (
          <EstadoBibliotecaVacia onAgregar={() => setModalSubidaAbierto(true)} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-8">
            {libros.map((libro, indice) => (
              <TarjetaLibro
                key={libro.id}
                libro={libro}
                progreso={progresoPorLibro[libro.id]}
                onAbrir={onAbrirLibro}
                onEliminar={
                  libro.origen === 'subido-por-usuario' ? setLibroAEliminar : undefined
                }
                indice={indice}
              />
            ))}
          </div>
        )}
      </main>

      <ModalSubirLibro
        abierto={modalSubidaAbierto}
        onCerrar={() => setModalSubidaAbierto(false)}
        onLibroAgregado={agregarLibro}
      />

      {libroAEliminar && (
        <DialogoConfirmarEliminacion
          libro={libroAEliminar}
          onConfirmar={confirmarEliminacion}
          onCancelar={() => setLibroAEliminar(null)}
        />
      )}
    </div>
  );
}

/**
 * Sub-componente: estado vacío amigable, mostrado solo si por algún
 * motivo ni siquiera la biblioteca base pudo cargarse (caso extremo,
 * pero cubierto para que la pantalla nunca quede confusa).
 */
function EstadoBibliotecaVacia({ onAgregar }: { onAgregar: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="text-7xl animate-flotar" aria-hidden="true">
        📚
      </div>
      <h2 className="font-cuento text-2xl font-bold text-cuento-tinta">
        Tu biblioteca está vacía
      </h2>
      <p className="font-cuento text-cuento-tintaSuave max-w-xs">
        Agrega tu primer cuento en PDF para empezar a leer.
      </p>
      <BotonGrande variante="coral" onClick={onAgregar}>
        Agregar mi primer cuento
      </BotonGrande>
    </div>
  );
}

/**
 * Sub-componente: confirmación antes de borrar un libro subido. Se
 * mantiene simple y local a este archivo por ser de uso exclusivo aquí.
 */
function DialogoConfirmarEliminacion({
  libro,
  onConfirmar,
  onCancelar,
}: {
  libro: Libro;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cuento-tinta/50 backdrop-blur-sm"
      onClick={onCancelar}
      role="alertdialog"
      aria-modal="true"
    >
      <div
        className="bg-cuento-crema rounded-blob shadow-libro max-w-sm w-full p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-5xl mb-3" aria-hidden="true">
          🗑️
        </div>
        <h3 className="font-cuento text-xl font-bold text-cuento-tinta mb-1">
          ¿Eliminar este cuento?
        </h3>
        <p className="font-cuento text-sm text-cuento-tintaSuave mb-5">
          "{libro.titulo}" se borrará de tu biblioteca y no se podrá deshacer.
        </p>
        <div className="flex gap-3 justify-center">
          <BotonGrande variante="neutro" compacto onClick={onCancelar}>
            Cancelar
          </BotonGrande>
          <BotonGrande variante="coral" compacto onClick={onConfirmar}>
            Sí, eliminar
          </BotonGrande>
        </div>
      </div>
    </div>
  );
}
