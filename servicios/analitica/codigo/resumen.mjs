const promedio = valores => valores.length
  ? Math.round(valores.reduce((total, valor) => total + valor, 0) / valores.length)
  : 0;

export function crearResumenAprendizaje({ profile = {}, lessons = [], attempts = [] } = {}) {
  const safeLessons = Array.isArray(lessons) ? lessons : [];
  const safeAttempts = Array.isArray(attempts) ? attempts : [];
  const bySign = new Map();
  for (const attempt of safeAttempts) {
    const signId = String(attempt.signId || attempt.expectedSign || '').trim();
    if (!signId) continue;
    const current = bySign.get(signId) || { signId, attempts: 0, correct: 0, scores: [] };
    current.attempts += 1;
    current.correct += attempt.correct ? 1 : 0;
    current.scores.push(Math.max(0, Math.min(100, Number(attempt.score) || 0)));
    bySign.set(signId, current);
  }

  const signPerformance = [...bySign.values()].map(item => ({
    signId: item.signId,
    attempts: item.attempts,
    accuracy: Math.round((item.correct / item.attempts) * 100),
    averageScore: promedio(item.scores)
  })).sort((a, b) => a.accuracy - b.accuracy || a.averageScore - b.averageScore);
  const weakSigns = signPerformance.filter(item => item.accuracy < 70 || item.averageScore < 70).slice(0, 3);
  const lowLesson = [...safeLessons]
    .filter(item => Number.isFinite(Number(item.score)))
    .sort((a, b) => Number(a.score) - Number(b.score))[0];
  const totalCorrect = safeAttempts.filter(item => item.correct).length;
  let recommendation = 'Completa una lección para comenzar a personalizar tu aprendizaje.';
  if (weakSigns[0]) recommendation = `Practica nuevamente “${weakSigns[0].signId}”; es la seña que necesita más refuerzo.`;
  else if (lowLesson && Number(lowLesson.score) < 80) recommendation = `Repite la lección “${lowLesson.lessonId}” para mejorar tu puntuación.`;
  else if (safeLessons.length) recommendation = 'Continúa con la siguiente lección y conserva tu ritmo de práctica.';

  return {
    overview: {
      xp: Math.max(0, Number(profile.xp) || 0),
      streak: Math.max(0, Number(profile.streak) || 0),
      completedLessons: safeLessons.length,
      averageLessonScore: promedio(safeLessons.map(item => Number(item.score)).filter(Number.isFinite)),
      practiceAttempts: safeAttempts.length,
      practiceAccuracy: safeAttempts.length ? Math.round((totalCorrect / safeAttempts.length) * 100) : 0
    },
    weakSigns,
    signPerformance,
    recommendation,
    privacy: { rawVideoStored: false }
  };
}

