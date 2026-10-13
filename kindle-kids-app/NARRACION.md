# Narración de cuentos

El lector obtiene primero el texto incluido en la página PDF. Si no contiene letras,
usa el OCR local en español. No describe ilustraciones, inventa acciones ni resume
el cuento. El orden depende del PDF; páginas con columnas o texto dibujado requieren
revisión. «Ver texto» permite comprobar qué se va a leer.

«Escuchar página» solicita una voz neuronal a través de una función de Netlify.
La configuración inicial es ElevenLabs Multilingual v2, voz George, con
velocidad 0,9 y estabilidad 0,65. Su tono debe probarse con cuentos reales antes de darlo por aprobado.
El audio tiene controles de reproducción, pausa, posición y velocidad. Cambiar de
página o cerrar el lector cancela la descarga y detiene el audio. En móviles que
bloquean la reproducción tras una descarga, se pide pulsar reproducir nuevamente.

## Activar ElevenLabs

1. Crear una cuenta gratuita de ElevenLabs y una clave con permiso **Text to Speech**.
   La clave debe tener un límite de créditos mayor que cero. Un límite 0 bloquea
   todas las solicitudes aunque la cuenta tenga créditos. Se puede asignar un límite
   de hasta la cuota gratuita disponible, sin contratar un plan de pago.
2. En Netlify → Cuentitoss → Project configuration → Environment variables,
   añadir estas variables con ámbito **Functions** (o todos los ámbitos):

   | Variable | Valor |
   | --- | --- |
   | `ELEVENLABS_API_KEY` | Clave privada de ElevenLabs |
   | `SUPABASE_URL` | URL del proyecto Supabase existente |
   | `SUPABASE_PUBLISHABLE_KEY` | Clave publicable del proyecto existente |

3. Volver a desplegar en Netlify y probar con una cuenta de correo confirmado.
   No poner la clave en GitHub, `netlify.toml` ni una variable `VITE_`.
   Para pruebas locales puede guardarse en `.env.local` (excluido de Git), usando
   Netlify Dev. Guardarla localmente no configura el servidor de producción.

El plan gratuito incluye 10.000 créditos mensuales, compartidos con otros productos
usados en esa cuenta. Multilingual v2 consume un crédito por carácter. El programa
no contrata planes ni recarga créditos. Al agotarse la cuota o el límite de la clave,
se muestra un aviso; se pueden seguir escuchando las copias locales ya guardadas.
También aplican los límites de Netlify.

El plan gratuito es para uso no comercial y exige atribución. El reproductor muestra
«Narración · elevenlabs.io». No quitarla de los audios publicados bajo ese plan.
No se clonan voces: se utiliza la voz predeterminada George de ElevenLabs.

La función verifica cada sesión contra Supabase Auth y exige correo confirmado.
El texto se envía como JSON, con límite de 5.000 caracteres por página y 32 KB
por solicitud. Netlify limita la ruta a 10 solicitudes por minuto por IP/dominio;
comprobar que la regla aparece en el registro de despliegue. No registrar claves,
tokens ni el contenido de cuentos en logs.

## Uso sin internet

El PDF se analiza en el dispositivo. Al preparar una página se envía **su texto**
a ElevenLabs para generar audio. El audio se guarda en IndexedDB, separado por cuenta,
libro, página y huella del texto/versión de voz. Repetirlo en ese dispositivo usa
la copia local, sin gastar más caracteres. No se guarda audio en Supabase todavía:
en otro dispositivo se genera de nuevo.

Solo las páginas ya preparadas tienen audio offline. El OCR de páginas escaneadas
necesita que sus recursos se hayan descargado antes. Hay un máximo de 64 MiB de
audio por biblioteca local; al alcanzarlo se permite escuchar pero se avisa que
no se pudo guardar. No se borran automáticamente audios anteriores. Quitar la
descarga o eliminar un libro también elimina sus audios. Borrar los datos del
navegador puede eliminar todas las copias locales.

## Verificación

`npm test`, `npm run lint` y `npm run build`.
Las pruebas del proveedor usan respuestas simuladas: no validan la calidad de voz
ni credenciales reales. Para ejecutar la función localmente usar Netlify Dev;
`npm run dev` solo sirve la aplicación Vite.

Referencias verificadas: [planes ElevenLabs](https://elevenlabs.io/pricing),
[API de voz](https://elevenlabs.io/docs/api-reference/text-to-speech/convert),
[variables de funciones Netlify](https://docs.netlify.com/build/functions/environment-variables/).
