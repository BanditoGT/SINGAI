export const defaults = {
  enabled: false, sender: '', reason: 'racha', frequency: 'diaria', hour: 18,
  subject: '🤟 Un momento para practicar con SingAI',
  body: 'Hola, {{nombre}}.\n\n¿Practicamos una seña hoy? {{racha}}\n\n{{leccion}}\n\nAbre SingAI: {{enlace}}'
};
export function validateSettings(input) {
  const { enabled, sender, reason, frequency, hour, subject, body, lessonId } = input ?? {};
  if (typeof enabled !== 'boolean' || typeof sender !== 'string' || sender.length > 254
    || (sender && !/^[^\s@]+@gmail\.com$/i.test(sender)) || (enabled && !sender)
    || !['racha','leccion'].includes(reason) || !['diaria','horaria'].includes(frequency)
    || !Number.isInteger(hour) || hour < 8 || hour > 20
    || typeof subject !== 'string' || !subject.trim() || subject.length > 120 || /[\r\n]/.test(subject)
    || typeof body !== 'string' || !body.trim() || body.length > 2000
    || (reason === 'leccion' && (typeof lessonId !== 'string' || !/^[a-z0-9-]{1,96}$/.test(lessonId)))) {
    throw Object.assign(new Error('Revisa el Gmail, el horario, la lección y el texto del correo.'), {status:400});
  }
  return {enabled,sender:sender.toLowerCase(),reason,frequency,hour,subject:subject.trim(),body:body.trim(),lessonId:reason === 'leccion' ? lessonId : null};
}
export function makeMessage(settings, streak, lessonTitle = '', name = 'estudiante') {
  const values = {nombre:name, racha:streak > 0 ? `Llevas ${streak} ${streak === 1 ? 'día' : 'días'} de racha. ¡Sigue así!` : '', leccion:lessonTitle ? `Te recomendamos la lección «${lessonTitle}».` : '', enlace:'https://singai.web.app/'};
  const render = value => value.replace(/\{\{(racha|leccion|enlace)\}\}/g, (_,key) => values[key]);
  const body = render(settings.body);
  return {subject:render(settings.subject).replace(/[\r\n]/g,' ').trim() || defaults.subject,text:body + (body.includes(values.enlace) ? '' : '\n\n' + values.enlace) + '\n\nPuedes desactivar estos avisos en Mi perfil.'};
}
export function canSend(settings, hour, sent, lessonSent) {
  if (!settings.enabled || hour < 8 || hour > 20 || lessonSent) return false;
  return settings.frequency === 'diaria' ? hour === settings.hour && sent === 0 : sent < 3;
}
