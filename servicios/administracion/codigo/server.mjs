import express from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validarCatalogo } from './catalogo.mjs';

const projectId = 'singai-seminario-2026-gt';
const credential = JSON.parse(process.env.FIREBASE_ADMIN_JSON || '{}');
if (credential.project_id !== projectId) throw new Error('Configura FIREBASE_ADMIN_JSON para SingAI.');
initializeApp({ credential: cert(credential), projectId });
const auth = getAuth();
const db = getFirestore();
const catalog = db.doc('catalogo/publicado');
const history = db.collection('catalogoHistorial');
const original = JSON.parse(readFileSync(new URL('../../../datos/catalog.json', import.meta.url), 'utf8'));
const cloud = process.env.CLOUDINARY_CLOUD_NAME;
cloudinary.config({ cloud_name: cloud, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
const app = express();
app.disable('x-powered-by');
const origins = new Set((process.env.ADMIN_WEB_ORIGINS || 'https://singai.web.app').split(',').map(s => s.trim()));
app.use((req,res,next) => {
  const origin = req.get('origin');
  if (origin && !origins.has(origin)) return res.sendStatus(403);
  if (origin) res.set('Access-Control-Allow-Origin', origin).vary('Origin');
  res.set('Cache-Control', 'no-store');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.get('/health', (_req,res) => res.json({ status: 'ok' }));
app.use('/admin', async (req,res,next) => {
  const token = /^Bearer (\S+)$/.exec(req.get('authorization') || '')?.[1];
  if (!token) return res.sendStatus(401);
  try {
    const decoded = await auth.verifyIdToken(token, true);
    const actor = await auth.getUser(decoded.uid);
    if (!actor.emailVerified || actor.customClaims?.admin !== true || actor.disabled) return res.sendStatus(403);
    req.actor = actor;
    next();
  } catch { res.sendStatus(401); }
});
app.use(express.json({ limit: '750kb' }));
const audit = (req, action, target) => console.info(JSON.stringify({ action, target, actor: req.actor.uid, date: new Date().toISOString() }));
app.get('/admin/catalog/history', async (_req,res) => {
  const snapshots = await history.orderBy('revision','desc').limit(20).select('revision','archivedAt','totalSigns').get();
  res.json({ versions: snapshots.docs.map(doc => doc.data()) });
});
app.get('/admin/catalog/history/:revision', async (req,res) => {
  if (!/^\d+$/.test(req.params.revision)) return res.sendStatus(400);
  const snapshot = await history.doc(req.params.revision).get();
  if (!snapshot.exists) return res.sendStatus(404);
  res.json(snapshot.data());
});
app.put('/admin/catalog', async (req,res) => {
  const data = validarCatalogo(req.body, cloud);
  const revision = await db.runTransaction(async tx => {
    const snapshot = await tx.get(catalog);
    const current = snapshot.data()?.revision ?? 0;
    if (req.body.revision !== current) throw Object.assign(new Error('El catálogo cambió. Recarga antes de volver a guardar.'), { status: 409 });
    const previous = snapshot.data() ?? original;
    tx.set(history.doc(String(current)), { ...previous, revision: current, archivedAt: new Date().toISOString() });
    tx.set(catalog, { ...data, revision: current + 1, updatedAt: new Date().toISOString() });
    return current + 1;
  });
  audit(req, 'catalog.publish', String(revision));
  res.json({ ...data, revision });
});
app.post('/admin/video', express.raw({ type: 'video/mp4', limit: '20mb' }), async (req,res) => {
  if (!cloud || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return res.status(503).json({ error: 'Falta configurar Cloudinary.' });
  if (!Buffer.isBuffer(req.body) || req.body.length < 12 || req.body.subarray(4,8).toString() !== 'ftyp') return res.status(400).json({ error: 'Selecciona un video MP4 válido de hasta 20 MB.' });
  const publicId = `singai/${randomUUID()}`;
  const result = await new Promise((resolve,reject) => {
    cloudinary.uploader.upload_stream({ resource_type:'video', public_id:publicId, format:'mp4', overwrite:false },
      (error,value) => error ? reject(error) : resolve(value)).end(req.body);
  });
  audit(req, 'video.upload', publicId);
  res.status(201).json({ video: result.secure_url });
});
const userView = (u, profile) => ({ uid:u.uid, email:u.email ?? '', name:u.displayName ?? '', disabled:u.disabled, admin:u.customClaims?.admin === true, verified:u.emailVerified, hasProfile:profile?.exists === true, streakReminder:profile?.data()?.streakReminder === true });
app.get('/admin/users', async (req,res) => {
  const result = await auth.listUsers(100, typeof req.query.cursor === 'string' ? req.query.cursor : undefined);
  const profiles = result.users.length ? await db.getAll(...result.users.map(user => db.doc(`profiles/${user.uid}`)), {fieldMask:['streakReminder']}) : [];
  const byId = new Map(profiles.map(profile => [profile.id, profile]));
  res.json({ users: result.users.map(user => userView(user, byId.get(user.uid))), cursor: result.pageToken ?? null });
});
app.patch('/admin/users/:uid/reminders', async (req,res) => {
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') return res.sendStatus(400);
  const user = await auth.getUser(req.params.uid);
  if (enabled && (user.disabled || !user.emailVerified || !user.email)) return res.status(409).json({error:'La cuenta debe estar activa y tener correo verificado.'});
  const profile = db.doc(`profiles/${user.uid}`);
  await db.runTransaction(async tx => {
    if (!(await tx.get(profile)).exists) throw Object.assign(new Error('La cuenta todavía no tiene perfil.'), {status:409});
    tx.update(profile, {streakReminder:enabled});
  });
  audit(req, enabled ? 'reminders.enable' : 'reminders.disable', user.uid);
  res.json(userView(user, await profile.get()));
});
app.patch('/admin/users/:uid', async (req,res) => {
  const user = await auth.getUser(req.params.uid);
  if (user.uid === req.actor.uid || user.customClaims?.owner === true) return res.status(409).json({ error: 'No puedes modificar tu propia cuenta ni la cuenta administradora inicial.' });
  const { disabled, admin } = req.body ?? {};
  if (typeof disabled === 'boolean' && admin === undefined) {
    if (user.customClaims?.admin === true && req.actor.customClaims?.owner !== true) return res.sendStatus(403);
    await auth.updateUser(user.uid, { disabled });
    if (disabled) await auth.revokeRefreshTokens(user.uid);
  } else if (typeof admin === 'boolean' && disabled === undefined) {
    if (admin && (!user.emailVerified || user.disabled)) return res.status(400).json({ error:'La cuenta debe estar activa y tener correo verificado.' });
    if (req.actor.customClaims?.owner !== true) return res.sendStatus(403);
    await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin });
    await auth.revokeRefreshTokens(user.uid);
  } else return res.status(400).json({ error:'Acción inválida.' });
  audit(req, disabled === undefined ? 'user.role' : 'user.disabled', user.uid);
  res.json(userView(await auth.getUser(user.uid), await db.doc(`profiles/${user.uid}`).get()));
});
app.delete('/admin/users/:uid', async (req,res) => {
  const user = await auth.getUser(req.params.uid);
  if (user.uid === req.actor.uid || user.customClaims?.admin === true) return res.status(409).json({ error:'No puedes eliminar tu cuenta ni una cuenta administradora.' });
  await auth.deleteUser(user.uid);
  await db.doc(`publicUsers/${user.uid}`).delete();
  audit(req, 'user.delete', user.uid);
  res.sendStatus(204);
});
app.use((err,_req,res,_next) => {
  const status = err.status === 413 ? 413 : [400,409].includes(err.status) ? err.status : err.code === 'auth/user-not-found' ? 404 : 500;
  if (status === 500) console.error('Administración:',err.code || err.name);
  res.status(status).json({ error: status === 413 ? 'El archivo excede el tamaño permitido.' : status === 404 ? 'Cuenta no encontrada.' : status === 500 ? 'No se pudo completar la operación.' : err.message });
});
app.listen(Number(process.env.PORT || 4107), '0.0.0.0');
