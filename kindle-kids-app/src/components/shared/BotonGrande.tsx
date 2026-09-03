/**
 * components/shared/BotonGrande.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Componente de presentación puro (sin lógica de negocio). Encapsula el
 * estilo "botón táctil infantil": grande, con sombra tipo "3D" (efecto
 * de botón físico que se hunde al presionar) y colores vivos.
 *
 * Reutilizarlo en toda la app (en vez de repetir clases de Tailwind)
 * cumple el principio DRY y asegura consistencia visual — muy importante
 * en interfaces para niños, donde la previsibilidad reduce la frustración.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type VarianteColor = 'coral' | 'turquesa' | 'amarillo' | 'morado' | 'neutro';

interface PropiedadesBotonGrande extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variante?: VarianteColor;
  /** Tamaño reducido para contextos con menos espacio (ej. barra del lector). */
  compacto?: boolean;
}

const CLASES_POR_VARIANTE: Record<VarianteColor, string> = {
  coral: 'bg-cuento-coral hover:bg-cuento-coralOscuro text-white shadow-[0_6px_0_0_rgba(200,70,70,0.5)]',
  turquesa: 'bg-cuento-turquesa hover:bg-cuento-turquesaOscuro text-white shadow-[0_6px_0_0_rgba(50,140,135,0.5)]',
  amarillo: 'bg-cuento-amarillo hover:bg-cuento-amarilloOscuro text-cuento-tinta shadow-[0_6px_0_0_rgba(190,140,30,0.4)]',
  morado: 'bg-cuento-morado hover:bg-cuento-moradoOscuro text-white shadow-[0_6px_0_0_rgba(110,80,190,0.5)]',
  neutro: 'bg-white hover:bg-cuento-crema text-cuento-tinta shadow-[0_6px_0_0_rgba(0,0,0,0.1)]',
};

export function BotonGrande({
  children,
  variante = 'coral',
  compacto = false,
  className = '',
  disabled,
  ...resto
}: PropiedadesBotonGrande) {
  return (
    <button
      // active:translate-y-1 + reducción de sombra simula físicamente el
      // "hundimiento" del botón al presionarlo: una micro-interacción
      // sencilla pero que aporta muchísimo feedback táctil percibido.
      className={`
        ${compacto ? 'px-4 py-2 text-base' : 'px-6 py-4 text-lg'}
        font-cuento font-bold rounded-2xl
        transition-all duration-150 ease-out
        active:translate-y-1 active:shadow-none
        disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:active:shadow-[inherit]
        select-none
        ${CLASES_POR_VARIANTE[variante]}
        ${className}
      `}
      disabled={disabled}
      {...resto}
    >
      {children}
    </button>
  );
}
