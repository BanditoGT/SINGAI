import { cpSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(root, 'aplicaciones', 'interfaz', 'dist');
const mediaDestination = join(destination, 'multimedia');

rmSync(mediaDestination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(join(root, 'multimedia'), mediaDestination, { recursive: true });
copyFileSync(join(root, 'datos', 'catalog.json'), join(destination, 'catalog.json'));

console.log('Paquete Firebase preparado: catálogo y videos incluidos.');
