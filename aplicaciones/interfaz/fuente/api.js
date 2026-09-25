import { initializeApp } from 'firebase/app';
import {
  browserSessionPersistence, createUserWithEmailAndPassword, getAuth,
  sendEmailVerification, sendPasswordResetEmail, setPersistence,
  signInWithEmailAndPassword, signOut, updateProfile
} from 'firebase/auth';
import {
  doc, getDoc, getDocs, getFirestore, increment, runTransaction,
  setDoc, updateDoc, collection, query, where
} from 'firebase/firestore';
import { aplicarFallo, calcularRacha, calcularXpGanada, estadoVidas, rachaVigente } from './progreso.js';

const firebaseConfig = {
  projectId: 'singai-seminario-2026-gt',
  appId: '1:391585565868:web:cfa549903f5d1d91d16309',
  storageBucket: 'singai-seminario-2026-gt.firebasestorage.app',
  apiKey: 'AIzaSyBx2FaXkS4DgB_cgy9VIFkv8vggnK6Txnw',
  authDomain: 'singai.web.app',
  messagingSenderId: '391585565868'
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
auth.languageCode = 'es';
const db = getFirestore(firebaseApp);
const persistenceReady = setPersistence(auth, browserSessionPersistence).catch(() => {});

export const MEDIA_URL = '';
const SESSION_MARKER = 'singai_firebase_session';
const VERIFICATION_SENT_AT = 'singai_verification_sent_at';
const VERIFICATION_COOLDOWN_MS = 2 * 60 * 1000;
export const session = {
  get token() { return sessionStorage.getItem(SESSION_MARKER); },
  set token(value) {
    value ? sessionStorage.setItem(SESSION_MARKER, 'active') : sessionStorage.removeItem(SESSION_MARKER);
    if (!value) signOut(auth).catch(() => {});
  }
};

const cleanEmail = value => String(value || '').trim().toLowerCase();
const publicUser = user => ({ id: user.uid, email: user.email, verified: user.emailVerified, createdAt: user.metadata.creationTime, lastSignInAt: user.metadata.lastSignInTime });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function hashEmail(value) {
  const bytes = new TextEncoder().encode(cleanEmail(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function syncPublicProfile(user, profile) {
  const publicProfile = {
    userId: user.uid, emailHash: await hashEmail(user.email), displayName: profile.displayName,
    avatar: profile.avatar || 'wave', xp: Math.max(0, Number(profile.xp || 0)),
    streak: Math.max(0, Number(profile.streak || 0)), updatedAt: new Date().toISOString()
  };
  await setDoc(doc(db, 'publicUsers', user.uid), publicProfile, { merge: true });
  return publicProfile;
}

async function findFriendRelation(firstUserId, secondUserId) {
  const requests = collection(db, 'friendRequests');
  const [sent, received] = await Promise.all([
    getDocs(query(requests, where('fromUid', '==', firstUserId), where('toUid', '==', secondUserId))),
    getDocs(query(requests, where('fromUid', '==', secondUserId), where('toUid', '==', firstUserId)))
  ]);
  return sent.docs[0] || received.docs[0] || null;
}

async function sendVerificationWithCooldown(user, force = false) {
  const lastSentAt = Number(localStorage.getItem(VERIFICATION_SENT_AT) || 0);
  if (!force && Date.now() - lastSentAt < VERIFICATION_COOLDOWN_MS) return false;
  await sendEmailVerification(user, { url: location.origin });
  localStorage.setItem(VERIFICATION_SENT_AT, String(Date.now()));
  return true;
}

async function currentUser() {
  await persistenceReady;
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
  return auth.currentUser;
}

function authMessage(error) {
  const code = String(error?.code || '');
  if (code.includes('email-already-in-use')) return 'Ya existe una cuenta con ese correo.';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Correo o contraseña incorrectos.';
  if (code.includes('weak-password')) return 'La contraseña debe tener al menos 8 caracteres.';
  if (code.includes('invalid-email')) return 'Escribe un correo válido.';
  if (code.includes('too-many-requests')) return 'Demasiados intentos. Espera un momento e inténtalo nuevamente.';
  if (code.includes('operation-not-allowed')) return 'El acceso por correo todavía no está habilitado en Firebase.';
  if (code.includes('invalid-hosting-link-domain')) return 'No fue posible preparar el enlace de correo. Inténtalo nuevamente.';
  return error?.message || 'No fue posible conectar con SingAI.';
}

async function createInitialProfile(user, body) {
  const profile = {
    userId: user.uid,
    displayName: String(body.name || user.email.split('@')[0]).trim().slice(0, 60),
    avatar: 'wave', learningGoal: body.learningGoal || 'comunicarme', dailyGoal: 1,
    weeklyGoal: 5, experienceLevel: 'principiante', preferredCategory: 'abecedario',
    bio: '', autoplayVideos: true, xp: 0, streak: 0, longestStreak: 0,
    hearts: 5, heartsBlockedUntil: null,
    lastActivity: null, createdAt: new Date().toISOString()
  };
  await setDoc(doc(db, 'profiles', user.uid), profile);
  return profile;
}

async function authApi(path, body) {
  try {
    await persistenceReady;
    if (path === '/auth/register') {
      const credential = await createUserWithEmailAndPassword(auth, cleanEmail(body.email), String(body.password || ''));
      await updateProfile(credential.user, { displayName: String(body.name || '').trim() });
      await createInitialProfile(credential.user, body);
      await sendVerificationWithCooldown(credential.user, true);
      await signOut(auth);
      return { requiresVerification: true, email: credential.user.email, delivery: 'firebase', message: 'Cuenta creada. Revisa tu correo para verificarla.' };
    }
    if (path === '/auth/login') {
      const credential = await signInWithEmailAndPassword(auth, cleanEmail(body.email), String(body.password || ''));
      await credential.user.reload();
      if (!credential.user.emailVerified) {
        const resent = await sendVerificationWithCooldown(credential.user);
        await signOut(auth);
        throw new Error(resent
          ? 'Tu cuenta aún no está verificada. Enviamos un nuevo enlace; revisa también Spam o Correo no deseado.'
          : 'Tu cuenta aún no está verificada. Ya enviamos un enlace recientemente; espera dos minutos antes de solicitar otro.');
      }
      return { token: 'firebase-session', user: publicUser(credential.user) };
    }
    if (path === '/auth/forgot-password') {
      await sendPasswordResetEmail(auth, cleanEmail(body.email), { url: location.origin });
      return { message: 'Te enviamos un enlace para cambiar tu contraseña.' };
    }
    if (path === '/auth/me') {
      const user = await currentUser(); await user.reload();
      if (!user.emailVerified) throw new Error('Debes verificar tu correo antes de entrar.');
      return { user: publicUser(user) };
    }
  } catch (error) { throw new Error(authMessage(error)); }
  throw new Error('Operación de autenticación no disponible.');
}

async function profileApi(path, method, body) {
  const user = await currentUser(); const profileRef = doc(db, 'profiles', user.uid);
  if (path === '/profile' && method === 'PATCH') {
    const allowed = ['displayName','avatar','learningGoal','dailyGoal','weeklyGoal','experienceLevel','preferredCategory','bio','autoplayVideos'];
    const changes = Object.fromEntries(allowed.filter(key => body[key] !== undefined).map(key => [key, body[key]]));
    await updateDoc(profileRef, changes);
    const updated = normalizarPerfil((await getDoc(profileRef)).data());
    await syncPublicProfile(user, updated);
    return { profile: updated };
  }
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) throw new Error('Perfil no encontrado.');
  const progressSnap = await getDocs(collection(db, 'profiles', user.uid, 'progress'));
  const lessons = progressSnap.docs.map(item => item.data()).sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  if (path === '/profile') return { profile: normalizarPerfil(profileSnap.data()) };
  if (path === '/progress') {
    const stored = profileSnap.data();
    const normalized = normalizarPerfil(stored);
    if (Number(stored.streak || 0) !== normalized.streak) await updateDoc(profileRef, { streak: normalized.streak });
    await syncPublicProfile(user, normalized);
    return { profile: normalized, lessons, completedLessonIds: lessons.map(item => item.lessonId) };
  }
  if (path === '/progress/mistake' && method === 'POST') {
    const result = await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(profileRef);
      const failure = aplicarFallo(snapshot.data(), Date.now());
      transaction.update(profileRef, { hearts: failure.vidas, heartsBlockedUntil: failure.bloqueadoHasta, xp: failure.xp });
      return failure;
    });
    const updated = normalizarPerfil((await getDoc(profileRef)).data());
    await syncPublicProfile(user, updated);
    return { ...result, progress: updated };
  }
  if (path === '/progress/complete' && method === 'POST') {
    const lessonRef = doc(db, 'profiles', user.uid, 'progress', String(body.lessonId));
    const currentDay = today();
    const completion = await runTransaction(db, async transaction => {
      const [profile, lesson] = await Promise.all([transaction.get(profileRef), transaction.get(lessonRef)]);
      const data = profile.data(); const first = !lesson.exists();
      const streak = calcularRacha(data, currentDay);
      const xpAwarded = calcularXpGanada(first, body.score);
      transaction.set(lessonRef, { lessonId: String(body.lessonId), score: Math.max(Number(body.score || 0), lesson.data()?.score || 0), attempts: (lesson.data()?.attempts || 0) + 1, completedAt: new Date().toISOString() });
      transaction.update(profileRef, { xp: increment(xpAwarded), streak, longestStreak: Math.max(data.longestStreak || 0, streak), lastActivity: currentDay });
      return { firstCompletion: first, xpAwarded };
    });
    const updated = normalizarPerfil((await getDoc(profileRef)).data());
    await syncPublicProfile(user, updated);
    return { progress: updated, ...completion };
  }
  throw new Error('Operación de perfil no disponible.');
}

async function socialApi(path, method, body) {
  const user = await currentUser();
  const profileSnap = await getDoc(doc(db, 'profiles', user.uid));
  if (!profileSnap.exists()) throw new Error('Perfil no encontrado.');
  const ownPublic = await syncPublicProfile(user, normalizarPerfil(profileSnap.data()));
  if (path === '/social/search' && method === 'POST') {
    const email = cleanEmail(body.email);
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Escribe el correo completo de tu amigo.');
    const results = await getDocs(query(collection(db, 'publicUsers'), where('emailHash', '==', await hashEmail(email))));
    const found = results.docs.map(item => item.data()).find(item => item.userId !== user.uid);
    if (!found) return {
      user: null,
      message: 'No encontramos un perfil social activo con ese correo. Si la cuenta es antigua, pídele que cierre sesión y vuelva a entrar una vez.'
    };
    const relationId = [user.uid, found.userId].sort().join('_');
    const relation = await findFriendRelation(user.uid, found.userId);
    return { user: found, relation: relation ? relation.data().status : null, relationId };
  }
  if (path === '/social/request' && method === 'POST') {
    const targetId = String(body.userId || '');
    if (!targetId || targetId === user.uid) throw new Error('No puedes enviarte una solicitud a ti mismo.');
    const target = await getDoc(doc(db, 'publicUsers', targetId));
    if (!target.exists()) throw new Error('Ese usuario ya no está disponible.');
    const relationId = [user.uid, targetId].sort().join('_'); const existing = await findFriendRelation(user.uid, targetId); const relationRef = existing?.ref || doc(db, 'friendRequests', relationId);
    if (existing && existing.data().status === 'accepted') throw new Error('Ya son amigos en SingAI.');
    if (existing && existing.data().status === 'pending') throw new Error('Ya existe una solicitud pendiente entre ustedes.');
    await setDoc(relationRef, { id: relationId, fromUid: user.uid, toUid: targetId, status: 'pending', fromName: ownPublic.displayName, fromAvatar: ownPublic.avatar, toName: target.data().displayName, toAvatar: target.data().avatar, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return { message: `Solicitud enviada a ${target.data().displayName}.` };
  }
  if (path === '/social/respond' && method === 'POST') {
    const relationRef = doc(db, 'friendRequests', String(body.requestId || '')); const relation = await getDoc(relationRef);
    if (!relation.exists() || relation.data().toUid !== user.uid || relation.data().status !== 'pending') throw new Error('Esta solicitud ya no está disponible.');
    const status = body.accept ? 'accepted' : 'rejected';
    await updateDoc(relationRef, { status, updatedAt: new Date().toISOString() });
    return { message: body.accept ? 'Ahora son amigos en SingAI.' : 'Solicitud rechazada.' };
  }
  if (path === '/social') {
    const [sentSnap, receivedSnap] = await Promise.all([
      getDocs(query(collection(db, 'friendRequests'), where('fromUid', '==', user.uid))),
      getDocs(query(collection(db, 'friendRequests'), where('toUid', '==', user.uid)))
    ]);
    const relations = [...sentSnap.docs, ...receivedSnap.docs].map(item => item.data());
    const incoming = relations.filter(item => item.toUid === user.uid && item.status === 'pending');
    const accepted = relations.filter(item => item.status === 'accepted');
    const friendIds = [...new Set(accepted.map(item => item.fromUid === user.uid ? item.toUid : item.fromUid))];
    const friendSnaps = await Promise.all(friendIds.map(uid => getDoc(doc(db, 'publicUsers', uid))));
    const friends = friendSnaps.filter(item => item.exists()).map(item => item.data());
    return { self: ownPublic, incoming, sent: relations.filter(item => item.fromUid === user.uid && item.status === 'pending'), friends };
  }
  throw new Error('Operación social no disponible.');
}

function normalizarPerfil(profile) {
  const estado = estadoVidas(profile);
  return { ...profile, streak: rachaVigente(profile, today()), hearts: estado.vidas, heartsBlockedUntil: estado.bloqueadoHasta };
}

export async function api(path, options = {}) {
  const method = options.method || 'GET'; const body = options.body || {};
  if (path.startsWith('/auth/')) return authApi(path, body);
  if (path.startsWith('/social')) return socialApi(path, method, body);
  if (path === '/catalog') {
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const response = await fetch(isLocal ? '/api/catalog' : '/catalog.json');
    if (!response.ok) throw new Error('No fue posible cargar el catálogo.');
    return response.json();
  }
  return profileApi(path, method, body);
}
