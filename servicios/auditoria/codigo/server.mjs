import 'dotenv/config';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: join(root, '.env'), override: false });
const port = Number(process.env.AUDIT_PORT || 4104);
const serviceKey = process.env.SERVICE_KEY || 'senalab-internal-dev';
const db = new DatabaseSync(join(root, 'datos', 'audit.db'));
db.exec(`CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, event_type TEXT NOT NULL,
  outcome TEXT NOT NULL, ip_hint TEXT, created_at TEXT NOT NULL
)`);
const app = express(); app.use(express.json({ limit: '16kb' }));
app.use('/internal', (req, res, next) => req.headers['x-service-key'] === serviceKey ? next() : res.status(403).json({ error: 'Acceso interno denegado.' }));
app.get('/health', (_req, res) => res.json({ service: 'audit', status: 'ok' }));
app.post('/internal/events', (req, res) => {
  const type = String(req.body.type || '').trim().slice(0, 60); const outcome = String(req.body.outcome || '').trim().slice(0, 30);
  if (!type || !outcome) return res.status(400).json({ error: 'Evento inválido.' });
  db.prepare('INSERT INTO security_events (user_id,event_type,outcome,ip_hint,created_at) VALUES (?,?,?,?,?)')
    .run(req.body.userId ? Number(req.body.userId) : null, type, outcome, String(req.body.ipHint || '').slice(0, 80), new Date().toISOString());
  res.status(202).json({ recorded: true });
});
app.listen(port, () => console.log(`Audit service en http://localhost:${port}`));
