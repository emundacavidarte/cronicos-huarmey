/**
 * verificar_renipress.js
 * Coteja las coordenadas de los establecimientos de la Microrred Huarmey contra RENIPRESS
 * (SUSALUD, datos abiertos: https://www.datosabiertos.gob.pe/dataset/registro-nacional-de-entidades-prestadoras-de-servicios-de-salud-renipress)
 * y contra GeoRIS (bundle) y database.js. Solo establecimientos; NO usa datos de pacientes.
 * Uso: node tools/verificar_renipress.js <ruta_al_RENIPRESS.csv>
 *   (en el CSV, NORTE = latitud y ESTE = longitud, en grados decimales)
 */
const fs = require('fs');
const path = require('path');

const csvPath = process.argv[2];
if (!csvPath) { console.error('Uso: node tools/verificar_renipress.js <RENIPRESS.csv>'); process.exit(2); }
const ROOT = path.resolve(__dirname, '..');

function hav(lat1, lon1, lat2, lon2) {
  const R = 6371000; const t = x => x * Math.PI / 180;
  const a = Math.sin(t(lat2 - lat1) / 2) ** 2 + Math.cos(t(lat1)) * Math.cos(t(lat2)) * Math.sin(t(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const CODES = ['00001741', '00001742', '00001743', '00001744', '00001745', '00001746', '00001747', '00001748',
  '00001749', '00001750', '00001751', '00001752', '00001753', '00001801'];

// RENIPRESS
const text = fs.readFileSync(csvPath, 'utf8');
const lines = text.split(/\r?\n/);
const head = lines[0].split(';');
const ix = n => head.indexOf(n);
const reni = new Map();
for (let i = 1; i < lines.length; i++) {
  const c = lines[i].split(';');
  const code = (c[ix('COD_IPRESS')] || '').replace(/"/g, '').padStart(8, '0');
  if (CODES.includes(code)) {
    reni.set(code, {
      nombre: c[ix('NOMBRE')], categoria: c[ix('CATEGORIA')], distrito: c[ix('DISTRITO')], red: c[ix('RED')],
      microrred: c[ix('MICRORED')], estado: c[ix('ESTADO')], lat: parseFloat(c[ix('NORTE')]), lng: parseFloat(c[ix('ESTE')]),
      direccion: c[ix('DIRECCION')]
    });
  }
}

// GeoRIS
global.window = {};
require(path.join(ROOT, 'client', 'data', 'georis', 'georisDataBundle.js'));
const b = global.window.GEORIS_DATA_BUNDLE;
const georis = new Map();
for (const k of ['eessArea', 'eessZona', 'eessPuertas', 'eessVinculados']) {
  for (const f of b[k].features) georis.set(String(f.properties.cod_reni), { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] });
}

// database.js
const db = require(path.join(ROOT, 'server', 'db', 'database.js'));
const dbm = new Map();
for (const est of db.getEstablishments()) {
  dbm.set(est.cod_renipress, { lat: est.latitud, lng: est.longitud });
}

const lab = d => d == null ? 'n/d' : (d <= 500 ? 'OK' : d <= 2000 ? 'REVISAR' : 'ERROR');
console.log('cod       | RENIPRESS nombre / categoria / distrito / microrred          | GeoRIS vs RENIPRESS | database.js vs RENIPRESS');
for (const code of CODES) {
  const r = reni.get(code);
  if (!r) { console.log(code, '| NO APARECE EN RENIPRESS (codigo inexistente o distinto)'); continue; }
  const g = georis.get(code); const d = dbm.get(code);
  const dg = g ? Math.round(hav(r.lat, r.lng, g.lat, g.lng)) : null;
  const dd = d ? Math.round(hav(r.lat, r.lng, d.lat, d.lng)) : null;
  console.log(`${code} | ${r.nombre} / ${r.categoria} / ${r.distrito} / ${r.microrred} / ${r.estado} | GeoRIS ${lab(dg)} ${dg ?? ''} m | database.js ${lab(dd)} ${dd ?? ''} m | RENIPRESS=${r.lat},${r.lng}`);
}
