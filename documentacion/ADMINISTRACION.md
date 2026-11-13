# Administración de SingAI

Firebase Hosting, Authentication y Firestore se conservan. El catálogo original se usa hasta que se publique una versión desde Administración. Las señas y lecciones que conservan su identificador mantienen su historial.

## Puesta en marcha

1. En Cloudinary, usa el plan gratuito. En Render, crea el servicio web desde `render.yaml` con el plan Free. Guarda las credenciales de Cloudinary y la cuenta de servicio de Firebase como variables secretas de Render. No las agregues a Git ni a variables `VITE_*`.
2. La cuenta de servicio debe poder administrar Firebase Authentication y escribir en Firestore del proyecto de SingAI. No requiere claves de cuentas de estudiantes.
3. Ejecuta `node servicios/administracion/codigo/asignar-inicial.mjs` en un entorno seguro con `FIREBASE_ADMIN_JSON`. Solo habilita la cuenta inicial ya verificada. No uses ese comando para gestionar otros administradores: el panel tiene esa opción.
4. Define `VITE_ADMIN_API_URL` con la URL HTTPS del servidor al compilar la interfaz. Publica las reglas de Firestore y Hosting del proyecto existente. No actives Firebase Blaze.
5. Verifica que una sesión normal no pueda llamar a las rutas de administrador. Con la cuenta inicial, vuelve a iniciar sesión y comprueba la publicación de un catálogo de prueba antes de operar sobre datos reales.

## Operación

- El panel permite cambiar unidades, lecciones, palabras y videos. Publicar requiere confirmación y evita sobrescribir una versión más reciente.
- Quitar una seña retira su video del catálogo. No borra archivos empaquetados en Firebase Hosting ni elimina automáticamente el recurso de Cloudinary, para conservar la posibilidad de recuperar contenido.
- Los videos nuevos son MP4 de hasta 20 MB. Render no almacena videos ni datos en disco.
- Desactivar una cuenta impide nuevos accesos. Eliminar quita el acceso de Authentication y el perfil público; los registros privados se conservan.
- Firebase Authentication envía los correos de restablecimiento. La cuenta inicial puede otorgar o retirar el rol de administración a cuentas activas y verificadas.
