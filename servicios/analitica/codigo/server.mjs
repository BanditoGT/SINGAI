import 'dotenv/config';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { crearResumenAprendizaje } from './resumen.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: join(root, '.env'), override: false });
const port = Number(process.env.ANALYTICS_PORT || 4106);
const serviceKey = process.env.SERVICE_KEY || 'senalab-internal-dev';
const db = new DatabaseSync(join(root, 'datos', 'analytics.db'));
db.exec(`CREATE TABLE IF NOT EXISTS practice_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  sign_id TEXT NOT NULL,
  detected_sign TEXT,
  score INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  confidence INTEGER NOT NULL,
  created_at TEXT NOT NULL
)`);

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use('/internal', (req, res, next) => req.headers['x-service-key'] === serviceKey
  ? next()
  : res.status(403).json({ error: 'Acceso interno denegado.' }));
const uid = req => Number(req.headers['x-user-id']);

app.get('/health', (_req, res) => res.json({
  service: 'analytics',
  status: 'ok',
  capabilities: ['learning-summary', 'weak-signs', 'next-step-recommendation']
}));

app.post('/internal/attempts', (req, res) => {
  const userId = uid(req);
  const evaluation = req.body.evaluation || req.body;
  const signId = String(evaluation.expectedSign || '').trim().slice(0, 80);
  if (!Number.isInteger(userId) || userId <= 0 || !signId) return res.status(400).json({ error: 'Intento inválido.' });
  db.prepare(`INSERT INTO practice_attempts
    (user_id,sign_id,detected_sign,score,correct,confidence,created_at)
    VALUES (?,?,?,?,?,?,?)`).run(
      userId,
      signId,
      String(evaluation.detectedSign || '').slice(0, 80) || null,
      Math.max(0, Math.min(100, Number(evaluation.score) || 0)),
      Number(Boolean(evaluation.correct)),
      Math.max(0, Math.min(100, Number(evaluation.confidence) || 0)),
      new Date().toISOString()
    );
  res.status(201).json({ recorded: true });
});

app.post('/internal/summary', (req, res) => {
  const userId = uid(req);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Usuario inválido.' });
  const attempts = db.prepare(`SELECT sign_id AS signId, detected_sign AS detectedSign,
    score, correct, confidence, created_at AS createdAt
    FROM practice_attempts WHERE user_id=? ORDER BY created_at DESC LIMIT 200`).all(userId)
    .map(item => ({ ...item, correct: Boolean(item.correct) }));
  res.json({ summary: crearResumenAprendizaje({
    profile: req.body.profile,
    lessons: req.body.lessons,
    attempts
  }) });
});

app.listen(port, () => console.log(`Analytics service en http://localhost:${port}`));

