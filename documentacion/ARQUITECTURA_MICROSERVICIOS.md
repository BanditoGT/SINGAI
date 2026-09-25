# Arquitectura de microservicios de SingAI

SingAI utiliza cinco servicios locales independientes cuando se inicia con `main.py`:

| Servicio | Puerto | Responsabilidad |
| --- | ---: | --- |
| Núcleo | 4100 | API pública local, credenciales, sesiones y coordinación de servicios. |
| Perfil | 4101 | Perfil, progreso, XP, vidas y vigencia de las rachas. |
| Correo | 4102 | Plantillas y entrega SMTP de verificación, recuperación y códigos. |
| Seguridad | 4103 | Códigos de seis dígitos, expiración, intentos y consumo único. |
| Auditoría | 4104 | Registro técnico de accesos aceptados y rechazados sin guardar contraseñas ni códigos. |

## Inicio de sesión local

1. El núcleo comprueba el correo y la contraseña.
2. Si la cuenta está verificada, solicita un desafío al servicio de seguridad.
3. Seguridad genera un código aleatorio, guarda solamente un resumen HMAC firmado y pide a Correo que lo entregue.
4. El código vence en diez minutos, permite cinco intentos y solamente puede usarse una vez.
5. El núcleo crea la sesión únicamente después de que Seguridad confirma el código.
6. Auditoría registra el resultado del proceso sin almacenar información secreta.

Si SMTP no está configurado, el mensaje se guarda en `datos/bandeja-salida` para demostraciones locales.

## Web pública gratuita

La versión publicada en Firebase mantiene autenticación por contraseña, correo previamente verificado y una sesión privada por pestaña. Firebase Spark no ofrece un backend personalizado gratuito para enviar y validar un código propio en cada acceso. Por seguridad, SingAI no finge esta validación desde JavaScript ni publica credenciales SMTP en el navegador.

## Política de rachas

- La zona horaria de referencia es `America/Guatemala`.
- Completar varias lecciones el mismo día no aumenta artificialmente la racha.
- Practicar al día siguiente suma un día.
- Si transcurre un día completo sin práctica, la racha visible y almacenada vuelve a cero.
- Después de una racha vencida, la siguiente lección comienza una racha nueva de un día.
