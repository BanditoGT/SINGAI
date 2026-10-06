const normalizar = texto => String(texto)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9ñ]+/g, ' ')
  .trim();

export function crearSecuenciaTraduccion(texto, senas) {
  const palabras = normalizar(texto).split(' ').filter(Boolean);
  const mapa = new Map(senas.map(sena => [normalizar(sena.term), sena]));
  const maximo = Math.max(1, ...[...mapa.keys()].map(termino => termino.split(' ').length));
  const secuencia = [];
  const deletreadas = [];
  const omitidas = [];

  for (let indice = 0; indice < palabras.length;) {
    let coincidencia = null;
    let cantidad = 0;
    for (let largo = Math.min(maximo, palabras.length - indice); largo > 0; largo--) {
      const frase = palabras.slice(indice, indice + largo).join(' ');
      if (mapa.has(frase)) { coincidencia = mapa.get(frase); cantidad = largo; break; }
    }
    if (coincidencia) {
      secuencia.push({ ...coincidencia, etiqueta: coincidencia.term, tipo: 'palabra' });
      indice += cantidad;
      continue;
    }

    const palabra = palabras[indice];
    const letras = [...palabra].map(letra => mapa.get(letra)).filter(Boolean);
    if (letras.length === palabra.length && letras.length) {
      deletreadas.push(palabra.toUpperCase());
      letras.forEach((sena, posicion) => secuencia.push({
        ...sena,
        etiqueta: palabra[posicion].toUpperCase(),
        tipo: 'letra',
        palabraDeletreada: palabra.toUpperCase()
      }));
    } else {
      omitidas.push(palabra.toUpperCase());
    }
    indice++;
  }
  return { secuencia, deletreadas, omitidas };
}
