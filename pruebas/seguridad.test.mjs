import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { hashPassword, checkPassword, signToken, verifyToken, tokenDigest } from '../servicios/nucleo/codigo/security.mjs';

test('las contraseñas se almacenan con sal y scrypt', () => {
  const hash = hashPassword('una-clave-segura');
  assert.notEqual(hash, 'una-clave-segura');
  assert.equal(checkPassword('una-clave-segura', hash), true);
  assert.equal(checkPassword('incorrecta', hash), false);
});

test('los tokens firmados validan firma y vencimiento', () => {
  const token = signToken({ sub: 7, email: 'alumno@demo.test' }, 'secreto-de-prueba', 60);
  assert.equal(verifyToken(token, 'secreto-de-prueba').sub, 7);
  assert.equal(verifyToken(token, 'otro-secreto'), null);
});

test('los tokens de un solo uso se guardan como resumen', () => {
  assert.equal(tokenDigest('abc'), tokenDigest('abc'));
  assert.notEqual(tokenDigest('abc'), tokenDigest('abcd'));
});

test('un token con segmentos adicionales es rechazado', () => {
  const token = signToken({ sub: 1 }, 'secreto', 60);
  assert.equal(verifyToken(`${token}.extra`, 'secreto'), null);
});

test('un vencimiento escrito como texto no valida la sesión', () => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: 1, exp: '9999999999' })).toString('base64url');
  const signature = createHmac('sha256', 'secreto').update(`${header}.${body}`).digest('base64url');
  const token = `${header}.${body}.${signature}`;
  assert.equal(verifyToken(token, 'secreto'), null);
});

test('un token sin vencimiento es rechazado', () => {
  const token = signToken({ sub: 1 }, 'secreto', -1);
  assert.equal(verifyToken(token, 'secreto'), null);
});

test('un hash de contraseña mal formado se rechaza sin fallar', () => {
  assert.equal(checkPassword('clave', ''), false);
  assert.equal(checkPassword('clave', 'sin-separador'), false);
  assert.equal(checkPassword('clave', 'sal:no-es-hexadecimal'), false);
});
