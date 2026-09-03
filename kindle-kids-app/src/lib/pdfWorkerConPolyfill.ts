/**
 * lib/pdfWorkerConPolyfill.ts
 * ─────────────────────────────────────────────────────────────────────────
 * ENTRY POINT PROPIO DEL WEB WORKER de pdfjs-dist.
 *
 * ¿POR QUÉ EXISTE ESTE ARCHIVO?
 * pdfjs-dist ejecuta la mayor parte de su trabajo (parseo y renderizado de
 * PDF) dentro de un Web Worker, es decir, en un hilo de JavaScript
 * COMPLETAMENTE AISLADO del hilo principal de la página. Internamente usa
 * `Map.prototype.getOrInsertComputed`, un método nativo estandarizado
 * recién en 2026 (Chrome 145 / Safari 18.4 / Firefox 144). En cualquier
 * navegador anterior a esas versiones, ese método no existe y pdfjs falla
 * en silencio dentro del worker, dejando la página del cuento en blanco.
 *
 * Un polyfill aplicado en el HILO PRINCIPAL (por ejemplo en `lib/pdf.ts`)
 * NO tiene ningún efecto dentro del worker, porque cada Web Worker tiene
 * su propio entorno global (`self`) totalmente separado.
 *
 * SOLUCIÓN: en lugar de apuntar `GlobalWorkerOptions.workerSrc` al script
 * del worker de pdfjs directamente, apuntamos a ESTE archivo. Este script
 * se ejecuta primero DENTRO del worker, aplica el polyfill sobre el
 * `Map.prototype` de ESE entorno global, y solo después importa
 * dinámicamente el worker real de pdfjs, que ya encuentra el método
 * disponible cuando lo necesita.
 *
 * Esto mantiene el requisito de robustez "indestructible" sin tener que
 * tocar (y por lo tanto sin tener que mantener) el código fuente interno
 * de la librería pdfjs-dist en `node_modules`.
 * ─────────────────────────────────────────────────────────────────────────
 */

// El polyfill se aplica sobre `Map.prototype`, que dentro de un Web
// Worker es una instancia distinta a la del hilo principal, pero el
// objeto global `self` sigue exponiendo la misma clase `Map` del
// entorno JavaScript estándar, así que el parche es idéntico en forma.
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

// Con el polyfill ya aplicado sobre el entorno global del worker,
// importamos el script real de pdfjs. Este `import` estático (resuelto
// por Vite en build time) hace que el bundler incluya el worker
// verdadero como una dependencia de ESTE entry point, preservando el
// code-splitting automático (el worker sigue siendo un chunk aparte).
import 'pdfjs-dist/build/pdf.worker.mjs';
