/**
 * types/mapUpsert.d.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Declaración de ambiente (ambient declaration) para los métodos
 * `Map.prototype.getOrInsert` y `Map.prototype.getOrInsertComputed`.
 *
 * Estos métodos forman parte de la propuesta ECMAScript "Upsert"
 * (estandarizada e implementada nativamente en navegadores recién a
 * partir de 2026: Chrome 145, Safari 18.4, Firefox 144). El `lib` target
 * configurado en `tsconfig.json` para este proyecto aún no los incluye
 * de forma built-in, así que los declaramos aquí a mano.
 *
 * Se usan en dos lugares de la app (ver `lib/pdf.ts` y
 * `lib/pdfWorkerConPolyfill.ts`), donde aplicamos un polyfill manual para
 * garantizar que pdfjs-dist funcione también en navegadores anteriores a
 * esas versiones.
 * ─────────────────────────────────────────────────────────────────────────
 */

interface Map<K, V> {
  /**
   * Devuelve el valor asociado a `key`. Si la clave no existe, inserta
   * `defaultValue` y lo devuelve.
   */
  getOrInsert(key: K, defaultValue: V): V;

  /**
   * Devuelve el valor asociado a `key`. Si la clave no existe, calcula
   * el valor por defecto invocando `callback(key)`, lo inserta y lo
   * devuelve. Útil cuando calcular el valor por defecto es costoso y
   * solo se quiere hacer bajo demanda.
   */
  getOrInsertComputed(key: K, callback: (key: K) => V): V;
}
