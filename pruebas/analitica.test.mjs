import test from 'node:test';
import assert from 'node:assert/strict';
import { crearResumenAprendizaje } from '../servicios/analitica/codigo/resumen.mjs';

test('resume progreso e identifica la seña que necesita refuerzo', () => {
  const summary = crearResumenAprendizaje({
    profile: { xp: 140, streak: 4 },
    lessons: [{ lessonId: 'saludos', score: 90 }, { lessonId: 'emociones', score: 75 }],
    attempts: [
      { signId: 'Hola', score: 95, correct: true },
      { signId: 'Gracias', score: 45, correct: false },
      { signId: 'Gracias', score: 60, correct: false }
    ]
  });
  assert.equal(summary.overview.completedLessons, 2);
  assert.equal(summary.overview.practiceAccuracy, 33);
  assert.equal(summary.weakSigns[0].signId, 'Gracias');
  assert.match(summary.recommendation, /Gracias/);
  assert.equal(summary.privacy.rawVideoStored, false);
});

test('ofrece una recomendación inicial cuando todavía no hay actividad', () => {
  const summary = crearResumenAprendizaje();
  assert.equal(summary.overview.practiceAttempts, 0);
  assert.match(summary.recommendation, /Completa una lección/);
});
