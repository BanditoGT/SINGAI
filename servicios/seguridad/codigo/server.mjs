import 'dotenv/config';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: join(root, '.env'), override: false });
const port = Number(process.env.SECURITY_PORT || 4103);
const serviceKey = process.env.SERVICE_KEY || 'senalab-internal-dev';
const mailUrl = process.env.MAIL_URL || 'http://localhost:4102';
const db = new DatabaseSync(join(root, 'datos', 'security.db'));
db.exec(`CREATE TABLE IF NOT EXISTS login_challenges (
  challenge_digest TEXT PRIMARY KEY, user_id INTEGER NOT NULL, email TEXT NOT NULL,
  code_digest TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT, created_at TEXT NOT NULL
)`);

const digest = value => createHash('sha256').update(String(value)).digest('hex');
const codeDigest = (challenge, code) => createHmac('sha256', serviceKey).update(`${challenge}:${code}`).digest('hex');
const same = (a, b) => {
  const left = Buffer.from(String(a)); const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
};
const app = express(); app.use(express.json({ limit: '16kb' }));
app.use('/internal', (req, res, next) => req.headers['x-service-key'] === serviceKey ? next() : res.status(403).json({ error: 'Acceso interno denegado.' }));
async function sendCode({ email, name, code }) {
  const response = await fetch(`${mailUrl}/internal/email/login-code`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-service-key': serviceKey },
    body: JSON.stringify({ to: email, name, code })
  });
  if (!response.ok) throw new Error('No fue posible entregar el código.');
  return response.json();
}

app.get('/health', (_req, res) => res.json({ service: 'security', status: 'ok', policy: { expiresMinutes: 10, maxAttempts: 5 } }));
app.post('/internal/challenges', async (req, res) => {
  const userId = Number(req.body.userId); const email = String(req.body.email || '').trim().toLowerCase();
  if (!userId || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Solicitud inválida.' });
  db.prepare('DELETE FROM login_challenges WHERE user_id=? OR expires_at<?').run(userId, new Date().toISOString());
  const challenge = randomUUID(); const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO login_challenges (challenge_digest,user_id,email,code_digest,expires_at,created_at) VALUES (?,?,?,?,?,?)')
    .run(digest(challenge), userId, email, codeDigest(challenge, code), expiresAt, new Date().toISOString());
  try {
    const delivery = await sendCode({ email, name: req.body.name || email.split('@')[0], code });
    res.status(201).json({ challenge, expiresAt, delivery: delivery.delivery, message: delivery.delivery === 'smtp'
      ? 'Te enviamos un código de seis dígitos. Puede tardar un momento; si no aparece, revisa Spam o Correo no deseado.'
      : 'Código generado en modo local. Abre el mensaje más reciente de datos/bandeja-salida.' });
  } catch (error) {
    db.prepare('DELETE FROM login_challenges WHERE challenge_digest=?').run(digest(challenge));
    res.status(502).json({ error: error.message });
  }
});
app.post('/internal/challenges/verify', (req, res) => {
  const challengeDigest = digest(req.body.challenge || '');
  const row = db.prepare('SELECT * FROM login_challenges WHERE challenge_digest=?').get(challengeDigest);
  if (!row || row.consumed_at || new Date(row.expires_at) <= new Date()) return res.status(400).json({ error: 'El código expiró. Inicia sesión nuevamente.' });
  if (row.attempts >= 5) return res.status(429).json({ error: 'Se agotaron los intentos. Inicia sesión nuevamente.' });
  const valid = same(row.code_digest, codeDigest(String(req.body.challenge || ''), String(req.body.code || '').trim()));
  if (!valid) {
    const attempts = row.attempts + 1; db.prepare('UPDATE login_challenges SET attempts=? WHERE challenge_digest=?').run(attempts, challengeDigest);
    return res.status(401).json({ error: `Código incorrecto. Te ${5 - attempts === 1 ? 'queda' : 'quedan'} ${5 - attempts} ${5 - attempts === 1 ? 'intento' : 'intentos'}.`, attemptsLeft: 5 - attempts });
  }
  db.prepare('UPDATE login_challenges SET consumed_at=? WHERE challenge_digest=?').run(new Date().toISOString(), challengeDigest);
  res.json({ verified: true, userId: row.user_id, email: row.email });
});
app.listen(port, () => console.log(`Security service en http://localhost:${port}`));
