/**
 * lib/procesarSubida.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CASO DE USO: "Subir un libro nuevo".
 *
 * Orquesta las piezas de infraestructura (lib/pdf.ts) para transformar un
 * `File` crudo (proveniente del input de subida o del drag & drop) en una
 * entidad `Libro` completa y lista para persistir, incluyendo:
 *   - Conteo de páginas.
 *   - Portada extraída automáticamente de la primera página.
 *   - Color de acento derivado de esa portada.
 *
 * Vive en `lib/` (no en `hooks/`) porque no depende de React en absoluto:
 * es lógica de negocio pura, fácilmente testeable de forma aislada.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Libro, Resultado } from '../types/libro';
import {
  cargarDocumentoPdf,
  renderizarPaginaComoImagen,
  extraerColorAcento,
  destruirDocumentoPdf,
} from './pdf';

/** Tamaño máximo aceptado para un PDF subido: 60 MB. */
export const TAMANO_MAXIMO_MB = 60;
const TAMANO_MAXIMO_BYTES = TAMANO_MAXIMO_MB * 1024 * 1024;

/**
 * Valida de forma defensiva un archivo ANTES de intentar procesarlo,
 * devolviendo mensajes de error pensados para un público general (padres
 * o cuidadores subiendo cuentos), no jerga técnica.
 */
function validarArchivo(archivo: File): Resultado<void> {
  const esPdfPorTipo = archivo.type === 'application/pdf';
  const esPdfPorExtension = archivo.name.toLowerCase().endsWith('.pdf');

  if (!esPdfPorTipo && !esPdfPorExtension) {
    return {
      ok: false,
      error: 'Solo se pueden subir archivos en formato PDF.',
    };
  }

  if (archivo.size === 0) {
    return { ok: false, error: 'El archivo está vacío.' };
  }

  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return {
      ok: false,
      error: `El archivo es demasiado grande. El tamaño máximo permitido es ${TAMANO_MAXIMO_MB} MB.`,
    };
  }

  return { ok: true, valor: undefined };
}

/**
 * Deriva un título "legible" a partir del nombre de archivo, quitando la
 * extensión y reemplazando guiones/guiones bajos por espacios, como
 * valor por defecto editable por el usuario en el formulario de subida.
 */
function derivarTituloDesdeNombreArchivo(nombreArchivo: string): string {
  const sinExtension = nombreArchivo.replace(/\.pdf$/i, '');
  const conEspacios = sinExtension.replace(/[-_]+/g, ' ').trim();
  if (conEspacios.length === 0) return 'Mi cuento';

  // Capitalizamos cada palabra para un resultado más prolijo.
  return conEspacios.replace(/\b\w/g, (letra) => letra.toUpperCase());
}

/**
 * Procesa un `File` PDF subido por el usuario y produce un `Libro`
 * completo (aún sin persistir) junto con el `Blob` original que deberá
 * guardarse en IndexedDB.
 *
 * Esta función es "todo o nada": si cualquier paso crítico falla (el PDF
 * no se puede leer, no tiene páginas, etc.) devuelve un error claro y NO
 * deja recursos (documento pdfjs) sin liberar.
 */
export async function procesarSubidaDeLibro(
  archivo: File,
  tituloPersonalizado?: string
): Promise<Resultado<{ libro: Libro; pdfBlob: Blob }>> {
  const validacion = validarArchivo(archivo);
  if (!validacion.ok) return validacion;

  let gestionado = null;

  try {
    const buffer = await archivo.arrayBuffer();
    const resultadoCarga = await cargarDocumentoPdf(buffer);

    if (!resultadoCarga.ok) return resultadoCarga;

    gestionado = resultadoCarga.valor;
    const documento = gestionado.documento;

    const resultadoPortada = await renderizarPaginaComoImagen(documento, 1, 600);
    if (!resultadoPortada.ok) return resultadoPortada;

    const colorAcento = await extraerColorAcento(resultadoPortada.valor);

    const libro: Libro = {
      id: `subido-${crypto.randomUUID()}`,
      titulo: tituloPersonalizado?.trim() || derivarTituloDesdeNombreArchivo(archivo.name),
      totalPaginas: documento.numPages,
      portadaUrl: resultadoPortada.valor,
      origen: 'subido-por-usuario',
      fuente: { tipo: 'blob', blob: archivo },
      colorAcento,
      fechaAgregado: new Date().toISOString(),
      tamanoBytes: archivo.size,
    };

    return { ok: true, valor: { libro, pdfBlob: archivo } };
  } catch (error) {
    console.error('[procesarSubida] Error inesperado procesando el PDF:', error);
    return {
      ok: false,
      error: 'Ocurrió un problema al procesar el libro. Intenta con otro archivo.',
    };
  } finally {
    // Blindaje de memoria: pase lo que pase (éxito o error), el
    // documento temporal usado solo para extraer metadatos se destruye.
    destruirDocumentoPdf(gestionado);
  }
}
