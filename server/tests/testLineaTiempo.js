/**
 * testLineaTiempo.js
 * A11 contra el servidor REAL (puerto 3104, sin tocar store.json): la línea de tiempo del paciente muestra
 * controles, citas, referencias, contrarreferencias y cambios de establecimiento, ordenados y con quién registró;
 * el registrante sale de la sesión y el alcance por red se respeta. Pacientes y usuarios inventados.
 * Ejecutar: node server/tests/testLineaTiempo.js
 */

const assert = require('assert');
const { startServer } = require('./helpers/realServer');

const PORT = 3104;
const ADMIN_PASS = 'clave-admin-de-prueba-1';
const DNI_SYSTEM = 'urn:oid:2.16.840.1.113883.4.904';

let passed = 0;
let failed = 0;
let BASE = '';

async function step(name, fn) {
  try { await fn(); passed++; console.log('  OK    ' + name); }
  catch (e) { failed++; console.log('  FALLA ' + name + '\n        ' + e.message); }
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

async function crearUsuario(adminToken, username, role, red) {
  const password = 'clave-de-' + username + '-123';
  const r = await call('POST', '/api/users', { token: adminToken, body: { username, nombre: 'USUARIO ' + username.toUpperCase(), role, password, red } });
  assert.strictEqual(r.status, 201, r.text);
  const l = await call('POST', '/api/auth/login', { body: { username, password } });
  assert.strictEqual(l.status, 200, l.text);
  return l.json.token;
}

function bundleFor(dni, orgCode) {
  return {
    resourceType: 'Bundle', type: 'transaction',
    entry: [{ resource: {
      resourceType: 'Patient', id: 'pac-00001741-' + dni,
      identifier: [{ system: DNI_SYSTEM, value: dni }],
      name: [{ text: 'Paciente Inventado ' + dni }], gender: 'female',
      managingOrganization: { reference: 'Organization/' + orgCode }
    } }]
  };
}

async function main() {
  let srv;
  try {
    srv = await startServer({
      port: PORT,
      env: { ADMIN_USER: 'admin', ADMIN_PASSWORD: ADMIN_PASS, ADMIN_RESET: '', NODE_ENV: 'test', AUTH_SECRET: 'secreto-linea-tiempo-de-prueba-con-mas-de-32-caracteres' }
    });
  } catch (e) {
    console.log('  FALLA no arranco el servidor: ' + e.message);
    process.exit(1);
  }
  BASE = srv.base;

  try {
    const admin = (await call('POST', '/api/auth/login', { body: { username: 'admin', password: ADMIN_PASS } })).json.token;
    const coordPs = await crearUsuario(admin, 'coord_ps', 'COORDINADOR', 'Pacífico Sur');
    const coordCs = await crearUsuario(admin, 'coord_cs', 'COORDINADOR', 'CONCHUCOS SUR (N° 87)');
    const director = await crearUsuario(admin, 'dir_ps', 'DIRECTOR', '156');

    const DNI = '93300001';
    const id = 'pac-00001741-' + DNI;
    const url = '/api/patients/' + id + '/eventos';
    const HUARMEY = '00001741';
    const LAVICTORIA = '00001744';

    assert.strictEqual((await call('POST', '/fhir/Bundle', { token: admin, body: bundleFor(DNI, LAVICTORIA) })).status, 200);

    console.log('A11: sin sesión y validación');

    await step('sin token responde 401', async () => {
      assert.strictEqual((await call('GET', url)).status, 401);
      assert.strictEqual((await call('POST', url, { body: {} })).status, 401);
    });

    await step('tipo, fecha, estado o establecimiento inválidos se rechazan con 400', async () => {
      const mal = [
        { tipo: 'diagnostico', fecha: '2026-10-01' },
        { tipo: 'control', fecha: '01/10/2026' },
        { tipo: 'control', fecha: '2026-13-45' },
        { tipo: 'referencia', fecha: '2026-10-01', estado: 'inventado' },
        { tipo: 'referencia', fecha: '2026-10-01', destino_establecimiento_id: '12345678' }
      ];
      for (const b of mal) {
        const r = await call('POST', url, { token: coordPs, body: b });
        assert.strictEqual(r.status, 400, JSON.stringify(b) + ' -> ' + r.status);
      }
      assert.strictEqual((await call('GET', url, { token: coordPs })).json.total, 0);
    });

    console.log('A11: cinco eventos ordenados con registrante');

    await step('un paciente con cinco eventos de distinto tipo muestra su historia ordenada, del más reciente al más antiguo', async () => {
      const eventos = [
        { tipo: 'cambio_establecimiento', fecha: '2026-03-01', establecimiento_id: HUARMEY, destino_establecimiento_id: LAVICTORIA, detalle: 'Pasa a control en su centro de salud' },
        { tipo: 'control', fecha: '2026-06-10', establecimiento_id: LAVICTORIA, detalle: 'PA 150/95 mmHg' },
        { tipo: 'referencia', fecha: '2026-07-05', establecimiento_id: LAVICTORIA, destino_establecimiento_id: HUARMEY, estado: 'pendiente' },
        { tipo: 'contrarreferencia', fecha: '2026-08-20', establecimiento_id: HUARMEY, destino_establecimiento_id: LAVICTORIA, estado: 'contrarreferida' },
        { tipo: 'cita', fecha: '2026-10-15', establecimiento_id: LAVICTORIA, estado: 'pendiente' }
      ];
      // se envían desordenados a propósito
      for (const e of [eventos[2], eventos[0], eventos[4], eventos[1], eventos[3]]) {
        const r = await call('POST', url, { token: coordPs, body: e });
        assert.strictEqual(r.status, 201, r.text);
      }
      const r = await call('GET', url, { token: coordPs });
      assert.strictEqual(r.status, 200, r.text);
      assert.strictEqual(r.json.total, 5);
      assert.deepStrictEqual(r.json.eventos.map(e => e.tipo), ['cita', 'contrarreferencia', 'referencia', 'control', 'cambio_establecimiento']);
      const ref = r.json.eventos.find(e => e.tipo === 'referencia');
      assert.ok(ref.establecimiento && ref.destino_establecimiento, 'debe traer los nombres de origen y destino');
      assert.strictEqual(ref.estado, 'pendiente');
    });

    await step('el registrante sale de la sesión, aunque el cuerpo diga otro usuario', async () => {
      const r = await call('POST', url, { token: coordPs, body: { tipo: 'control', fecha: '2026-09-01', registrado_por: 'otro.usuario', rol_registrante: 'ADMIN', id: 'evt-forzado' } });
      assert.strictEqual(r.status, 201, r.text);
      assert.strictEqual(r.json.data.registrado_por, 'coord_ps');
      assert.strictEqual(r.json.data.rol_registrante, 'COORDINADOR');
      assert.notStrictEqual(r.json.data.id, 'evt-forzado');
      assert.ok(r.json.data.fecha_registro);
      const todos = (await call('GET', url, { token: admin })).json.eventos;
      assert.ok(todos.every(e => e.registrado_por === 'coord_ps'));
    });

    await step('la pre-cita generada entra a la línea de tiempo como cita derivada, sin registrante inventado', async () => {
      const pre = await call('POST', '/api/appointments/pre-cita', { token: coordPs, body: { patient_id: id, fecha_sugerida: '2026-11-02' } });
      assert.strictEqual(pre.status, 200, pre.text);
      const eventos = (await call('GET', url, { token: coordPs })).json.eventos;
      const derivada = eventos.find(e => e.origen === 'cita' && e.fecha === '2026-11-02');
      assert.ok(derivada, 'falta la cita derivada');
      assert.strictEqual(derivada.estado, 'pre-cita');
      assert.strictEqual(derivada.registrado_por, null);
      assert.strictEqual(eventos[0].fecha, '2026-11-02', 'la más reciente va primero');
    });

    console.log('A11: alcance');

    await step('un usuario de otra red no ve ni escribe eventos (404, igual que un paciente inexistente: F2-04) y el DIRECTOR no accede (403)', async () => {
      assert.strictEqual((await call('GET', url, { token: coordCs })).status, 404);
      assert.strictEqual((await call('POST', url, { token: coordCs, body: { tipo: 'control', fecha: '2026-10-01' } })).status, 404);
      assert.strictEqual((await call('GET', url, { token: director })).status, 403);
      assert.strictEqual((await call('POST', url, { token: director, body: { tipo: 'control', fecha: '2026-10-01' } })).status, 403);
    });

    await step('paciente inexistente responde 404', async () => {
      assert.strictEqual((await call('GET', '/api/patients/no-existe-99/eventos', { token: admin })).status, 404);
      assert.strictEqual((await call('POST', '/api/patients/no-existe-99/eventos', { token: admin, body: { tipo: 'control', fecha: '2026-10-01' } })).status, 404);
    });

    await step('cada evento registrado deja huella en la auditoría', async () => {
      const logs = (await call('GET', '/api/security/audit-logs?limit=500', { token: admin })).json;
      const filas = logs.logs || [];
      assert.ok(filas.filter(l => l.evento === 'EVENTO_LINEA_TIEMPO').length >= 6);
    });
  } catch (e) {
    failed++;
    console.log('  FALLA ' + e.message);
    console.log('--- salida del servidor ---\n' + srv.getLog());
  } finally {
    await srv.stop();
  }

  console.log('\nResultado Línea de tiempo: ' + passed + ' correctas, ' + failed + ' con falla');
  process.exit(failed === 0 ? 0 : 1);
}

main();
