import { rachaVigente } from './progreso.js';

export const DEFINICIONES_LOGROS = [
  { id: 'primer-paso', titulo: 'Primer paso', descripcion: 'Completa tu primera lección.', icono: '🌱', cumple: ({ lecciones }) => lecciones >= 1 },
  { id: 'en-marcha', titulo: 'En marcha', descripcion: 'Completa 5 lecciones.', icono: '🚀', cumple: ({ lecciones }) => lecciones >= 5 },
  { id: 'explorador', titulo: 'Explorador visual', descripcion: 'Completa 10 lecciones.', icono: '🧭', cumple: ({ lecciones }) => lecciones >= 10 },
  { id: 'constante-3', titulo: 'Constancia', descripcion: 'Mantén una racha de 3 días.', icono: '🔥', cumple: ({ racha }) => racha >= 3 },
  { id: 'semana-perfecta', titulo: 'Semana perfecta', descripcion: 'Mantén una racha de 7 días.', icono: '🏆', cumple: ({ racha }) => racha >= 7 },
  { id: 'centenario', titulo: 'Centenario', descripcion: 'Alcanza 100 XP.', icono: '⚡', cumple: ({ xp }) => xp >= 100 },
  { id: 'competidor', titulo: 'Competidor', descripcion: 'Alcanza 300 XP.', icono: '🥉', cumple: ({ xp }) => xp >= 300 },
  { id: 'dedicacion', titulo: 'Gran dedicación', descripcion: 'Completa 20 lecciones.', icono: '💎', cumple: ({ lecciones }) => lecciones >= 20 }
];

export function calcularLogros(perfil, progreso, diaActual) {
  const contexto = {
    xp: Math.max(0, Number(perfil?.xp || 0)),
    racha: rachaVigente(perfil, diaActual),
    lecciones: new Set(progreso?.completedLessonIds || []).size
  };
  return DEFINICIONES_LOGROS.map(logro => ({ ...logro, desbloqueado: logro.cumple(contexto) }));
}

export function actividadUltimosDias(lecciones = [], ahora = new Date(), cantidad = 7) {
  const formato = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' });
  const completados = new Set(lecciones.map(item => formato.format(new Date(item.completedAt))));
  return Array.from({ length: cantidad }, (_, indice) => {
    const fecha = new Date(ahora); fecha.setDate(fecha.getDate() - (cantidad - 1 - indice));
    const clave = formato.format(fecha);
    return { fecha: clave, activo: completados.has(clave), etiqueta: new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', weekday: 'short' }).format(fecha).replace('.', '') };
  });
}
