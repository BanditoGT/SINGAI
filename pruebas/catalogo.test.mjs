import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(root, 'datos', 'catalog.json'), 'utf8'));

test('el catálogo contiene todas las señas migradas', () => {
  const signs = catalog.units.flatMap(unit => unit.lessons.flatMap(lesson => lesson.signs));
  assert.equal(catalog.totalSigns, 105);
  assert.equal(signs.length, 105);
  assert.equal(new Set(signs.map(sign => sign.id)).size, 105);
});

test('cada lección apunta a videos existentes', () => {
  for (const unit of catalog.units) for (const lesson of unit.lessons) for (const sign of lesson.signs) {
    const relative = decodeURI(sign.video.replace(/^\/multimedia\//, '')).replaceAll('/', '\\');
    assert.equal(existsSync(join(root, 'multimedia', relative)), true, sign.video);
  }
});

test('las unidades y lecciones tienen identificadores únicos', () => {
  const unitIds = catalog.units.map(unit => unit.id);
  const lessonIds = catalog.units.flatMap(unit => unit.lessons.map(lesson => lesson.id));
  assert.equal(new Set(unitIds).size, unitIds.length);
  assert.equal(new Set(lessonIds).size, lessonIds.length);
});

test('las unidades y lecciones incluyen títulos y descripciones', () => {
  for (const unit of catalog.units) {
    assert.ok(unit.title.trim(), unit.id);
    assert.ok(unit.description.trim(), unit.id);
    for (const lesson of unit.lessons) {
      assert.ok(lesson.title.trim(), lesson.id);
      assert.ok(lesson.description.trim(), lesson.id);
    }
  }
});

test('cada lección ofrece una cantidad positiva de XP', () => {
  for (const unit of catalog.units) for (const lesson of unit.lessons) {
    assert.equal(Number.isInteger(lesson.xp) && lesson.xp > 0, true, lesson.id);
  }
});

test('las rutas del catálogo apuntan a archivos MP4 públicos', () => {
  const signs = catalog.units.flatMap(unit => unit.lessons.flatMap(lesson => lesson.signs));
  for (const sign of signs) assert.match(sign.video, /^\/multimedia\/.+\.mp4$/i, sign.id);
});
