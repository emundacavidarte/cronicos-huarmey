/**
 * verificar_establecimientos.js
 * Compara las coordenadas de los establecimientos de la Microrred Huarmey entre las tres
 * fuentes del repositorio: GeoRIS (client/data/georis/georisDataBundle.js, capa oficial MINSA),
 * server/db/database.js (DEFAULT_ESTABLISHMENTS) y client/js/map/ancashGeocoder.js.
 * Solo lee establecimientos; NO toca ni imprime datos de pacientes.
 * Uso: node tools/verificar_establecimientos.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function hav(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const t = x => x * Math.PI / 180;
  const dLat = t(lat2 - lat1);
  const dLon = t(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(t(lat1)) * Math.cos(t(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 1. GeoRIS oficial (bundle)
global.window = {};
require(path.join(ROOT, 'client', 'data', 'georis', 'georisDataBundle.js'));
const bundle = global.window.GEORIS_DATA_BUNDLE;
const georis = new Map();
for (const layer of ['eessArea', 'eessZona', 'eessPuertas', 'eessVinculados']) {
  for (const f of bundle[layer].features) {
    const p = f.properties;
    const code = String(p.cod_reni);
    if (!georis.has(code)) {
      georis.set(code, { code, nombre: p.ipress, categoria: p.categoria, ris: p.ris, id_ris: p.id_ris,
        id_zona: p.id_zona, distrito: p.distrito, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], capa: layer });
    }
  }
}

// 2. database.js y establecimientos.js (DEFAULT_ESTABLISHMENTS)
const estModule = require(path.join(ROOT, 'client', 'js', 'map', 'establecimientos.js'));
const db = require(path.join(ROOT, 'server', 'db', 'database.js'));
const dbList = db.getEstablishments();

// 3. Geocodificador (ancashGeocoder.js)
const geocoder = require(path.join(ROOT, 'client', 'js', 'map', 'ancashGeocoder.js'));
const geoEntries = geocoder.entries || [];

const AND_BOX = { latMin: -10.6, latMax: -8.0, lngMin: -78.9, lngMax: -76.8 };
const inBox = (la, lo) => la >= AND_BOX.latMin && la <= AND_BOX.latMax && lo >= AND_BOX.lngMin && lo <= AND_BOX.lngMax;

console.log('== A. database.js vs GeoRIS oficial (distancia en metros) ==');
let totalErroresDb = 0;
for (const e of dbList) {
  const g = georis.get(e.cod_renipress || e.code);
  if (!g) { console.log(e.cod_renipress, e.nombre, '-> NO EXISTE EN GEORIS'); totalErroresDb++; continue; }
  const d = Math.round(hav(e.latitud || e.lat, e.longitud || e.lng, g.lat, g.lng));
  const veredicto = d <= 500 ? 'OK' : (d <= 2000 ? 'REVISAR' : 'ERROR');
  if (veredicto === 'ERROR') totalErroresDb++;
  console.log(`${veredicto.padEnd(8)} ${(e.cod_renipress || e.code)} ${(e.nombre || '').padEnd(34)} dist=${String(d).padStart(6)} m | GeoRIS: ${g.nombre} (${g.categoria}, RIS ${g.ris}, zona ${g.id_zona}, ${g.distrito}, capa ${g.capa}) | en caja Ancash: ${inBox(e.latitud || e.lat, e.longitud || e.lng)}`);
}

console.log('\n== B. ancashGeocoder.js (entradas de establecimientos) vs GeoRIS ==');
let totalErroresGeo = 0;
const seen = new Set();
for (const e of geoEntries) {
  if (!e.es) continue;
  const g = georis.get(e.es);
  if (!g) { console.log(`SIN-GEORIS ${e.es} "${e.kw}"`); totalErroresGeo++; continue; }
  const d = Math.round(hav(e.lat, e.lng, g.lat, g.lng));
  if (!seen.has(e.es)) {
    seen.add(e.es);
    const veredicto = d <= 500 ? 'OK' : (d <= 2000 ? 'REVISAR' : 'ERROR');
    if (veredicto === 'ERROR') totalErroresGeo++;
    console.log(`${veredicto.padEnd(8)} "${e.kwOriginal || e.kw}" -> ${e.es} (${g.nombre}) dist=${d} m`);
  }
}
const codesGeo = new Set(geoEntries.map(e => e.es).filter(Boolean));
console.log('\nCodigos usados por el geocodificador que NO existen en GeoRIS:', [...codesGeo].filter(c => !georis.has(c)).join(', ') || 'ninguno');

console.log('\n== C. Establecimientos de la red PACIFICO SUR zona de Huarmey en GeoRIS que NO estan en database.js ==');
const dbCodes = new Set(dbList.map(e => e.cod_renipress || e.code));
const missingZona6 = [];
for (const g of georis.values()) {
  if (g.id_ris === 156 && g.id_zona === 6 && !dbCodes.has(g.code)) {
    missingZona6.push(g);
    console.log(`${g.code} ${g.nombre} (${g.categoria}, zona ${g.id_zona}, ${g.distrito}) capa ${g.capa}`);
  }
}
if (missingZona6.length === 0) {
  console.log('Ninguno. Todos los 13 establecimientos de la Zona Sanitaria Huarmey estan presentes en database.js.');
}

console.log('\nTotal GeoRIS en bundle:', georis.size, '| en database.js:', dbList.length);
console.log(`Resultado: Errores database.js: ${totalErroresDb} | Errores geocodificador: ${totalErroresGeo}`);
