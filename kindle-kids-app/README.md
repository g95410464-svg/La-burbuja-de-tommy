# 📖 Cuentitos — Biblioteca de Cuentos Infantiles

Aplicación web estilo **Kindle Kids / Epic!** para leer cuentos infantiles ilustrados en formato PDF, con una interfaz pulida, táctil y pensada para niños.

Funciona **completamente en el navegador** (sin backend): trae 3 cuentos de muestra precargados y permite subir PDFs propios, que se guardan en el dispositivo mediante IndexedDB.

---

## 🛠️ 1. Stack tecnológico

| Capa | Tecnología | Motivo |
|---|---|---|
| Framework UI | **React 19 + TypeScript** | Tipado estricto, componentes reutilizables |
| Bundler / Dev Server | **Vite** | Arranque instantáneo, HMR rápido, build optimizado |
| Estilos | **Tailwind CSS 3** | Diseño consistente mediante un sistema de tokens (`tailwind.config.js`) |
| Procesamiento de PDF | **pdfjs-dist 5.7.284** (Mozilla PDF.js) | Renderizado de PDF a `<canvas>` sin plugins nativos |
| Persistencia local | **IndexedDB** vía **idb** | Almacena PDFs binarios (Blobs) sin el límite de 5MB de LocalStorage |
| Fuentes | **@fontsource/baloo-2** y **@fontsource/nunito** | Tipografía redondeada y amigable, empaquetada localmente (sin depender de un CDN externo en producción) |

No se usa ningún router: la app tiene solo dos vistas (Biblioteca y Lector), gestionadas con estado simple en `App.tsx` (ver comentario de arquitectura en ese archivo).

---

## 📂 2. Estructura del proyecto

```
kindle-kids-app/
├── public/
│   ├── books/                     # PDFs de la biblioteca base (3 cuentos de muestra)
│   │   ├── luna-estrellas.pdf
│   │   ├── bosque-amigos.pdf
│   │   └── granja-feliz.pdf
│   ├── covers/                    # Portadas PNG pre-renderizadas de esos 3 cuentos
│   └── favicon.svg
│
├── src/
│   ├── types/
│   │   ├── libro.ts                # Contratos del dominio: Libro, ProgresoLectura, Resultado<T>
│   │   └── mapUpsert.d.ts          # Tipos para el polyfill de Map (ver sección 5)
│   │
│   ├── lib/                        # Lógica de negocio pura (sin React)
│   │   ├── pdf.ts                  # Wrapper de pdfjs-dist: cargar, renderizar, extraer color
│   │   ├── pdfWorkerConPolyfill.ts # Entry point del Web Worker con polyfill de compatibilidad
│   │   ├── storageManager.ts       # CRUD sobre IndexedDB (libros y progreso)
│   │   └── procesarSubida.ts       # Caso de uso: convertir un File subido en un Libro completo
│   │
│   ├── hooks/                      # Capa de aplicación (orquestación con estado de React)
│   │   ├── useBiblioteca.ts        # Combina biblioteca base + libros guardados + progreso
│   │   ├── usarLectorPdf.ts        # Ciclo de vida del documento PDF dentro del lector
│   │   └── usarGestoSwipe.ts       # Detección de gestos táctiles (swipe izq/der)
│   │
│   ├── data/
│   │   └── bibliotecaBase.ts       # Catálogo estático de los 3 cuentos precargados
│   │
│   ├── components/
│   │   ├── shared/                 # Componentes reutilizables de UI
│   │   │   ├── BotonGrande.tsx
│   │   │   ├── CargandoCuento.tsx
│   │   │   ├── AvisoError.tsx
│   │   │   └── LimiteDeError.tsx   # Error Boundary de React
│   │   ├── library/                # Pantalla de biblioteca
│   │   │   ├── PantallaBiblioteca.tsx
│   │   │   └── TarjetaLibro.tsx
│   │   ├── reader/                 # Pantalla del lector
│   │   │   ├── PantallaLector.tsx
│   │   │   └── ProgresoEstrellas.tsx
│   │   └── upload/                 # Subida de libros
│   │       ├── ZonaSubida.tsx      # Drag & Drop
│   │       └── ModalSubirLibro.tsx
│   │
│   ├── App.tsx                     # Componente raíz: navegación biblioteca ↔ lector
│   ├── main.tsx                    # Punto de entrada de React
│   └── index.css                   # Tailwind + fuentes + estilos base globales
│
├── tailwind.config.js               # Paleta de colores, animaciones y tipografía del "design system"
├── package.json
└── README.md
```

---

## 🚀 3. Instalación y ejecución local

### Requisitos previos
- **Node.js 20 o superior** (recomendado 22 LTS)
- **npm** (viene incluido con Node.js)

### Pasos

```bash
# 1. Entra a la carpeta del proyecto
cd kindle-kids-app

# 2. Instala las dependencias
npm install

# 3. Levanta el servidor de desarrollo
npm run dev
```

Esto abrirá la app en **http://localhost:5173** (Vite lo indicará en la terminal). La biblioteca ya tendrá 3 cuentos precargados listos para leer.

### Otros comandos disponibles

```bash
# Compilar para producción (genera la carpeta dist/)
npm run build

# Previsualizar el build de producción localmente
npm run preview

# Revisar el código con el linter
npm run lint
```

No se requiere ninguna variable de entorno ni backend: toda la aplicación corre en el navegador.

---

## ⚡ 4. Funcionalidades implementadas

### Biblioteca precargada
Tres cuentos de muestra (`public/books/*.pdf`) con ilustraciones vectoriales originales, listos para leer sin ninguna configuración adicional.

### Subida y persistencia de PDFs propios
- Zona de **Drag & Drop** más selector de archivo tradicional (`components/upload/ZonaSubida.tsx`), accesible por teclado.
- Al subir un PDF, se **extrae automáticamente la portada** (primera página renderizada a imagen) y un **color de acento** dominante para el fondo de la tarjeta (`lib/pdf.ts` → `extraerColorAcento`).
- El PDF completo se guarda como `Blob` en **IndexedDB** (`lib/storageManager.ts`), por lo que **sobrevive a recargas del navegador** sin necesidad de volver a subirlo.
- Se puede eliminar cualquier libro subido (no así los de la biblioteca base) con confirmación previa.

### Lector interactivo
- Controles grandes y táctiles: botones circulares ◀ ▶ a los costados.
- **Gestos de swipe** en móvil (`hooks/usarGestoSwipe.ts`).
- **Navegación por teclado**: flechas ← → para cambiar de página, `Esc` para salir.
- **Modo sin distracciones**: tocar el centro de la pantalla oculta/muestra los controles.
- **Progreso persistente**: cada cambio de página se guarda en IndexedDB y se refleja como una barra de progreso tipo "listón" en la tarjeta de la biblioteca.
- **Precarga inteligente**: la página siguiente se renderiza en segundo plano mientras el niño o niña lee la actual, para que el paso de página se sienta instantáneo.

---

## 🧱 5. Decisiones de arquitectura relevantes

### Por qué la lógica es "indestructible"
- **Result Pattern** (`Resultado<T>` en `types/libro.ts`): las funciones que pueden fallar de forma esperada (PDF corrupto, archivo no soportado, fallo de IndexedDB) devuelven un objeto `{ ok: false, error: string }` en vez de lanzar excepciones. Esto obliga, por tipos, a manejar el caso de error en cada punto de consumo.
- **Error Boundary** (`components/shared/LimiteDeError.tsx`): si algo inesperado escapa a todos los controles anteriores, este límite evita que la app entera se caiga con una pantalla en blanco.
- **Fallbacks visuales**: portadas rotas muestran un ícono de reemplazo (`TarjetaLibro.tsx`), PDFs corruptos muestran un mensaje amigable con opción de reintentar (`AvisoError.tsx`).

### Gestión de memoria en el lector de PDF
`hooks/usarLectorPdf.ts` es responsable de todo el ciclo de vida del documento pdfjs:
- Destruye el documento anterior (`PDFDocumentLoadingTask.destroy()`) cada vez que se cambia de libro o se desmonta el lector, liberando los buffers internos del Web Worker.
- Mantiene un **cache acotado** de imágenes de página (la actual ± 1) en memoria, purgando el resto — importante en libros de muchas páginas con ilustraciones HD, donde cada página renderizada puede pesar varios cientos de KB.
- Usa un identificador de "carga vigente" para descartar resultados obsoletos si el usuario cambia de libro muy rápido (evita condiciones de carrera).

### Un bug real de compatibilidad, encontrado y corregido
Durante el desarrollo se detectó que `pdfjs-dist` usa internamente `Map.prototype.getOrInsertComputed`, un método de JavaScript estandarizado recién en 2026 (Chrome 145, Safari 18.4, Firefox 144). En navegadores anteriores a esas versiones, el renderizado de PDF fallaba **en silencio dentro del Web Worker**, dejando la pantalla del lector en blanco sin ningún error visible.

La solución (`src/lib/pdfWorkerConPolyfill.ts`) es un *entry point* propio del Web Worker que aplica un polyfill de ese método **dentro del entorno aislado del worker** (un polyfill en el hilo principal no tiene ningún efecto ahí, porque cada Web Worker tiene su propio `Map.prototype`) antes de cargar el código real de `pdfjs-dist`. Se probó exhaustivamente con Playwright contra un navegador sin soporte nativo, confirmando el arreglo.

### Por qué no hay router
La app tiene solo dos pantallas conceptuales (Biblioteca y Lector). Introducir `react-router` para dos vistas sería sobre-ingeniería; la navegación se resuelve con un `useState` simple en `App.tsx`. Si en el futuro se necesitaran enlaces directos a un libro concreto, ese es el único archivo que habría que tocar.

---

## 🎨 6. Sistema de diseño

Definido centralizadamente en `tailwind.config.js`:
- **Paleta "cuento"**: colores cálidos (coral, turquesa, amarillo, morado) con variantes oscuras para estados `hover`/`active`.
- **Tipografía "Baloo 2"**: fuente redondeada típica de interfaces infantiles, con "Nunito" como respaldo.
- **Animaciones personalizadas**: `latido` (pulso de invitación al toque), `aparecer` (entrada suave de tarjetas), `flotar` (estados de carga), entre otras.
- **Botones con efecto "3D"**: sombra inferior sólida que desaparece y el botón se desplaza al presionar (`active:translate-y-1`), simulando un botón físico — un patrón de refuerzo táctil muy usado en apps infantiles.

---

## 📌 7. Límites conocidos / posibles próximos pasos

- El tamaño máximo de PDF subido está limitado a 60 MB (`lib/procesarSubida.ts`), ajustable según necesidad.
- No hay perfiles de usuario múltiples: la biblioteca y el progreso son únicos por navegador/dispositivo.
- No hay narración por voz (text-to-speech) ni resaltado de texto sincronizado; el PDF se trata como páginas ilustradas estáticas.
- IndexedDB tiene límites de cuota que varían según navegador y espacio disponible en disco; `storageManager.ts` ya maneja el fallo de escritura mostrando un mensaje claro al usuario.
