# Narración de cuentos

El lector obtiene primero el texto incluido en la página PDF. Si no contiene letras,
usa el OCR local en español. No describe ilustraciones, inventa acciones ni resume
el cuento. El orden depende del PDF; páginas con columnas o texto dibujado requieren
revisión. «Ver texto» permite comprobar qué se va a leer.

«Escuchar página» solicita una voz neuronal a través de una función de Netlify.
La configuración inicial es Azure `es-MX-DaliaNeural`, a un ritmo 10 % menor que
el normal. Su tono debe probarse con cuentos reales antes de darlo por aprobado.
El audio tiene controles de reproducción, pausa, posición y velocidad. Cambiar de
página o cerrar el lector cancela la descarga y detiene el audio. En móviles que
bloquean la reproducción tras una descarga, se pide pulsar reproducir nuevamente.

## Activar Azure sin contratar el nivel de pago

1. Crear una cuenta de Azure y un recurso **Speech** con tarifa **Free F0**.
   Confirmar la tarifa en el propio recurso. No elegir Standard S0 ni voces HD.
2. En el recurso, abrir **Keys and Endpoint** y obtener región y clave.
3. En Netlify → Cuentitoss → Project configuration → Environment variables,
   añadir las siguientes variables con ámbito **Functions** (o todos los ámbitos):

   | Variable | Valor |
   | --- | --- |
   | `AZURE_SPEECH_KEY` | Clave privada del recurso Speech |
   | `AZURE_SPEECH_REGION` | Región del recurso, por ejemplo `eastus` |
   | `AZURE_SPEECH_TIER` | `F0`, después de verificarlo en Azure |
   | `SUPABASE_URL` | La URL del proyecto Supabase existente |
   | `SUPABASE_PUBLISHABLE_KEY` | La clave publicable del proyecto existente |

4. Volver a desplegar en Netlify y probar con una cuenta de correo confirmado.
   No poner la clave de Azure en GitHub, `netlify.toml`, una variable `VITE_` ni el chat.

`AZURE_SPEECH_TIER` es una confirmación de configuración, no una consulta a la
facturación de Azure: quien configura debe comprobar que el recurso realmente es F0.
El código no cambia la tarifa ni tiene alternativa de pago. F0 ofrece 500.000
caracteres mensuales y limita las solicitudes; al alcanzar límites se muestra un
aviso. También aplican los límites de la cuenta Netlify.

La función verifica cada sesión contra Supabase Auth y exige correo confirmado.
El texto se escapa antes de producir SSML, tiene límite de 5.000 caracteres por
página y 32 KB por solicitud. Netlify limita la ruta a 10 solicitudes por minuto
por IP/dominio; comprobar que la regla aparece en el registro de despliegue.
No registrar claves, tokens ni el contenido de cuentos en logs.

## Uso sin internet

El PDF se analiza en el dispositivo. Al preparar una página se envía **su texto**
a Azure para generar audio. El audio se guarda en IndexedDB, separado por cuenta,
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

Referencias verificadas: [tarifas Azure Speech](https://azure.microsoft.com/en-us/pricing/details/speech/),
[API de voz](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech),
[variables de funciones Netlify](https://docs.netlify.com/build/functions/environment-variables/).
