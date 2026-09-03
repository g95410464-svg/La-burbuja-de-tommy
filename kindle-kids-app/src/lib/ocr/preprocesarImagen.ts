/**
 * lib/ocr/preprocesarImagen.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CAPA DE INFRAESTRUCTURA: preprocesamiento de imagen para OCR.
 *
 * El OCR (Tesseract) funciona mucho mejor sobre imágenes limpias: alto
 * contraste, fondo uniforme, texto nítido. Los cuentos infantiles suelen
 * tener texto sobre ilustraciones, fondos de color, o baja resolución.
 *
 * ESTA CAPA:
 *  - NUNCA altera la imagen que ve el usuario.
 *  - Trabaja SIEMPRE sobre una copia destinada exclusivamente al OCR.
 *  - Aplica transformaciones conservadoras que MEJORAN la legibilidad
 *    sin riesgo de "borrar" letras.
 *
 * NO implementamos aquí algoritmos destructivos (binarización agresiva,
 * umbralado) porque podrían eliminar texto decorativo o sobre ilustración.
 * Mantenemos el pipeline conservador y configurable.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Opciones de preprocesamiento. Todas opcionales con valores por defecto
 * conservadores. Exponemos `usarPreprocesado` como "opt-in" para poder
 * comparar OCR original vs preprocesado durante desarrollo (requisito
 * del diseño).
 */
export interface OpcionesPreprocesado {
  /** Activar/desactivar todo el preprocesamiento. Por defecto: true. */
  usarPreprocesado?: boolean;
  /**
   * Ancho objetivo en píxeles para el canvas del OCR.
   * Tesseract rinde mejor con una resolución razonablemente alta,
   * pero no excesiva (memoria). Por defecto: 1400.
   */
  anchoObjetivo?: number;
  /** Convertir a escala de grises. Por defecto: true. */
  escalaGrises?: boolean;
  /** Mejorar contraste de forma conservadora. Por defecto: true. */
  mejorarContraste?: boolean;
}

const OPCIONES_DEFECTO: Required<OpcionesPreprocesado> = {
  usarPreprocesado: true,
  anchoObjetivo: 1400,
  escalaGrises: true,
  mejorarContraste: true,
};

/**
 * Aplica mejora conservadora de contraste usando la técnica de
 * "auto-contraste" (escala lineal basada en los percentiles de la
 * imagen). Estiramos los valores de luminancia para que el rango
 * completo de blanco-negro se use, aumentando la separación entre
 * texto y fondo sin recortar (clipping) los extremos.
 *
 * Muestra una rejilla de píxeles para estimar los percentiles sin
 * recorrer la imagen completa (más barato en CPU).
 */
function calcularFactoresContraste(
  data: Uint8ClampedArray,
  ancho: number,
  alto: number
): { escala: number; desplazamiento: number } {
  // Rejilla de muestreo: máximo ~1600 puntos, suficiente para estimar.
  const paso = Math.max(1, Math.floor(Math.sqrt((ancho * alto) / 1600)));

  const luminancias: number[] = [];
  for (let y = 0; y < alto; y += paso) {
    for (let x = 0; x < ancho; x += paso) {
      const i = (y * ancho + x) * 4;
      // Luma ITU-R BT.601 ponderada: perceptualmente correcta.
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      luminancias.push(luma);
    }
  }

  if (luminancias.length === 0) return { escala: 1, desplazamiento: 0 };

  luminancias.sort((a, b) => a - b);

  // Percentiles 5 y 95 para resistir valores atípicos (ruido, bordes).
  const p5 = luminancias[Math.floor(luminancias.length * 0.05)];
  const p95 = luminancias[Math.floor(luminancias.length * 0.95)];

  const rango = p95 - p5;
  if (rango < 1) return { escala: 1, desplazamiento: 0 };

  // Escala lineal: mapear p5→0 y p95→255.
  const escala = 255 / rango;
  const desplazamiento = -p5 * escala;
  return { escala, desplazamiento };
}

/**
 * Preprocesa una imagen Data URL (PNG/JPEG) para maximizar la calidad
 * del OCR. Devuelve una NUEVA Data URL preparada para Tesseract.
 *
 * La imagen de entrada es la que ya genera pdfjs (`renderizarPaginaComoImagen`),
 * es decir, una página del PDF ya renderizada a Data URL. Este módulo
 * toma esa imagen, la redibuja en un canvas de trabajo y aplica las
 * transformaciones. La imagen ORIGINAL del usuario nunca se toca.
 *
 * @param imagenDataUrl Imagen de entrada (Data URL).
 * @param opciones      Opciones de preprocesamiento (todas opcionales).
 * @returns             Data URL de la imagen preprocesada, o la original
 *                      si no se pudo preprocesar (nunca lanza).
 */
export async function preprocesarImagen(
  imagenDataUrl: string,
  opciones?: OpcionesPreprocesado
): Promise<string> {
  const config = { ...OPCIONES_DEFECTO, ...opciones };

  // Si el preprocesado está desactivado, devolvemos la imagen tal cual.
  if (!config.usarPreprocesado) return imagenDataUrl;

  try {
    const imagen = await cargarImagen(imagenDataUrl);
    const anchoOriginal = imagen.naturalWidth;
    const altoOriginal = imagen.naturalHeight;

    if (!anchoOriginal || !altoOriginal) return imagenDataUrl;

    // Escala para alcanzar el ancho objetivo sin superar un tope
    // (evita redibujar a resoluciones absurdas en imágenes ya grandes).
    const escala = Math.min(
      config.anchoObjetivo / anchoOriginal,
      2 // nunca ampliamos más de 2x — podría difuminar el texto
    );

    const ancho = Math.max(1, Math.round(anchoOriginal * escala));
    const alto = Math.max(1, Math.round(altoOriginal * escala));

    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const contexto = canvas.getContext('2d', { willReadFrequently: true });
    if (!contexto) return imagenDataUrl;

    contexto.drawImage(imagen, 0, 0, ancho, alto);

    if (config.escalaGrises || config.mejorarContraste) {
      const imageData = contexto.getImageData(0, 0, ancho, alto);
      const data = imageData.data;

      let escalaC = 1;
      let desplazamientoC = 0;
      if (config.mejorarContraste) {
        ({ escala: escalaC, desplazamiento: desplazamientoC } =
          calcularFactoresContraste(data, ancho, alto));
      }

      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        if (config.escalaGrises) {
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          r = g = b = luma;
        }

        if (config.mejorarContraste) {
          r = r * escalaC + desplazamientoC;
          g = g * escalaC + desplazamientoC;
          b = b * escalaC + desplazamientoC;
        }

        data[i] = clamp255(r);
        data[i + 1] = clamp255(g);
        data[i + 2] = clamp255(b);
      }

      contexto.putImageData(imageData, 0, 0);
    }

    const dataUrlPreprocesada = canvas.toDataURL('image/png');

    // Liberamos memoria del canvas de trabajo explícitamente.
    canvas.width = 0;
    canvas.height = 0;

    return dataUrlPreprocesada;
  } catch (error) {
    // Nunca rompemos el flujo OCR por un fallo de preprocesado:
    // devolvemos la imagen original y el OCR intentará con ella.
    console.warn('[preprocesarImagen] No se pudo preprocesar, usando original:', error);
    return imagenDataUrl;
  }
}

/** Carga una imagen Data URL en un elemento Image. */
function cargarImagen(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const imagen = new Image();
    imagen.onload = () => resolve(imagen);
    imagen.onerror = () => reject(new Error('No se pudo cargar la imagen para preprocesado.'));
    imagen.src = dataUrl;
  });
}

/** Asegura que un valor quede en [0, 255]. */
function clamp255(valor: number): number {
  return valor < 0 ? 0 : valor > 255 ? 255 : Math.round(valor);
}
