import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = resolve(root, 'datos');
const remove = target => {
  const safe = resolve(target);
  if (!safe.startsWith(`${data}\\`) && safe !== data) throw new Error(`Ruta fuera de datos: ${safe}`);
  if (existsSync(safe)) rmSync(safe, { force: true });
};

for (const name of ['auth.db', 'auth.db-shm', 'auth.db-wal', 'profiles.db', 'profiles.db-shm', 'profiles.db-wal']) remove(join(data, name));
const outbox = join(data, 'bandeja-salida');
if (existsSync(outbox)) for (const name of readdirSync(outbox)) if (name.endsWith('.html')) remove(join(outbox, name));
console.log('Datos locales reiniciados. El catálogo y los videos se conservaron.');
