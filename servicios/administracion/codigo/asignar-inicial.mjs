import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const email = 'juuandiego222@gmail.com';
const projectId = 'singai-seminario-2026-gt';
const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_JSON || '{}');
if (serviceAccount.project_id !== projectId) throw new Error('La credencial debe pertenecer a SingAI.');
initializeApp({ credential: cert(serviceAccount), projectId });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
if (!user.emailVerified || user.disabled) throw new Error('La cuenta inicial debe estar activa y verificada.');
await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true, owner: true });
console.log('Permiso inicial configurado. Vuelve a iniciar sesión para recibir el rol.');
