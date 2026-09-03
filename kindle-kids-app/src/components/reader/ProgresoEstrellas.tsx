/**
 * components/reader/ProgresoEstrellas.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Indicador de progreso "lúdico": en vez de una barra de progreso fría y
 * técnica, mostramos una barra pintada con un degradado cálido más el
 * texto "Página X de Y" y una estrellita que se enciende al completar el
 * libro. Pensado para reforzar positivamente el avance en la lectura,
 * como en apps como Epic! o Kindle Kids.
 * ─────────────────────────────────────────────────────────────────────────
 */

interface PropiedadesProgresoEstrellas {
  paginaActual: number;
  totalPaginas: number;
}

export function ProgresoEstrellas({ paginaActual, totalPaginas }: PropiedadesProgresoEstrellas) {
  const porcentaje = totalPaginas > 0 ? Math.min(100, (paginaActual / totalPaginas) * 100) : 0;
  const completado = paginaActual >= totalPaginas && totalPaginas > 0;

  return (
    <div className="flex items-center gap-3 w-full" role="progressbar" aria-valuenow={paginaActual} aria-valuemin={1} aria-valuemax={totalPaginas}>
      <span className={`text-xl ${completado ? 'animate-latido' : ''}`} aria-hidden="true">
        {completado ? '🌟' : '📖'}
      </span>

      <div className="flex-1 h-3 bg-white/40 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cuento-amarillo via-cuento-coral to-cuento-morado transition-all duration-500 ease-out"
          style={{ width: `${porcentaje}%` }}
        />
      </div>

      <span className="font-cuento text-sm font-bold text-cuento-tinta whitespace-nowrap">
        {paginaActual} / {totalPaginas}
      </span>
    </div>
  );
}
