# Guía breve para la demostración

1. Ejecutar `pnpm dev` y abrir `http://localhost:5173`.
2. Crear una cuenta y explicar que el microservicio de perfil genera un registro independiente.
3. Abrir **Aprender**, completar una lección y mostrar cómo cambian los XP, la racha y el progreso.
4. Buscar una palabra en **Diccionario visual**.
5. Probar **Traductor** con “Hola, buenos días” por escrito o con el micrófono.
6. Cerrar sesión y elegir **Entrar con enlace**. Abrir el HTML más reciente de `datos/bandeja-salida/` para simular el correo.
7. Explicar que al configurar SMTP el mismo servicio envía el mensaje a una dirección real sin modificar código.

## Puntos para la exposición

- El producto cambió de una herramienta puntual a una experiencia de aprendizaje medible.
- Los servicios de perfil y correo pueden desplegarse y evolucionar por separado.
- SQLite simplifica la demostración; en producción puede sustituirse por PostgreSQL sin cambiar la interfaz web.
- Los videos son contenido propio del equipo y el catálogo se regenera automáticamente.
