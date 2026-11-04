/**
 * redes.js
 * Las 7 Redes Integradas de Salud (RIS) de Áncash tal como las muestra GeoRIS (cada red agrupa
 * todos sus establecimientos). Es la única lista válida de "red" para usuarios y pacientes.
 */

const RIS = [
  { codigo: '69', nombre: 'HUAYLAS NORTE' },
  { codigo: '87', nombre: 'CONCHUCOS SUR' },
  { codigo: '111', nombre: 'CONCHUCOS NORTE' },
  { codigo: '101', nombre: 'HUAYLAS SUR 1' },
  { codigo: '104', nombre: 'HUAYLAS SUR 2' },
  { codigo: '156', nombre: 'PACIFICO SUR' },
  { codigo: '157', nombre: 'PACIFICO NORTE' }
].map(r => Object.assign({}, r, { etiqueta: `${r.nombre} (N° ${r.codigo})` }));

function stripAccents(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Devuelve el nombre canónico de la RIS ("PACIFICO SUR") o null si no es una de las 7.
 * Acepta mayúsculas/minúsculas, tildes, el texto de GeoRIS ("PACIFICO SUR (N° 156)") y el código ("156", "RIS 156").
 */
function normalizeRed(value) {
  if (value === null || value === undefined) return null;
  let text = stripAccents(value).toUpperCase().trim();
  if (!text) return null;

  const byCode = /^(?:RIS\s*)?(?:N[°º]?\s*)?(\d{2,3})$/.exec(text);
  if (byCode) {
    const found = RIS.find(r => r.codigo === byCode[1]);
    return found ? found.nombre : null;
  }

  text = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const found = RIS.find(r => r.nombre === text);
  return found ? found.nombre : null;
}

/** Verdadero solo si ambas redes son válidas y son la misma. Dos valores desconocidos nunca son iguales. */
function sameRed(a, b) {
  const na = normalizeRed(a);
  return na !== null && na === normalizeRed(b);
}

module.exports = { RIS, normalizeRed, sameRed };
