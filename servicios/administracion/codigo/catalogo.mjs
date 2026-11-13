const id = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,95}$/.test(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
export function validarCatalogo(catalog, cloud) {
  if (!Array.isArray(catalog?.units) || !catalog.units.length || catalog.units.length > 40) fail('Agrega entre 1 y 40 unidades.');
  const units = new Set(), lessons = new Set(), signs = new Set();
  for (const unit of catalog.units) {
    if (!id(unit?.id) || units.has(unit.id) || !text(unit.title, 100) || !text(unit.description, 300)
      || !/^#[0-9a-f]{6}$/i.test(unit.color) || !Array.isArray(unit.lessons) || !unit.lessons.length) fail('Cada unidad debe tener título, descripción y al menos una lección.');
    units.add(unit.id);
    for (const lesson of unit.lessons) {
      if (!id(lesson?.id) || lessons.has(lesson.id) || !text(lesson.title, 100) || !text(lesson.description, 300)
        || !Number.isInteger(lesson.xp) || lesson.xp < 0 || lesson.xp > 100 || !Array.isArray(lesson.signs) || !lesson.signs.length) fail('Cada lección debe tener título, descripción, XP entre 0 y 100 y al menos una seña.');
      lessons.add(lesson.id);
      for (const sign of lesson.signs) {
        if (!id(sign?.id) || signs.has(sign.id) || !text(sign.term, 100) || typeof sign.video !== 'string' || sign.video.length > 512) fail('Cada seña debe tener un nombre, un video y un identificador único.');
        const bundled = /^\/multimedia\/[\w.%/() -]+\.mp4$/i.test(sign.video) && !decodeURIComponent(sign.video).split('/').includes('..');
        const uploaded = cloud && sign.video.startsWith(`https://res.cloudinary.com/${cloud}/video/upload/`)
          && /^v\d+\/singai\/[\w-]+\.mp4$/.test(sign.video.slice(`https://res.cloudinary.com/${cloud}/video/upload/`.length));
        if (!bundled && !uploaded) fail('El video debe pertenecer a SingAI.');
        signs.add(sign.id);
      }
    }
    unit.totalSigns = unit.lessons.reduce((n, lesson) => n + lesson.signs.length, 0);
  }
  if (signs.size > 2000 || Buffer.byteLength(JSON.stringify(catalog.units)) > 700_000) fail('El catálogo excede el tamaño permitido.');
  return { units: catalog.units, totalSigns: signs.size };
}
