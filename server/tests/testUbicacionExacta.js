/**
 * testUbicacionExacta.js
 * Geolocalización exacta del paciente y capas GeoRIS (auditoría adversarial del 05/11/2026):
 *  G-03 Reglas de coordenadas (texto, coma decimal, grados, enlaces de mapas, invertidas, 0/0, fuera del Perú).
 *  G-04 Geocodificador: sin desplazamientos inventados, calles con nombre de ciudad, localidad primero,
 *       vías largas con kilómetro, topónimos sobre el trazo del catastro y con el sector de su polígono.
 *  G-05 Pacientes semilla: coordenadas en tierra, sector = polígono GeoRIS, cerca de su topónimo.
 *  G-06 Base de datos: ubicación exacta (GPS/mapa/coordenadas) protegida frente a reimportaciones,
 *       mudanzas, coordenadas basura, geocodificación en el servidor.
 *  G-07 HTTP: PUT /api/patients/:id/ubicacion con permisos y alcance; FHIR sin geolocation nula; sector por palabras.
 * Servidor real en el puerto 3109 (sin tocar store.json). Pacientes y usuarios inventados.
 * Ejecutar: node server/tests/testUbicacionExacta.js
 */

const assert = require('assert');

// La semilla (20 pacientes SINTÉTICOS) se lee antes de cargar la base en memoria, que bloquea ese archivo
const padron = require('../db/padron_inicial');
const hosix = require('../../client/js/data/hosixParser.js'); // se carga antes: memoryDb bloquea client/js/data
const { db, resetDb } = require('./helpers/memoryDb');
const { startServer } = require('./helpers/realServer');
const G = require('../../client/js/map/geoUbicacion');
const geocoder = require('../../client/js/map/ancashGeocoder');
const est = require('../../client/js/map/establecimientos');
const scope = require('../auth/scope');

global.window = global.window || {};
require('../../client/data/georis/georisDataBundle.js');
require('../../client/data/georis/huarmeyCadastreBundle.js');
const bundle = global.window.GEORIS_DATA_BUNDLE;
const catastro = global.window.HUARMEY_CADASTRE;

const PORT = 3109;
const ADMIN_PASS = 'clave-admin-ubicacion-1';
const DNI_SYSTEM = 'urn:oid:2.16.840.1.113883.4.904';
let passed = 0;
let failed = 0;
let BASE = '';

async function step(name, fn) {
  try { await fn(); passed++; console.log('  OK    ' + name); }
  catch (e) { failed++; console.log('  FALLA ' + name + '\n        ' + e.message); }
}

const inRing = (x, y, r) => {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins;
  }
  return ins;
};
const { GeorisTerritory } = require('../../client/js/map/georisAncashLayers.js');
GeorisTerritory.bundle = bundle;
const polysDe = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const enGeom = (lng, lat, g) => polysDe(g).some(p => inRing(lng, lat, p[0]) && !p.slice(1).some(h => inRing(lng, lat, h)));
const enZona = (lat, lng) => !!GeorisTerritory.zonaQueContiene(lat, lng);
const kx = Math.cos(10.06 * Math.PI / 180) * 111320, ky = 110574;
function distSeg(p, a, b) {
  const ax = a[0] * kx, ay = a[1] * ky, bx = b[0] * kx, by = b[1] * ky, px = p[0] * kx, py = p[1] * ky;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function distanciaACalle(lat, lng) {
  let best = { d: Infinity, name: null };
  for (const f of catastro.features) {
    if (f.properties.type !== 'highway' || !f.properties.name) continue;
    const l = f.geometry.coordinates;
    for (let i = 0; i < l.length - 1; i++) {
      const d = distSeg([lng, lat], l[i], l[i + 1]);
      if (d < best.d) best = { d, name: f.properties.name };
    }
  }
  return best;
}

async function unitarias() {
  console.log('G-03: reglas de coordenadas');
  await step('formatos aceptados: decimales con punto o coma, grados, enlaces de Google Maps / WhatsApp', async () => {
    const casos = ['-10.04780, -78.15480', '-10,04780; -78,15480', '-10,04780 -78,15480', `10°02'52.1"S 78°09'17.3"W`,
      'https://maps.google.com/?q=-10.047800,-78.154800', 'https://www.google.com/maps/@-10.0478,-78.1548,17z', '−10.0478, −78.1548'];
    for (const c of casos) {
      const r = G.interpretarTexto(c);
      assert.ok(r.ok, c + ' → ' + r.error);
      assert.ok(Math.abs(r.lat + 10.0478) < 1e-4 && Math.abs(r.lng + 78.1548) < 1e-4, c + ' → ' + r.lat + ',' + r.lng);
    }
  });
  await step('enlaces de mapas: pin de un lugar (!3d!4d) antes que el centro de la vista, %2C codificado y geo:', async () => {
    const pin = G.interpretarTexto('https://www.google.com/maps/place/X/@-10.06,-78.13,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-10.0789!4d-78.1512');
    assert.ok(pin.ok && pin.lat === -10.0789 && pin.lng === -78.1512, JSON.stringify(pin));
    assert.strictEqual(G.interpretarTexto('https://maps.google.com/?q=-10.0478%2C-78.1548').lat, -10.0478);
    assert.strictEqual(G.interpretarTexto('geo:-10.0478,-78.1548?z=17').lng, -78.1548);
  });
  await step('un GPS de más de 50 m no es una ubicación exacta', async () => {
    assert.strictEqual(G.ubicacionEsExacta({ latitud: -10.05, longitud: -78.15, precision_geo: 'gps', precision_m: 3000 }), false);
    assert.strictEqual(G.ubicacionEsExacta({ latitud: -10.05, longitud: -78.15, precision_geo: 'gps', precision_m: 12 }), true);
    assert.strictEqual(G.describirPrecision({ latitud: -10.05, longitud: -78.15, precision_geo: 'gps', precision_m: 3000 }).exacta, false);
  });
  await step('latitud y longitud invertidas se corrigen y se avisa; 0/0, texto y fuera del Perú se rechazan', async () => {
    const inv = G.validarCoordenadas(-78.1548, -10.0478);
    assert.ok(inv.ok && inv.invertidas && inv.lat === -10.0478 && inv.lng === -78.1548);
    for (const [a, b] of [[0, 0], ['abc', -78], [40.7, -74], [null, -78.15], [-10.05, undefined], [NaN, -78], [{}, []], [999, -999]]) {
      assert.strictEqual(G.validarCoordenadas(a, b).ok, false, JSON.stringify([a, b]));
    }
    assert.strictEqual(G.validarCoordenadas('-10,0689', '-78,1524').lat, -10.0689);
  });
  await step('precisión: exactas (gps, mapa, manual) frente a aproximadas (calle, sector, localidad)', async () => {
    assert.deepStrictEqual(G.PRECISIONES_EXACTAS, ['gps', 'mapa', 'manual']);
    assert.strictEqual(G.describirPrecision({ latitud: -10.05, longitud: -78.15, precision_geo: 'gps', precision_m: 6.4 }).etiqueta, 'Exacta por GPS (±6 m)');
    assert.strictEqual(G.describirPrecision({ latitud: -10.05, longitud: -78.15 }).clave, 'no_verificada');
    assert.strictEqual(G.describirPrecision({ latitud: null, longitud: null }).clave, 'sin_ubicacion');
  });

  console.log('G-04: geocodificador');
  await step('sin desplazamientos inventados: distintos números de la misma calle dan el mismo punto y sector', async () => {
    const pts = ['Jr. Bolognesi 120', 'Jr. Bolognesi 640', 'JIRON BOLOGNESI N° 9'].map(a => geocoder.geocode(a));
    assert.ok(pts.every(p => p.lat === pts[0].lat && p.lng === pts[0].lng && p.sector === pts[0].sector), JSON.stringify(pts));
    const av = ['Av. Garcilaso de la Vega 1', 'Av. Garcilaso de la Vega 999'].map(a => geocoder.geocode(a).sector);
    assert.strictEqual(av[0], av[1]);
  });
  await step('calles con nombre de ciudad son calles de Huarmey, no Casma, Huaraz ni Chimbote', async () => {
    for (const a of ['Jirón Casma 123', 'Psje. Casma 12', 'PJE CASMA 8', 'Av. Casma 300', 'Jr. Casma 180 - Huarmey']) {
      const r = geocoder.geocode(a);
      assert.ok(r.matched && r.localidad === 'HUARMEY' && r.lat > -10.08 && r.lat < -10.06, a + ' → ' + JSON.stringify(r));
    }
    for (const a of ['Jr. Huaraz 450', 'Av. Chimbote 210', 'CASMA 230 HUARMEY', 'Prolongación Casma 140']) {
      const r = geocoder.geocode(a);
      assert.ok(!r.matched || r.localidad === 'HUARMEY', a + ' → ' + JSON.stringify(r));
    }
    assert.strictEqual(geocoder.geocode('Casma').localidad, 'CASMA');
    // El parser de HOSIX no asigna como puerta de entrada un establecimiento ajeno a la microrred
    global.window.EstablecimientosHuarmey = est;
    global.window.AncashGeocoder = geocoder;
    const proc = hosix.processRecords([{ NRO_DOCUMENTO: '93000001', DIRECCION: 'Ciudad de Casma' }]);
    assert.strictEqual(proc[0].puerta_entrada_id, '00001741', 'puerta ajena asignada: ' + proc[0].puerta_entrada_id);
    assert.strictEqual(proc[0].precision_geo, 'localidad');
  });
  await step('primero la localidad: calles homónimas del Puerto o de Culebras no van al casco urbano', async () => {
    for (const a of ['Calle Bolognesi 230 Puerto Huarmey', 'Jr. 28 de Julio 150 Pto. Huarmey', 'Jr. Garcilaso de la Vega 12, Puerto Huarmey']) {
      assert.strictEqual(geocoder.geocode(a).localidad, 'PUERTO HUARMEY', a);
    }
    for (const a of ['Jr. Castilla 10 Culebras', 'Jr. Grau s/n Culebras', 'Panamericana Norte Km 312 Culebras']) {
      assert.strictEqual(geocoder.geocode(a).localidad, 'CULEBRAS', a);
    }
  });
  await step('Panamericana con kilómetro no se ubica en un punto inventado', async () => {
    assert.strictEqual(geocoder.geocode('Panamericana Norte Km 293').matched, false);
    assert.strictEqual(geocoder.geocode('Panamericana Norte s/n').precision_geo, 'sector');
  });
  await step('abreviaturas: Sto. Domingo Ampl., 1ro de Mayo, Jirón Dos de Mayo, AA.HH.', async () => {
    assert.strictEqual(geocoder.geocode('Sto. Domingo Ampliación Mz P Lt 1').sector, 'Sector 68');
    assert.strictEqual(geocoder.geocode('Santo Domingo Ampl. Mz P').sector, 'Sector 68');
    assert.strictEqual(geocoder.geocode('1ro de Mayo 230').toponym, '1 DE MAYO');
    assert.strictEqual(geocoder.geocode('Jirón Dos de Mayo 400').toponym, 'JR 2 DE MAYO');
    assert.strictEqual(geocoder.geocode('AA.HH. Miramar Mz F').toponym, 'AH MIRAMAR');
  });
  await step('cada topónimo declara el sector de su polígono GeoRIS y está en Áncash', async () => {
    for (const t of geocoder.HUARMEY_TOPONYMS) {
      const s = geocoder.getSectorFromCoordinates(t.lat, t.lng);
      if (s) assert.strictEqual(t.sector, `Sector ${s.id_sector}`, t.keywords[0]);
      assert.ok(enZona(t.lat, t.lng), t.keywords[0] + ' fuera de las zonas sanitarias');
    }
  });
  await step('los topónimos de vías del catastro están sobre el trazo de su vía (≤ 30 m)', async () => {
    const pares = [['JR 28 DE JULIO', 'Jirón 28 de Julio'], ['CALLE MIGUEL GRAU', 'Calle MIguel Grau'], ['JR 2 DE MAYO', 'Jirón 2 de Mayo'],
      ['AV GARCILASO DE LA VEGA', 'Avenida Garcilaso de la Vega'], ['CALLE FRANCISCO BOLOGNESI', 'Calle Francisco Bolognesi'], ['AV AIJA', 'Avenida Aija'],
      ['JR CASMA', 'Jirón Casma'], ['PSJ CASMA', 'Pasaje Casma'], ['JR IQUITOS', 'Jirón Iquitos'], ['CALLE ERNESTO REYNA', 'Calle Ernesto Reyna']];
    for (const [kw, calle] of pares) {
      const t = geocoder.HUARMEY_TOPONYMS.find(x => x.keywords.includes(kw));
      assert.ok(t, kw);
      let d = Infinity;
      for (const f of catastro.features) {
        if (f.properties.name !== calle) continue;
        const l = f.geometry.coordinates;
        for (let i = 0; i < l.length - 1; i++) d = Math.min(d, distSeg([t.lng, t.lat], l[i], l[i + 1]));
      }
      assert.ok(d <= 30, `${kw}: ${Math.round(d)} m de ${calle}`);
    }
  });
  await step('puerta de entrada: la IPRESS oficial del sector o el puesto de la localidad (catálogo de la red)', async () => {
    assert.strictEqual(geocoder.geocode('Jr. Grau 5').es_puerta_id, '00001744');
    assert.strictEqual(geocoder.geocode('Caserío El Molino').es_puerta_id, '00001745');
    assert.strictEqual(geocoder.geocode('Puerto Huarmey').es_puerta_id, '00001742');
  });

  console.log('G-05: pacientes semilla');
  await step('los 20 pacientes semilla están en tierra, con sector = polígono GeoRIS y cerca de su topónimo', async () => {
    assert.strictEqual(padron.length, 20);
    for (const p of padron) {
      const v = G.validarCoordenadas(p.latitud, p.longitud);
      assert.ok(v.ok, p.dni + ' coordenadas inválidas');
      assert.ok(enZona(p.latitud, p.longitud), p.dni + ' fuera de las zonas sanitarias (¿en el mar?)');
      const s = geocoder.getSectorFromCoordinates(p.latitud, p.longitud);
      assert.strictEqual(p.sector_sanitario, s ? `Sector ${s.id_sector}` : 'Sin sector GeoRIS', p.dni);
      const g = geocoder.geocode(p.direccion);
      if (g.matched) {
        const d = G.distanciaMetros(p.latitud, p.longitud, g.lat, g.lng);
        const lim = g.precision_geo === 'localidad' ? 2500 : 600;
        assert.ok(d <= lim, `${p.dni} a ${Math.round(d)} m de «${g.toponym}»`);
        assert.strictEqual(p.precision_geo, g.precision_geo, p.dni + ' precisión');
      } else {
        assert.strictEqual(p.precision_geo, undefined, p.dni + ' sin topónimo no puede declarar precisión');
      }
    }
  });
  await step('ningún establecimiento ni hospital de referencia queda fuera de su zona', async () => {
    for (const e of est.getAllHuarmey()) assert.ok(enZona(e.latitud, e.longitud), e.nombre);
  });

  console.log('G-06: base de datos');
  const base = () => {
    resetDb();
    db.upsertPatient({ id: 'pac-00001741-91000001', dni: '91000001', apellidos_nombres: 'PACIENTE UBICACION', direccion: 'Jr. Bolognesi 640', puerta_entrada_id: '00001741' });
  };
  await step('paciente nuevo con solo la dirección: el servidor lo geocodifica con su precisión y sector', async () => {
    base();
    const p = db.getPatientByDni('91000001');
    assert.strictEqual(p.precision_geo, 'calle');
    assert.strictEqual(p.geo_toponimo, 'JR BOLOGNESI');
    assert.strictEqual(p.sector_sanitario, 'Sector 67');
    assert.ok(G.validarCoordenadas(p.latitud, p.longitud).ok);
  });
  await step('setPatientLocation guarda la ubicación exacta, el usuario, la fecha y el sector del polígono', async () => {
    base();
    const r = db.setPatientLocation('91000001', { latitud: -10.06993, longitud: -78.1498, precision_geo: 'mapa' }, { username: 'enfermera1' });
    assert.ok(r.ok, r.error);
    const p = db.getPatientByDni('91000001');
    assert.strictEqual(p.latitud, -10.06993);
    assert.strictEqual(p.precision_geo, 'mapa');
    assert.strictEqual(p.sector_sanitario, 'Sector 69');
    assert.strictEqual(p.geo_registrado_por, 'enfermera1');
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(p.geo_fecha));
    assert.strictEqual(p.geo_toponimo, undefined);
    assert.strictEqual(r.territorio.zona.id_zona, 6);
  });
  await step('setPatientLocation rechaza: GPS sin precisión, precisión aproximada, fuera del Perú, 0/0', async () => {
    base();
    const u = { username: 'x' };
    assert.ok(!db.setPatientLocation('91000001', { latitud: -10.06, longitud: -78.15, precision_geo: 'gps' }, u).ok);
    assert.ok(!db.setPatientLocation('91000001', { latitud: -10.06, longitud: -78.15, precision_geo: 'calle' }, u).ok);
    assert.ok(!db.setPatientLocation('91000001', { latitud: 40.7, longitud: -74, precision_geo: 'mapa' }, u).ok);
    assert.ok(!db.setPatientLocation('91000001', { latitud: 0, longitud: 0, precision_geo: 'mapa' }, u).ok);
    assert.ok(!db.setPatientLocation('91000001', { latitud: -10.06, longitud: -78.15, precision_geo: 'gps', precision_m: -3 }, u).ok);
    assert.ok(db.setPatientLocation('91000001', { latitud: -10.06, longitud: -78.15, precision_geo: 'gps', precision_m: '7,5' }, u).ok);
    assert.strictEqual(db.getPatientByDni('91000001').precision_m, 7.5);
  });
  await step('reimportar con la misma dirección (otro formato) y otras coordenadas no pisa la ubicación exacta', async () => {
    base();
    db.setPatientLocation('91000001', { latitud: -10.06993, longitud: -78.1498, precision_geo: 'gps', precision_m: 5 }, { username: 'u' });
    db.upsertPatient({ dni: '91000001', direccion: 'JIRON BOLOGNESI NRO 640 HUARMEY', latitud: -10.07, longitud: -78.16, precision_geo: 'calle', sector_sanitario: 'Sector 62' });
    const p = db.getPatientByDni('91000001');
    assert.strictEqual(p.latitud, -10.06993);
    assert.strictEqual(p.precision_geo, 'gps');
    assert.strictEqual(p.precision_m, 5);
    assert.strictEqual(p.sector_sanitario, 'Sector 69');
  });
  await step('si el paciente se mudó, vale la nueva ubicación (o ninguna, si la nueva dirección no se ubica)', async () => {
    base();
    db.setPatientLocation('91000001', { latitud: -10.06993, longitud: -78.1498, precision_geo: 'mapa' }, { username: 'u' });
    db.upsertPatient({ dni: '91000001', direccion: 'Caserío El Molino' });
    let p = db.getPatientByDni('91000001');
    assert.strictEqual(p.precision_geo, 'localidad');
    assert.strictEqual(p.sector_sanitario, 'Sector 62');
    assert.ok(Math.abs(p.latitud + 9.881821) < 1e-6);
    db.upsertPatient({ dni: '91000001', direccion: 'Calle Inexistente 99' });
    p = db.getPatientByDni('91000001');
    assert.strictEqual(p.latitud, null);
    assert.strictEqual(p.longitud, null);
    assert.strictEqual(p.precision_geo, undefined);
  });
  await step('la misma casa escrita de otra forma no borra la ubicación exacta (sin tipo de vía, Mza/Lote, referencias)', async () => {
    base();
    db.setPatientLocation('91000001', { latitud: -10.06676, longitud: -78.15358, precision_geo: 'gps', precision_m: 6 }, { username: 'u' });
    for (const dir of ['Bolognesi 640', 'Ca. Bolognesi 640', 'JR BOLOGNESI 640 (frente al mercado)', 'Jr. Bolognesi 690']) {
      db.upsertPatient({ dni: '91000001', direccion: dir });
      const p = db.getPatientByDni('91000001');
      assert.strictEqual(p.precision_geo, 'gps', dir);
      assert.strictEqual(p.latitud, -10.06676, dir);
      assert.strictEqual(p.geo_registrado_por, 'u', dir);
    }
  });
  await step('completar la dirección de un paciente que no la tenía no borra la ubicación tomada en la visita', async () => {
    resetDb();
    db.upsertPatient({ id: 'pac-00001741-91000009', dni: '91000009', apellidos_nombres: 'SIN DIRECCION' });
    db.setPatientLocation('91000009', { latitud: -10.0745, longitud: -78.147, precision_geo: 'mapa' }, { username: 'u' });
    db.upsertPatient({ dni: '91000009', direccion: 'Jr. Bolognesi 120' });
    const p = db.getPatientByDni('91000009');
    assert.strictEqual(p.precision_geo, 'mapa');
    assert.strictEqual(p.latitud, -10.0745);
  });
  await step('dirección nueva ilegible: se conserva el punto exacto marcado «por verificar»; mudanza lejana: queda historial', async () => {
    base();
    db.setPatientLocation('91000001', { latitud: -10.06676, longitud: -78.15358, precision_geo: 'mapa' }, { username: 'u' });
    db.upsertPatient({ dni: '91000001', direccion: 'Mz Q Lt 9 Sector Nuevo' });
    let p = db.getPatientByDni('91000001');
    assert.strictEqual(p.precision_geo, 'mapa');
    assert.strictEqual(p.ubicacion_por_verificar, true);
    assert.ok(G.describirPrecision(p).etiqueta.includes('verifique'));
    db.upsertPatient({ dni: '91000001', direccion: 'Ciudad de Huaraz' });
    p = db.getPatientByDni('91000001');
    assert.strictEqual(p.precision_geo, 'localidad');
    assert.strictEqual(p.sector_sanitario, 'Sin sector GeoRIS', 'Huaraz está fuera de los polígonos de sectores');
    assert.strictEqual(p.geo_anterior.precision_geo, 'mapa');
    assert.strictEqual(p.geo_anterior.latitud, -10.06676);
    assert.strictEqual(p.ubicacion_por_verificar, undefined);
  });
  await step('el sector derivado de las coordenadas se reinicia si el paciente se muda a una dirección que no se ubica', async () => {
    base();
    assert.strictEqual(db.getPatientByDni('91000001').sector_sanitario, 'Sector 67');
    db.upsertPatient({ dni: '91000001', direccion: 'Pasaje Inventado 4' });
    const p = db.getPatientByDni('91000001');
    assert.strictEqual(p.latitud, null);
    assert.strictEqual(p.sector_sanitario, 'Sin sector asignado');
  });
  await step('setPatientLocation rechaza un GPS de más de 50 m', async () => {
    base();
    const r = db.setPatientLocation('91000001', { latitud: -10.06, longitud: -78.15, precision_geo: 'gps', precision_m: 3000 }, { username: 'u' });
    assert.ok(!r.ok && /insuficiente/.test(r.error), r.error);
  });
  await step('ids con caracteres peligrosos se sanean al guardar (no llegan a los botones de la pantalla)', async () => {
    resetDb();
    db.upsertPatient({ id: "x');window.__xss=1;//", dni: '91000010', direccion: 'Jr. Bolognesi 1' });
    const p = db.getPatientByDni('91000010');
    assert.ok(/^[A-Za-z0-9._-]+$/.test(p.id), p.id);
    db.upsertCondition({ patient_id: "x');window.__xss=1;//", cie10_cod: 'I10' });
    assert.ok(db.getPatientByIdOrDni(p.id).conditions.some(c => c.cie10_cod === 'I10'), 'la condición quedó huérfana');
  });
  await step('un lote no puede declararse «gps» ni traer usuario/fecha de registro de la ubicación', async () => {
    resetDb();
    db.upsertPatient({ dni: '91000002', direccion: 'X', latitud: -10.065, longitud: -78.15, precision_geo: 'gps', precision_m: 3, geo_registrado_por: 'falso', geo_fecha: '2020-01-01' });
    const p = db.getPatientByDni('91000002');
    assert.strictEqual(p.precision_geo, undefined);
    assert.strictEqual(p.geo_registrado_por, undefined);
    assert.strictEqual(p.geo_fecha, undefined);
    assert.strictEqual(p.latitud, -10.065);
  });
  await step('coordenadas basura no se guardan ni pisan una buena; invertidas se corrigen; coma decimal se acepta', async () => {
    base();
    const antes = db.getPatientByDni('91000001');
    for (const [la, lo] of [['abc', -78], [0, 0], [999, -999], [{}, []], [true, false], [-10.05, null]]) {
      db.upsertPatient({ dni: '91000001', latitud: la, longitud: lo });
      const p = db.getPatientByDni('91000001');
      assert.strictEqual(p.latitud, antes.latitud, JSON.stringify([la, lo]));
      assert.strictEqual(p.longitud, antes.longitud, JSON.stringify([la, lo]));
    }
    db.upsertPatient({ dni: '91000003', latitud: -78.1534, longitud: -10.0912 });
    assert.strictEqual(db.getPatientByDni('91000003').latitud, -10.0912);
    db.upsertPatient({ dni: '91000004', latitud: '-10,0689', longitud: '-78,1524' });
    assert.strictEqual(db.getPatientByDni('91000004').longitud, -78.1524);
    assert.strictEqual(db.getPatientByDni('91000004').sector_sanitario, 'Sector 67');
  });

  console.log('G-08: capas GeoRIS (integridad del bundle oficial)');
  await step('conteos y poblaciones: RIS = Σ zonas, zona = Σ sectores (Pacífico Sur), sectores 1-72 completos', async () => {
    for (const r of bundle.ris.features) {
      const p = r.properties;
      const zs = bundle.zonas.features.filter(z => z.properties.id_ris === p.id_ris);
      assert.strictEqual(zs.length, p.n_zona, `RIS ${p.id_ris} zonas`);
      assert.strictEqual(zs.reduce((a, z) => a + z.properties.pob_t, 0), p.pob_t, `RIS ${p.id_ris} población`);
      assert.strictEqual(zs.reduce((a, z) => a + z.properties.n_sec, 0), p.n_sec, `RIS ${p.id_ris} sectores`);
    }
    for (const z of bundle.zonas.features.filter(z => z.properties.id_ris === 156)) {
      const ss = bundle.sectores.features.filter(s => s.properties.id_zona === z.properties.id_zona);
      assert.strictEqual(ss.length, z.properties.n_sec);
      assert.strictEqual(ss.reduce((a, s) => a + s.properties.pob_t, 0), z.properties.pob_t);
    }
    const ids = bundle.sectores.features.map(f => f.properties.id_sector).sort((a, b) => a - b);
    assert.deepStrictEqual(ids, Array.from({ length: 72 }, (_, i) => i + 1));
  });
  await step('cada sector está dentro de su zona y cada zona dentro de su RIS (muestreo interior)', async () => {
    const muestras = (g, n) => {
      const ps = polysDe(g); let a = [Infinity, Infinity, -Infinity, -Infinity];
      ps.forEach(p => p[0].forEach(q => { a = [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[0]), Math.max(a[3], q[1])]; }));
      const out = []; const k = Math.ceil(Math.sqrt(n * 4));
      for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { const x = a[0] + (i + 0.5) * (a[2] - a[0]) / k, y = a[1] + (j + 0.5) * (a[3] - a[1]) / k; if (enGeom(x, y, g)) out.push([x, y]); }
      return out;
    };
    for (const s of bundle.sectores.features) {
      const z = bundle.zonas.features.find(z => z.properties.id_ris === s.properties.id_ris && z.properties.id_zona === s.properties.id_zona);
      const pts = muestras(s.geometry, 30);
      assert.ok(pts.every(([x, y]) => enGeom(x, y, z.geometry)), 'sector ' + s.properties.id_sector);
    }
    for (const z of bundle.zonas.features) {
      const r = bundle.ris.features.find(r => r.properties.id_ris === z.properties.id_ris);
      const pts = muestras(z.geometry, 40);
      assert.ok(pts.filter(([x, y]) => enGeom(x, y, r.geometry)).length >= pts.length * 0.98, `zona ${z.properties.id_ris}:${z.properties.id_zona}`);
    }
  });
  await step('los 32 vinculados con id_zona errado en la fuente se asignan a la zona donde están su punto y su puerta', async () => {
    const v = GeorisTerritory.getVinculados('ALL', 'ALL');
    const corregidos = v.filter(x => x.id_zona_declarada !== null);
    assert.strictEqual(corregidos.length, 32);
    for (const e of [...v, ...GeorisTerritory.getPuertasEntrada('ALL', 'ALL'), ...GeorisTerritory.getEessZona('ALL')]) {
      const z = GeorisTerritory.zonaQueContiene(e.lat, e.lng);
      assert.ok(z && z.id_ris === e.id_ris && z.id_zona === e.id_zona, `${e.cod_renipress} ${e.nombre} en zona ${z && z.id_zona}, asignado ${e.id_zona}`);
    }
    assert.ok(!GeorisTerritory.getVinculados(156, 6).some(x => x.id_zona_declarada !== null), 'Huarmey no tiene correcciones');
  });
  await step('totales de Áncash calculados del bundle (13 hospitales sin el Sihuas repetido; 72 sectores con polígono)', async () => {
    const t = GeorisTerritory.getResumenAncash();
    assert.deepStrictEqual(t, { ris: 7, poblacion: 1078374, familias: 316831, viviendas: 361712, zonas: 44, sectores: 367, sectores_con_poligono: 72, hospitales: 13, cabeceras: 44, puertas: 225, vinculados: 184 });
  });

  console.log('G-07: alcance por sector');
  await step('un usuario del «Sector 6» no ve pacientes del «Sector 67» (antes se comparaba por subcadena)', async () => {
    const u = { role: 'COORDINADOR', red: 'PACIFICO SUR', sector_sanitario: 'Sector 6' };
    const mk = sec => ({ red_salud: 'PACIFICO SUR', puerta_entrada_id: '00001741', sector_sanitario: sec });
    assert.strictEqual(scope.canSeePatient(u, mk('Sector 67')), false);
    assert.strictEqual(scope.canSeePatient(u, mk('Sector 6')), true);
    assert.strictEqual(scope.canSeePatient({ ...u, sector_sanitario: 'Sector I' }, { ...mk('Sector 67'), sector: 'Sector I – Centro' }), true);
  });
}

async function call(method, url, { token, body } = {}) {
  const h = {};
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* no era JSON */ }
  return { status: res.status, json, text };
}

async function login(username, password) {
  const r = await call('POST', '/api/auth/login', { body: { username, password } });
  assert.strictEqual(r.status, 200, r.text);
  return r.json.token;
}

async function crearUsuario(admin, username, role, red, extra = {}) {
  const password = 'clave-de-' + username + '-123';
  const r = await call('POST', '/api/users', { token: admin, body: { username, nombre: 'USUARIO ' + username.toUpperCase(), role, password, red, ...extra } });
  assert.strictEqual(r.status, 201, r.text);
  return login(username, password);
}

async function http() {
  console.log('G-07: PUT /api/patients/:id/ubicacion (servidor real)');
  const srv = await startServer({ port: PORT, env: { ADMIN_PASSWORD: ADMIN_PASS, NODE_ENV: 'development' } });
  BASE = srv.base;
  try {
    const admin = await login('admin', ADMIN_PASS);
    const imp = await call('POST', '/api/padron/importar-lote', { token: admin, body: { patients: [
      { id: 'pac-00001741-92000001', dni: '92000001', apellidos_nombres: 'PRUEBA HUARMEY', direccion: 'Jr. Casma 180', puerta_entrada_id: '00001741', red_salud: 'PACIFICO SUR' },
      { id: 'pac-00001741-92000002', dni: '92000002', apellidos_nombres: 'PRUEBA SIN UBICACION', direccion: 'Mz. K Lt. 12', puerta_entrada_id: '00001741', red_salud: 'PACIFICO SUR' }
    ] } });
    assert.strictEqual(imp.status, 200, imp.text);
    const coordSur = await crearUsuario(admin, 'coord_sur', 'COORDINADOR', 'Pacífico Sur');
    const coordNorte = await crearUsuario(admin, 'coord_norte', 'COORDINADOR', 'Pacífico Norte');
    const director = await crearUsuario(admin, 'director_sur', 'DIRECTOR', 'Pacífico Sur');
    const coordSector = await crearUsuario(admin, 'coord_sec67', 'COORDINADOR', 'Pacífico Sur', { sector_sanitario: 'Sector 69' });

    await step('la importación ubicó «Jr. Casma 180» en Huarmey (no en la ciudad de Casma) y dejó sin ubicación lo que no se reconoce', async () => {
      const list = (await call('GET', '/api/cronicos', { token: admin })).json;
      const a = list.find(p => p.dni === '92000001');
      const b = list.find(p => p.dni === '92000002');
      assert.strictEqual(a.precision_geo, 'calle');
      assert.strictEqual(a.sector_sanitario, 'Sector 69');
      assert.ok(a.latitud < -10.06 && a.latitud > -10.08, String(a.latitud));
      assert.strictEqual(b.latitud ?? null, null);
    });

    await step('COORDINADOR de la red fija la ubicación por GPS: 200, sector y territorio del polígono', async () => {
      const r = await call('PUT', '/api/patients/92000002/ubicacion', { token: coordSur, body: { latitud: -10.06721, longitud: -78.15352, precision_geo: 'gps', precision_m: 8 } });
      assert.strictEqual(r.status, 200, r.text);
      assert.strictEqual(r.json.data.sector_sanitario, 'Sector 67');
      assert.strictEqual(r.json.data.precision_m, 8);
      assert.strictEqual(r.json.data.geo_registrado_por, 'coord_sur');
      assert.strictEqual(r.json.data.territorio.zona.id_zona, 6);
      assert.strictEqual(r.json.data.territorio.ris.id_ris, 156);
      const geo = (await call('GET', '/api/patients/geo', { token: admin })).json;
      const f = geo.features.find(x => x.properties.dni === '92000002');
      assert.deepStrictEqual(f.geometry.coordinates, [-78.15352, -10.06721]);
      assert.strictEqual(f.properties.precision_geo, 'gps');
      assert.deepStrictEqual(geo.ubicaciones, { exacta: 1, aproximada: 1, sin_ubicacion: 0 });
      const resumen = (await call('GET', '/api/alerts/summary', { token: director })).json;
      assert.deepStrictEqual(resumen.ubicaciones, { exacta: 1, aproximada: 1, sin_ubicacion: 0 });
    });

    await step('DIRECTOR no puede (403); COORDINADOR de otra red no lo encuentra (404); sin sesión 401', async () => {
      const body = { latitud: -10.0672, longitud: -78.1535, precision_geo: 'mapa' };
      assert.strictEqual((await call('PUT', '/api/patients/92000001/ubicacion', { token: director, body })).status, 403);
      assert.strictEqual((await call('PUT', '/api/patients/92000001/ubicacion', { token: coordNorte, body })).status, 404);
      assert.strictEqual((await call('PUT', '/api/patients/92000001/ubicacion', { body })).status, 401);
      assert.strictEqual((await call('PUT', '/api/patients/99999999/ubicacion', { token: admin, body })).status, 404);
    });

    await step('un coordinador limitado a su sector no puede mover al paciente fuera de él (403) y sí dentro (200)', async () => {
      // 92000001 está en el Sector 69 (Jr. Casma)
      const fuera = await call('PUT', '/api/patients/92000001/ubicacion', { token: coordSector, body: { latitud: -10.06721, longitud: -78.15352, precision_geo: 'mapa' } });
      assert.strictEqual(fuera.status, 403, fuera.text);
      const dentro = await call('PUT', '/api/patients/92000001/ubicacion', { token: coordSector, body: { latitud: -10.06993, longitud: -78.1498, precision_geo: 'mapa' } });
      assert.strictEqual(dentro.status, 200, dentro.text);
      assert.strictEqual(dentro.json.data.sector_sanitario, 'Sector 69');
    });

    await step('un GPS de más de 50 m responde 400', async () => {
      const r = await call('PUT', '/api/patients/92000001/ubicacion', { token: admin, body: { latitud: -10.0699, longitud: -78.1498, precision_geo: 'gps', precision_m: 99999 } });
      assert.strictEqual(r.status, 400, r.text);
    });

    await step('datos inválidos responden 400 y no cambian nada', async () => {
      const antes = (await call('GET', '/api/cronicos', { token: admin })).json.find(p => p.dni === '92000001');
      for (const body of [{ latitud: 'x', longitud: -78.15, precision_geo: 'mapa' }, { latitud: -10.06, longitud: -78.15, precision_geo: 'calle' },
        { latitud: -10.06, longitud: -78.15, precision_geo: 'gps' }, { latitud: 0, longitud: 0, precision_geo: 'manual' }, {}]) {
        const r = await call('PUT', '/api/patients/92000001/ubicacion', { token: admin, body });
        assert.strictEqual(r.status, 400, JSON.stringify(body) + ' → ' + r.status);
      }
      const despues = (await call('GET', '/api/cronicos', { token: admin })).json.find(p => p.dni === '92000001');
      assert.strictEqual(despues.latitud, antes.latitud);
      assert.strictEqual(despues.precision_geo, antes.precision_geo);
    });

    await step('queda en la auditoría quién fijó la ubicación (sin las coordenadas del domicilio)', async () => {
      const logs = (await call('GET', '/api/security/audit-logs?limit=50', { token: admin })).json.logs;
      const l = logs.find(x => x.action === 'UBICACION_PACIENTE_FIJADA' || x.event === 'UBICACION_PACIENTE_FIJADA' || JSON.stringify(x).includes('UBICACION_PACIENTE_FIJADA'));
      assert.ok(l, 'sin registro de auditoría');
      assert.ok(!JSON.stringify(l).includes('-78.15352'), 'la auditoría no debe copiar las coordenadas');
    });

    await step('reimportar por FHIR con la misma dirección no pisa la ubicación exacta', async () => {
      const bundleFhir = { resourceType: 'Bundle', type: 'transaction', entry: [{ resource: {
        resourceType: 'Patient', id: 'pac-00001741-92000002', identifier: [{ system: DNI_SYSTEM, value: '92000002' }],
        address: [{ text: 'MZ K LT 12', extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/geolocation', extension: [{ url: 'latitude', valueDecimal: -10.08 }, { url: 'longitude', valueDecimal: -78.16 }] }] }]
      } }] };
      assert.strictEqual((await call('POST', '/fhir/Bundle', { token: admin, body: bundleFhir })).status, 200);
      const p = (await call('GET', '/api/cronicos', { token: admin })).json.find(x => x.dni === '92000002');
      assert.strictEqual(p.latitud, -10.06721);
      assert.strictEqual(p.precision_geo, 'gps');
    });

    await step('FHIR: un paciente sin coordenadas no lleva la extensión geolocation con valores nulos', async () => {
      await call('POST', '/api/padron/importar-lote', { token: admin, body: { patients: [{ id: 'pac-00001741-92000003', dni: '92000003', apellidos_nombres: 'SIN DIRECCION', puerta_entrada_id: '00001741' }] } });
      const b = (await call('GET', '/fhir/Patient/92000003', { token: admin })).json;
      const pat = b.entry.map(e => e.resource).find(r => r.resourceType === 'Patient');
      const exts = (pat.address && pat.address[0] && pat.address[0].extension) || [];
      assert.ok(!exts.some(e => /geolocation/.test(e.url)), JSON.stringify(exts));
      const todo = (await call('GET', '/fhir/Bundle', { token: admin })).text;
      assert.ok(!/"valueDecimal":null/.test(todo), 'el Bundle completo trae valueDecimal nulo');
    });
  } finally {
    await srv.stop();
  }
}

(async () => {
  await unitarias();
  await http();
  console.log(`\nResultado Ubicación exacta: ${passed} correctas, ${failed} con falla`);
  if (failed > 0) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
