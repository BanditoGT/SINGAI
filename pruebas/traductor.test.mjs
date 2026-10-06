import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearSecuenciaTraduccion } from '../aplicaciones/interfaz/fuente/traductor.js';

const catalogo = JSON.parse(readFileSync(new URL('../datos/catalog.json', import.meta.url), 'utf8'));
const senas = catalogo.units.flatMap(unidad => unidad.lessons.flatMap(leccion => leccion.signs));

test('conserva las palabras conocidas y deletrea las desconocidas en orden', () => {
  const resultado = crearSecuenciaTraduccion('HOLA SOY DIEGO', senas);
  assert.deepEqual(resultado.secuencia.map(item => item.etiqueta), ['Hola', 'S', 'O', 'Y', 'D', 'I', 'E', 'G', 'O']);
  assert.deepEqual(resultado.deletreadas, ['SOY', 'DIEGO']);
  assert.deepEqual(resultado.omitidas, []);
});

test('prefiere una seña de frase completa antes que deletrearla', () => {
  const resultado = crearSecuenciaTraduccion('buenos dias', senas);
  assert.equal(resultado.secuencia.length, 1);
  assert.equal(resultado.secuencia[0].term, 'Buenos Dias');
});
