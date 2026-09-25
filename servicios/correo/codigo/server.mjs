import 'dotenv/config';
import express from 'express';
import nodemailer from 'nodemailer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: join(root, '.env'), override: false });
const outbox = join(root, 'datos', 'bandeja-salida'); mkdirSync(outbox, { recursive: true });
const port = Number(process.env.MAIL_PORT || 4102); const serviceKey = process.env.SERVICE_KEY || 'senalab-internal-dev';
const transport = process.env.SMTP_HOST ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined }) : null;
let deliveryMode = 'local-outbox';
if (transport) {
  try {
    await transport.verify();
    deliveryMode = 'smtp';
    console.log(`Conexión SMTP verificada para ${process.env.SMTP_USER || 'el remitente configurado'}`);
  } catch (error) {
    deliveryMode = 'smtp-error';
    console.error(`El proveedor SMTP rechazó la configuración: ${error.message}`);
  }
}
const app = express(); app.use(express.json({ limit: '24kb' }));
app.get('/health', (_req, res) => res.json({ service: 'mail', status: 'ok', delivery: deliveryMode }));
app.use('/internal', (req, res, next) => req.headers['x-service-key'] === serviceKey ? next() : res.status(403).json({ error: 'Acceso interno denegado.' }));
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function template({ name, link, kind }) {
  const verify = kind === 'verify'; const magic = kind === 'magic'; const title = verify ? 'Verifica tu cuenta' : magic ? 'Tu acceso a SingAI' : 'Cambia tu contraseña'; const action = verify ? 'Verificar mi correo' : magic ? 'Iniciar sesión' : 'Crear nueva contraseña';
  const purpose = verify ? 'confirmar tu correo y activar tu cuenta' : magic ? 'entrar de forma segura, sin contraseña' : 'elegir una contraseña nueva';
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#1d2844"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px"><table width="560" style="max-width:100%;background:white;border-radius:24px;padding:40px"><tr><td><div style="font-size:24px;font-weight:800;color:#6c5ce7">🤟🏻 SingAI</div><h1 style="font-size:28px;margin:32px 0 12px">${title}</h1><p style="line-height:1.6;color:#5d6680">Hola, ${escape(name)}. Usa el botón para ${purpose}.</p><p style="margin:30px 0"><a href="${escape(link)}" style="display:inline-block;background:#6c5ce7;color:white;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:bold">${action}</a></p><p style="font-size:13px;color:#8991a7">Este enlace vence en 20 minutos y solo puede utilizarse una vez. Si no lo solicitaste, ignora este mensaje.</p></td></tr></table></td></tr></table></body></html>`;
}
function codeTemplate({ name, code }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#1d2844"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px"><table width="560" style="max-width:100%;background:white;border-radius:24px;padding:40px"><tr><td><div style="font-size:24px;font-weight:800;color:#6c5ce7">🤟🏻 SingAI</div><h1 style="font-size:28px;margin:32px 0 12px">Tu código para entrar</h1><p style="line-height:1.6;color:#5d6680">Hola, ${escape(name)}. Escribe este código en SingAI para completar tu inicio de sesión:</p><div style="margin:28px 0;padding:20px;text-align:center;background:#f0edff;border-radius:16px;font-size:34px;font-weight:800;letter-spacing:9px;color:#5947dc">${escape(code)}</div><p style="font-size:13px;line-height:1.6;color:#8991a7">El código vence en 10 minutos y solo puede utilizarse una vez. Si no reconoces este intento, no compartas el código con nadie.</p><p style="font-size:13px;line-height:1.6;color:#8991a7">¿No lo encuentras en tu bandeja principal? A veces puede llegar a Spam o Correo no deseado. Puedes marcar a SingAI como remitente seguro para encontrarlo más fácilmente la próxima vez.</p></td></tr></table></td></tr></table></body></html>`;
}
async function send(req, res, kind) {
  const { to, name, link } = req.body; if (!/^\S+@\S+\.\S+$/.test(to || '') || !String(link || '').startsWith('http')) return res.status(400).json({ error: 'Mensaje inválido.' });
  const subject = kind === 'verify' ? 'Verifica tu cuenta de SingAI' : kind === 'magic' ? 'Tu enlace para entrar a SingAI' : 'Restablece tu contraseña de SingAI'; const html = template({ name, link, kind });
  if (deliveryMode === 'smtp') await transport.sendMail({ from: process.env.MAIL_FROM || 'SingAI <no-reply@singai.local>', to, subject, html });
  else { const filename = `${Date.now()}-${kind}-${String(to).replace(/[^a-z0-9]/gi, '_')}.html`; writeFileSync(join(outbox, filename), html); console.log(`Correo local: datos/bandeja-salida/${filename}`); }
  res.status(202).json({ queued: true, delivery: deliveryMode === 'smtp' ? 'smtp' : 'local-outbox' });
}
app.post('/internal/email/magic-link', (req, res) => send(req, res, 'magic').catch(() => res.status(502).json({ error: 'No fue posible enviar el correo.' })));
app.post('/internal/email/verify-account', (req, res) => send(req, res, 'verify').catch(() => res.status(502).json({ error: 'No fue posible enviar el correo.' })));
app.post('/internal/email/password-reset', (req, res) => send(req, res, 'reset').catch(() => res.status(502).json({ error: 'No fue posible enviar el correo.' })));
app.post('/internal/email/login-code', async (req, res) => {
  const { to, name, code } = req.body;
  if (!/^\S+@\S+\.\S+$/.test(to || '') || !/^\d{6}$/.test(String(code || ''))) return res.status(400).json({ error: 'Mensaje inválido.' });
  const html = codeTemplate({ name: name || String(to).split('@')[0], code: String(code) });
  try {
    if (deliveryMode === 'smtp') await transport.sendMail({ from: process.env.MAIL_FROM || 'SingAI <no-reply@singai.local>', to, subject: 'Tu código de seguridad de SingAI', html });
    else { const filename = `${Date.now()}-codigo-${String(to).replace(/[^a-z0-9]/gi, '_')}.html`; writeFileSync(join(outbox, filename), html); console.log(`Correo local: datos/bandeja-salida/${filename}`); }
    res.status(202).json({ queued: true, delivery: deliveryMode === 'smtp' ? 'smtp' : 'local-outbox' });
  } catch { res.status(502).json({ error: 'No fue posible enviar el código.' }); }
});
app.listen(port, () => console.log(`Mail service en http://localhost:${port}`));
