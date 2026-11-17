import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, makeMessage } from '../servicios/administracion/codigo/notificaciones.mjs';

test('el correo reemplaza el nombre y los datos del recordatorio', () => {
  const message = makeMessage({
    ...defaults,
    subject: 'Hola {{nombre}}',
    body: '{{nombre}}, {{racha}} {{leccion}} {{enlace}}'
  }, 3, 'El abecedario', 'Roberto Arcon');
  assert.equal(message.subject, 'Hola Roberto Arcon');
  assert.match(message.text, /Roberto Arcon/);
  assert.match(message.text, /3 días de racha/);
  assert.match(message.text, /El abecedario/);
  assert.match(message.text, /https:\/\/singai\.web\.app\//);
  assert.doesNotMatch(message.text, /\{\{/);
});
