/**
 * components/shared/CargandoCuento.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Estado de carga reutilizable. En vez de un spinner genérico, usamos un
 * librito animado que "flota", coherente con la identidad visual infantil
 * de la app y menos ansiógeno para un niño esperando su cuento.
 * ─────────────────────────────────────────────────────────────────────────
 */

interface PropiedadesCargando {
  mensaje?: string;
}

export function CargandoCuento({ mensaje = 'Preparando tu cuento...' }: PropiedadesCargando) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16" role="status" aria-live="polite">
      <div className="text-6xl animate-flotar" aria-hidden="true">
        📖
      </div>
      <p className="font-cuento text-lg text-cuento-tintaSuave">{mensaje}</p>
    </div>
  );
}
