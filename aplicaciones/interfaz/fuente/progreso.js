const diasEntre = (anterior, actual) => Math.round(
  (new Date(`${actual}T12:00:00Z`) - new Date(`${anterior}T12:00:00Z`)) / 86400000
);

export function calcularRacha(perfil, diaActual) {
  const anterior = Math.max(0, Math.floor(Number(perfil?.streak) || 0));
  if (perfil?.lastActivity === diaActual) return anterior;
  if (perfil?.lastActivity && diasEntre(perfil.lastActivity, diaActual) === 1) return anterior + 1;
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
  const valor = Number(puntuacion);
  const puntuacionValida = Number.isFinite(valor) ? Math.max(0, Math.min(100, valor)) : 0;
  return puntuacionValida >= 80 ? 20 : 10;
}

export const VIDAS_MAXIMAS = 5;
export const MINUTOS_BLOQUEO = 10;
export const PENALIZACION_XP = 25;
export const XP_POR_DIVISION = 100;

export const RANGOS = ['Hierro', 'Bronce', 'Plata', 'Oro', 'Platino', 'Ascendente', 'Inmortal', 'Radiante'];
const romanos = ['I', 'II', 'III'];

export function obtenerRango(xpActual) {
  const valor = Number(xpActual);
  const xp = Number.isFinite(valor) ? Math.max(0, Math.floor(valor)) : 0;
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
  const valor = Number(perfil?.hearts ?? VIDAS_MAXIMAS);
  let vidas = Math.max(0, Math.min(VIDAS_MAXIMAS, Number.isFinite(valor) ? Math.floor(valor) : VIDAS_MAXIMAS));
  const intervalo = MINUTOS_BLOQUEO * 60000;
  let siguiente = Date.parse(perfil?.heartsRecoveryAt || perfil?.heartsBlockedUntil || '');
  // Los perfiles anteriores sin fecha de recarga reciben una recarga inicial.
  if (vidas < VIDAS_MAXIMAS && !Number.isFinite(siguiente)) vidas = VIDAS_MAXIMAS;
  if (vidas < VIDAS_MAXIMAS && siguiente <= ahora) {
    const recuperadas = Math.floor((ahora - siguiente) / intervalo) + 1;
    vidas = Math.min(VIDAS_MAXIMAS, vidas + recuperadas);
    siguiente += recuperadas * intervalo;
  }
  const recuperaEn = vidas < VIDAS_MAXIMAS ? new Date(siguiente).toISOString() : null;
  return { vidas, recuperaEn, bloqueadoHasta: vidas === 0 ? recuperaEn : null, bloqueado: vidas === 0 };
}

export function aplicarFallo(perfil, ahora = Date.now()) {
  const estado = estadoVidas(perfil, ahora);
  if (estado.bloqueado) return { ...estado, xp: Math.max(0, Number(perfil?.xp || 0)), xpPerdida: 0 };
  const vidas = Math.max(0, estado.vidas - 1);
  const agotadas = vidas === 0;
  const xpValor = Number(perfil?.xp);
  const xpAnterior = Number.isFinite(xpValor) ? Math.max(0, Math.floor(xpValor)) : 0;
  const xp = agotadas ? Math.max(0, xpAnterior - PENALIZACION_XP) : xpAnterior;
  return {
    vidas,
    bloqueado: agotadas,
    bloqueadoHasta: agotadas ? estado.recuperaEn || new Date(ahora + MINUTOS_BLOQUEO * 60000).toISOString() : null,
    recuperaEn: estado.recuperaEn || new Date(ahora + MINUTOS_BLOQUEO * 60000).toISOString(),
    xp,
    xpPerdida: xpAnterior - xp
  };
}

export function seCompletoHoy(fecha, diaActual) {
  if (!fecha) return false;
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return false;
  const dia = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(valor);
  return dia === diaActual;
}
