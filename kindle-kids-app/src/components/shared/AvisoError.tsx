/**
 * components/shared/AvisoError.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Fallback visual unificado para cualquier error controlado de la app
 * (PDF corrupto, fallo de IndexedDB, archivo no soportado, etc.).
 *
 * Este es el componente que garantiza el requisito de "indestructible a
 * nivel visual": pase lo que pase en la lógica, el usuario NUNCA ve una
 * pantalla en blanco ni un stack trace, sino un mensaje cálido y, cuando
 * aplica, un botón para reintentar.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { BotonGrande } from './BotonGrande';

interface PropiedadesAvisoError {
  titulo?: string;
  mensaje: string;
  onReintentar?: () => void;
  onVolver?: () => void;
}

export function AvisoError({
  titulo = '¡Ups! Algo no salió bien',
  mensaje,
  onReintentar,
  onVolver,
}: PropiedadesAvisoError) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center"
      role="alert"
    >
      <div className="text-6xl" aria-hidden="true">
        🙈
      </div>
      <h2 className="font-cuento text-2xl font-bold text-cuento-tinta">{titulo}</h2>
      <p className="font-cuento text-base text-cuento-tintaSuave max-w-sm">{mensaje}</p>
      <div className="flex gap-3 mt-2">
        {onReintentar && (
          <BotonGrande variante="turquesa" compacto onClick={onReintentar}>
            Intentar de nuevo
          </BotonGrande>
        )}
        {onVolver && (
          <BotonGrande variante="neutro" compacto onClick={onVolver}>
            Volver a la biblioteca
          </BotonGrande>
        )}
      </div>
    </div>
  );
}
