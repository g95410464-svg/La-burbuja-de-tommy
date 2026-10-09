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

Las cuentas funcionan mediante Supabase Auth. Los PDF, las portadas y el progreso siguen en IndexedDB, separados por el identificador de cada cuenta. No hay sincronización de libros entre dispositivos. No es almacenamiento cifrado y el acceso al perfil del navegador permite inspeccionar los datos locales. Borrar los datos del sitio elimina la colección de ese navegador.

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
