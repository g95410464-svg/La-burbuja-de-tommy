/**
 * lib/pdf.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CAPA DE INFRAESTRUCTURA: procesamiento de PDF con `pdfjs-dist`.
 *
 * Toda la interacción "sucia" con la librería pdfjs vive aislada aquí.
 * Ningún componente de React importa `pdfjs-dist` directamente: siempre
 * pasan por estas funciones. Esto es el principio de "Single
 * Responsibility" (SOLID) aplicado a nivel de módulo, y además nos da un
 * único punto donde blindar los errores (PDFs corruptos, contraseñas,
 * páginas vacías, etc.) sin repetir try/catch por toda la app.
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Resultado } from '../types/libro';

/**
 * POLYFILL DEFENSIVO: `Map.prototype.getOrInsertComputed` / `getOrInsert`.
 * ────────────────────────────────────────────────────────────────────────
 * pdfjs-dist usa internamente estos métodos de Map recién estandarizados
 * (propuesta ES2026 "Upsert"), disponibles de forma nativa solo desde
 * Chrome 145, Safari 18.4 y Firefox 144 (inicios de 2026). En cualquier
 * navegador anterior a esas versiones —crítico para el público de esta
 * app, que puede incluir tablets infantiles con sistemas desactualizados
 * o navegadores embebidos antiguos— la ausencia de este método rompe
 * TODO el renderizado de PDF con un `TypeError` silencioso dentro del
 * worker, dejando la página en blanco.
 *
 * Para cumplir el requisito de robustez "indestructible", parcheamos
 * `Map.prototype` con una implementación mínima y 100% compatible con el
 * comportamiento nativo ANTES de inicializar pdfjs. Si el navegador ya
 * trae el método nativo, no se sobreescribe (comprobación `if`).
 */
if (typeof Map.prototype.getOrInsertComputed !== 'function') {
  // eslint-disable-next-line no-extend-native
  Map.prototype.getOrInsertComputed = function <K, V>(
    this: Map<K, V>,
    clave: K,
    callback: (clave: K) => V
  ): V {
    if (!this.has(clave)) {
      this.set(clave, callback(clave));
    }
    return this.get(clave) as V;
  };
}

if (typeof Map.prototype.getOrInsert !== 'function') {
  // eslint-disable-next-line no-extend-native
  Map.prototype.getOrInsert = function <K, V>(this: Map<K, V>, clave: K, valorPorDefecto: V): V {
    if (!this.has(clave)) {
      this.set(clave, valorPorDefecto);
    }
    return this.get(clave) as V;
  };
}

/**
 * NOTA IMPORTANTE SOBRE EL CICLO DE VIDA DE pdfjs-dist:
 * El método `destroy()` que libera la memoria del worker (parseo,
 * buffers internos, etc.) NO vive en `PDFDocumentProxy` sino en el
 * objeto `PDFDocumentLoadingTask` devuelto por `getDocument()` ANTES de
 * resolver la promesa. Por eso empaquetamos ambos objetos juntos en este
 * tipo: el consumidor solo interactúa con el `documento` (proxy), pero
 * la limpieza de memoria pasa internamente por la `tarea` original.
 */
export interface DocumentoPdfGestionado {
  documento: PDFDocumentProxy;
  tarea: pdfjsLib.PDFDocumentLoadingTask;
}

/**
 * CONFIGURACIÓN DEL WORKER
 * ────────────────────────
 * pdfjs-dist necesita un Web Worker para no bloquear el hilo principal
 * mientras decodifica PDFs pesados (crítico en libros ilustrados con
 * imágenes HD). Usamos el worker empaquetado por Vite mediante el patrón
 * `?url`, que resuelve la ruta final del asset en build y en dev por
 * igual, evitando el clásico problema de "funciona en local pero no en
 * producción" con CDNs externos.
 *
 * IMPORTANTE: apuntamos a NUESTRO wrapper (`pdfWorkerConPolyfill.ts`) y
 * no al worker original de la librería. El wrapper aplica un polyfill de
 * `Map.prototype.getOrInsertComputed` dentro del propio entorno del
 * worker antes de cargar el código real de pdfjs — ver el comentario
 * extenso en ese archivo para el porqué.
 */
import pdfWorkerUrl from './pdfWorkerConPolyfill.ts?worker&url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Límite defensivo de tamaño de render para portadas. No queremos generar
 * imágenes de portada gigantescas (memoria innecesaria en la biblioteca);
 * 600px de ancho es más que suficiente para una tarjeta de portada nítida
 * incluso en pantallas retina.
 */
const ANCHO_MAX_PORTADA = 600;

/**
 * Escala máxima de render para páginas del lector. Los libros ilustrados
 * necesitan buena resolución, pero limitamos para no reventar la memoria
 * en dispositivos móviles con PDFs muy pesados.
 */
const ESCALA_MAX_LECTOR = 2.5;

/**
 * Carga un documento PDF a partir de un ArrayBuffer y devuelve el proxy
 * de pdfjs, envuelto en nuestro tipo `Resultado` para manejo de errores
 * explícito (sin excepciones no controladas escapando hacia la UI).
 *
 * NOTA DE MEMORIA: quien reciba este `PDFDocumentProxy` es responsable de
 * llamar a `.destroy()` cuando ya no lo necesite (ver `usarLectorPdf`).
 * pdfjs mantiene buffers internos en el worker que no se liberan solos.
 */
export async function cargarDocumentoPdf(
  datos: ArrayBuffer
): Promise<Resultado<DocumentoPdfGestionado>> {
  try {
    // Clonamos el buffer: pdfjs puede "transferir" (neutering) el
    // ArrayBuffer original al worker, dejándolo inutilizable para
    // cualquier otro consumidor (por ejemplo, si luego queremos re-leerlo
    // para guardarlo en IndexedDB). Clonar cuesta poco frente al riesgo
    // de un buffer "vaciado" silenciosamente.
    const copia = datos.slice(0);
    const tarea = pdfjsLib.getDocument({ data: copia });
    const documento = await tarea.promise;

    if (documento.numPages <= 0) {
      // Liberamos inmediatamente: no dejamos una tarea "viva" para un
      // documento que de todas formas vamos a rechazar.
      tarea.destroy();
      return { ok: false, error: 'El PDF no contiene páginas.' };
    }

    return { ok: true, valor: { documento, tarea } };
  } catch (error) {
    // Blindaje: cualquier fallo de parseo (archivo corrupto, no es un
    // PDF válido, PDF cifrado sin contraseña soportada, etc.) se traduce
    // a un mensaje entendible en español en lugar de dejar escapar el
    // error técnico crudo de la librería.
    console.error('[lib/pdf] Error al cargar el documento PDF:', error);
    return {
      ok: false,
      error:
        'No se pudo leer este archivo PDF. Puede estar dañado o no ser un PDF válido.',
    };
  }
}

/**
 * Renderiza una página concreta de un documento PDF ya cargado en un
 * <canvas> oculto y devuelve el resultado como Data URL (imagen PNG).
 *
 * Se usa tanto para generar la portada (página 1) como, potencialmente,
 * para precachear páginas del lector.
 */
export async function renderizarPaginaComoImagen(
  documento: PDFDocumentProxy,
  numeroPagina: number,
  anchoObjetivo: number = ANCHO_MAX_PORTADA
): Promise<Resultado<string>> {
  try {
    const pagina = await documento.getPage(numeroPagina);

    // Calculamos la escala necesaria para alcanzar el ancho objetivo,
    // partiendo del viewport "natural" (escala 1) de la página.
    const viewportBase = pagina.getViewport({ scale: 1 });
    const escala = Math.min(
      anchoObjetivo / viewportBase.width,
      ESCALA_MAX_LECTOR
    );
    const viewport = pagina.getViewport({ scale: Math.max(escala, 0.1) });

    const canvas = document.createElement('canvas');
    const contexto = canvas.getContext('2d');

    if (!contexto) {
      return {
        ok: false,
        error: 'El navegador no permite crear un lienzo de renderizado.',
      };
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await pagina.render({
      canvas,
      canvasContext: contexto,
      viewport,
    }).promise;

    const dataUrl = canvas.toDataURL('image/png');

    // Liberamos referencias del canvas explícitamente ayudando al GC en
    // navegadores móviles, donde la memoria de canvas es más limitada.
    canvas.width = 0;
    canvas.height = 0;

    // pdfjs recomienda liberar los recursos de la página tras usarla si
    // no se va a reutilizar inmediatamente.
    pagina.cleanup();

    return { ok: true, valor: dataUrl };
  } catch (error) {
    console.error('[lib/pdf] Error al renderizar página:', error);
    return {
      ok: false,
      error: `No se pudo generar la imagen de la página ${numeroPagina}.`,
    };
  }
}

/**
 * Analiza una imagen (Data URL) y extrae un color "acento" representativo,
 * usado para pintar fondos degradados suaves detrás de cada portada en la
 * biblioteca (efecto muy propio de Apple Books / Epic!).
 *
 * Implementación deliberadamente simple: muestreamos un puñado de píxeles
 * en una rejilla reducida y promediamos. No buscamos precisión de
 * "k-means" de verdad, sino algo rápido, barato en CPU y visualmente
 * agradable. Si algo falla, devolvemos un color por defecto: la función
 * NUNCA debe romper el flujo de guardado de un libro.
 */
export async function extraerColorAcento(dataUrlImagen: string): Promise<string> {
  const COLOR_POR_DEFECTO = '#A78BFA'; // morado suave de la paleta "cuento"

  try {
    const imagen = new Image();
    imagen.src = dataUrlImagen;
    await new Promise<void>((resolve, reject) => {
      imagen.onload = () => resolve();
      imagen.onerror = () => reject(new Error('No se pudo cargar la imagen para muestreo de color.'));
    });

    const TAMANO_MUESTREO = 24; // rejilla pequeña = barato y suficiente
    const canvas = document.createElement('canvas');
    canvas.width = TAMANO_MUESTREO;
    canvas.height = TAMANO_MUESTREO;
    const contexto = canvas.getContext('2d');
    if (!contexto) return COLOR_POR_DEFECTO;

    contexto.drawImage(imagen, 0, 0, TAMANO_MUESTREO, TAMANO_MUESTREO);
    const { data } = contexto.getImageData(0, 0, TAMANO_MUESTREO, TAMANO_MUESTREO);

    let r = 0;
    let g = 0;
    let b = 0;
    let contador = 0;

    for (let i = 0; i < data.length; i += 4) {
      const alfa = data[i + 3];
      if (alfa < 32) continue; // ignoramos píxeles casi transparentes

      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      contador++;
    }

    if (contador === 0) return COLOR_POR_DEFECTO;

    r = Math.round(r / contador);
    g = Math.round(g / contador);
    b = Math.round(b / contador);

    return `rgb(${r}, ${g}, ${b})`;
  } catch (error) {
    console.warn('[lib/pdf] No se pudo extraer color de acento, usando color por defecto:', error);
    return COLOR_POR_DEFECTO;
  }
}

/**
 * Libera explícitamente los recursos de un documento PDF cargado
 * (destruye la `PDFDocumentLoadingTask` asociada, que a su vez cierra el
 * worker y libera los buffers internos de pdfjs).
 *
 * Envolver esta llamada en una función propia (en vez de llamar
 * `.destroy()` directamente desde los componentes) nos permite añadir
 * logging o lógica adicional en un único lugar en el futuro.
 */
export function destruirDocumentoPdf(gestionado: DocumentoPdfGestionado | null): void {
  if (!gestionado) return;
  try {
    // `destroy()` devuelve una Promise; no necesitamos esperarla porque
    // no bloqueamos ninguna otra operación en su finalización, pero
    // capturamos cualquier rechazo para que nunca se convierta en un
    // "unhandled promise rejection" en consola.
    gestionado.tarea.destroy().catch((error) => {
      console.warn('[lib/pdf] Aviso al destruir documento PDF (async):', error);
    });
  } catch (error) {
    // Un fallo al destruir no debe nunca propagar un error a la UI: en
    // el peor caso, el navegador liberará la memoria al recargar/cerrar.
    console.warn('[lib/pdf] Aviso al destruir documento PDF:', error);
  }
}
