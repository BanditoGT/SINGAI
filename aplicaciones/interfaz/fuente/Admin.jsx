import React, { useEffect, useRef, useState } from 'react';
import { Play, X } from 'lucide-react';
import SignVideo from './SignVideo.jsx';
import { adminApi, adminReset } from './api.js';
import './admin.css';

const uuid = () => crypto.randomUUID();
const firstSign = () => ({ id: uuid(), term: '', video: '' });
const firstLesson = () => ({ id: uuid(), title: '', description: '', xp: 20, signs: [firstSign()] });
const field = (label, value, change, props = {}) =>
  <label>{label}<input value={value} onChange={e => change(e.target.value)} {...props}/></label>;

export default function Admin({ catalog, onPublish, owner }) {
  const [tab, setTab] = useState('contenido');
  const [draft, setDraft] = useState(() => structuredClone(catalog));
  const [users, setUsers] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [versions, setVersions] = useState([]);
  const [preview, setPreview] = useState(null);
  const dialog = useRef(null);
  const dirty = JSON.stringify(draft.units) !== JSON.stringify(catalog.units);
  useEffect(() => { if (preview && !dialog.current.open) dialog.current.showModal(); }, [preview]);
  const edit = fn => setDraft(current => {
    const copy = structuredClone(current); fn(copy.units); return copy;
  });
  async function run(fn, message) {
    setBusy(true); setNotice(null);
    try { await fn(); if (message) setNotice({ text: message }); }
    catch (error) { setNotice({ text: error.message, error: true }); }
    finally { setBusy(false); }
  }
  const loadUsers = (next = null) => run(async () => {
    const result = await adminApi('/users' + (next ? '?cursor=' + encodeURIComponent(next) : ''));
    setUsers(current => next ? [...current, ...result.users] : result.users);
    setCursor(result.cursor);
  });
  useEffect(() => { if (tab === 'usuarios') loadUsers(); }, [tab]);
  const showHistory = () => {
    setTab('historial');
    run(async () => setVersions((await adminApi('/catalog/history')).versions));
  };
  const changeUser = (user, data, label) => setConfirm({
    text: `${label}: ${user.email}.`,
    action: () => run(async () => {
      const result = await adminApi('/users/' + encodeURIComponent(user.uid), {
        method: data ? 'PATCH' : 'DELETE', data
      });
      setUsers(list => data ? list.map(item => item.uid === user.uid ? result : item) : list.filter(item => item.uid !== user.uid));
    }, 'Cuenta actualizada.')
  });
  return <div className="page admin-page">
    <div className="page-heading"><span className="eyebrow">SINGAI</span><h1>Administración</h1><p>Gestiona las lecciones, las señas y las cuentas.</p></div>
    <div className="admin-tabs" aria-label="Administración">
      <button className="button secondary" aria-pressed={tab === 'contenido'} disabled={busy} onClick={() => setTab('contenido')}>Contenido</button>
      <button className="button secondary" aria-pressed={tab === 'usuarios'} disabled={busy} onClick={() => setTab('usuarios')}>Usuarios</button>
      <button className="button secondary" aria-pressed={tab === 'historial'} disabled={busy} onClick={showHistory}>Historial del catálogo</button>
    </div>
    {notice && <p role={notice.error ? 'alert' : 'status'} className={notice.error ? 'notice' : 'notice success'}>{notice.text}</p>}
    {confirm && <div className="admin-confirm" role="alert">
      <p>{confirm.text} ¿Continuar?</p><button disabled={busy} onClick={() => { const action = confirm.action; setConfirm(null); action(); }}>Confirmar</button>
      <button onClick={() => setConfirm(null)}>Cancelar</button>
    </div>}
    {tab === 'contenido' ? <form onSubmit={event => {
      event.preventDefault();
      setConfirm({ text:'Publicar los cambios de contenido para todos los estudiantes', action: () => run(async () => {
        const saved = await adminApi('/catalog', { method:'PUT', data:{ units:draft.units, revision:draft.revision ?? 0 } });
        setDraft(saved); onPublish(saved);
      }, 'Catálogo publicado.') });
    }}>
      <div className="admin-catalog-status">
        <strong>{dirty ? 'Cambios sin publicar' : 'Catálogo publicado'}</strong>
        <span>{draft.units.length} unidades · {draft.units.reduce((sum, unit) => sum + unit.lessons.length, 0)} lecciones</span>
      </div>
      <p className="muted">Al publicar, los cambios aparecen para todos los estudiantes. Quitar una seña la oculta del catálogo; el archivo de video se conserva.</p>
      <fieldset disabled={busy || !!confirm}>
      {draft.units.map((unit, u) => <details className="admin-card" key={unit.id}><summary>{unit.title || 'Unidad nueva'}</summary>
        <div className="admin-fields">
          {field('Nombre de la unidad', unit.title, v => edit(a => {a[u].title=v;}), {required:true,maxLength:100})}
          {field('Descripción', unit.description, v => edit(a => {a[u].description=v;}), {required:true,maxLength:300})}
        </div>
        {unit.lessons.map((lesson,l) => <details key={lesson.id} className="admin-lesson"><summary>{lesson.title || 'Lección nueva'} · {lesson.signs.length} señas</summary>
          <div className="admin-fields">
            {field('Nombre de la lección', lesson.title, v => edit(a => {a[u].lessons[l].title=v;}), {required:true,maxLength:100})}
            {field('Descripción', lesson.description, v => edit(a => {a[u].lessons[l].description=v;}), {required:true,maxLength:300})}
          </div>
          {lesson.signs.map((sign,s) => <div key={sign.id} className="admin-sign">
            {field('Palabra o frase', sign.term, v => edit(a => {a[u].lessons[l].signs[s].term=v;}), {required:true,maxLength:100})}
            <label className="admin-upload">{sign.video ? 'Reemplazar video' : 'Subir video'}<input type="file" accept="video/mp4,.mp4" onChange={e => {
              const file = e.target.files[0]; e.target.value = '';
              if (!file) return;
              run(async () => {
                if (file.size > 20 * 1024 * 1024) throw new Error('El video no puede superar 20 MB.');
                const result = await adminApi('/video', { method:'POST', file });
                edit(a => {a[u].lessons[l].signs[s].video=result.video;});
              }, 'Video subido. Publica el catálogo para aplicar el cambio.');
            }}/></label>
            <div className="admin-sign-actions">
              {sign.video && <button type="button" className="button secondary admin-preview-button" onClick={() => setPreview({ ...sign })}><Play aria-hidden="true"/> Ver video</button>}
              <button type="button" className="admin-remove" onClick={() => edit(a => {a[u].lessons[l].signs.splice(s,1);})}>Quitar seña</button>
            </div>
          </div>)}
          <button type="button" onClick={() => edit(a => {a[u].lessons[l].signs.push(firstSign());})}>Agregar seña</button>
          <button type="button" onClick={() => edit(a => {a[u].lessons.splice(l,1);})}>Quitar lección</button>
        </details>)}
        <button type="button" onClick={() => edit(a => {a[u].lessons.push(firstLesson());})}>Agregar lección</button>
        <button type="button" onClick={() => edit(a => {a.splice(u,1);})}>Quitar unidad</button>
      </details>)}
      <div className="admin-tabs">
        <button type="button" className="button secondary" onClick={() => edit(a => {a.push({ id:uuid(), title:'', description:'', color:'#6c5ce7', lessons:[firstLesson()] });})}>Agregar unidad</button>
        <button className="button primary" disabled={!dirty}>Publicar catálogo</button>
      </div>
      </fieldset>
    </form> : tab === 'historial' ? <section className="admin-card">
      <h2>Recuperar contenido del catálogo</h2>
      <ol>
        <li>Al publicar cambios, guardamos una copia del catálogo anterior. Quitar una seña no borra su archivo de video.</li>
        <li>Elige una copia y pulsa «Cargar como borrador». Esto reemplaza tu borrador actual con el catálogo completo de esa fecha.</li>
        <li>Revisa el borrador y pulsa «Publicar catálogo» para que lo vean los estudiantes. El progreso guardado no se modifica.</li>
      </ol>
      {busy ? <p role="status">Cargando…</p> : !versions.length ? <p><strong>Todavía no hay copias.</strong> Aparecerá la primera cuando publiques un cambio desde Contenido.</p> : versions.map(version =>
        <article className="admin-user" key={version.revision}>
          <strong>Versión {version.revision} · {version.totalSigns} señas</strong>
          <p>{new Date(version.archivedAt).toLocaleString('es-GT', {timeZone:'America/Guatemala'})}</p>
          <button disabled={!!confirm} onClick={() => setConfirm({
            text: 'Cargar esta versión en lugar del borrador actual',
            action: () => run(async () => {
              const saved = await adminApi('/catalog/history/' + version.revision);
              setDraft({ ...catalog, units:saved.units });
              setTab('contenido');
            }, 'Versión cargada como borrador. Revisa y publica para recuperarla.')
          })}>Cargar como borrador</button>
        </article>
      )}
    </section> : <section className="admin-card">
      <p className="muted">Los recordatorios se programan para las 6:17 p. m. de Guatemala, solo si la cuenta practicó ayer y aún no practica hoy. Cada estudiante puede desactivarlos en Mi perfil.</p>
      {field('Buscar entre las cuentas cargadas', query, setQuery, {type:'search'})}
      {users.filter(u => (u.email+' '+u.name).toLowerCase().includes(query.trim().toLowerCase())).map(user => <article className="admin-user" key={user.uid}>
        <div><strong>{user.name || user.email}</strong><div>{user.email}</div><small>{user.admin ? 'Administrador' : 'Estudiante'} · {user.disabled ? 'Desactivada' : 'Activa'} · {user.verified ? 'Correo verificado' : 'Correo sin verificar'}</small></div>
        <div className="admin-actions">
          {user.hasProfile && <button aria-pressed={user.streakReminder} disabled={busy || !!confirm || (!user.streakReminder && (user.disabled || !user.verified))} onClick={() => setConfirm({
            text:`${user.streakReminder ? 'Desactivar' : 'Activar'} recordatorios de racha para ${user.email}`,
            action: () => run(async () => {
              const result = await adminApi('/users/' + encodeURIComponent(user.uid) + '/reminders', {method:'PATCH', data:{enabled:!user.streakReminder}});
              setUsers(list => list.map(item => item.uid === user.uid ? result : item));
            }, 'Preferencia de recordatorios guardada.')
          })}>Recordatorios: {user.streakReminder ? 'activados' : 'desactivados'}</button>}
          <button disabled={busy || !!confirm || !user.email} onClick={() => setConfirm({text:`Enviar un correo de restablecimiento a ${user.email}`, action: () => run(() => adminReset(user.email), 'Solicitud de restablecimiento enviada.')})}>Restablecer contraseña</button>
          <button disabled={busy || !!confirm} onClick={() => changeUser(user, {disabled:!user.disabled}, user.disabled ? 'Reactivar cuenta' : 'Desactivar cuenta')}>{user.disabled ? 'Reactivar' : 'Desactivar'}</button>
          {owner && <button disabled={busy || !!confirm} onClick={() => changeUser(user, {admin:!user.admin}, user.admin ? 'Quitar rol de administrador' : 'Asignar rol de administrador')}>{user.admin ? 'Quitar rol' : 'Hacer administrador'}</button>}
          {!user.admin && <button disabled={busy || !!confirm} onClick={() => changeUser(user, null, 'Eliminar cuenta de acceso de forma permanente')}>Eliminar</button>}
        </div>
      </article>)}
      {cursor && <button disabled={busy || !!confirm} onClick={() => loadUsers(cursor)}>Cargar más cuentas</button>}
      {busy && <p role="status">Procesando… El primer acceso puede tardar.</p>}
    </section>}
    <dialog ref={dialog} className="admin-video-dialog" aria-labelledby="admin-video-title" onClose={() => setPreview(null)}>
      {preview && <>
        <header><div><span className="eyebrow">VISTA PREVIA</span><h2 id="admin-video-title">{preview.term || 'Video de la seña'}</h2></div>
          <button type="button" autoFocus className="admin-close" onClick={() => dialog.current.close()} aria-label="Cerrar vista previa"><X aria-hidden="true"/></button>
        </header>
        <div className="admin-video-stage"><SignVideo key={preview.video} src={preview.video.startsWith('/multimedia/') ? preview.video + '?formato=h264' : preview.video} autoplay={false}/></div>
      </>}
    </dialog>
  </div>;
}
