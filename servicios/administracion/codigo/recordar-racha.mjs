import nodemailer from 'nodemailer';
import { defaults, makeMessage, canSend } from './notificaciones.mjs';
import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const zone = 'America/Guatemala';
const dateKey = date => new Intl.DateTimeFormat('en-CA', { timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit' }).format(date);
const now = new Date();
const today = dateKey(now);
const yesterday = dateKey(new Date(now.getTime() - 86400000));
const { FIREBASE_ADMIN_JSON, SMTP_USER, SMTP_PASS } = process.env;
if (!FIREBASE_ADMIN_JSON || !SMTP_USER || !SMTP_PASS) {
  console.log('Recordatorios desactivados: falta configurar el remitente o Firebase.');
  process.exit(process.env.SINGAI_TEST_MAIL === 'true' ? 1 : 0);
}
const credential = JSON.parse(FIREBASE_ADMIN_JSON);
if (credential.project_id !== 'singai-seminario-2026-gt') throw new Error('Proyecto de Firebase incorrecto.');
initializeApp({ credential:cert(credential) });
const db = getFirestore();
const auth = getAuth();
const mail = nodemailer.createTransport({ service:'gmail',auth:{user:SMTP_USER,pass:SMTP_PASS},connectionTimeout:10000,socketTimeout:15000 });
const hour = Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'}).format(now));
const settings = (await db.doc('notificaciones/configuracion').get()).data() ?? defaults;
const status = db.doc('notificaciones/estado');
const testRef = db.doc('notificaciones/prueba');
const pending = (await testRef.get()).data();
const manual = process.env.SINGAI_TEST_MAIL === 'true';
const lesson = settings.reason === 'leccion' ? ((await db.doc('catalogo/publicado').get()).data() ??
  JSON.parse(readFileSync(new URL('../../../datos/catalog.json', import.meta.url),'utf8'))).units
  .flatMap(unit => unit.lessons).find(item => item.id === settings.lessonId) : null;
try {
  if (settings.sender && settings.sender !== SMTP_USER.trim().toLowerCase()) throw Object.assign(new Error('Remitente distinto al secreto SMTP'),{code:'sender-mismatch'});
  if (manual || pending?.state === 'pending') {
    const owner = manual ? await auth.getUserByEmail('juuandiego222@gmail.com') : await auth.getUser(pending.uid);
    if (!owner.emailVerified || owner.disabled || !owner.email || (manual && owner.customClaims?.owner !== true)) throw new Error('Cuenta no disponible');
    const profile = (await db.doc(`profiles/${owner.uid}`).get()).data() ?? {};
    if (!manual && owner.customClaims?.owner !== true && profile.streakReminder !== true) throw new Error('Recordatorios desactivados');
    const streak = [today,yesterday].includes(profile.lastActivity) ? Math.max(0,Number(profile.streak)||0) : 0;
    const message = makeMessage(settings,streak,lesson?.title,profile.displayName || owner.displayName || 'estudiante');
    if (!manual) await testRef.update({state:'processing'});
    await mail.sendMail({from:{name:'SingAI',address:SMTP_USER},to:owner.email,...message,subject:manual ? '[Prueba] ' + message.subject : message.subject});
    if (!manual) await testRef.update({state:'sent'});
    await status.set({test:'sent',testAt:new Date().toISOString()},{merge:true});
    console.log('Gmail aceptó la prueba para el administrador.');
    if (manual) process.exit(0);
  }
  if (!settings.enabled || hour < 8 || hour > 20 || (settings.reason === 'leccion' && !lesson)) process.exit(0);
  const eligible = await db.collection('profiles').where('streakReminder','==',true)
    .limit(100).get();
  let sent=0,failed=0;
  for (const candidate of eligible.docs) {
    const profile = candidate.ref;
    const marker = db.doc(`recordatoriosRacha/${candidate.id}`);
    const lessonMarker = lesson && marker.collection('lecciones').doc(lesson.id);
    try {
      const before = candidate.data();
      if (!lesson && (before.lastActivity !== yesterday || !(before.streak > 0))) continue;
      const user = await auth.getUser(candidate.id);
      if (user.disabled || !user.emailVerified || !user.email) continue;
      const data = await db.runTransaction(async tx => {
        const [p,m,l,progress,cfg] = await Promise.all([tx.get(profile),tx.get(marker),lessonMarker && tx.get(lessonMarker),
          lesson && tx.get(profile.collection('progress').doc(lesson.id)),tx.get(db.doc('notificaciones/configuracion'))]);
        if (!Object.entries(settings).every(([key,value]) => cfg.data()?.[key] === value)) return null;
        const d = p.data(), previous=m.data(), count=previous?.day === today ? previous.count ?? 1 : 0;
        const personal = Number.isInteger(d?.reminderHour) && d.reminderHour >= 8 && d.reminderHour <= 20
          ? {...settings,frequency:'diaria',hour:d.reminderHour} : settings;
        if (d?.streakReminder !== true || !canSend(personal,hour,count,l?.exists || progress?.exists)
          || (previous?.day === today && previous.hour === hour)
          || (!lesson && (d.lastActivity !== yesterday || !(d.streak > 0)))) return null;
        tx.set(marker,{day:today,hour,count:count+1});
        if (lessonMarker) tx.set(lessonMarker,{day:today});
        return d;
      });
      if (!data) continue;
      const streak = [today,yesterday].includes(data.lastActivity) ? Math.max(0,Number(data.streak)||0) : 0;
      await mail.sendMail({from:{name:'SingAI',address:SMTP_USER},to:user.email,...makeMessage(settings,streak,lesson?.title,data.displayName || user.displayName || 'estudiante')});
      sent++;
    } catch (error) { failed++; console.error('Aviso no completado:',error.code || error.name); }
  }
  await status.set({lastRun:new Date().toISOString(),sent,failed},{merge:true});
  if (failed) process.exitCode=1;
} catch (error) {
  console.error('No se completó el envío:',error.code || error.name);
  if (manual || pending?.state === 'pending') {
    await status.set({test:'failed',testAt:new Date().toISOString(),error:error.code || error.name},{merge:true});
    if (!manual) await testRef.update({state:'failed'});
  }
  process.exitCode=1;
} finally { mail.close(); }
