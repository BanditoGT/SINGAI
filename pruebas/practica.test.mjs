import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluarSena, normalizarSena } from '../servicios/practica/codigo/evaluacion.mjs';

test('normaliza tildes, espacios y mayúsculas al comparar señas', () => {
  assert.equal(normalizarSena('  CÓMO estás '), 'como-estas');
});

test('reconoce una seña clara y no almacena video', () => {
  const result = evaluarSena({
    expectedSign: 'Buenos días',
    detectedSign: 'buenos dias',
    confidence: 0.94,
    metrics: { visibility: 0.9, stability: 0.86 }
  });
  assert.equal(result.correct, true);
  assert.ok(result.score >= 90);
  assert.equal(result.privacy.videoStored, false);
  assert.equal(result.xpSuggested, 15);
});

test('una seña diferente recibe retroalimentación y no otorga XP', () => {
  const result = evaluarSena({ expectedSign: 'Hola', detectedSign: 'Gracias', confidence: 0.9 });
  assert.equal(result.correct, false);
  assert.equal(result.xpSuggested, 0);
  assert.match(result.feedback[0], /Gracias/);
});

