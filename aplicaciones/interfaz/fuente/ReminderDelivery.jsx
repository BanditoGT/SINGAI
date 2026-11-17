import React, {useEffect,useState} from 'react';
import {adminApi} from './api.js';

const messages = {
  pending:'El correo está esperando el siguiente proceso automático.',
  processing:'Estamos enviando el correo ahora…',
  sent:'Gmail aceptó el correo. Si no aparece en Recibidos, revisa Spam.',
  failed:'No se pudo enviar el correo. Revisa la configuración del remitente e inténtalo de nuevo.'
};

export default function ReminderDelivery({uid,refresh=0}) {
  const [state,setState]=useState(null);
  useEffect(()=>{
    let stopped=false, timer;
    const load=async()=>{
      try {
        const result=await adminApi('/notifications/delivery'+(uid?'?uid='+encodeURIComponent(uid):''));
        if (stopped) return;
        setState(result.state);
        if (['pending','processing'].includes(result.state)) timer=setTimeout(load,30000);
      } catch { if (!stopped) setState('unavailable'); }
    };
    load();
    return ()=>{stopped=true;clearTimeout(timer)};
  },[uid,refresh]);
  if (!state) return null;
  return <p className={state==='sent'?'notice success':state==='failed'?'notice':'muted'} role="status">{messages[state] ?? 'No pudimos consultar el estado del correo.'}</p>;
}
