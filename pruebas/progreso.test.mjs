import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarFallo, calcularRacha, calcularXpGanada, estadoRacha, estadoVidas, listarRangos, obtenerRango, rachaVigente, seCompletoHoy } from '../aplicaciones/interfaz/fuente/progreso.js';

test('la primera práctica inicia una racha de un día', () => {
  assert.equal(calcularRacha({ streak: 0, lastActivity: null }, '2026-08-20'), 1);
});

test('varias lecciones el mismo día no inflan la racha', () => {
  assert.equal(calcularRacha({ streak: 4, lastActivity: '2026-08-20' }, '2026-08-20'), 4);
});

test('practicar al día siguiente aumenta la racha y saltarse un día la reinicia', () => {
  assert.equal(calcularRacha({ streak: 4, lastActivity: '2026-08-19' }, '2026-08-20'), 5);
  assert.equal(calcularRacha({ streak: 4, lastActivity: '2026-08-18' }, '2026-08-20'), 1);
});

test('la racha visible vence después de faltar un día completo', () => {
  assert.equal(rachaVigente({ streak: 8, lastActivity: '2026-09-22' }, '2026-09-25'), 0);
  assert.equal(estadoRacha({ streak: 8, lastActivity: '2026-09-22' }, '2026-09-25').estado, 'sin-racha');
});

test('la racha queda en riesgo si la última práctica fue ayer', () => {
  const estado = estadoRacha({ streak: 8, lastActivity: '2026-09-24' }, '2026-09-25');
  assert.equal(estado.racha, 8);
  assert.equal(estado.estado, 'en-riesgo');
});

test('la XP distingue entre completar y repetir una lección', () => {
  assert.equal(calcularXpGanada(true, 100), 20);
  assert.equal(calcularXpGanada(true, 50), 10);
  assert.equal(calcularXpGanada(false, 100), 2);
});

test('detecta lecciones terminadas hoy en horario de Guatemala', () => {
  assert.equal(seCompletoHoy('2026-08-20T05:30:00.000Z', '2026-08-19'), true);
  assert.equal(seCompletoHoy('2026-08-20T06:30:00.000Z', '2026-08-20'), true);
});

test('los rangos avanzan cada 100 XP y terminan en Radiante III', () => {
  assert.equal(obtenerRango(0).nombre, 'Hierro I');
  assert.equal(obtenerRango(299).nombre, 'Hierro III');
  assert.equal(obtenerRango(300).nombre, 'Bronce I');
  assert.equal(obtenerRango(2300).nombre, 'Radiante III');
  assert.equal(obtenerRango(99999).nombre, 'Radiante III');
});

test('la guía contiene los 24 rangos y su XP necesaria', () => {
  const rangos = listarRangos();
  assert.equal(rangos.length, 24);
  assert.deepEqual(rangos[0], { nombre: 'Hierro I', rango: 'Hierro', division: 'I', xpNecesaria: 0, indice: 0 });
  assert.equal(rangos.at(-1).nombre, 'Radiante III');
  assert.equal(rangos.at(-1).xpNecesaria, 2300);
});

test('el quinto fallo bloquea diez minutos y descuenta XP sin bajar de cero', () => {
  const ahora = Date.parse('2026-08-20T12:00:00Z');
  const fallo = aplicarFallo({ hearts: 1, xp: 80 }, ahora);
  assert.equal(fallo.vidas, 0);
  assert.equal(fallo.xp, 55);
  assert.equal(fallo.xpPerdida, 25);
  assert.equal(new Date(fallo.bloqueadoHasta).getTime() - ahora, 10 * 60000);
  assert.equal(aplicarFallo({ hearts: 1, xp: 10 }, ahora).xp, 0);
});

test('las vidas vuelven a cinco cuando termina el bloqueo', () => {
  const bloqueo = '2026-08-20T12:10:00.000Z';
  assert.equal(estadoVidas({ hearts: 0, heartsBlockedUntil: bloqueo }, Date.parse('2026-08-20T12:05:00Z')).bloqueado, true);
  assert.equal(estadoVidas({ hearts: 0, heartsBlockedUntil: bloqueo }, Date.parse('2026-08-20T12:11:00Z')).vidas, 5);
});

test('la racha nunca conserva valores negativos', () => {
  assert.equal(calcularRacha({ streak: -4, lastActivity: '2026-09-25' }, '2026-09-25'), 0);
});

test('una puntuación inválida recibe la XP mínima', () => {
  assert.equal(calcularXpGanada(true, 'sin-puntuacion'), 10);
  assert.equal(calcularXpGanada(true, 500), 20);
});

test('un valor de XP inválido inicia en Hierro I', () => {
  assert.equal(obtenerRango('sin-xp').nombre, 'Hierro I');
  assert.equal(obtenerRango(299.9).xp, 299);
});

test('las vidas se mantienen enteras y dentro del límite', () => {
  assert.equal(estadoVidas({ hearts: 3.8 }).vidas, 3);
  assert.equal(estadoVidas({ hearts: 99 }).vidas, 5);
});

test('un perfil con XP inválida conserva un total seguro', () => {
  assert.equal(aplicarFallo({ hearts: 1, xp: 'incorrecta' }, 0).xp, 0);
});

test('una fecha inválida no cuenta como actividad de hoy', () => {
  assert.equal(seCompletoHoy('fecha-invalida', '2026-09-25'), false);
});
