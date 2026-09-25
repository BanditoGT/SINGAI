const diasEntre = (anterior, actual) => Math.round(
  (new Date(`${actual}T12:00:00Z`) - new Date(`${anterior}T12:00:00Z`)) / 86400000
);

export function calcularRacha(perfil, diaActual) {
  if (perfil.lastActivity === diaActual) return Number(perfil.streak || 0);
  if (perfil.lastActivity && diasEntre(perfil.lastActivity, diaActual) === 1) {
    return Number(perfil.streak || 0) + 1;
  }
  return 1;
}

export function rachaVigente(perfil, diaActual) {
  if (!perfil?.lastActivity) return 0;
  const diferencia = diasEntre(perfil.lastActivity, diaActual);
  if (diferencia < 0 || diferencia > 1) return 0;
  return Math.max(0, Number(perfil.streak || 0));
}

export function estadoRacha(perfil, diaActual) {
  const racha = rachaVigente(perfil, diaActual);
  if (!racha) return { racha: 0, estado: 'sin-racha', mensaje: 'Completa una lección hoy para iniciar una nueva racha.' };
  if (perfil.lastActivity === diaActual) return { racha, estado: 'protegida', mensaje: 'Tu racha ya está protegida por hoy.' };
  return { racha, estado: 'en-riesgo', mensaje: 'Practica hoy para no perder tu racha.' };
}

export function calcularXpGanada(esPrimeraVez, puntuacion) {
  if (!esPrimeraVez) return 2;
  return Number(puntuacion || 0) >= 80 ? 20 : 10;
}

export const VIDAS_MAXIMAS = 5;
export const MINUTOS_BLOQUEO = 10;
export const PENALIZACION_XP = 25;
export const XP_POR_DIVISION = 100;

export const RANGOS = ['Hierro', 'Bronce', 'Plata', 'Oro', 'Platino', 'Ascendente', 'Inmortal', 'Radiante'];
const romanos = ['I', 'II', 'III'];

export function obtenerRango(xpActual) {
  const xp = Math.max(0, Number(xpActual || 0));
  const ultimaDivision = RANGOS.length * romanos.length - 1;
  const indice = Math.min(Math.floor(xp / XP_POR_DIVISION), ultimaDivision);
  const rango = RANGOS[Math.floor(indice / 3)];
  const division = romanos[indice % 3];
  const xpBase = indice * XP_POR_DIVISION;
  const esMaximo = indice === ultimaDivision;
  return {
    nombre: `${rango} ${division}`,
    rango,
    division,
    xp,
    xpBase,
    xpSiguiente: esMaximo ? null : xpBase + XP_POR_DIVISION,
    progreso: esMaximo ? 100 : Math.min(100, Math.round((xp - xpBase) / XP_POR_DIVISION * 100)),
    esMaximo
  };
}

export function listarRangos() {
  return RANGOS.flatMap((rango, rangoIndex) => romanos.map((division, divisionIndex) => {
    const indice = rangoIndex * 3 + divisionIndex;
    return { nombre: `${rango} ${division}`, rango, division, xpNecesaria: indice * XP_POR_DIVISION, indice };
  }));
}

export function estadoVidas(perfil, ahora = Date.now()) {
  const bloqueo = perfil?.heartsBlockedUntil ? new Date(perfil.heartsBlockedUntil).getTime() : 0;
  if (bloqueo && bloqueo > ahora) return { vidas: 0, bloqueadoHasta: new Date(bloqueo).toISOString(), bloqueado: true };
  if (bloqueo && bloqueo <= ahora) return { vidas: VIDAS_MAXIMAS, bloqueadoHasta: null, bloqueado: false };
  return { vidas: Math.max(0, Math.min(VIDAS_MAXIMAS, Number(perfil?.hearts ?? VIDAS_MAXIMAS))), bloqueadoHasta: null, bloqueado: false };
}

export function aplicarFallo(perfil, ahora = Date.now()) {
  const estado = estadoVidas(perfil, ahora);
  if (estado.bloqueado) return { ...estado, xp: Math.max(0, Number(perfil?.xp || 0)), xpPerdida: 0 };
  const vidas = Math.max(0, estado.vidas - 1);
  const agotadas = vidas === 0;
  const xpAnterior = Math.max(0, Number(perfil?.xp || 0));
  const xp = agotadas ? Math.max(0, xpAnterior - PENALIZACION_XP) : xpAnterior;
  return {
    vidas,
    bloqueado: agotadas,
    bloqueadoHasta: agotadas ? new Date(ahora + MINUTOS_BLOQUEO * 60000).toISOString() : null,
    xp,
    xpPerdida: xpAnterior - xp
  };
}

export function seCompletoHoy(fecha, diaActual) {
  if (!fecha) return false;
  const dia = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(fecha));
  return dia === diaActual;
}
