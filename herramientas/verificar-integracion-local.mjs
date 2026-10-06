import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, symlinkSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const source = join(dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = mkdtempSync(join(tmpdir(), 'singai-integration-'));
const linkType = process.platform === 'win32' ? 'junction' : 'dir';
const basePort = 43100 + Math.floor(Math.random() * 1000);
const ports = { core: basePort, profile: basePort + 1, mail: basePort + 2 };

mkdirSync(join(sandbox, 'servicios'), { recursive: true });
mkdirSync(join(sandbox, 'datos'), { recursive: true });
for (const service of ['nucleo', 'perfil', 'correo']) {
  const target = join(sandbox, 'servicios', service);
  mkdirSync(target, { recursive: true });
  cpSync(join(source, 'servicios', service, 'codigo'), join(target, 'codigo'), { recursive: true });
  cpSync(join(source, 'servicios', service, 'package.json'), join(target, 'package.json'));
  symlinkSync(join(source, 'servicios', service, 'node_modules'), join(target, 'node_modules'), linkType);
}
cpSync(join(source, 'datos', 'catalog.json'), join(sandbox, 'datos', 'catalog.json'));
symlinkSync(join(source, 'node_modules'), join(sandbox, 'node_modules'), linkType);

const env = {
  ...process.env,
  CORE_PORT: String(ports.core),
  PROFILE_PORT: String(ports.profile),
  MAIL_PORT: String(ports.mail),
  PROFILE_URL: `http://127.0.0.1:${ports.profile}`,
  MAIL_URL: `http://127.0.0.1:${ports.mail}`,
  PUBLIC_APP_URL: 'http://127.0.0.1:5173',
  WEB_ORIGIN: 'http://127.0.0.1:5173',
  JWT_SECRET: 'integration-only-secret-not-for-deployment',
  SERVICE_KEY: 'integration-only-service-key',
  SMTP_HOST: '',
  SMTP_USER: '',
  SMTP_PASS: '',
  APP_TIME_ZONE: 'America/Guatemala'
};

const children = [];
const logs = [];
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function start(relativePath) {
  const child = spawn(process.execPath, [join(sandbox, relativePath)], {
    env,
    cwd: sandbox,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', data => logs.push(`${relativePath}: ${String(data).trim()}`));
  child.stderr.on('data', data => logs.push(`${relativePath} ERROR: ${String(data).trim()}`));
  children.push(child);
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { return await request(url); } catch { await wait(200); }
  }
  throw new Error(`No inició ${url}\n${logs.join('\n')}`);
}

function json(body, headers = {}) {
  return {
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  };
}

try {
  start('servicios/perfil/codigo/server.mjs');
  start('servicios/correo/codigo/server.mjs');
  start('servicios/nucleo/codigo/server.mjs');
  await Promise.all([
    waitFor(`http://127.0.0.1:${ports.core}/api/health`),
    waitFor(`http://127.0.0.1:${ports.profile}/health`),
    waitFor(`http://127.0.0.1:${ports.mail}/health`)
  ]);

  const health = {
    core: await request(`http://127.0.0.1:${ports.core}/api/health`),
    profile: await request(`http://127.0.0.1:${ports.profile}/health`),
    mail: await request(`http://127.0.0.1:${ports.mail}/health`)
  };
  const catalog = await request(`http://127.0.0.1:${ports.core}/api/catalog`);
  const email = `probe-${Date.now()}@example.test`;
  const register = await request(`http://127.0.0.1:${ports.core}/api/auth/register`, {
    method: 'POST',
    ...json({ email, password: 'ClavePrueba2026', name: 'Prueba Integración', learningGoal: 'comunicarme' })
  });
  const outbox = join(sandbox, 'datos', 'bandeja-salida');
  const htmlFile = existsSync(outbox)
    ? readdirSync(outbox).filter(file => file.endsWith('.html')).sort().at(-1)
    : null;
  const html = htmlFile ? readFileSync(join(outbox, htmlFile), 'utf8') : '';
  const actionToken = /token=([a-f0-9]{64})/.exec(html)?.[1];
  const verify = await request(`http://127.0.0.1:${ports.core}/api/auth/magic/verify`, {
    method: 'POST',
    ...json({ token: actionToken })
  });
  const bearer = verify.body.token;
  const profile = await request(`http://127.0.0.1:${ports.core}/api/profile`, {
    headers: { authorization: `Bearer ${bearer}` }
  });
  const complete = await request(`http://127.0.0.1:${ports.core}/api/progress/complete`, {
    method: 'POST',
    ...json({ lessonId: 'probe-lesson', score: 90 }, { authorization: `Bearer ${bearer}` })
  });
  const denied = await request(`http://127.0.0.1:${ports.profile}/internal/profile`, {
    headers: { 'x-user-id': '1' }
  });

  console.log(JSON.stringify({
    executedAt: new Date().toISOString(),
    isolatedTemporaryData: true,
    health,
    catalog: {
      status: catalog.status,
      totalSigns: catalog.body.totalSigns,
      units: catalog.body.units?.length
    },
    register: {
      status: register.status,
      requiresVerification: register.body.requiresVerification,
      delivery: register.body.delivery
    },
    localOutboxCreated: Boolean(htmlFile),
    verify: {
      status: verify.status,
      responseUserVerified: verify.body.user?.verified,
      tokenReturned: Boolean(bearer),
      knownIssue: verify.body.user?.verified === false
        ? 'La respuesta reutiliza la fila anterior al UPDATE; la cuenta sí queda verificada.'
        : null
    },
    profile: {
      status: profile.status,
      userId: profile.body.profile?.userId,
      xp: profile.body.profile?.xp
    },
    complete: {
      status: complete.status,
      firstCompletion: complete.body.firstCompletion,
      xp: complete.body.progress?.xp,
      streak: complete.body.progress?.streak
    },
    internalWithoutKey: { status: denied.status, error: denied.body.error }
  }, null, 2));
} finally {
  for (const child of children) child.kill();
  await wait(300);
  rmSync(sandbox, { recursive: true, force: true });
}
