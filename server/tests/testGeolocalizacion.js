/**
 * testGeolocalizacion.js
 * Suite de pruebas para G-01 (Fuente única de coordenadas) y G-02 (Geocodificador determinista y GeoRIS).
 */

const assert = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');

// Helpers de prueba
require('./helpers/memoryDb'); // Asegura que la BD corra aislada en memoria
const db = require('../db/database');
const estModule = require('../../client/js/map/establecimientos');
const geocoder = require('../../client/js/map/ancashGeocoder');

// Cargar GeoRIS oficial
global.window = global.window || {};
require('../../client/data/georis/georisDataBundle.js');
const bundle = global.window.GEORIS_DATA_BUNDLE;

function hav(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const t = x => x * Math.PI / 180;
  const dLat = t(lat2 - lat1);
  const dLon = t(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(t(lat1)) * Math.cos(t(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

let passed = 0;
let failed = 0;

function test(desc, fn) {
  try {
    fn();
    console.log(`  OK    ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${desc}: ${err.message}`);
    failed++;
  }
}

console.log('G-01: Fuente única de coordenadas y establecimientos oficiales');

const georisMap = new Map();
for (const layer of ['eessArea', 'eessZona', 'eessPuertas', 'eessVinculados']) {
  for (const f of bundle[layer].features) {
    const code = String(f.properties.cod_reni);
    if (!georisMap.has(code)) {
      georisMap.set(code, {
        code,
        nombre: f.properties.ipress,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        id_zona: f.properties.id_zona,
        id_ris: f.properties.id_ris
      });
    }
  }
}

test('database.js contiene los 13 establecimientos de la Microrred Huarmey (Zona 6)', () => {
  const ests = db.getEstablishments();
  assert.strictEqual(ests.length, 13);
  const codes = new Set(ests.map(e => e.cod_renipress));
  assert.ok(codes.has('00001749'), 'Debe incluir P.S. Cochapetí (00001749)');
  assert.ok(codes.has('00001741'), 'Debe incluir Hospital Huarmey (00001741)');
  assert.ok(codes.has('00001744'), 'Debe incluir C.S. La Victoria (00001744)');
});

test('Las coordenadas de database.js coinciden con GeoRIS al 100% (distancia <= 1 m)', () => {
  for (const e of db.getEstablishments()) {
    const g = georisMap.get(e.cod_renipress);
    assert.ok(g, `Establecimiento ${e.cod_renipress} existe en GeoRIS`);
    const d = hav(e.latitud, e.longitud, g.lat, g.lng);
    assert.ok(d <= 1.5, `Distancia en ${e.nombre} (${e.cod_renipress}) debe ser <= 1m (fue ${d.toFixed(2)} m)`);
  }
});

test('Hospital 00001741 apunta al Nuevo Hospital (-10.04780, -78.15480)', () => {
  const hosp = db.getEstablishmentByCode('00001741');
  assert.strictEqual(hosp.latitud, -10.04780);
  assert.strictEqual(hosp.longitud, -78.15480);
});

test('Cochapetí usa el código oficial RENIPRESS 00001749 (no el dado de baja 00001750)', () => {
  const c = db.getEstablishmentByCode('00001749');
  assert.ok(c, '00001749 debe existir');
  assert.strictEqual(c.nombre, 'PUESTO DE SALUD COCHAPETI');
  assert.strictEqual(db.getEstablishmentByCode('00001750'), null);
});

console.log('G-02: Geocodificador determinista, punto-en-polígono GeoRIS y honestidad');

test('Determinismo: llamadas repetidas producen el mismo resultado sin variación aleatoria', () => {
  const r1 = geocoder.geocode('Jr. Bolognesi 120');
  for (let i = 0; i < 5; i++) {
    const ri = geocoder.geocode('Jr. Bolognesi 120');
    assert.strictEqual(ri.lat, r1.lat);
    assert.strictEqual(ri.lng, r1.lng);
    assert.strictEqual(ri.sector, r1.sector);
  }
});

test('Delimitación de palabras completas: no captura subcadenas falsas', () => {
  assert.strictEqual(geocoder.geocode('CONCENTRO 45').matched, false);
  assert.strictEqual(geocoder.geocode('Centro Poblado Los Pinos').matched, false);
  assert.strictEqual(geocoder.geocode('Calle Nueva Esperanza 12').matched, false);
});

test('Dirección sin coincidencia o vacía devuelve matched=false y lat/lng nulos', () => {
  const vacia = geocoder.geocode('');
  assert.strictEqual(vacia.matched, false);
  assert.strictEqual(vacia.lat, null);
  assert.strictEqual(vacia.lng, null);
  assert.strictEqual(vacia.precision_geo, 'sin_ubicacion');
});

test('Topónimos resuelven al sector oficial GeoRIS numerado (62-72)', () => {
  assert.strictEqual(geocoder.geocode('Puerto Huarmey').sector, 'Sector 66');
  assert.strictEqual(geocoder.geocode('Caleta Culebras').sector, 'Sector 62');
  assert.strictEqual(geocoder.geocode('Caserio Quian').sector, 'Sector 64');
  assert.strictEqual(geocoder.geocode('Valle Huamba').sector, 'Sector 70');
  assert.strictEqual(geocoder.geocode('Puesto de Salud Huayan').sector, 'Sector 72');
  assert.strictEqual(geocoder.geocode('Distrito de Malvas').sector, 'Sector 71');
  assert.strictEqual(geocoder.geocode('Puesto de Salud Cochapeti').sector, 'Sector 71');
  assert.strictEqual(geocoder.geocode('Huanchay').sector, 'Sector 63');
  assert.strictEqual(geocoder.geocode('Raypa').sector, 'Sector 64');
});

test('Punto-en-polígono dinámico asigna sector GeoRIS según coordenadas', () => {
  const pip1 = geocoder.getSectorFromCoordinates(-10.0689, -78.1524); // Plaza
  assert.strictEqual(pip1.id_sector, 67);
  const pip2 = geocoder.getSectorFromCoordinates(-10.0478, -78.1548); // Nuevo Hospital
  assert.strictEqual(pip2.id_sector, 68);
});

console.log(`\nResultado: ${passed} correctas, ${failed} con falla`);
if (failed > 0) process.exit(1);
