/**
 * testGeoServidor.js
 * G-03 y G-04 (auditoría de geolocalización, 06/11/2026), con datos INVENTADOS:
 *  - el servidor geocodifica al ingresar pacientes (no solo el navegador);
 *  - no inventa sector ni ubicación; un paciente sin ubicación queda marcado;
 *  - valida coordenadas (Áncash, intercambiadas, no numéricas);
 *  - una ubicación aproximada no pisa una del origen o exacta;
 *  - /api/patients/geo y /api/alerts/summary informan cuántos están sin ubicar.
 * Ejecutar: node server/tests/testGeoServidor.js
 */

const assert = require('assert');
const { db, resetDb, closeDb } = require('./helpers/memoryDb');
const fhirAdapter = require('../fhir/fhirAdapter');
const hosixConnector = require('../fhir/connectors/hosixConnector');
const { startServer } = require('./helpers/realServer');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { resetDb(); fn(); passed++; console.log('  OK    ' + name); }
  catch (e) { failed++; console.log('  FALLA ' + name + '\n        ' + e.message); }
}
async function step(name, fn) {
  try { await fn(); passed++; console.log('  OK    ' + name); }
  catch (e) { failed++; console.log('  FALLA ' + name + '\n        ' + e.message); }
}

function ingestHosix(rec) {
  const parsed = fhirAdapter.processBundle(hosixConnector.transformToFhir(rec));
  parsed.patients.forEach(p => db.upsertPatient(p));
}

console.log('G-03: geocodificación en el servidor');

test('Paciente nuevo por HOSIX con «Jr. Bolognesi 120» queda con coordenadas, sector GeoRIS y precisión', () => {
  ingestHosix({ NRO_DOCUMENTO: '91000001', APELLIDOS_NOMBRES: 'PACIENTE INVENTADO UNO', DIRECCION: 'Jr. Bolognesi 120' });
  const p = db.getPatientByDni('91000001');
  assert.ok(typeof p.latitud === 'number' && typeof p.longitud === 'number', 'tiene coordenadas');
  assert.strictEqual(p.precision_geo, 'cuadra');
  assert.strictEqual(p.geo_fuente, 'geocodificador');
  assert.strictEqual(p.sector_georis, 'Sector 67');
  assert.strictEqual(p.sector_sanitario, 'Sector 67', 'sin sector declarado se usa el GeoRIS calculado, no «Sector 01»');
});

test('Paciente nuevo con dirección no reconocida queda SIN UBICACIÓN (no en la plaza)', () => {
  db.upsertPatient({ dni: '91000002', direccion: 'Pje Primavera s/n' });
  const p = db.getPatientByDni('91000002');
  assert.strictEqual(p.latitud, null);
  assert.strictEqual(p.longitud, null);
  assert.strictEqual(p.precision_geo, 'sin_ubicacion');
  assert.strictEqual(p.sector_sanitario, null);
});

test('El sector declarado del padrón se usa como contexto («Calle Grau 120» + «Puerto Huarmey»)', () => {
  db.upsertPatient({ dni: '91000003', direccion: 'Calle Grau 120', sector: 'Puerto Huarmey' });
  const p = db.getPatientByDni('91000003');
  assert.strictEqual(p.sector_georis, 'Sector 66');
});

test('Coordenadas del origen válidas se respetan (precisión «origen»)', () => {
  db.upsertPatient({ dni: '91000004', direccion: 'Jr. Bolognesi 120', latitud: -10.0700, longitud: -78.1530 });
  const p = db.getPatientByDni('91000004');
  assert.strictEqual(p.latitud, -10.07);
  assert.strictEqual(p.precision_geo, 'origen');
});

test('Coordenadas del origen NO se pisan al actualizar sin coordenadas ni con una aproximación de la misma dirección', () => {
  db.upsertPatient({ dni: '91000005', direccion: 'Jr. Bolognesi 120', latitud: -10.0701, longitud: -78.1531, precision_geo: 'exacta', geo_fuente: 'mapa_manual' });
  db.upsertPatient({ dni: '91000005', telefono: '999000111' });
  db.upsertPatient({ dni: '91000005', direccion: 'Jr. Bolognesi 120', latitud: -10.0666, longitud: -78.1533, precision_geo: 'calle', geo_fuente: 'geocodificador' });
  const p = db.getPatientByDni('91000005');
  assert.strictEqual(p.latitud, -10.0701);
  assert.strictEqual(p.precision_geo, 'exacta');
});

test('Si la dirección cambia y las coordenadas eran del geocodificador, se vuelve a geocodificar', () => {
  db.upsertPatient({ dni: '91000006', direccion: 'Jr. Bolognesi 120' });
  const antes = db.getPatientByDni('91000006');
  db.upsertPatient({ dni: '91000006', direccion: 'Caleta Culebras' });
  const p = db.getPatientByDni('91000006');
  assert.notStrictEqual(p.latitud, antes.latitud);
  assert.strictEqual(p.sector_georis, 'Sector 62');
  db.upsertPatient({ dni: '91000006', direccion: 'Pje Inexistente 9' });
  const q = db.getPatientByDni('91000006');
  assert.strictEqual(q.latitud, null, 'la ubicación de la dirección anterior no se conserva');
  assert.strictEqual(q.precision_geo, 'sin_ubicacion');
});

console.log('G-04: validación de coordenadas');

test('Coordenadas intercambiadas se rechazan y se usa la dirección', () => {
  db.upsertPatient({ dni: '91000007', direccion: 'Jr. Bolognesi 120', latitud: -78.153, longitud: -10.07 });
  const p = db.getPatientByDni('91000007');
  assert.ok(p.latitud > -10.1 && p.latitud < -10.0, 'latitud de Huarmey');
  assert.strictEqual(p.geo_alerta, 'coordenadas_rechazadas:intercambiadas');
  assert.strictEqual(p.precision_geo, 'cuadra');
});

test('Coordenadas fuera de Áncash (Lima) sin dirección reconocible → sin ubicación', () => {
  db.upsertPatient({ dni: '91000008', direccion: 'Calle Desconocida 1', latitud: -12.05, longitud: -77.04 });
  const p = db.getPatientByDni('91000008');
  assert.strictEqual(p.latitud, null);
  assert.strictEqual(p.geo_alerta, 'coordenadas_rechazadas:fuera_de_ancash');
});

test('Coordenadas inválidas ya guardadas (datos anteriores) se muestran SIN UBICACIÓN al leer', () => {
  db.data.patients.push({ id: 'pac-x-91000009', dni: '91000009', latitud: 0, longitud: 0 });
  db.rebuildIndexes();
  db.invalidateCache();
  const p = db.getAllPatients().find(x => x.dni === '91000009');
  assert.strictEqual(p.latitud, null);
  assert.strictEqual(p.precision_geo, 'sin_ubicacion');
});

test('La salida FHIR no emite geolocalización null ni «Sector 01 - Centro Urbano»', () => {
  db.upsertPatient({ dni: '91000010', direccion: 'Pje Primavera s/n' });
  const b = fhirAdapter.toFhirBundle(db.getPatientByDni('91000010'));
  const pat = b.entry.find(e => e.resource.resourceType === 'Patient').resource;
  const txt = JSON.stringify(pat);
  assert.ok(!txt.includes('Sector 01'), 'sin sector inventado');
  assert.ok(!/"valueDecimal":null/.test(txt), 'sin coordenadas null');
});

closeDb();

(async () => {
  console.log('G-04: la API informa cuántos pacientes están sin ubicar (servidor real, puerto 3111)');
  let srv;
  try {
    srv = await startServer({
      port: 3111,
      env: { ADMIN_USER: 'admin', ADMIN_PASSWORD: 'clave-admin-de-prueba-1', ADMIN_RESET: '', NODE_ENV: 'test', AUTH_SECRET: 'secreto-geo-de-prueba-con-mas-de-32-caracteres-xx' }
    });
  } catch (e) {
    failed++;
    console.log('  FALLA no arrancó el servidor: ' + e.message);
  }
  if (srv) {
    const call = async (method, url, token, body) => {
      const h = {};
      if (token) h.Authorization = 'Bearer ' + token;
      if (body !== undefined) h['Content-Type'] = 'application/json';
      const r = await fetch(srv.base + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, json: await r.json().catch(() => null) };
    };
    try {
      const token = (await call('POST', '/api/auth/login', null, { username: 'admin', password: 'clave-admin-de-prueba-1' })).json.token;
      await step('Ingesta por lote: uno ubicable y otro no; /api/patients/geo y /api/alerts/summary los cuentan', async () => {
        const antes = (await call('GET', '/api/patients/geo', token)).json.resumen_geo;
        const r = await call('POST', '/api/padron/importar-lote', token, { patients: [
          { id: 'pac-geo-1', dni: '92000001', apellidos_nombres: 'PACIENTE INVENTADO GEO UNO', direccion: 'Av. Grau 450' },
          { id: 'pac-geo-2', dni: '92000002', apellidos_nombres: 'PACIENTE INVENTADO GEO DOS', direccion: 'Pje Primavera s/n' }
        ] });
        assert.strictEqual(r.status, 200, JSON.stringify(r.json));
        const geo = (await call('GET', '/api/patients/geo', token)).json;
        assert.strictEqual(geo.resumen_geo.sin_ubicacion, antes.sin_ubicacion + 1);
        assert.strictEqual(geo.resumen_geo.ubicados, antes.ubicados + 1);
        const f = geo.features.find(x => x.properties.id === 'pac-geo-1');
        assert.ok(f, 'el ubicable tiene pin');
        assert.strictEqual(f.properties.precision_geo, 'cuadra');
        assert.ok(!geo.features.some(x => x.properties.id === 'pac-geo-2'), 'el no ubicable no tiene pin falso');
        const sum = (await call('GET', '/api/alerts/summary', token)).json;
        assert.strictEqual(sum.geo.sin_ubicacion, geo.resumen_geo.sin_ubicacion);
      });
    } finally {
      await srv.stop();
    }
  }
  console.log('\nResultado Geolocalización servidor: ' + passed + ' correctas, ' + failed + ' con falla');
  process.exit(failed === 0 ? 0 : 1);
})();
