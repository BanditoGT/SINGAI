import test from 'node:test';
import assert from 'node:assert/strict';
import { actividadUltimosDias, calcularLogros } from '../aplicaciones/interfaz/fuente/logros.js';

test('los logros reflejan XP, lecciones y racha vigente', () => {
  const logros = calcularLogros({ xp: 120, streak: 4, lastActivity: '2026-09-25' }, { completedLessonIds: ['a','b','c','d','e'] }, '2026-09-25');
  assert.equal(logros.find(item => item.id === 'centenario').desbloqueado, true);
  assert.equal(logros.find(item => item.id === 'en-marcha').desbloqueado, true);
  assert.equal(logros.find(item => item.id === 'semana-perfecta').desbloqueado, false);
});

test('una racha vencida no desbloquea logros de constancia', () => {
  const logros = calcularLogros({ xp: 0, streak: 20, lastActivity: '2026-09-20' }, { completedLessonIds: [] }, '2026-09-25');
  assert.equal(logros.find(item => item.id === 'constante-3').desbloqueado, false);
});

test('la actividad semanal marca únicamente días practicados', () => {
  const actividad = actividadUltimosDias([{ completedAt: '2026-09-25T15:00:00.000Z' }], new Date('2026-09-25T18:00:00.000Z'));
  assert.equal(actividad.length, 7);
  assert.equal(actividad.at(-1).activo, true);
  assert.equal(actividad.filter(item => item.activo).length, 1);
});
