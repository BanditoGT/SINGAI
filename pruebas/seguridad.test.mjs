import test from 'node:test';
import assert from 'node:assert/strict';
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
