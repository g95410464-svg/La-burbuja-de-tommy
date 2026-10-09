# Cuentitos: activar las cuentas

La aplicación local ya tiene configurada la URL y la clave pública del proyecto `wjnsukmxxykuvcwcxzgs` en `.env.local`. El archivo no contiene claves administrativas. El build adjunto para Netlify incorpora esta configuración pública. La configuración pública también está en `netlify.toml` para compilar desde GitHub. Las URLs de retorno del panel deben apuntar al sitio publicado. El despliegue en Netlify debe verificarse después del push. Sin variables, el acceso ofrece una vista previa local.

1. Crea o elige un proyecto activo en Supabase para Cuentitos.
2. Activa el proveedor Email en Authentication. Conserva la confirmación de correo.
3. En Authentication → URL Configuration, establece `https://cuentitoss.netlify.app` como Site URL. Añade ese origen y `http://127.0.0.1:5173` a Redirect URLs para producción y desarrollo.
4. Copia `.env.example` a `.env.local` e introduce la URL del proyecto y su clave **publishable** (también se admite la clave pública anon). Nunca uses una clave secret ni service_role en Vite.
5. `netlify.toml` ya incluye `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Al compilar desde GitHub se incorporan al frontend. Si cambias de proyecto, actualiza esos valores públicos y vuelve a desplegar.
6. Para uso público, configura el envío de correo de Supabase con un proveedor SMTP propio y comprueba entrega, confirmación de registro y recuperación.

## Verificación antes de publicar

- Crear una cuenta, confirmar el correo, iniciar y cerrar sesión.
- Recargar con sesión iniciada y comprobar que se restaura.
- Solicitar recuperación, abrir el enlace, cambiar contraseña e iniciar sesión nuevamente.
- Subir un PDF, avanzar páginas, volver a la biblioteca y continuar la lectura.
- Entrar con otra cuenta en el mismo navegador: debe tener una colección independiente.
- Comprobar errores de credenciales, conexión y confirmación pendiente.

## Almacenamiento

Las cuentas funcionan mediante Supabase Auth. Los PDF descargados, las portadas y el progreso se conservan en IndexedDB, separados por el identificador de cada cuenta. Los libros y el progreso se sincronizan con Supabase; los PDF descargados también permanecen en este dispositivo. No es almacenamiento cifrado y el acceso al perfil del navegador permite inspeccionar los datos locales. Borrar los datos del sitio elimina las descargas y los cambios todavía no sincronizados de ese navegador.

La base de datos anterior se conserva intacta; solo se utiliza en la vista previa sin Supabase. No se asigna automáticamente a la primera cuenta que inicia sesión. Si ya hay libros anteriores que se quieren conservar dentro de una cuenta, se deben volver a agregar desde sus PDF originales.

Los tres títulos de prueba se retiraron por petición del propietario. La biblioteca comienza vacía.

## Desarrollo

```sh
npm ci
npm run dev
npm run build
npm run lint
npm test
```

El registro, inicio de sesión y recuperación usan el SDK oficial: https://supabase.com/docs/reference/javascript/auth-signup

## Biblioteca híbrida

Los PDF se guardan en el bucket privado `cuentitos-books`. Las tablas `cuentitos_books` y `cuentitos_progress` tienen RLS por `auth.uid()`. El límite por archivo es 50 MB. Las portadas se guardan como imágenes de datos en los metadatos privados. No se necesita ninguna clave administrativa en el frontend.

Cada libro nuevo se guarda primero en IndexedDB y queda pendiente hasta que se confirme la subida. Al iniciar sesión en otro dispositivo se descarga el catálogo; abrir un libro lo descarga, y «Descargar para leer sin conexión» lo conserva sin abrirlo. «Quitar descarga» libera el PDF y OCR local sin eliminar su copia remota. No permite quitar la única copia de un libro que todavía no se ha sincronizado.

«Eliminar de mi biblioteca» elimina la colección activa y genera una marca persistente de borrado. Al reconectar se elimina el PDF remoto; los demás dispositivos descartan su copia cuando vuelven a sincronizar. Los metadatos mínimos del borrado permanecen para impedir que un dispositivo desactualizado vuelva a subir el libro. Un dispositivo que permanece desconectado conservará su copia hasta sincronizar.

El progreso usa la fecha de lectura más reciente; «terminado» se conserva al releer. La base de datos resuelve actualizaciones concurrentes de manera atómica. Los relojes de dispositivos deben estar correctamente ajustados. La sincronización se ejecuta al entrar a la biblioteca, al volver la conexión, después de subir/borrar, cada 30 segundos mientras la app está abierta y con el botón Sincronizar. No se promete sincronización con la aplicación cerrada.

La PWA precarga interfaz, fuentes y visor PDF. Tras abrirla una vez con internet y completar su instalación de caché, puede abrirse sin red. El OCR es opcional y solo estará disponible sin red si sus recursos ya se usaron y almacenaron previamente. La app recuerda el último usuario confirmado para acceso local sin conexión; esto no autoriza solicitudes a la nube ni sustituye la sesión de Supabase. El cierre de sesión retira ese recuerdo. Los datos locales no están cifrados: solo activar sesiones en dispositivos de confianza. El navegador puede liberar almacenamiento bajo presión; la copia en la nube permite recuperarlo.

## OTP de registro: activado

Por decisión del propietario, solo se pide verificación al crear la cuenta. El login habitual sigue usando correo y contraseña.

Se configuró SMTP propio de Brevo y se guardó la plantilla con `{{ .Token }}`. `netlify.toml` activa `VITE_REGISTRATION_OTP_ENABLED=true`. El registro pide el código por correo; el acceso habitual mantiene correo y contraseña. La entrega real sigue pendiente de una prueba con una cuenta propia.

Para activar el OTP:
1. Configurar un proveedor SMTP autorizado en Authentication → SMTP Settings.
2. Mantener habilitada la confirmación de correo.
3. Pegar `supabase/confirm-sign-up.html` en Authentication → Emails → Confirm sign up y guardar.
4. Añadir `VITE_REGISTRATION_OTP_ENABLED=true` al entorno de Netlify y volver a desplegar.
5. Probar registro, código correcto, incorrecto, vencido y reenvío con un correo propio. No se ha enviado ningún correo de prueba ni creado cuentas reales durante el desarrollo.

El backend verifica el código con `verifyOtp`, tipo `email`, vinculado al correo del registro. El reenvío utiliza `resend`, tipo `signup`, con espera visible de 60 segundos; los límites y vencimiento definitivos los impone Supabase.

## Verificación de esta versión

- Diez pruebas automatizadas: aislamiento local entre cuentas, cola ante fallo de red, descarga y retirada, borrado remoto sin resurrección, borrado pendiente, avance simultáneo y conservación del logro terminado.
- Prueba transaccional en Supabase de RLS entre dos usuarios y rechazo de un avance antiguo, con rollback de todos los datos temporales.
- Compilación TypeScript, lint y generación de manifiesto/service worker.
- SMTP y plantilla OTP configurados; todavía no se ha probado el registro de extremo a extremo.
- El asesor de Supabase no reporta problemas de RLS; avisa que la protección contra contraseñas filtradas está deshabilitada: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Correo sin cuota mensual de pago

Brevo ofrece un plan gratuito de SMTP con 300 correos diarios. Requiere crear y verificar una cuenta y un remitente; su activación está sujeta a las comprobaciones del proveedor. Puede usarse un remitente de un servicio gratuito, con sustitución del dominio por brevosend.com. Comprueba las condiciones vigentes antes de activarlo:
- https://www.brevo.com/products/transactional-email/
- https://help.brevo.com/hc/en-us/articles/35852083084178-Domain-setup-for-better-email-deliverability

La clave SMTP se introduce exclusivamente en el panel de Supabase, nunca en Vite, GitHub ni el chat. El envío integrado de Supabase tiene restricciones de destinatarios y no debe considerarse correo público de producción. Brevo ya está configurado. Falta probar la entrega y verificación con un registro propio.

