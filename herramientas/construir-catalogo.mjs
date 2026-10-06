import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const mediaRoot = join(root, 'multimedia');
const output = join(root, 'datos', 'catalog.json');

const unitMeta = {
  'Abecedario': { title: 'El abecedario', description: 'Aprende a deletrear nombres y palabras.', icon: 'spell-check', color: '#6C5CE7', order: 1 },
  'Frases de cortesia': { title: 'Primeras conversaciones', description: 'Saluda y comunícate con respeto.', icon: 'messages', color: '#00A884', order: 2 },
  'Emociones': { title: 'Emociones', description: 'Expresa cómo te sientes.', icon: 'heart', color: '#F05D7B', order: 3 },
  'Dias de la semana': { title: 'Días de la semana', description: 'Habla sobre planes y fechas.', icon: 'calendar', color: '#F5A623', order: 4 },
  'Varios': { title: 'Acciones cotidianas', description: 'Amplía tu vocabulario para el día a día.', icon: 'sparkles', color: '#2D8CFF', order: 5 }
};

const titleCase = value => value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const slug = value => value.toLowerCase().replace(/ñ/g, 'enie').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (extname(name).toLowerCase() === '.mp4') files.push(full);
  }
}
walk(mediaRoot);

const grouped = new Map();
for (const file of files) {
  const rel = relative(mediaRoot, file).replaceAll('\\', '/');
  const group = rel.split('/')[0];
  if (!grouped.has(group)) grouped.set(group, []);
  const raw = basename(file, extname(file));
  grouped.get(group).push({ id: slug(`${group}-${raw}`), term: titleCase(raw), video: `/multimedia/${encodeURI(rel)}` });
}

const units = [...grouped.entries()].map(([group, signs]) => {
  const meta = unitMeta[group] ?? { title: group, description: 'Practica vocabulario nuevo.', icon: 'book', color: '#6C5CE7', order: 99 };
  signs.sort((a, b) => a.term.localeCompare(b.term, 'es'));
  const lessonSize = group === 'Abecedario' ? 6 : 5;
  const lessons = [];
  for (let i = 0; i < signs.length; i += lessonSize) {
    const chunk = signs.slice(i, i + lessonSize);
    lessons.push({ id: `${slug(group)}-${lessons.length + 1}`, title: `Lección ${lessons.length + 1}`, description: `${chunk[0].term} · ${chunk.at(-1).term}`, xp: 20, signs: chunk });
  }
  return { id: slug(group), ...meta, sourceGroup: group, totalSigns: signs.length, lessons };
}).sort((a, b) => a.order - b.order);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), totalSigns: files.length, units }, null, 2));
console.log(`Catálogo generado: ${files.length} señas, ${units.length} unidades, ${units.reduce((n, u) => n + u.lessons.length, 0)} lecciones.`);
