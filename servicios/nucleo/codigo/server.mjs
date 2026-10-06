import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, checkPassword, signToken, verifyToken, randomToken, tokenDigest } from './security.mjs';
import dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
dotenv.config({ path: join(root, '.env'), override: false });
const port = Number(process.env.CORE_PORT || 4100);
const jwtSecret = process.env.JWT_SECRET || 'senalab-development-secret-change-me';
const serviceKey = process.env.SERVICE_KEY || 'senalab-internal-dev';
const profileUrl = process.env.PROFILE_URL || 'http://localhost:4101';
const mailUrl = process.env.MAIL_URL || 'http://localhost:4102';
const publicAppUrl = process.env.PUBLIC_APP_URL || 'http://localhost:5173';

const db = new DatabaseSync(join(root, 'datos', 'auth.db'));
db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT,
  created_at TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0,
  action_digest TEXT, action_type TEXT, action_expires TEXT
)`);

const app = express();
app.use(cors({ origin: process.env.WEB_ORIGIN?.split(',') || ['http://localhost:5173'], credentials: false }));
app.use(express.json({ limit: '64kb' }));
app.use('/multimedia', express.static(join(root, 'multimedia'), { maxAge: '1d' }));

const cleanEmail = value => String(value || '').trim().toLowerCase();
const publicUser = row => ({ id: row.id, email: row.email, verified: Boolean(row.verified), createdAt: row.created_at });
const findUser = email => db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail(email));
function auth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const payload = verifyToken(token, jwtSecret);
  if (!payload?.sub) return res.status(401).json({ error: 'Tu sesión expiró. Inicia sesión nuevamente.' });
  const account = db.prepare('SELECT verified FROM users WHERE id=?').get(payload.sub);
  if (!account?.verified) return res.status(403).json({ error: 'Debes verificar tu correo antes de entrar.' });
  req.user = payload;
  next();
}
async function internalPost(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-service-key': serviceKey }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Servicio no disponible (${response.status})`);
  return response.json();
}
async function sendAccountLink(user, type, name = '') {
  const raw = randomToken();
  const expires = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  db.prepare('UPDATE users SET action_digest=?,action_type=?,action_expires=? WHERE id=?').run(tokenDigest(raw), type, expires, user.id);
  const isReset = type === 'reset';
  const endpoint = isReset ? 'password-reset' : type === 'verify' ? 'verify-account' : 'magic-link';
  const route = isReset ? 'restablecer' : 'acceso';
  return internalPost(`${mailUrl}/internal/email/${endpoint}`, { to: user.email, name: name || user.email.split('@')[0], link: `${publicAppUrl}/${route}?token=${raw}` });
}
async function profileProxy(req, res, path, method = 'GET') {
  try {
    const response = await fetch(`${profileUrl}${path}`, { method, headers: { 'content-type': 'application/json', 'x-service-key': serviceKey, 'x-user-id': String(req.user.sub) }, body: method === 'GET' ? undefined : JSON.stringify(req.body) });
    const payload = await response.json();
    res.status(response.status).json(payload);
  } catch { res.status(503).json({ error: 'El servicio de perfiles no está disponible.' }); }
}

app.get('/api/health', (_req, res) => res.json({ service: 'core', status: 'ok' }));
app.get('/api/catalog', (_req, res) => {
  const file = join(root, 'datos', 'catalog.json');
  if (!existsSync(file)) return res.status(503).json({ error: 'Ejecuta pnpm catalog antes de iniciar.' });
  res.type('json').send(readFileSync(file, 'utf8'));
});
app.post('/api/auth/register', async (req, res) => {
  const email = cleanEmail(req.body.email); const password = String(req.body.password || ''); const name = String(req.body.name || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  if (name.length < 2) return res.status(400).json({ error: 'Escribe tu nombre.' });
  let createdId = null;
  try {
    const result = db.prepare('INSERT INTO users (email,password_hash,created_at) VALUES (?,?,?)').run(email, hashPassword(password), new Date().toISOString());
    createdId = Number(result.lastInsertRowid);
    await internalPost(`${profileUrl}/internal/profiles`, { userId: createdId, displayName: name, learningGoal: req.body.learningGoal || 'comunicarme' });
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(createdId);
    let delivery = 'unavailable';
    try { delivery = (await sendAccountLink(user, 'verify', name)).delivery; } catch (mailError) { console.error(mailError.message); }
    res.status(201).json({ requiresVerification: true, email, delivery, message: delivery === 'smtp' ? 'Cuenta creada. Revisa tu correo para verificarla.' : 'Cuenta creada. Abre el enlace guardado en datos/bandeja-salida para verificarla.' });
  } catch (error) {
    if (String(error).includes('UNIQUE')) {
      const existing = findUser(email);
      if (existing && !existing.verified && checkPassword(password, existing.password_hash)) {
        let delivery = 'unavailable';
        try { delivery = (await sendAccountLink(existing, 'verify', name)).delivery; } catch (mailError) { console.error(mailError.message); }
        return res.json({ requiresVerification: true, email, delivery, message: delivery === 'smtp' ? 'Te enviamos un nuevo enlace de verificación.' : 'Generamos un nuevo enlace en datos/bandeja-salida.' });
      }
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    }
    if (createdId) db.prepare('DELETE FROM users WHERE id=?').run(createdId);
    res.status(500).json({ error: 'No fue posible crear la cuenta.' });
  }
});
app.post('/api/auth/login', async (req, res) => {
  const user = findUser(req.body.email);
  if (!user || !user.password_hash || !checkPassword(String(req.body.password || ''), user.password_hash)) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  if (!user.verified) {
    let delivery = 'unavailable';
    try { delivery = (await sendAccountLink(user, 'verify')).delivery; } catch (error) { console.error(error.message); }
    const error = delivery === 'smtp'
      ? 'Tu cuenta aún no está verificada. Enviamos un nuevo enlace a tu correo.'
      : delivery === 'local-outbox'
        ? 'Tu cuenta aún no está verificada. El correo está en modo local: abre el enlace más reciente de datos/bandeja-salida o configura un remitente desde main.py.'
        : 'Tu cuenta aún no está verificada y no pudimos entregar el enlace. Revisa la configuración de correo al iniciar SingAI.';
    return res.status(403).json({ error, delivery });
  }
  res.json({ token: signToken({ sub: user.id, email: user.email }, jwtSecret), user: publicUser(user) });
});
app.get('/api/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json({ user: publicUser(user) });
});
async function requestLink(req, res, type) {
  const email = cleanEmail(req.body.email); const user = findUser(email);
  let delivery = 'unavailable';
  // Respuesta uniforme para evitar revelar qué correos están registrados.
  if (user) {
    try { delivery = (await sendAccountLink(user, type)).delivery; } catch (error) { console.error(error.message); }
  }
  const message = delivery === 'smtp'
    ? 'Si el correo está registrado, recibirás un enlace en unos minutos.'
    : delivery === 'local-outbox'
      ? 'Si el correo está registrado, el enlace se guardó en datos/bandeja-salida porque SingAI está en modo local.'
      : 'Si el correo está registrado, se generó la solicitud. Revisa la configuración del servicio de correo.';
  res.json({ message, delivery });
}
app.post('/api/auth/magic-link', (req, res) => requestLink(req, res, 'magic'));
app.post('/api/auth/forgot-password', (req, res) => requestLink(req, res, 'reset'));
app.post('/api/auth/magic/verify', (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE action_digest=? AND action_type IN ('magic','verify')").get(tokenDigest(String(req.body.token || '')));
  if (!user || new Date(user.action_expires) < new Date()) return res.status(400).json({ error: 'El enlace no es válido o ya expiró.' });
  db.prepare('UPDATE users SET action_digest=NULL,action_type=NULL,action_expires=NULL,verified=1 WHERE id=?').run(user.id);
  res.json({ token: signToken({ sub: user.id, email: user.email }, jwtSecret), user: publicUser(user) });
});
app.post('/api/auth/reset-password', (req, res) => {
  const password = String(req.body.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  const user = db.prepare('SELECT * FROM users WHERE action_digest=? AND action_type=?').get(tokenDigest(String(req.body.token || '')), 'reset');
  if (!user || new Date(user.action_expires) < new Date()) return res.status(400).json({ error: 'El enlace no es válido o ya expiró.' });
  db.prepare('UPDATE users SET password_hash=?,action_digest=NULL,action_type=NULL,action_expires=NULL WHERE id=?').run(hashPassword(password), user.id);
  res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
});
app.get('/api/profile', auth, (req, res) => profileProxy(req, res, '/internal/profile'));
app.patch('/api/profile', auth, (req, res) => profileProxy(req, res, '/internal/profile', 'PATCH'));
app.get('/api/progress', auth, (req, res) => profileProxy(req, res, '/internal/progress'));
app.post('/api/progress/complete', auth, (req, res) => profileProxy(req, res, '/internal/progress/complete', 'POST'));

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Ocurrió un error inesperado.' }); });
app.listen(port, () => console.log(`Core API en http://localhost:${port}`));
