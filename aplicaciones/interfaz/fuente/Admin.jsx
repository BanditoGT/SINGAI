import React, { useEffect, useState } from 'react';
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
      <p>Los cambios se aplican al pulsar «Publicar». Quitar una seña la retira del catálogo.</p>
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
            <label>{sign.video ? 'Reemplazar video' : 'Subir video'}<input type="file" accept="video/mp4,.mp4" onChange={e => {
              const file = e.target.files[0]; e.target.value = '';
              if (!file) return;
              run(async () => {
                if (file.size > 20 * 1024 * 1024) throw new Error('El video no puede superar 20 MB.');
                const result = await adminApi('/video', { method:'POST', file });
                edit(a => {a[u].lessons[l].signs[s].video=result.video;});
              }, 'Video subido. Publica el catálogo para aplicar el cambio.');
            }}/></label>
            {sign.video && <a href={sign.video} target="_blank" rel="noreferrer">Ver video</a>}
            <button type="button" onClick={() => edit(a => {a[u].lessons[l].signs.splice(s,1);})}>Quitar seña</button>
          </div>)}
          <button type="button" onClick={() => edit(a => {a[u].lessons[l].signs.push(firstSign());})}>Agregar seña</button>
          <button type="button" onClick={() => edit(a => {a[u].lessons.splice(l,1);})}>Quitar lección</button>
        </details>)}
        <button type="button" onClick={() => edit(a => {a[u].lessons.push(firstLesson());})}>Agregar lección</button>
        <button type="button" onClick={() => edit(a => {a.splice(u,1);})}>Quitar unidad</button>
      </details>)}
      <div className="admin-tabs">
        <button type="button" className="button secondary" onClick={() => edit(a => {a.push({ id:uuid(), title:'', description:'', color:'#6c5ce7', lessons:[firstLesson()] });})}>Agregar unidad</button>
        <button className="button primary">Publicar catálogo</button>
      </div>
      </fieldset>
    </form> : <section className="admin-card">
      {field('Buscar entre las cuentas cargadas', query, setQuery, {type:'search'})}
      {users.filter(u => (u.email+' '+u.name).toLowerCase().includes(query.trim().toLowerCase())).map(user => <article className="admin-user" key={user.uid}>
        <div><strong>{user.name || user.email}</strong><div>{user.email}</div><small>{user.admin ? 'Administrador' : 'Estudiante'} · {user.disabled ? 'Desactivada' : 'Activa'} · {user.verified ? 'Correo verificado' : 'Correo sin verificar'}</small></div>
        <div className="admin-actions">
          <button disabled={busy || !!confirm || !user.email} onClick={() => setConfirm({text:`Enviar un correo de restablecimiento a ${user.email}`, action: () => run(() => adminReset(user.email), 'Solicitud de restablecimiento enviada.')})}>Restablecer contraseña</button>
          <button disabled={busy || !!confirm} onClick={() => changeUser(user, {disabled:!user.disabled}, user.disabled ? 'Reactivar cuenta' : 'Desactivar cuenta')}>{user.disabled ? 'Reactivar' : 'Desactivar'}</button>
          {owner && <button disabled={busy || !!confirm} onClick={() => changeUser(user, {admin:!user.admin}, user.admin ? 'Quitar rol de administrador' : 'Asignar rol de administrador')}>{user.admin ? 'Quitar rol' : 'Hacer administrador'}</button>}
          {!user.admin && <button disabled={busy || !!confirm} onClick={() => changeUser(user, null, 'Eliminar cuenta de acceso de forma permanente')}>Eliminar</button>}
        </div>
      </article>)}
      {cursor && <button disabled={busy || !!confirm} onClick={() => loadUsers(cursor)}>Cargar más cuentas</button>}
      {busy && <p role="status">Procesando… El primer acceso puede tardar.</p>}
    </section>}
  </div>;
}
