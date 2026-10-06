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
