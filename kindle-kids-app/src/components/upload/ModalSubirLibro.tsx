/**
 * components/upload/ModalSubirLibro.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Modal que orquesta el FLUJO COMPLETO de subida: recibe el archivo desde
 * `ZonaSubida`, lo procesa con el caso de uso `procesarSubidaDeLibro`, y
 * si todo sale bien lo persiste a través de `useBiblioteca().agregarLibro`.
 *
 * Este componente conecta la capa de UI con la capa de aplicación, pero
 * delega TODA la lógica real a las capas inferiores: aquí solo se
 * gestionan estados de UI (cargando / error / éxito).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { ZonaSubida } from './ZonaSubida';
import { BotonGrande } from '../shared/BotonGrande';
import { procesarSubidaDeLibro } from '../../lib/procesarSubida';
import type { Libro, Resultado } from '../../types/libro';

interface PropiedadesModalSubirLibro {
  abierto: boolean;
  onCerrar: () => void;
  onLibroAgregado: (libro: Libro, pdfBlob: Blob) => Promise<Resultado<void>>;
}

type FaseSubida = 'esperando' | 'procesando' | 'error' | 'exito';

export function ModalSubirLibro({ abierto, onCerrar, onLibroAgregado }: PropiedadesModalSubirLibro) {
  const [fase, setFase] = useState<FaseSubida>('esperando');
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [tituloLibroAgregado, setTituloLibroAgregado] = useState('');

  if (!abierto) return null;

  const manejarArchivo = async (archivo: File) => {
    setFase('procesando');
    setMensajeError(null);

    // Paso 1: procesar el PDF (extraer portada, contar páginas, etc.)
    const resultadoProceso = await procesarSubidaDeLibro(archivo);

    if (!resultadoProceso.ok) {
      setFase('error');
      setMensajeError(resultadoProceso.error);
      return;
    }

    // Paso 2: persistir en IndexedDB a través del hook de biblioteca.
    const { libro, pdfBlob } = resultadoProceso.valor;
    const resultadoGuardado = await onLibroAgregado(libro, pdfBlob);

    if (!resultadoGuardado.ok) {
      setFase('error');
      setMensajeError(resultadoGuardado.error);
      return;
    }

    setTituloLibroAgregado(libro.titulo);
    setFase('exito');
  };

  const cerrarYReiniciar = () => {
    setFase('esperando');
    setMensajeError(null);
    onCerrar();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cuento-tinta/50 backdrop-blur-sm animate-aparecer"
      onClick={cerrarYReiniciar}
      role="dialog"
      aria-modal="true"
      aria-label="Subir un nuevo cuento"
    >
      <div
        className="bg-cuento-crema rounded-blob shadow-libro max-w-md w-full p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={cerrarYReiniciar}
          className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full
                     bg-white hover:bg-cuento-coral hover:text-white text-cuento-tintaSuave transition-colors"
          aria-label="Cerrar"
        >
          ✕
        </button>

        <h2 className="font-cuento text-2xl font-bold text-cuento-tinta mb-1 pr-8">
          Agregar un cuento nuevo
        </h2>
        <p className="font-cuento text-sm text-cuento-tintaSuave mb-5">
          Se guardará en este dispositivo para leerlo cuando quieras.
        </p>

        {fase === 'esperando' && (
          <ZonaSubida onArchivoSeleccionado={manejarArchivo} />
        )}

        {fase === 'procesando' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <div className="text-5xl animate-latido" aria-hidden="true">
              ✨
            </div>
            <p className="font-cuento text-cuento-tintaSuave">Preparando las páginas mágicas...</p>
          </div>
        )}

        {fase === 'error' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="text-5xl" aria-hidden="true">
              😅
            </div>
            <p className="font-cuento text-cuento-tinta font-semibold">{mensajeError}</p>
            <BotonGrande variante="turquesa" compacto onClick={() => setFase('esperando')}>
              Intentar con otro archivo
            </BotonGrande>
          </div>
        )}

        {fase === 'exito' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="text-5xl" aria-hidden="true">
              🎉
            </div>
            <p className="font-cuento text-cuento-tinta font-semibold">
              ¡"{tituloLibroAgregado}" se agregó a tu biblioteca!
            </p>
            <BotonGrande variante="coral" compacto onClick={cerrarYReiniciar}>
              Genial
            </BotonGrande>
          </div>
        )}
      </div>
    </div>
  );
}
