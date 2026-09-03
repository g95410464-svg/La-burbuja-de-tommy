/**
 * components/upload/ZonaSubida.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Componente de UI para la subida de libros: zona de Drag & Drop más
 * selector de archivo tradicional (fallback accesible para quien no use
 * mouse/touch de arrastre, incluyendo lectores de pantalla).
 *
 * Este componente NO sabe procesar PDFs ni hablar con IndexedDB: solo
 * captura el `File` y delega el trabajo pesado al componente padre vía
 * `onArchivoSeleccionado`. Esto respeta el principio de responsabilidad
 * única: aquí solo vive la interacción de arrastre/selección.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useRef, useState, type DragEvent } from 'react';

interface PropiedadesZonaSubida {
  onArchivoSeleccionado: (archivo: File) => void;
  /** Deshabilita la interacción mientras se procesa una subida anterior. */
  deshabilitado?: boolean;
}

export function ZonaSubida({ onArchivoSeleccionado, deshabilitado = false }: PropiedadesZonaSubida) {
  const [arrastrandoSobre, setArrastrandoSobre] = useState(false);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  const manejarSoltar = useCallback(
    (evento: DragEvent<HTMLDivElement>) => {
      evento.preventDefault();
      setArrastrandoSobre(false);

      if (deshabilitado) return;

      const archivo = evento.dataTransfer.files?.[0];
      if (archivo) onArchivoSeleccionado(archivo);
    },
    [onArchivoSeleccionado, deshabilitado]
  );

  const manejarSeleccionManual = useCallback(
    (evento: React.ChangeEvent<HTMLInputElement>) => {
      const archivo = evento.target.files?.[0];
      if (archivo) onArchivoSeleccionado(archivo);
      // Reseteamos el input para permitir volver a seleccionar el MISMO
      // archivo dos veces seguidas (si el usuario corrige y reintenta),
      // ya que el evento `change` no se dispara si el valor no cambia.
      evento.target.value = '';
    },
    [onArchivoSeleccionado]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!deshabilitado) setArrastrandoSobre(true);
      }}
      onDragLeave={() => setArrastrandoSobre(false)}
      onDrop={manejarSoltar}
      className={`
        relative rounded-blob border-4 border-dashed p-10
        flex flex-col items-center justify-center gap-3 text-center
        transition-all duration-200 ease-out cursor-pointer
        ${deshabilitado ? 'opacity-50 cursor-not-allowed' : 'hover:border-cuento-turquesa hover:bg-cuento-turquesa/5'}
        ${arrastrandoSobre ? 'border-cuento-turquesa bg-cuento-turquesa/10 scale-[1.02]' : 'border-cuento-morado/40 bg-white/60'}
      `}
      onClick={() => !deshabilitado && inputArchivoRef.current?.click()}
      role="button"
      tabIndex={deshabilitado ? -1 : 0}
      aria-label="Subir un nuevo cuento en PDF, arrastra el archivo aquí o haz clic para elegirlo"
      onKeyDown={(evento) => {
        if ((evento.key === 'Enter' || evento.key === ' ') && !deshabilitado) {
          evento.preventDefault();
          inputArchivoRef.current?.click();
        }
      }}
    >
      <div className={`text-6xl ${arrastrandoSobre ? 'animate-latido' : ''}`} aria-hidden="true">
        {arrastrandoSobre ? '📂' : '📤'}
      </div>
      <p className="font-cuento font-bold text-lg text-cuento-tinta">
        {arrastrandoSobre ? '¡Suelta aquí tu cuento!' : 'Arrastra un PDF o toca para elegir'}
      </p>
      <p className="font-cuento text-sm text-cuento-tintaSuave">
        Agrega tus propios cuentos ilustrados en formato PDF
      </p>

      <input
        ref={inputArchivoRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={manejarSeleccionManual}
        disabled={deshabilitado}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
