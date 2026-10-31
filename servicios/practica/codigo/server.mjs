import 'dotenv/config';
import express from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { evaluarSena } from './evaluacion.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: join(root, '.env'), override: false });
const port = Number(process.env.PRACTICE_PORT || 4105);
const serviceKey = process.env.SERVICE_KEY || 'senalab-internal-dev';
const attempts = new Map();

const app = express();
app.use(express.json({ limit: '24kb' }));
app.use('/internal', (req, res, next) => req.headers['x-service-key'] === serviceKey
  ? next()
  : res.status(403).json({ error: 'Acceso interno denegado.' }));

function allowAttempt(userId) {
  const now = Date.now();
  const active = (attempts.get(userId) || []).filter(time => now - time < 60_000);
  if (active.length >= 30) return false;
  active.push(now);
  attempts.set(userId, active);
  return true;
}

app.get('/health', (_req, res) => res.json({
  service: 'practice',
  status: 'ok',
  capabilities: ['sign-feedback', 'confidence-score', 'privacy-first']
}));

app.post('/internal/evaluations', (req, res) => {
  const userId = Number(req.headers['x-user-id']);
  const expectedSign = String(req.body.expectedSign || '').trim();
  const detectedSign = String(req.body.detectedSign || '').trim();
  const confidence = Number(req.body.confidence);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Usuario inválido.' });
  if (!expectedSign || expectedSign.length > 80) return res.status(400).json({ error: 'Indica la seña que se está practicando.' });
  if (detectedSign.length > 80) return res.status(400).json({ error: 'La seña detectada no es válida.' });
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return res.status(400).json({ error: 'La confianza debe estar entre 0 y 1.' });
  }
  if (!allowAttempt(userId)) return res.status(429).json({ error: 'Espera un momento antes de volver a evaluar.' });
  res.json({ evaluation: evaluarSena(req.body), evaluatedAt: new Date().toISOString() });
});

app.listen(port, () => console.log(`Practice service en http://localhost:${port}`));

