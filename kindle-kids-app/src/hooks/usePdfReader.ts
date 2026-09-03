/**
 * hooks/usarLectorPdf.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CAPA DE APLICACIÓN: ciclo de vida completo de un documento PDF dentro
 * del lector interactivo.
 *
 * Responsabilidades de este hook:
 *  1. Obtener el ArrayBuffer del PDF (desde URL o desde Blob).
 *  2. Cargarlo con pdfjs-dist (lib/pdf.ts).
 *  3. Renderizar la página actual como imagen.
 *  4. Precachear silenciosamente la página siguiente (para que el "pase
 *     de página" se sienta instantáneo, sin esperas).
 *  5. GESTIÓN DE MEMORIA: destruir el documento pdfjs cuando el
 *     componente se desmonta o cuando cambia de libro, y limpiar el
 *     cache de imágenes para no acumular Data URLs en memoria
 *     indefinidamente (crítico en libros con muchas páginas HD).
 *
 * Esto es el corazón del requisito "indestructible": cualquier error en
 * cualquier punto de esta cadena se captura y se traduce a un estado
 * `error` legible, nunca a una pantalla en blanco o un crash de React.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { FuentePdf } from '../types/libro';
import {
  cargarDocumentoPdf,
  renderizarPaginaComoImagen,
  destruirDocumentoPdf,
  type DocumentoPdfGestionado,
} from '../lib/pdf';
import { ServicioOcr } from '../lib/ocr/ServicioOcr';
import { TesseractOcr } from '../lib/ocr/TesseractOcr';

type EstadoCarga = 'inactivo' | 'cargando' | 'listo' | 'error';

interface EstadoLectorPdf {
  estadoCarga: EstadoCarga;
  totalPaginas: number;
  paginaActual: number;
  imagenPaginaActual: string | null;
  cargandoPagina: boolean;
  mensajeError: string | null;
}

/**
 * Convierte una `FuentePdf` (url o blob) en un ArrayBuffer listo para
 * pdfjs. Aislamos esta conversión aquí porque las dos ramas tienen
 * formas de fallar distintas (red vs. lectura de blob) y ambas deben
 * quedar cubiertas por el mismo tipo de error controlado.
 */
async function obtenerBufferDesdeFuente(fuente: FuentePdf): Promise<ArrayBuffer> {
  if (fuente.tipo === 'url') {
    const respuesta = await fetch(fuente.url);
    if (!respuesta.ok) {
      throw new Error(`No se pudo descargar el libro (código ${respuesta.status}).`);
    }
    return respuesta.arrayBuffer();
  }

  // fuente.tipo === 'blob'
  return fuente.blob.arrayBuffer();
}

/**
 * Tamaño del cache de imágenes de página en memoria. Con un cache
 * pequeño (actual ± 1) evitamos que libros de muchas páginas acumulen
 * decenas de Data URLs (cada una puede pesar varios cientos de KB en
 * libros ilustrados HD) sin liberar nunca memoria.
 */
const RADIO_PRECARGA = 1;

/**
 * Ancho (en píxeles) al que se renderiza la imagen destinada al OCR.
 * Es mayor que el de visualización (1400) para dar a Tesseract más
 * detalle del texto, lo que mejora la precisión. Esta imagen es SOLO
 * para OCR: jamás se muestra al usuario y no toca el cache visual.
 */
const ANCHO_OCR = 1800;

/**
 * Intervalo en milisegundos para desencadenar el OCR de la página
 * actual una vez mostrada. Dejamos que el navegador pinte la imagen
 * antes de lanzar el OCR, evitando competir por el hilo en el mismo
 * frame.
 */
const RETARDO_INICIO_OCR_MS = 150;

export function usePdfReader(fuente: FuentePdf | null, libroId?: string) {
  const [estado, setEstado] = useState<EstadoLectorPdf>({
    estadoCarga: 'inactivo',
    totalPaginas: 0,
    paginaActual: 1,
    imagenPaginaActual: null,
    cargandoPagina: false,
    mensajeError: null,
  });

  // Referencias mutables que NO deben disparar re-render por sí mismas:
  // el documento pdfjs vivo (proxy) y el cache de imágenes renderizadas.
  // `gestionadoRef` guarda además la `tarea` de carga, necesaria para
  // liberar memoria correctamente (ver lib/pdf.ts).
  const gestionadoRef = useRef<DocumentoPdfGestionado | null>(null);
  const documentoRef = useRef<PDFDocumentProxy | null>(null);
  const cacheImagenesRef = useRef<Map<number, string>>(new Map());
  // Bandera para descartar resultados de cargas "obsoletas" si el
  // usuario cambia de libro muy rápido (evita condiciones de carrera).
  const idCargaVigenteRef = useRef(0);

  // ── Estado OCR (FASE 1) ─────────────────────────────────────────────
  // Exponemos el texto OCR de la página actual SIN modificar la UI del
  // lector (el comportamiento visual permanece idéntico). Esto queda
  // listo para que la FASE 2 (narración) lo consuma.
  const [textoOcrActual, setTextoOcrActual] = useState<string | null>(null);
  const [ocrListo, setOcrListo] = useState(false);

  // Referencias para el servicio OCR. `paginaActualRef` se actualiza de
  // forma SÍNCRONA (no espera a React) para que el callback del OCR
  // pueda decidir, sin desfase, si el resultado pertenece a la página
  // que se está mostrando ahora mismo.
  const servicioOcrRef = useRef<ServicioOcr | null>(null);
  const libroIdRef = useRef<string | undefined>(libroId);
  const paginaActualRef = useRef(1);

  // Mantenemos `libroIdRef` sincronizado si el padre cambia el prop.
  libroIdRef.current = libroId;

  /**
   * Limpia por completo el estado del lector: destruye el documento
   * pdfjs actual (liberando memoria del worker) y vacía el cache de
   * imágenes en memoria. Se invoca al cambiar de libro y al desmontar.
   */
  const limpiarRecursos = useCallback(() => {
    destruirDocumentoPdf(gestionadoRef.current);
    gestionadoRef.current = null;
    documentoRef.current = null;
    cacheImagenesRef.current.clear();
  }, []);

  /**
   * Renderiza (o recupera de cache) la imagen de una página concreta.
   */
  const obtenerImagenDePagina = useCallback(
    async (documento: PDFDocumentProxy, numeroPagina: number): Promise<string | null> => {
      const cache = cacheImagenesRef.current;
      const existente = cache.get(numeroPagina);
      if (existente) return existente;

      // Ancho generoso para libros ilustrados: priorizamos nitidez sobre
      // tamaño de archivo, ya que el requisito explícito es "soporte HD".
      const resultado = await renderizarPaginaComoImagen(documento, numeroPagina, 1400);
      if (!resultado.ok) {
        console.warn(`[usarLectorPdf] ${resultado.error}`);
        return null;
      }

      cache.set(numeroPagina, resultado.valor);
      return resultado.valor;
    },
    []
  );

  /**
   * Purga del cache las páginas que quedan fuera del "radio de precarga"
   * respecto a la página actual, para no dejar crecer la memoria sin
   * límite en libros largos.
   */
  const purgarCacheLejano = useCallback((paginaCentral: number) => {
    const cache = cacheImagenesRef.current;
    for (const numeroPagina of cache.keys()) {
      if (Math.abs(numeroPagina - paginaCentral) > RADIO_PRECARGA) {
        cache.delete(numeroPagina);
      }
    }
  }, []);

  /**
   * Crea (la primera vez) y devuelve el servicio OCR compartido de este
   * lector. El servicio gestiona un único worker de Tesseract reutilizable.
   * El callback solo aplica un resultado OCR si pertenece al libro y a la
   * página que se está mostrando AHORA (defensa extra contra condiciones
   * de carrera, además de la generación interna del servicio).
   */
  const obtenerServicioOcr = useCallback(() => {
    if (!servicioOcrRef.current) {
      servicioOcrRef.current = new ServicioOcr(new TesseractOcr(), {
        onResultadoOcr: (resultado) => {
          if (
            resultado.libroId === libroIdRef.current &&
            resultado.pagina === paginaActualRef.current
          ) {
            setTextoOcrActual(resultado.textoLimpio);
            setOcrListo(true);
          }
        },
      });
    }
    return servicioOcrRef.current;
  }, []);

  /**
   * Crea un proveedor de imagen de página para OCR. Renderiza la página a
   * `ANCHO_OCR` (solo para OCR, nunca para mostrar). Si el documento ya no
   * es el actual (el usuario cambió de libro), devuelve `null` para que el
   * servicio descarte la tarea sin error.
   */
  const crearProveedorImagenOcr = useCallback(
    (documento: PDFDocumentProxy, numeroPagina: number): (() => Promise<string | null>) => {
      return async () => {
        if (documentoRef.current !== documento) return null;
        const resultado = await renderizarPaginaComoImagen(documento, numeroPagina, ANCHO_OCR);
        if (!resultado.ok) {
          console.warn(`[usarLectorPdf] OCR (${numeroPagina}): ${resultado.error}`);
          return null;
        }
        return resultado.valor;
      };
    },
    []
  );

  /**
   * Encola OCR con la estrategia de precarga por prioridad:
   *   1. Página actual  → 'actual'
   *   2. Página siguiente → 'siguiente'
   *   3. Página anterior → 'anterior'
   * El servicio deduplica por (libroId, página) y solo procesa las
   * cercanas; NUNCA el libro completo.
   */
  const solicitarOcrParaPagina = useCallback(
    (documento: PDFDocumentProxy, paginaCentral: number, totalPaginas: number) => {
      const servicio = servicioOcrRef.current;
      const libro = libroIdRef.current;
      if (!servicio || !libro) return;

      servicio.solicitarPagina(
        libro,
        paginaCentral,
        'actual',
        crearProveedorImagenOcr(documento, paginaCentral)
      );

      if (paginaCentral + 1 <= totalPaginas) {
        servicio.solicitarPagina(
          libro,
          paginaCentral + 1,
          'siguiente',
          crearProveedorImagenOcr(documento, paginaCentral + 1)
        );
      }

      if (paginaCentral - 1 >= 1) {
        servicio.solicitarPagina(
          libro,
          paginaCentral - 1,
          'anterior',
          crearProveedorImagenOcr(documento, paginaCentral - 1)
        );
      }
    },
    [crearProveedorImagenOcr]
  );

  /**
   * Navega a una página concreta: renderiza (o toma de cache) la imagen,
   * actualiza el estado, y dispara en segundo plano la precarga de las
   * páginas vecinas para que "Siguiente/Anterior" se sientan instantáneos.
   */
  const irAPagina = useCallback(
    async (numeroPagina: number) => {
      const documento = documentoRef.current;
      if (!documento) return;

      const paginaAcotada = Math.min(
        Math.max(1, numeroPagina),
        documento.numPages
      );

      // Actualizamos la referencia síncrona ANTES de cualquier await:
      // así, si un OCR termina mientras renderizamos, el callback ya sabe
      // cuál es la página objetivo y descarta resultados obsoletos.
      paginaActualRef.current = paginaAcotada;

      setEstado((previo) => ({ ...previo, cargandoPagina: true }));

      const idCarga = idCargaVigenteRef.current;
      const imagen = await obtenerImagenDePagina(documento, paginaAcotada);

      // Si mientras renderizábamos el usuario ya cambió de libro, este
      // resultado quedó obsoleto: lo descartamos silenciosamente.
      if (idCarga !== idCargaVigenteRef.current) return;

      setEstado((previo) => ({
        ...previo,
        paginaActual: paginaAcotada,
        imagenPaginaActual: imagen,
        cargandoPagina: false,
      }));

      purgarCacheLejano(paginaAcotada);

      // Precarga silenciosa de la página siguiente (la más probable que
      // el niño o niña pida a continuación), sin bloquear la UI.
      const siguiente = paginaAcotada + 1;
      if (siguiente <= documento.numPages && !cacheImagenesRef.current.has(siguiente)) {
        obtenerImagenDePagina(documento, siguiente).catch(() => {
          // Fallo de precarga: no es crítico, se reintentará bajo
          // demanda si el usuario realmente navega a esa página.
        });
      }

      // ── OCR (FASE 1) ──────────────────────────────────────────────
      // Lanzamos el OCR de la página actual (y vecinas) con un pequeño
      // retardo para no competir por el hilo en el mismo frame en que se
      // pinta la imagen. El servicio se encarga de la cola de prioridad,
      // el cache y las condiciones de carrera.
      const idOcr = idCarga;
      window.setTimeout(() => {
        if (idCargaVigenteRef.current !== idOcr) return;
        solicitarOcrParaPagina(documento, paginaAcotada, documento.numPages);
      }, RETARDO_INICIO_OCR_MS);
    },
    [obtenerImagenDePagina, purgarCacheLejano, solicitarOcrParaPagina]
  );

  /**
   * Efecto principal: cada vez que cambia la `fuente` del PDF, se limpia
   * todo lo anterior y se inicia una nueva carga desde cero.
   */
  useEffect(() => {
    idCargaVigenteRef.current += 1;
    const idCargaActual = idCargaVigenteRef.current;

    // Reiniciamos el estado OCR y la referencia de página al comenzar una
    // carga nueva (nuevo libro o recarga), para que ningún resultado del
    // libro anterior contamine el nuevo.
    paginaActualRef.current = 1;
    setTextoOcrActual(null);
    setOcrListo(false);

    limpiarRecursos();

    if (!fuente) {
      setEstado({
        estadoCarga: 'inactivo',
        totalPaginas: 0,
        paginaActual: 1,
        imagenPaginaActual: null,
        cargandoPagina: false,
        mensajeError: null,
      });
      return;
    }

    // Preparamos el servicio OCR para este libro (worker de Tesseract
    // reutilizable + cola de prioridad). `cambiarLibro` descarta la cola
    // anterior e invalida los callbacks del libro previo.
    if (libroIdRef.current) {
      const servicio = obtenerServicioOcr();
      servicio.cambiarLibro(libroIdRef.current);
    }

    setEstado({
      estadoCarga: 'cargando',
      totalPaginas: 0,
      paginaActual: 1,
      imagenPaginaActual: null,
      cargandoPagina: false,
      mensajeError: null,
    });

    (async () => {
      try {
        const buffer = await obtenerBufferDesdeFuente(fuente);

        // Condición de carrera: si durante la descarga/lectura el
        // usuario ya cambió de libro otra vez, abandonamos sin tocar
        // el estado (que ya pertenece a la nueva carga en curso).
        if (idCargaActual !== idCargaVigenteRef.current) return;

        const resultado = await cargarDocumentoPdf(buffer);

        if (idCargaActual !== idCargaVigenteRef.current) return;

        if (!resultado.ok) {
          setEstado({
            estadoCarga: 'error',
            totalPaginas: 0,
            paginaActual: 1,
            imagenPaginaActual: null,
            cargandoPagina: false,
            mensajeError: resultado.error,
          });
          return;
        }

        gestionadoRef.current = resultado.valor;
        documentoRef.current = resultado.valor.documento;

        setEstado((previo) => ({
          ...previo,
          estadoCarga: 'listo',
          totalPaginas: resultado.valor.documento.numPages,
        }));

        await irAPagina(1);
      } catch (error) {
        if (idCargaActual !== idCargaVigenteRef.current) return;

        console.error('[usarLectorPdf] Error inesperado al cargar el libro:', error);
        setEstado({
          estadoCarga: 'error',
          totalPaginas: 0,
          paginaActual: 1,
          imagenPaginaActual: null,
          cargandoPagina: false,
          mensajeError:
            'No pudimos abrir este libro. Comprueba tu conexión o intenta con otro cuento.',
        });
      }
    })();

    // Función de limpieza: se ejecuta al desmontar el componente O antes
    // de que este efecto se vuelva a ejecutar (cambio de `fuente`). Aquí
    // es donde garantizamos que NUNCA queda un documento pdfjs "colgado"
    // consumiendo memoria tras salir del lector.
    return () => {
      limpiarRecursos();

      // Liberamos el servicio OCR: incrementa la generación (descarta
      // callbacks en vuelo), limpia la cola y termina el worker de
      // Tesseract. Cualquier OCR que estuviera en curso se cancela y su
      // resultado nunca llega a la UI.
      const servicio = servicioOcrRef.current;
      servicioOcrRef.current = null;
      if (servicio) void servicio.destruir();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuente]);

  const paginaSiguiente = useCallback(() => {
    irAPagina(estado.paginaActual + 1);
  }, [estado.paginaActual, irAPagina]);

  const paginaAnterior = useCallback(() => {
    irAPagina(estado.paginaActual - 1);
  }, [estado.paginaActual, irAPagina]);

  return {
    ...estado,
    irAPagina,
    paginaSiguiente,
    paginaAnterior,
    esPrimeraPagina: estado.paginaActual <= 1,
    esUltimaPagina: estado.paginaActual >= estado.totalPaginas,
    // OCR (FASE 1): texto de la página actual, expuesto para la futura
    // narración. La UI actual no lo usa (comportamiento idéntico).
    textoOcrActual,
    ocrListo,
  };
}
