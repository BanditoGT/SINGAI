import nodemailer from 'nodemailer';
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
if (process.env.SINGAI_TEST_MAIL === 'true') {
  try {
    const owner = await auth.getUserByEmail('juuandiego222@gmail.com');
    if (!owner.emailVerified || owner.disabled || owner.customClaims?.owner !== true) throw new Error('Cuenta de prueba no disponible');
    await mail.sendMail({
      from:{name:'SingAI',address:SMTP_USER}, to:owner.email,
      subject:'Prueba de correo de SingAI',
      text:'Esta es una prueba del remitente de recordatorios. No se enviaron avisos a estudiantes. https://singai.web.app/'
    });
    console.log('Gmail aceptó el correo de prueba para la cuenta administradora.');
  } catch (error) {
    console.error('Falló la prueba:',error.code || error.name);
    process.exitCode = 1;
  } finally { mail.close(); }
} else {
const eligible = await db.collection('profiles').where('streakReminder','==',true).where('lastActivity','==',yesterday).limit(100).get();
let sent = 0, failed = 0;
for (const candidate of eligible.docs) {
  const profile = candidate.ref;
  const marker = db.doc(`recordatoriosRacha/${candidate.id}`);
  try {
    const user = await auth.getUser(candidate.id);
    if (user.disabled || !user.emailVerified || !user.email) continue;
    const streak = await db.runTransaction(async tx => {
      const [p,m] = await Promise.all([tx.get(profile),tx.get(marker)]);
      const data = p.data();
      if (data?.streakReminder !== true || data.lastActivity !== yesterday ||
          !Number.isSafeInteger(data.streak) || data.streak < 1 || m.data()?.day === today) return 0;
      tx.set(marker,{day:today,status:'pending'});
      return data.streak;
    });
    if (!streak) continue;
    await mail.sendMail({
      from: { name:'SingAI',address:SMTP_USER }, to:user.email,
      subject:'Tu racha de SingAI sigue viva',
      text:`Llevas ${streak} ${streak === 1 ? 'día' : 'días'} de racha. Completa una lección hoy para mantenerla: https://singai.web.app/\n\nPuedes desactivar estos avisos en Mi perfil.`
    });
    await marker.update({status:'sent'});
    sent++;
  } catch (error) { failed++; console.error('Recordatorio no completado:',error.code || error.name); }
}
console.log(`Recordatorios enviados: ${sent}; incidencias: ${failed}.`);
if (failed) process.exitCode = 1;
}
