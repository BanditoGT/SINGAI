# SingAI

SingAI es una plataforma web de aprendizaje de Lengua de Señas Guatemalteca
(LENSEGUA). Organiza 105 video-señas en cinco unidades, permite practicar por
lecciones, consultar un diccionario visual y registrar XP, rachas y progreso.

## Arquitectura real

El repositorio contiene dos variantes de ejecución que deben distinguirse:

- **Integración local:** interfaz React/Vite y tres servicios Express: núcleo
  (`4100`), perfil (`4101`) y correo (`4102`). El núcleo expone `/api`, usa
  SQLite y coordina perfil y correo mediante rutas `/internal` protegidas con
  `x-service-key`.
- **Aplicación publicada:** la interfaz usa Firebase Authentication y Firestore
  directamente mediante el SDK web. Firebase Hosting sirve el frontend y el
  catálogo estático. Esta variante no consume los tres servicios locales.

Los servicios locales son una integración académica verificable, no el backend
productivo del despliegue Firebase.

## Requisitos

- Node.js 22 o posterior.
- pnpm.
- Una copia de `.env.example` guardada como `.env` para la ejecución local.
- Configuración Firebase y SMTP solamente cuando se necesiten esas integraciones.

Nunca se deben versionar `.env`, bases SQLite ni correos generados en la bandeja
local. La configuración web de Firebase se encuentra en el cliente porque el SDK
la requiere; la autorización efectiva depende de Firebase Authentication y de
[`firestore.rules`](firestore.rules).

## Instalación y ejecución

```powershell
Copy-Item .env.example .env
pnpm install
pnpm catalog
pnpm dev
```

`pnpm dev` inicia la interfaz y los tres servicios. Para iniciar solamente los
servicios Express sin Vite:

```powershell
pnpm start
```

La interfaz local queda en `http://localhost:5173` y la API pública local en
`http://localhost:4100/api`.

## Comandos verificados

| Comando | Propósito |
|---|---|
| `pnpm test` | Ejecuta las 16 pruebas automatizadas del catálogo, progreso, seguridad y traductor. |
| `pnpm evidence:integration` | Ejecuta un flujo Núcleo → Perfil → Correo sobre bases y bandeja temporales. |
| `pnpm build` | Compila la interfaz de producción con Vite. |
| `pnpm build:firebase` | Compila y prepara catálogo y multimedia para Firebase Hosting. |
| `pnpm reset:data` | Reinicia las bases locales de demostración; elimina datos locales. |

La prueba de integración es aislada: crea su entorno en el directorio temporal
del sistema, utiliza una dirección `example.test` y elimina ese entorno al terminar.

## Estructura

```text
aplicaciones/interfaz/   React 19, Vite y adaptador Firebase
servicios/nucleo/        identidad local, catálogo y fachada HTTP
servicios/perfil/        perfil, XP, racha y progreso
servicios/correo/        SMTP o bandeja HTML local
herramientas/            catálogo, preparación Firebase, reinicio y verificación
pruebas/                 pruebas automatizadas de dominio y seguridad
datos/catalog.json       catálogo generado que sí se versiona
multimedia/              105 video-señas del catálogo
docs/                    contrato OpenAPI, evidencia y entrega académica
```

## API y documentación

- [Contrato OpenAPI 3.1](docs/openapi.yaml): rutas públicas del núcleo y rutas
  internas de perfil y correo. Puede abrirse con Swagger Editor u otro visor
  compatible con OpenAPI 3.1.
- [Entrega 04 en PDF](docs/entrega-04/Entrega%2004%20SingAI.pdf).
- [Entrega 04 editable](docs/entrega-04/Entrega%2004%20SingAI.docx).
- [Evidencia reproducible](docs/evidencia/pruebas-2026-09-14.md).

## Seguridad y datos locales

- `JWT_SECRET` y `SERVICE_KEY` deben sustituirse por valores fuertes antes de
  cualquier despliegue.
- Los puertos `4101` y `4102` son internos y no deben exponerse a Internet.
- La ejecución sin SMTP escribe mensajes en `datos/bandeja-salida/`; esa carpeta
  está excluida de Git.
- `datos/auth.db` y `datos/profiles.db` son bases locales excluidas de Git.
- El proyecto aún no implementa rate limiting, timeout HTTP ni bloqueo de
  intentos en los servicios Express. La Entrega 04 registra estos pendientes.

## Estado verificado

El 14 de septiembre de 2026 se ejecutaron correctamente `pnpm test`,
`pnpm build` y el flujo aislado de integración. La respuesta de verificación
local conserva un defecto conocido: devuelve `user.verified=false` usando la
fila anterior al `UPDATE`, aunque la cuenta sí queda habilitada y el token funciona.
