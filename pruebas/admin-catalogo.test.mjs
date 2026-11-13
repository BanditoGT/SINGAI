import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validarCatalogo } from '../servicios/administracion/codigo/catalogo.mjs';
const original = () => JSON.parse(readFileSync(new URL('../datos/catalog.json', import.meta.url)));
test('acepta el catálogo existente y un MP4 del espacio de SingAI', () => {
  const data = original();
  data.units[0].lessons[0].signs[0].video = 'https://res.cloudinary.com/singai-test/video/upload/v123/singai/video-1.mp4';
  assert.equal(validarCatalogo(data, 'singai-test').totalSigns, data.totalSigns);
});
test('rechaza videos ajenos y lecciones sin señas', () => {
  const data = original();
  data.units[0].lessons[0].signs[0].video = 'https://example.com/video.mp4';
  assert.throws(() => validarCatalogo(data, 'singai-test'), /pertenecer/);
  data.units[0].lessons[0].signs = [];
  assert.throws(() => validarCatalogo(data, 'singai-test'), /al menos una seña/);
});
