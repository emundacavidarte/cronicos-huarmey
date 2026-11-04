/**
 * testHttp.js
 * Prueba HTTP real: arranca server.js en el puerto 3100 (sin tocar store.json ni client/js/data),
 * prueba POST /fhir/Bundle y GET /api/patients/geo con pacientes inventados y apaga el servidor.
 * Ejecutar: node server/tests/testHttp.js
 */

const assert = require('assert');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const PORT = 3100;
const BASE = 'http://127.0.0.1:' + PORT;
const SERVER_JS = path.join(__dirname, '..', 'server.js');
const PRELOAD = path.join(__dirname, 'helpers', 'blockDisk.js');

const PID = 'pac-00001741-92000001';
const DNI = '92000001';
const DNI_SYSTEM = 'urn:oid:2.16.840.1.113883.4.904';

let TOKEN = '';
let passed = 0;
let failed = 0;

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  OK    ' + name);
  } catch (e) {
    failed++;
    console.log('  FALLA ' + name + '\n        ' + e.message);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
}

async function postBundle(bundle) {
  const res = await fetch(BASE + '/fhir/Bundle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify(bundle)
  });
  return { status: res.status, body: await res.json() };
}

async function getGeoFeature() {
  const res = await fetch(BASE + '/api/patients/geo', { headers: { Authorization: 'Bearer ' + TOKEN } });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  const feat = body.features.find(f => f.properties.dni === DNI);
  assert.ok(feat, 'el paciente inventado debe aparecer en /api/patients/geo');
  return feat;
}

function portIsFree() {
  return new Promise(resolve => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(PORT, '127.0.0.1');
  });
}

async function waitForHealth(timeoutMs) {
  const limit = Date.now() + timeoutMs;
  while (Date.now() < limit) {
    try {
      const r = await fetch(BASE + '/health');
      if (r.ok) return;
    } catch (e) { /* aun no arranca */ }
    await sleep(200);
  }
  throw new Error('El servidor no respondio en /health a tiempo');
}

// Bundle 1: paciente completo + citas y observaciones en orden "malo" (la mas reciente NO al final)
function fullBundle() {
  const apt = (id, days) => ({
    resource: {
      resourceType: 'Appointment', id, status: 'booked', start: isoDaysFromNow(days),
      serviceCategory: [{ coding: [{ system: 'http://minsa.gob.pe/fhir/estrategia', code: 'HEARTS' }] }],
      participant: [{ actor: { reference: 'Patient/' + PID }, status: 'accepted' }]
    }
  });
  const obs = (id, date, sys, dia) => ({
    resource: {
      resourceType: 'Observation', id, status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '85354-9' }] },
      subject: { reference: 'Patient/' + PID }, effectiveDateTime: date,
      component: [
        { code: { coding: [{ system: 'http://loinc.org', code: '8480-6' }] }, valueQuantity: { value: sys } },
        { code: { coding: [{ system: 'http://loinc.org', code: '8462-4' }] }, valueQuantity: { value: dia } }
      ]
    }
  });
  return {
    resourceType: 'Bundle', type: 'transaction',
    entry: [
      { resource: {
        resourceType: 'Patient', id: PID,
        identifier: [{ system: DNI_SYSTEM, value: DNI }],
        name: [{ text: 'Quispe Rojas Maria' }], gender: 'female',
        telecom: [{ system: 'phone', value: '944555666' }],
        address: [{
          text: 'Jr. Grau 321',
          extension: [
            { url: 'http://hl7.org/fhir/StructureDefinition/geolocation', extension: [
              { url: 'latitude', valueDecimal: -10.0701 }, { url: 'longitude', valueDecimal: -78.1502 }
            ] },
            { url: 'http://minsa.gob.pe/georis/StructureDefinition/sector-sanitario', valueString: 'Sector 07 - Ribera' }
          ]
        }]
      } },
      apt('http-apt-futura', 40),
      apt('http-apt-vencida', -60),
      obs('http-obs-reciente', '2026-09-01', 120, 80),
      obs('http-obs-antigua', '2026-01-01', 170, 100)
    ]
  };
}

// Bundle 2: el mismo paciente pero SIN direccion, telefono, coordenadas ni sector
function minimalBundle() {
  return {
    resourceType: 'Bundle', type: 'transaction',
    entry: [{ resource: {
      resourceType: 'Patient', id: PID,
      identifier: [{ system: DNI_SYSTEM, value: DNI }],
      name: [{ text: 'Quispe Rojas Maria' }]
    } }]
  };
}

async function main() {
  if (!(await portIsFree())) {
    console.log('El puerto ' + PORT + ' ya esta en uso. No se arranca el servidor para no interferir.');
    process.exit(1);
  }

  // Servidor real, con lectura/escritura de store.json bloqueada (--require) y puerto 3100
  const server = spawn(process.execPath, ['--require', PRELOAD, SERVER_JS], {
    env: Object.assign({}, process.env, { PORT: String(PORT), ADMIN_USER: 'admin', ADMIN_PASSWORD: 'clave-de-prueba-http-1', ADMIN_RESET: '', AUTH_SECRET: 'secreto-http-de-prueba-con-mas-de-32-caracteres' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  server.stdout.on('data', d => { serverLog += d; });
  server.stderr.on('data', d => { serverLog += d; });

  let exited = false;
  server.on('exit', () => { exited = true; });

  async function stopServer() {
    if (exited) return;
    server.kill();
    const limit = Date.now() + 5000;
    while (!exited && Date.now() < limit) await sleep(100);
    if (!exited) {
      spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
      await sleep(500);
    }
  }

  try {
    await waitForHealth(15000);
    const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'clave-de-prueba-http-1' }) });
    TOKEN = (await login.json()).token;
    console.log('Servidor arrancado en ' + BASE + ' (pid ' + server.pid + ')');
    console.log('Prueba HTTP: POST /fhir/Bundle y GET /api/patients/geo');

    await step('POST /fhir/Bundle (paciente completo) responde 200', async () => {
      const r = await postBundle(fullBundle());
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.total, 1);
    });

    await step('GET /api/patients/geo: aparece con sus coordenadas y su sector', async () => {
      const f = await getGeoFeature();
      assert.deepStrictEqual(f.geometry.coordinates, [-78.1502, -10.0701]);
      assert.strictEqual(f.properties.sector_sanitario, 'Sector 07 - Ribera');
      assert.strictEqual(f.properties.telefono, '944555666');
      assert.strictEqual(f.properties.direccion, 'Jr. Grau 321');
    });

    await step('Error B: usa la cita mas reciente (+40 dias, verde) aunque la vencida (-60) llego despues', async () => {
      const f = await getGeoFeature();
      assert.strictEqual(f.properties.semaforo, 'green');
      assert.ok(f.properties.dias_restantes > 7, 'dias_restantes = ' + f.properties.dias_restantes);
    });

    await step('Error B: usa la observacion mas reciente (Controlado, frecuencia 90)', async () => {
      const f = await getGeoFeature();
      assert.strictEqual(f.properties.estado_control, 'Controlado');
      assert.strictEqual(f.properties.frecuencia_hearts, 90);
    });

    await step('POST /fhir/Bundle (mismo paciente SIN direccion/telefono/geo/sector) responde 200', async () => {
      const r = await postBundle(minimalBundle());
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    });

    await step('Error A: tras el Bundle minimo se conservan direccion, telefono, sector y coordenadas', async () => {
      const f = await getGeoFeature();
      assert.deepStrictEqual(f.geometry.coordinates, [-78.1502, -10.0701]);
      assert.strictEqual(f.properties.sector_sanitario, 'Sector 07 - Ribera');
      assert.strictEqual(f.properties.telefono, '944555666');
      assert.strictEqual(f.properties.direccion, 'Jr. Grau 321');
      assert.strictEqual(f.properties.apellidos_nombres, 'QUISPE ROJAS MARIA');
    });

    await step('Error A: un Bundle con valores reales SI actualiza (telefono nuevo)', async () => {
      const b = minimalBundle();
      b.entry[0].resource.telecom = [{ system: 'phone', value: '900111222' }];
      const r = await postBundle(b);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      const f = await getGeoFeature();
      assert.strictEqual(f.properties.telefono, '900111222');
      assert.strictEqual(f.properties.direccion, 'Jr. Grau 321');
    });

    await step('POST /fhir/Bundle con payload invalido responde 400', async () => {
      const r = await postBundle({ resourceType: 'Patient' });
      assert.strictEqual(r.status, 400);
    });

    await step('T-02: el padron ya no se sirve como archivo estatico (GET /js/data/sampleDataset.js)', async () => {
      const res = await fetch(BASE + '/js/data/sampleDataset.js?v=20261021_v18');
      const text = await res.text();
      assert.ok(!/SAMPLE_PATIENTS/.test(text), 'la respuesta no debe contener el padron (SAMPLE_PATIENTS)');
      assert.ok(!/["']?dni["']?\s*:\s*["']?\d{8}/i.test(text), 'la respuesta no debe contener registros con DNI');
      assert.ok(!/apellidos_nombres["']?\s*:/i.test(text), 'la respuesta no debe contener registros con nombres');
      assert.ok(!/javascript/i.test(res.headers.get('content-type') || ''), 'no debe responder como JavaScript');
    });
  } catch (e) {
    failed++;
    console.log('  FALLA ' + e.message);
    console.log('--- salida del servidor ---\n' + serverLog);
  } finally {
    await stopServer();
    const free = await portIsFree();
    console.log('Servidor apagado: ' + (exited ? 'si' : 'NO') + '; puerto ' + PORT + ' libre: ' + (free ? 'si' : 'NO'));
  }

  console.log('\nResultado: ' + passed + ' correctas, ' + failed + ' con falla');
  process.exit(failed === 0 ? 0 : 1);
}

main();

