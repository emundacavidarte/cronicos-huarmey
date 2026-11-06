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

test('Los 12 establecimientos (salvo el Nuevo Hospital) coinciden con GeoRIS (<= 1,5 m)', () => {
  for (const e of db.getEstablishments()) {
    if (e.cod_renipress === '00001741') continue;
    const g = georisMap.get(e.cod_renipress);
    assert.ok(g, `Establecimiento ${e.cod_renipress} existe en GeoRIS`);
    const d = hav(e.latitud, e.longitud, g.lat, g.lng);
    assert.ok(d <= 1.5, `Distancia en ${e.nombre} (${e.cod_renipress}) debe ser <= 1,5 m (fue ${d.toFixed(2)} m)`);
    assert.strictEqual(e.fuente_coordenadas, 'GeoRIS MINSA');
  }
});

test('El bundle GeoRIS no fue alterado salvo el punto del hospital (geometría = campos este/norte)', () => {
  const alterados = [];
  for (const layer of ['eessArea', 'eessZona', 'eessPuertas', 'eessVinculados']) {
    for (const f of bundle[layer].features) {
      const p = f.properties;
      if (p.este == null || p.norte == null) continue;
      if (hav(f.geometry.coordinates[1], f.geometry.coordinates[0], p.norte, p.este) > 5) alterados.push(String(p.cod_reni));
    }
  }
  assert.deepStrictEqual([...new Set(alterados)], ['00001741']);
});

test('Hospital 00001741 apunta al Nuevo Hospital (-10.04780, -78.15480)', () => {
  const hosp = db.getEstablishmentByCode('00001741');
  assert.strictEqual(hosp.latitud, -10.04780);
  assert.strictEqual(hosp.longitud, -78.15480);
});

test('El Nuevo Hospital declara que su coordenada es manual y conserva la oficial de GeoRIS (local antiguo)', () => {
  const hosp = estModule.getByCode('00001741');
  assert.ok(/MANUAL/.test(hosp.fuente_coordenadas));
  const f = bundle.eessArea.features.find(x => String(x.properties.cod_reni) === '00001741');
  assert.strictEqual(hosp.coordenadas_georis_oficial.latitud, f.properties.norte);
  assert.strictEqual(hosp.coordenadas_georis_oficial.longitud, f.properties.este);
  const d = hav(hosp.latitud, hosp.longitud, f.properties.norte, f.properties.este);
  assert.ok(d > 2000 && d < 2500, `traslado de ~2 km respecto del local antiguo (fue ${d.toFixed(0)} m)`);
});

test('Rol GeoRIS real: los vinculados declaran su puerta de entrada GeoRIS', () => {
  for (const layer of ['eessVinculados']) {
    for (const f of bundle[layer].features) {
      const e = estModule.getByCode(String(f.properties.cod_reni));
      if (!e || e.id_zona !== 6 || e.id_ris !== 156) continue;
      assert.ok(/Vinculado/.test(e.rol_georis), `${e.nombre} es vinculado en GeoRIS`);
      assert.strictEqual(e.puerta_entrada_georis, String(f.properties.cod_p_en));
    }
  }
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

test('Calles con nombre de ciudad no se mandan a esa ciudad («Jr. Huaraz», «Av. Casma», «Pje. Culebras»)', () => {
  for (const a of ['Av Casma 230', 'Jr Huaraz 145', 'Jr Chimbote 12', 'Pasaje Culebras 4', 'Calle Malvas 12', 'Jr Huanchay 45']) {
    const r = geocoder.geocode(a);
    assert.notStrictEqual(r.precision_geo, 'localidad', `${a} no debe ubicarse en la localidad homónima`);
  }
  // Las que sí existen en el catastro de Huarmey se ubican sobre su calle
  const jr = geocoder.geocode('Jr. Casma 230');
  assert.strictEqual(jr.matched, true);
  assert.ok(Math.abs(jr.lat - (-10.069)) < 0.01 && Math.abs(jr.lng - (-78.15)) < 0.01, 'Jr. Casma queda en Huarmey');
});

test('Una dirección que nombra otra ciudad no se queda en Huarmey', () => {
  assert.strictEqual(geocoder.geocode('Urb Buenos Aires Chimbote').es_puerta_id, '00001652');
  assert.strictEqual(geocoder.geocode('Jr Belen 20, Casma').es_puerta_id, '00001719');
  assert.strictEqual(geocoder.geocode('Buenos Aires, Nuevo Chimbote').es_puerta_id, '00001704');
  // …salvo que diga Huarmey
  assert.strictEqual(geocoder.geocode('Jr Casma 120 Huarmey').ambito, 'urbano');
});

test('Chimbote (RIS Pacífico Norte) ya no se confunde con Nuevo Chimbote (Pacífico Sur)', () => {
  assert.strictEqual(geocoder.geocode('Chimbote').es_puerta_id, '00001652');
  assert.strictEqual(geocoder.geocode('Nuevo Chimbote').es_puerta_id, '00001704');
});

test('Calle del catastro: el pin queda sobre la línea de la calle (≤ 5 m)', () => {
  const idx = require('../../client/js/map/huarmeyCallesIndex');
  const bol = idx.calles.find(c => c.nombre === 'Calle Francisco Bolognesi').tramos;
  const r = geocoder.geocode('Jr. Bolognesi 120');
  let best = Infinity;
  for (const tr of bol) for (let i = 0; i < tr.length - 1; i++) for (let k = 0; k <= 50; k++) {
    const f = k / 50;
    best = Math.min(best, hav(r.lat, r.lng, tr[i][0] + (tr[i + 1][0] - tr[i][0]) * f, tr[i][1] + (tr[i + 1][1] - tr[i][1]) * f));
  }
  assert.ok(best <= 5, `distancia a la línea de Bolognesi: ${best.toFixed(1)} m`);
  assert.strictEqual(r.fuente_geo, 'catastro_osm');
});

test('Número de puerta → cuadra: avanza ~100 m por cuadra y en un solo sentido', () => {
  const c1 = geocoder.geocode('Jr. Bolognesi 120');
  const c2 = geocoder.geocode('Jr. Bolognesi 250');
  const c3 = geocoder.geocode('Jr. Bolognesi 330');
  assert.strictEqual(c1.precision_geo, 'cuadra');
  assert.deepStrictEqual([c1.cuadra, c2.cuadra, c3.cuadra], [1, 2, 3]);
  const d12 = hav(c1.lat, c1.lng, c2.lat, c2.lng), d13 = hav(c1.lat, c1.lng, c3.lat, c3.lng);
  assert.ok(d12 > 70 && d12 < 130, `cuadra 1→2: ${d12.toFixed(0)} m`);
  assert.ok(d13 > d12, 'la cuadra 3 está más lejos que la 2');
  // Mismo número = mismo punto; «28 de Julio» no se toma como número de puerta
  assert.deepStrictEqual([geocoder.geocode('Jr. Bolognesi 199').lat], [c1.lat]);
  assert.strictEqual(geocoder.geocode('Jr 28 de Julio').precision_geo, 'calle');
  assert.strictEqual(geocoder.geocode('Jr. Bolognesi Mz A Lt 5').precision_geo, 'calle');
});

test('Sector declarado del padrón como contexto de la dirección', () => {
  const g1 = geocoder.geocodeConSector('Calle Grau 120', 'Puerto Huarmey');
  assert.strictEqual(g1.sector, 'Sector 66');
  const g2 = geocoder.geocodeConSector('Mz B Lt 4', 'Sector II – La Victoria');
  assert.strictEqual(g2.precision_geo, 'sector');
  const g3 = geocoder.geocodeConSector('Jr Bolognesi 120', 'Sector I – Centro');
  assert.strictEqual(g3.precision_geo, 'cuadra');
  const g4 = geocoder.geocodeConSector('Calle Los Olivos 4', 'Otro distrito (se anota cuál en la dirección)');
  assert.strictEqual(g4.matched, false);
});

test('Validación de coordenadas: fuera de Áncash, intercambiadas o no numéricas se rechazan', () => {
  assert.strictEqual(geocoder.validarCoordenadas(-10.05, -78.15).ok, true);
  assert.strictEqual(geocoder.validarCoordenadas(-78.15, -10.05).motivo, 'intercambiadas');
  assert.strictEqual(geocoder.validarCoordenadas(-12.05, -77.04).motivo, 'fuera_de_ancash');
  assert.strictEqual(geocoder.validarCoordenadas('abc', -78.1).motivo, 'no_numericas');
  assert.strictEqual(geocoder.validarCoordenadas(0, 0).ok, false);
});

test('El geocodificador en Node no crea global.window (no contamina el servidor)', () => {
  // Esta suite sí crea global.window para cargar el bundle; se comprueba en un proceso limpio
  const { execFileSync } = require('child_process');
  const out = execFileSync(process.execPath, ['-e', "const g=require(process.argv[1]);g.getSectorFromCoordinates(-10.0689,-78.1524);console.log(typeof window)", require.resolve('../../client/js/map/ancashGeocoder')]).toString().trim();
  assert.strictEqual(out, 'undefined');
});

test('Punto-en-polígono dinámico asigna sector GeoRIS según coordenadas', () => {
  const pip1 = geocoder.getSectorFromCoordinates(-10.0689, -78.1524); // Plaza
  assert.strictEqual(pip1.id_sector, 67);
  const pip2 = geocoder.getSectorFromCoordinates(-10.0478, -78.1548); // Nuevo Hospital
  assert.strictEqual(pip2.id_sector, 68);
});

console.log(`\nResultado: ${passed} correctas, ${failed} con falla`);
if (failed > 0) process.exit(1);
