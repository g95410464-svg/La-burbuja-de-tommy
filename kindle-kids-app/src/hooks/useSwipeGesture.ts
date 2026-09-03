/**
 * hooks/usarGestoSwipe.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Hook pequeño y enfocado (SRP) que traduce eventos táctiles nativos en
 * llamadas semánticas `onSwipeIzquierda` / `onSwipeDerecha`. Se usa en el
 * lector para permitir pasar de página deslizando el dedo, tal como se
 * espera en cualquier app de lectura móvil moderna.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useRef, type TouchEvent } from 'react';

/** Distancia mínima en píxeles para considerar el gesto un "swipe" real. */
const UMBRAL_SWIPE_PX = 50;

interface OpcionesGestoSwipe {
  onSwipeIzquierda: () => void;
  onSwipeDerecha: () => void;
}

export function useSwipeGesture({ onSwipeIzquierda, onSwipeDerecha }: OpcionesGestoSwipe) {
  const xInicioRef = useRef<number | null>(null);

  const onTouchStart = (evento: TouchEvent) => {
    xInicioRef.current = evento.touches[0].clientX;
  };

  const onTouchEnd = (evento: TouchEvent) => {
    if (xInicioRef.current === null) return;

    const xFin = evento.changedTouches[0].clientX;
    const delta = xFin - xInicioRef.current;
    xInicioRef.current = null;

    if (Math.abs(delta) < UMBRAL_SWIPE_PX) return; // toque, no swipe

    if (delta > 0) {
      onSwipeDerecha(); // deslizó hacia la derecha → página anterior
    } else {
      onSwipeIzquierda(); // deslizó hacia la izquierda → página siguiente
    }
  };

  return { onTouchStart, onTouchEnd };
}
