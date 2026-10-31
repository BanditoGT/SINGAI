const limitar = (valor, minimo = 0, maximo = 1) => Math.max(minimo, Math.min(maximo, valor));

export function normalizarSena(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, '-');
}

export function evaluarSena(datos = {}) {
  const expectedSign = String(datos.expectedSign || '').trim().slice(0, 80);
  const detectedSign = String(datos.detectedSign || '').trim().slice(0, 80);
  const confidenceValue = Number(datos.confidence);
  const visibilityValue = Number(datos.metrics?.visibility);
  const stabilityValue = Number(datos.metrics?.stability);
  const confidence = limitar(Number.isFinite(confidenceValue) ? confidenceValue : 0);
  const visibility = limitar(Number.isFinite(visibilityValue) ? visibilityValue : confidence);
  const stability = limitar(Number.isFinite(stabilityValue) ? stabilityValue : confidence);
  const sameSign = Boolean(expectedSign && detectedSign)
    && normalizarSena(expectedSign) === normalizarSena(detectedSign);
  const weightedScore = sameSign
    ? confidence * 0.6 + visibility * 0.2 + stability * 0.2
    : confidence * 0.2;
  const score = Math.round(limitar(weightedScore) * 100);
  const correct = sameSign && score >= 70;
  const feedback = [];

  if (!detectedSign) feedback.push('No logramos identificar una seña. Mantén la mano dentro del encuadre.');
  else if (!sameSign) feedback.push(`Se detectó “${detectedSign}”; intenta nuevamente la seña “${expectedSign}”.`);
  if (visibility < 0.65) feedback.push('Acerca la mano y evita cubrir los dedos.');
  if (stability < 0.6) feedback.push('Mantén la posición un momento para mejorar la lectura.');
  if (sameSign && confidence < 0.7) feedback.push('La forma es correcta, pero puedes marcarla con mayor claridad.');
  if (correct && feedback.length === 0) feedback.push('¡Muy bien! La seña fue reconocida con claridad.');

  return {
    expectedSign,
    detectedSign: detectedSign || null,
    score,
    correct,
    confidence: Math.round(confidence * 100),
    feedback,
    xpSuggested: correct ? (score >= 90 ? 15 : 10) : 0,
    privacy: { videoStored: false, processing: 'landmarks-only' }
  };
}

