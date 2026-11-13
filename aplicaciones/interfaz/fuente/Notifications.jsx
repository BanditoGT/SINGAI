import React, {useEffect,useState} from 'react';
import {adminApi} from './api.js';
export default function Notifications({catalog}) {
  const [form,setForm]=useState(null), [status,setStatus]=useState(null), [notice,setNotice]=useState(''), [busy,setBusy]=useState(false);
  const lessons=catalog.units.flatMap(u=>u.lessons);
  const change=(key,value)=>setForm(current=>({...current,[key]:value}));
  const run=async fn=>{setBusy(true);setNotice('');try{await fn()}catch(error){setNotice(error.message)}finally{setBusy(false)}};
  const load=()=>run(async()=>{const data=await adminApi('/notifications');setForm(data.settings);setStatus(data.status)});
  useEffect(()=>{load()},[]);
  const sample=text=>text.replace(/\{\{(nombre|racha|leccion|enlace)\}\}/g,(_,key)=>({nombre:'Diego',racha:form.reason==='racha'?'Llevas 3 días de racha. ¡Sigue así!':'',leccion:form.reason==='leccion'?lessons.find(l=>l.id===form.lessonId)?.title ?? '':'',enlace:'https://singai.web.app/'})[key]);
  return <section className="admin-card reminders-panel">
    <h2>Recordatorios por correo</h2>
    <p>Los avisos automáticos solo llegan a estudiantes con correo verificado y recordatorios activados.</p>
    {notice && <p role="status">{notice}</p>}
    {!form ? <button disabled={busy} onClick={load}>{busy?'Cargando…':'Volver a cargar'}</button> : <form onSubmit={e=>{e.preventDefault();run(async()=>{setForm(await adminApi('/notifications',{method:'PUT',data:form}));setNotice('Configuración guardada.');});}}>
      <fieldset disabled={busy}>
        <label><span><input style={{width:'auto'}} type="checkbox" checked={form.enabled} onChange={e=>change('enabled',e.target.checked)}/> Activar envío automático</span></label>
        <div className="admin-fields">
          <label>Gmail remitente<input type="email" value={form.sender} onChange={e=>change('sender',e.target.value)} required={form.enabled}/></label>
          <label>Motivo<select value={form.reason} onChange={e=>change('reason',e.target.value)}><option value="racha">Racha en riesgo</option><option value="leccion">Recordar una lección</option></select></label>
          {form.reason==='leccion' && <label>Lección<select required value={form.lessonId ?? ''} onChange={e=>change('lessonId',e.target.value)}><option value="">Selecciona una lección</option>{lessons.map(l=><option key={l.id} value={l.id}>{l.title} · {l.description}</option>)}</select></label>}
          <label>Frecuencia<select value={form.frequency} onChange={e=>change('frequency',e.target.value)}><option value="diaria">Una vez al día</option><option value="horaria">Cada hora, máximo 3 al día</option></select></label>
          {form.frequency==='diaria' && <label>Hora de Guatemala<select value={form.hour} onChange={e=>change('hour',Number(e.target.value))}>{Array.from({length:13},(_,i)=>i+8).map(h=><option key={h} value={h}>{h}:17</option>)}</select></label>}
        </div>
        <p className="muted">El modo por hora revisa de 8:17 a 20:17. El aviso de lección se envía una vez por estudiante y lección.</p>
        <label>Asunto<input required maxLength={120} value={form.subject} onChange={e=>change('subject',e.target.value)}/></label>
        <label>Mensaje<textarea required maxLength={2000} rows={7} value={form.body} onChange={e=>change('body',e.target.value)}/></label>
        <p className="muted">Puedes usar {'{{nombre}}'}, {'{{racha}}'}, {'{{leccion}}'} y {'{{enlace}}'}. La racha se omite cuando ya venció.</p>
        <div className="admin-confirm" style={{position:'static'}}><strong>{sample(form.subject)}</strong><p style={{whiteSpace:'pre-wrap'}}>{sample(form.body)}</p></div>
        <button className="button primary">Guardar configuración</button>
      </fieldset>
    </form>}
    <div className="admin-tabs"><button className="button secondary" disabled={busy} onClick={()=>run(async()=>{await adminApi('/notifications/test',{method:'POST'});setNotice('Prueba en cola. Se enviará en la próxima revisión de correo.');})}>Solicitar correo de prueba</button><button type="button" disabled={busy} onClick={load}>Actualizar estado</button></div>
    {status?.testAt && <p>Última prueba: {status.test==='sent'?'aceptada por Gmail':'fallida'} · {new Date(status.testAt).toLocaleString('es-GT')}</p>}
  </section>;
}
