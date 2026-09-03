/**
 * lib/ocr/MotorOcr.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CAPA DE INFRAESTRUCTURA: contrato abstracto del motor OCR.
 *
 * Define la interfaz que toda implementación concreta de OCR debe
 * cumplir. Esto permite:
 *  - Cambiar de motor OCR sin tocar el resto de la app.
 *  - Añadir fallbacks (p. ej. un motor ligero si Tesseract falla).
 *  - Testear la lógica con un motor simulado.
 *
 * La UI y el servicio de narración NUNCA importan Tesseract.js
 * directamente: siempre pasan por `MotorOcr`.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type {
  MotorOcr as MotorOcrContrato,
  ResultadoOcrCrudo,
  ResultadoOcrPagina,
} from '../../types/ocr';

/**
 * Interfaz del motor OCR.
 *
 * Re-exportamos el tipo desde types/ocr.ts para mantener la definición
 * del contrato en la capa de dominio (types) y tener aquí un único
 * punto de importación limpio.
 */
export type MotorOcr = MotorOcrContrato;

export type { ResultadoOcrCrudo, ResultadoOcrPagina };
