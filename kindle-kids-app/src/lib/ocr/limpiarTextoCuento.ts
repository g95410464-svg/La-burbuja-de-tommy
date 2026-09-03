/**
 * lib/ocr/limpiarTextoCuento.ts
 * ─────────────────────────────────────────────────────────────────────────
 * CAPA DE DOMINIO: limpieza/normalización de texto OCR de cuentos.
 *
 * IMPORTANTE: Esta función NORMALIZA, no reescribe. No corrige
 * errores ortográficos del OCR ni inventa palabras. Su propósito es
 * transformar el texto crudo que devuelve Tesseract en un texto
 * "narrable" limpio, eliminando artefactos típicos del OCR:
 *
 *  - Espacios múltiples
 *  - Saltos de línea incorrectos
 *  - Espacios antes de puntuación
 *  - Palabras separadas por saltos de línea
 *  - Guiones de división de línea (salvo diálogos con raya)
 *  - Normalización de signos de interrogación/exclamación
 *  - Puntos suspensivos
 *  - Conservación de diálogos (raya)
 *
 * NO utiliza ninguna API de IA ni modelos de lenguaje. Es puramente
 * heurística y determinista.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Limpia el texto bruto de OCR para cuentos infantiles.
 *
 * @param textoBruto Texto tal como lo devuelve Tesseract.
 * @returns Texto limpio y normalizado (nunca null; "" si no hay contenido).
 */
export function limpiarTextoCuento(textoBruto: string): string {
  if (!textoBruto) return '';

  let texto = textoBruto;

  // 1. Normalizamos los saltos de línea a \n (los OCR a veces usan \r).
  texto = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Limpiamos espacios en blanco al inicio y final de cada línea
  //    y eliminamos líneas que solo contienen espacios.
  texto = texto
    .split('\n')
    .map((linea) => linea.trim())
    .join('\n');

  // 3. Eliminamos líneas completamente vacías consecutivas (dejamos
  //    como máximo una en blanco como separador de párrafo).
  texto = texto.replace(/\n{3,}/g, '\n\n');

  // 4. Reconstrucción de palabras rotas por salto de línea.
  //    "casa\nbonita" -> "casa bonita" (palabra no terminada, sin guion)
  texto = texto.replace(/([a-záéíóúüñ])[\n]+([a-záéíóúüñ])/gi, '$1 $2');

  // 5. Reconstrucción de palabras partidas con guion de división.
  //    "ca-\nsa" -> "casa" (el guion indica que la palabra continúa)
  //    PERO preservamos los diálogos iniciados con "—" o "-".
  //    Detectamos guion de división solo cuando hay una letra justo
  //    antes y otra justo después del guion+salto.
  texto = texto.replace(/([a-záéíóúüñ])-\n([a-záéíóúüñ])/gi, '$1$2');

  // 6. Reconstrucción de palabras separadas por salto donde Tesseract
  //    dejó un espacio al final de línea. Ya cubierto por #4.

  // 7. Espacios antes de puntuación (OCR suele dejarlos).
  texto = texto.replace(/\s+([.,;:!?¿¡…])/g, '$1');

  // 8. Normalización de signos de interrogación y exclamación
  //    (Tesseract a veces no reconoce ¿¡ iniciales en español).
  //    Solo agregamos el signo de apertura si falta en el inicio de
  //    una frase que ya cierra con ? o !.
  texto = normalizarSignos(texto);

  // 9. Normalización de puntos suspensivos: "..." y ". . ." -> "…"
  texto = texto.replace(/\.\s*\.\s*\./g, '…');
  texto = texto.replace(/\.\.+/g, '…');

  // 10. Colapsar espacios múltiples a uno solo (dentro de la línea).
  texto = texto.replace(/[ \t]{2,}/g, ' ');

  // 11. Eliminar espacios alrededor de la raya de diálogo.
  //     "— Hola" se mantiene, pero "—Hola" se corrige.
  texto = texto.replace(/(—|–)(?=[a-záéíóúüñA-ZÁÉÍÓÚÜÑ])/g, '$1 ');

  // 12. Quitar líneas de solo guiones/símbolos (artefactos de Tesseract
  //     que suelen ser marcos decorativos, no texto real).
  const lineas = texto
    .split('\n')
    .filter((linea) => !/^[\s\-—–_=*•·|]+$/.test(linea));

  texto = lineas.join('\n');

  // 13. Limpieza final de espacios y saltos redundantes.
  texto = texto
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return texto;
}

/**
 * Normaliza signos de interrogación y exclamación en español.
 * Tesseract a veces no detecta los signos de apertura (¿ ¡), o los
 * convierte en otros caracteres. Esta función:
 *  - Asegura que toda frase terminada en "?" tenga "¿" al inicio.
 *  - Asegura que toda frase terminada en "!" tenga "¡" al inicio.
 *  - Evita duplicar signos si ya están presentes.
 *
 * Es conservadora: solo agrega si falta, nunca quita.
 */
function normalizarSignos(texto: string): string {
  // Procesamos línea por línea para no cruzar límites de párrafo.
  return texto
    .split('\n')
    .map((linea) => {
      let resultado = linea;

      // Interrogación: buscar "?" y verificar si hay "¿" antes en la frase.
      resultado = resultado.replace(/([^¿]*)\?/g, (coincidencia, prefijo: string) => {
        if (/[¿]/.test(prefijo)) return coincidencia;
        // Buscar el inicio de la frase (último punto, signo, o inicio).
        const inicioFrase = prefijo.search(/[.!¡¿…]\s+[A-ZÁÉÍÓÚÜÑ]|^\s*[A-ZÁÉÍÓÚÜÑ"“']|^\s*[a-záéíóúüñ]/);
        if (inicioFrase >= 0) {
          const cabeza = prefijo.slice(0, inicioFrase);
          const cola = prefijo.slice(inicioFrase);
          return `${cabeza}¿${cola}?`;
        }
        return `¿${prefijo}?`;
      });

      // Exclamación: mismo patrón con "!".
      resultado = resultado.replace(/([^¡]*)!/g, (coincidencia, prefijo: string) => {
        if (/[¡]/.test(prefijo)) return coincidencia;
        const inicioFrase = prefijo.search(/[.!¡¿…]\s+[A-ZÁÉÍÓÚÜÑ]|^\s*[A-ZÁÉÍÓÚÜÑ"“']|^\s*[a-záéíóúüñ]/);
        if (inicioFrase >= 0) {
          const cabeza = prefijo.slice(0, inicioFrase);
          const cola = prefijo.slice(inicioFrase);
          return `${cabeza}¡${cola}!`;
        }
        return `¡${prefijo}!`;
      });

      return resultado;
    })
    .join('\n');
}
