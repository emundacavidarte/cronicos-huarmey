/**
 * verificar_sectores.js
 * Comprueba la sectorizacion GeoRIS (client/data/georis/georisDataBundle.js):
 *  1. Que sectores hay en la zona sanitaria de Huarmey y a que establecimiento pertenece cada uno.
 *  2. En que sector/zona/RIS GeoRIS cae cada punto del diccionario del geocodificador (ancashGeocoder.js)
 *     y si coincide con el "sector" y el establecimiento (es:) que el geocodificador declara.
 *  3. En que sector GeoRIS cae cada establecimiento de la Microrred Huarmey.
 * Solo usa coordenadas de calles/establecimientos; NO usa datos de pacientes.
 * Uso: node tools/verificar_sectores.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

global.window = {};
require(path.join(ROOT, 'client', 'data', 'georis', 'georisDataBundle.js'));
const B = global.window.GEORIS_DATA_BUNDLE;

function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function inGeom(lng, lat, g) {
  if (!g) return false;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some(p => inRing(lng, lat, p[0]) && !p.slice(1).some(h => inRing(lng, lat, h)));
}
function find(layer, lng, lat) {
  return B[layer].features.filter(f => inGeom(lng, lat, f.geometry)).map(f => f.properties);
}
function describe(lng, lat) {
  const sec = find('sectores', lng, lat)[0];
  const zon = find('zonas', lng, lat)[0];
  const ris = find('ris', lng, lat)[0];
  return {
    ris: ris ? `${ris.ris}(${ris.id_ris})` : 'FUERA DE ANCASH/RIS',
    zona: zon ? `${zon.id_zona}:${zon.ipress}` : '-',
    sector: sec ? `${sec.id_sector}:${sec.ipress}` : 'SIN SECTOR GEORIS',
    sectorData: sec || null
  };
}

console.log('== 1. Sectores GeoRIS por zona sanitaria (RIS 156 PACIFICO SUR) ==');
const porZona = {};
for (const f of B.sectores.features) {
  const p = f.properties;
  if (p.id_ris !== 156) continue;
  const k = `zona ${p.id_zona}`;
  porZona[k] = porZona[k] || [];
  porZona[k].push(`${p.id_sector}:${p.ipress}(${p.distrito})`);
}
for (const [k, v] of Object.entries(porZona)) console.log(k, `(${v.length} sectores)`, v.slice(0, 40).join(' | '));
const huarmey = B.sectores.features.filter(f => /HUARMEY|CULEBRAS|HUAYAN|MALVAS|COCHAPETI/i.test(f.properties.distrito || ''));
console.log('\nSectores GeoRIS en distritos de la provincia de Huarmey:', huarmey.length);
for (const f of huarmey) { const p = f.properties; console.log(`  sector ${p.id_sector} | ${p.ipress} | ${p.distrito} | zona ${p.id_zona} | ubigeo ${p.ubigeo} | pob ${p.pob_t}`); }

console.log('\n== 2. Diccionario del geocodificador: sector declarado vs sector GeoRIS donde cae el punto ==');
const geocoder = require(path.join(ROOT, 'client', 'js', 'map', 'ancashGeocoder.js'));
let n = 0, fuera = 0, sinSector = 0;
const declarados = {};
const seenKw = new Set();
for (const entry of (geocoder.entries || [])) {
  const kw = entry.kwOriginal || entry.kw;
  if (seenKw.has(kw)) continue;
  seenKw.add(kw);
  const lat = entry.lat, lng = entry.lng;
  const d = describe(lng, lat);
  n++;
  if (d.ris.startsWith('FUERA')) fuera++;
  if (d.sector.startsWith('SIN')) sinSector++;
  const key = entry.sector;
  declarados[key] = declarados[key] || {};
  declarados[key][d.sector] = (declarados[key][d.sector] || 0) + 1;
  console.log(`${kw.slice(0, 24).padEnd(24)} declara "${entry.sector}" es=${entry.es} | GeoRIS: RIS ${d.ris} | zona ${d.zona} | sector ${d.sector}`);
}
console.log(`\nEntradas: ${n} | fuera de toda RIS: ${fuera} | sin sector GeoRIS: ${sinSector}`);
console.log('\nResumen: nombre de sector del geocodificador -> sectores GeoRIS reales donde caen sus puntos');
for (const [k, v] of Object.entries(declarados)) console.log(`  "${k}" ->`, JSON.stringify(v));

console.log('\n== 3. Establecimientos Microrred Huarmey (coordenadas GeoRIS) y su sector GeoRIS ==');
const CODES = ['00001741', '00001742', '00001743', '00001744', '00001745', '00001746', '00001747', '00001748', '00001749', '00001751', '00001752', '00001753', '00001801'];
for (const layer of ['eessArea', 'eessZona', 'eessPuertas', 'eessVinculados']) {
  for (const f of B[layer].features) {
    if (!CODES.includes(String(f.properties.cod_reni))) continue;
    const [lng, lat] = f.geometry.coordinates;
    const d = describe(lng, lat);
    console.log(`${f.properties.cod_reni} ${String(f.properties.ipress).padEnd(32)} | sector GeoRIS ${d.sector} | zona ${d.zona} | RIS ${d.ris}`);
  }
}
