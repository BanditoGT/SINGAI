import 'dotenv/config';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: join(root, '.env'), override: false });
const port = Number(process.env.PROFILE_PORT || 4101);
const serviceKey = process.env.SERVICE_KEY || 'senalab-internal-dev';
const db = new DatabaseSync(join(root, 'datos', 'profiles.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (user_id INTEGER PRIMARY KEY, display_name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT 'wave', learning_goal TEXT NOT NULL DEFAULT 'comunicarme', daily_goal INTEGER NOT NULL DEFAULT 1, weekly_goal INTEGER NOT NULL DEFAULT 5, experience_level TEXT NOT NULL DEFAULT 'principiante', preferred_category TEXT NOT NULL DEFAULT 'abecedario', bio TEXT NOT NULL DEFAULT '', autoplay_videos INTEGER NOT NULL DEFAULT 1, xp INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, longest_streak INTEGER NOT NULL DEFAULT 0, last_activity TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS lesson_progress (user_id INTEGER NOT NULL, lesson_id TEXT NOT NULL, score INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 1, completed_at TEXT NOT NULL, PRIMARY KEY(user_id,lesson_id));
`);
const profileColumns = new Set(db.prepare('PRAGMA table_info(profiles)').all().map(column => column.name));
for (const [name, definition] of Object.entries({
  weekly_goal: 'INTEGER NOT NULL DEFAULT 5', experience_level: "TEXT NOT NULL DEFAULT 'principiante'",
  preferred_category: "TEXT NOT NULL DEFAULT 'abecedario'", bio: "TEXT NOT NULL DEFAULT ''",
  autoplay_videos: 'INTEGER NOT NULL DEFAULT 1'
})) if (!profileColumns.has(name)) db.exec(`ALTER TABLE profiles ADD COLUMN ${name} ${definition}`);
const app = express(); app.use(express.json({ limit: '32kb' }));
app.use('/internal', (req, res, next) => req.headers['x-service-key'] === serviceKey ? next() : res.status(403).json({ error: 'Acceso interno denegado.' }));
const uid = req => Number(req.headers['x-user-id']);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIME_ZONE || 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
const shape = row => ({ userId: row.user_id, displayName: row.display_name, avatar: row.avatar, learningGoal: row.learning_goal, dailyGoal: row.daily_goal, weeklyGoal: row.weekly_goal, experienceLevel: row.experience_level, preferredCategory: row.preferred_category, bio: row.bio, autoplayVideos: Boolean(row.autoplay_videos), xp: row.xp, streak: row.streak, longestStreak: row.longest_streak, lastActivity: row.last_activity });

app.get('/health', (_req, res) => res.json({ service: 'profile', status: 'ok' }));
app.post('/internal/profiles', (req, res) => {
  const name = String(req.body.displayName || '').trim().slice(0, 60);
  db.prepare('INSERT OR IGNORE INTO profiles (user_id,display_name,learning_goal,created_at) VALUES (?,?,?,?)').run(Number(req.body.userId), name, String(req.body.learningGoal || 'comunicarme').slice(0, 40), new Date().toISOString());
  res.status(201).json({ created: true });
});
app.get('/internal/profile', (req, res) => {
  const row = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(uid(req));
  row ? res.json({ profile: shape(row) }) : res.status(404).json({ error: 'Perfil no encontrado.' });
});
app.patch('/internal/profile', (req, res) => {
  const current = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(uid(req));
  if (!current) return res.status(404).json({ error: 'Perfil no encontrado.' });
  const name = String(req.body.displayName ?? current.display_name).trim().slice(0, 60);
  const goal = String(req.body.learningGoal ?? current.learning_goal).slice(0, 40);
  const daily = Math.max(1, Math.min(10, Number(req.body.dailyGoal ?? current.daily_goal)));
  const weekly = Math.max(1, Math.min(7, Number(req.body.weeklyGoal ?? current.weekly_goal)));
  const experience = ['principiante','intermedio','avanzado'].includes(req.body.experienceLevel) ? req.body.experienceLevel : current.experience_level;
  const category = ['abecedario','conversaciones','emociones','dias','acciones'].includes(req.body.preferredCategory) ? req.body.preferredCategory : current.preferred_category;
  const bio = String(req.body.bio ?? current.bio).trim().slice(0, 180);
  const autoplay = req.body.autoplayVideos === undefined ? current.autoplay_videos : Number(Boolean(req.body.autoplayVideos));
  const avatar = ['wave','duck','unicorn','chick','fox','panda','frog','cat','dog','koala','butterfly','spark','heart','star','book','rocket','sun'].includes(req.body.avatar) ? req.body.avatar : current.avatar;
  db.prepare('UPDATE profiles SET display_name=?,learning_goal=?,daily_goal=?,weekly_goal=?,experience_level=?,preferred_category=?,bio=?,autoplay_videos=?,avatar=? WHERE user_id=?').run(name, goal, daily, weekly, experience, category, bio, autoplay, avatar, uid(req));
  res.json({ profile: shape(db.prepare('SELECT * FROM profiles WHERE user_id=?').get(uid(req))) });
});
app.get('/internal/progress', (req, res) => {
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(uid(req));
  const lessons = db.prepare('SELECT lesson_id AS lessonId,score,attempts,completed_at AS completedAt FROM lesson_progress WHERE user_id=? ORDER BY completed_at DESC').all(uid(req));
  res.json({ profile: profile ? shape(profile) : null, lessons, completedLessonIds: lessons.map(x => x.lessonId) });
});
app.post('/internal/progress/complete', (req, res) => {
  const userId = uid(req); const lessonId = String(req.body.lessonId || '').slice(0, 80); const score = Math.max(0, Math.min(100, Number(req.body.score || 0))); const xpEarned = score >= 80 ? 20 : 10;
  if (!lessonId) return res.status(400).json({ error: 'Falta la lección.' });
  const existing = db.prepare('SELECT * FROM lesson_progress WHERE user_id=? AND lesson_id=?').get(userId, lessonId);
  db.prepare(`INSERT INTO lesson_progress (user_id,lesson_id,score,attempts,completed_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET score=MAX(score,excluded.score),attempts=attempts+1,completed_at=excluded.completed_at`).run(userId, lessonId, score, 1, new Date().toISOString());
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(userId);
  const currentDay = today(); let streak = profile.streak;
  if (profile.last_activity !== currentDay) streak = profile.last_activity && daysBetween(profile.last_activity, currentDay) === 1 ? streak + 1 : 1;
  db.prepare('UPDATE profiles SET xp=xp+?,streak=?,longest_streak=MAX(longest_streak,?),last_activity=? WHERE user_id=?').run(existing ? 2 : xpEarned, streak, streak, currentDay, userId);
  res.json({ progress: shape(db.prepare('SELECT * FROM profiles WHERE user_id=?').get(userId)), firstCompletion: !existing });
});
app.listen(port, () => console.log(`Profile service en http://localhost:${port}`));
