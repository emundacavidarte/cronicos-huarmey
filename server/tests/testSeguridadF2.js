/**
 * testSeguridadF2.js
 * Fase 2 (auditoría de seguridad y privacidad del servidor): una prueba por hallazgo corregido.
 * Servidor REAL en el puerto 3110 con la lectura/escritura de store.json bloqueada (blockDisk.js);
 * las pruebas de permisos de archivo y de ADMIN_RESET usan una carpeta temporal propia (nunca server/db).
 * Pacientes, DNI y usuarios inventados. Ejecutar: node server/tests/testSeguridadF2.js
 * Ver docs/produccion/F2_seguridad_servidor.md (IDs F2-xx).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { startServer } = require('./helpers/realServer');

const PORT = 3110;
const ADMIN_PASS = 'clave-admin-de-prueba-f2';
const SECRET = 'f2-' + 'q7Wm2Kx9Lp4Rt8Vz1Nc6Hb3Jd5Fs0Gy'.repeat(2);
const DNI_SYSTEM = 'urn:oid:2.16.840.1.113883.4.904';
const SERVER_JS = path.join(__dirname, '..', 'server.js');
const PRELOAD = path.join(__dirname, 'helpers', 'blockDisk.js');

let passed = 0;
let failed = 0;
let BASE = '';
let ipSeq = 10;

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

/** Cada bloque usa su propia IP (TRUST_PROXY=true en el servidor de prueba) para no compartir cupos. */
function nuevaIp() { ipSeq++; return '10.20.' + Math.floor(ipSeq / 250) + '.' + (ipSeq % 250); }
let IP = nuevaIp();

async function call(method, url, { token, body, raw, headers, base } = {}) {
  const h = Object.assign({ 'X-Forwarded-For': IP }, headers || {});
  if (token) h.Authorization = 'Bearer ' + token;
  let payload;
  if (body !== undefined) {
    payload = raw ? body : JSON.stringify(body);
    if (!h['Content-Type']) h['Content-Type'] = 'application/json';
  }
  const res = await fetch((base || BASE) + url, { method, headers: h, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* no era JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}
const diag = r => (r.json && ((r.json.issue && r.json.issue[0] && r.json.issue[0].diagnostics) || r.json.error)) || r.text;

async function login(username, password, extra) {
  return call('POST', '/api/auth/login', Object.assign({ body: { username, password } }, extra || {}));
}

async function crearUsuario(adminToken, username, role, red, extra) {
  const password = 'clave-de-' + username + '-123';
  const r = await call('POST', '/api/users', { token: adminToken, body: Object.assign({ username, nombre: 'USUARIO ' + username.toUpperCase(), role, red, password }, extra || {}) });
  assert.strictEqual(r.status, 201, r.text);
  const l = await login(username, password);
  assert.strictEqual(l.status, 200, l.text);
  return l.json.token;
}

function patientFhir(dni, { org, sector, nombre } = {}) {
  const p = {
    resourceType: 'Patient', id: 'pac-00001741-' + dni,
    identifier: [{ system: DNI_SYSTEM, value: dni }],
    name: [{ text: nombre || 'Prueba F2 ' + dni }], gender: 'female', birthDate: '1960-05-10'
  };
  if (org) p.managingOrganization = { reference: 'Organization/' + org };
  if (sector) p.address = [{ text: 'Calle inventada 1', extension: [{ url: 'http://minsa.gob.pe/georis/StructureDefinition/sector-sanitario', valueString: sector }] }];
  return p;
}
const bundle = (...resources) => ({ resourceType: 'Bundle', type: 'transaction', entry: resources.map(resource => ({ resource })) });

/** Arranca server.js con `env` y devuelve { code, out } (código de salida o 'sigue-vivo' a los 8 s). */
function arranqueCon(env, { preload = true } = {}) {
  return new Promise(resolve => {
    const args = preload ? ['--require', PRELOAD, SERVER_JS] : [SERVER_JS];
    const child = spawn(process.execPath, args, { env: Object.assign({}, process.env, { PORT: '3111' }, env), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => { child.kill(); resolve({ code: 'sigue-vivo', out }); }, 8000);
    child.on('exit', code => { clearTimeout(timer); resolve({ code, out }); });
  });
}

/** Servidor sin blockDisk sobre una carpeta temporal (para pruebas que necesitan reiniciar con datos). */
async function servidorConDatos(dataDir, env, port) {
  const child = spawn(process.execPath, [SERVER_JS], {
    env: Object.assign({}, process.env, { PORT: String(port), DATA_DIR: dataDir, NODE_ENV: 'production', AUTH_SECRET: SECRET }, env),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 75; i++) {
    try { if ((await fetch(base + '/health')).ok) break; } catch (e) { /* arrancando */ }
    await new Promise(r => setTimeout(r, 200));
  }
  return {
    base,
    out: () => out,
    stop: () => new Promise(resolve => { child.on('exit', resolve); child.kill('SIGTERM'); })
  };
}

async function main() {
  console.log('Pruebas de la Fase 2: seguridad y privacidad del servidor\n');

  // --- Configuración insegura (S-01, S-16): el servidor se niega a arrancar, con un mensaje de una línea ---
  const ENV_EJEMPLO = { NODE_ENV: 'production', AUTH_SECRET: 'clave-secreta-produccion-minimo-32-caracteres-huarmey-2026', ADMIN_USER: 'admin', ADMIN_PASSWORD: 'Huarmey2026*Seguro', ADMIN_RESET: '' };
  await step('F2-01 producción con el AUTH_SECRET de .env.example: no arranca', async () => {
    const r = await arranqueCon(ENV_EJEMPLO);
    assert.strictEqual(r.code, 1, 'código de salida ' + r.code);
  });
  await step('F2-01 producción con la ADMIN_PASSWORD de .env.example y un secreto propio: no arranca', async () => {
    const r = await arranqueCon(Object.assign({}, ENV_EJEMPLO, { AUTH_SECRET: SECRET }));
    assert.strictEqual(r.code, 1, 'código de salida ' + r.code);
  });
  await step('F2-01 producción con un marcador CAMBIAR o un secreto de un solo carácter repetido: no arranca', async () => {
    assert.strictEqual((await arranqueCon(Object.assign({}, ENV_EJEMPLO, { AUTH_SECRET: 'CAMBIAR-por-un-secreto-aleatorio-de-64-caracteres', ADMIN_PASSWORD: 'otra-clave-de-prueba-1' }))).code, 1);
    assert.strictEqual((await arranqueCon(Object.assign({}, ENV_EJEMPLO, { AUTH_SECRET: 'a'.repeat(40), ADMIN_PASSWORD: 'otra-clave-de-prueba-1' }))).code, 1);
  });
  await step('F2-01 el .env.example del repositorio ya no trae un secreto ni una clave utilizables', async () => {
    const ejemplo = fs.readFileSync(path.join(__dirname, '..', '..', '.env.example'), 'utf8');
    assert.ok(!ejemplo.includes('clave-secreta-produccion-minimo-32-caracteres-huarmey-2026'));
    assert.ok(!ejemplo.includes('Huarmey2026*Seguro'));
    assert.ok(/AUTH_SECRET=CAMBIAR/.test(ejemplo) && /ADMIN_PASSWORD=CAMBIAR/.test(ejemplo));
  });
  await step('F2-02 sin AUTH_SECRET en producción: una línea de error, sin traza de Node (S-16)', async () => {
    const r = await arranqueCon({ NODE_ENV: 'production', AUTH_SECRET: '', ADMIN_PASSWORD: 'otra-clave-de-prueba-1' });
    assert.strictEqual(r.code, 1);
    assert.ok(/AUTH_SECRET/.test(r.out), r.out);
    assert.ok(!/\n\s+at /.test(r.out), 'la salida trae una traza:\n' + r.out);
  });

  const srv = await startServer({
    port: PORT,
    env: { NODE_ENV: 'production', AUTH_SECRET: SECRET, ADMIN_USER: 'admin', ADMIN_PASSWORD: ADMIN_PASS, ADMIN_RESET: '', TRUST_PROXY: 'true', CORS_ORIGINS: '' }
  });
  BASE = srv.base;
  try {
    const admin = (await login('admin', ADMIN_PASS)).json.token;
    const coordPs = await crearUsuario(admin, 'f2.coord.ps', 'COORDINADOR', '156');
    const coordPn = await crearUsuario(admin, 'f2.coord.pn', 'COORDINADOR', '157');
    const coordE41 = await crearUsuario(admin, 'f2.coord.e41', 'COORDINADOR', '156', { establecimiento_id: '00001741' });
    const coordE44 = await crearUsuario(admin, 'f2.coord.e44', 'COORDINADOR', '156', { establecimiento_id: '00001744' });
    const coordS6 = await crearUsuario(admin, 'f2.coord.s6', 'COORDINADOR', '156', { sector_sanitario: 'Sector 6' });

    // Pacientes inventados: dos de Pacífico Sur (dos establecimientos y dos sectores) y uno de Pacífico Norte
    assert.strictEqual((await call('POST', '/fhir/Bundle', { token: admin, body: bundle(
      patientFhir('95100001', { org: '00001741', sector: 'Sector 62' }),
      patientFhir('95100002', { org: '00001744', sector: 'Sector 6' })) })).status, 200);
    const PN = { id: 'pac-f2-pn-1', dni: '95100009', apellidos_nombres: 'PRUEBA NORTE F2', red_salud: 'PACIFICO NORTE', sexo: 'Femenino', fecha_nacimiento: '1961-01-01' };
    assert.strictEqual((await call('POST', '/api/padron/importar-lote', { token: admin, body: [PN] })).status, 200);
    const verComoAdmin = async id => (await call('GET', '/api/cronicos', { token: admin })).json.find(p => p.id === id || p.dni === id);

    // --- F2-03 Escritura cruzada de red por los hijos de importar-lote (H-01) ---
    await step('F2-03 importar-lote: DNI propio + id de un paciente de otra red → 400 y el paciente ajeno no cambia', async () => {
      const r = await call('POST', '/api/padron/importar-lote', { token: coordPs, body: [{
        dni: '95100001', id: PN.id,
        conditions: [{ cie10_cod: 'E11', diagnostico: 'INYECTADO' }],
        observations: [{ fecha_registro: '2026-11-04', pa_sistolica: 210, pa_diastolica: 125 }]
      }] });
      assert.strictEqual(r.status, 400, r.text);
      const pn = await verComoAdmin(PN.id);
      assert.deepStrictEqual(pn.diagnosticos, []);
      assert.strictEqual(pn.pa_sistolica, null);
    });
    await step('F2-03 importar-lote: los diagnósticos y controles se cuelgan del paciente realmente guardado', async () => {
      const r = await call('POST', '/api/padron/importar-lote', { token: coordPs, body: [{
        dni: '95100001', conditions: [{ cie10_cod: 'I10', diagnostico: 'Hipertensión Arterial' }],
        observations: [{ fecha_registro: '2026-11-03', pa_sistolica: 150, pa_diastolica: 95 }]
      }] });
      assert.strictEqual(r.status, 200, r.text);
      const p = await verComoAdmin('95100001');
      assert.ok(p.diagnosticos.includes('I10'), JSON.stringify(p.diagnosticos));
      assert.ok(p.conditions.every(c => c.patient_id === p.id), JSON.stringify(p.conditions));
      assert.strictEqual(p.pa_sistolica, 150);
    });

    // --- F2-04 Oráculo de existencia (H-02): otra red responde igual que un paciente inexistente ---
    await step('F2-04 eventos, consentimiento y pre-cita: paciente de otra red = paciente inexistente (404)', async () => {
      const casos = [
        id => call('GET', `/api/patients/${id}/eventos`, { token: coordPs }),
        id => call('POST', `/api/patients/${id}/eventos`, { token: coordPs, body: { tipo: 'control', fecha: '2026-11-01' } }),
        id => call('PUT', `/api/patients/${id}/consentimiento`, { token: coordPs, body: { consentimiento: 'No' } }),
        id => call('POST', '/api/appointments/pre-cita', { token: coordPs, body: { patient_id: id } })
      ];
      for (const fn of casos) {
        const ajeno = await fn('95100009');
        const inexistente = await fn('95999999');
        assert.strictEqual(ajeno.status, 404, ajeno.text);
        assert.strictEqual(inexistente.status, 404, inexistente.text);
        assert.strictEqual(diag(ajeno), diag(inexistente));
      }
    });
    await step('F2-05 pre-cita del ADMIN a un paciente inexistente → 404 (S-05)', async () => {
      const r = await call('POST', '/api/appointments/pre-cita', { token: admin, body: { patient_id: 'NO-EXISTE-F2' } });
      assert.strictEqual(r.status, 404, r.text);
    });

    // --- F2-06 ETag por usuario y sin almacenamiento en caché (H-03) ---
    await step('F2-06 dos COORDINADORES de la misma red con distinto establecimiento no comparten ETag; no-store', async () => {
      const red = await call('GET', '/api/cronicos', { token: coordPs });
      const est = await call('GET', '/api/cronicos', { token: coordE44, headers: { 'If-None-Match': red.headers.get('etag') } });
      assert.strictEqual(est.status, 200, 'el ETag de otro usuario dio ' + est.status);
      assert.notStrictEqual(est.headers.get('etag'), red.headers.get('etag'));
      assert.ok(/no-store/.test(red.headers.get('cache-control') || ''), red.headers.get('cache-control'));
      assert.ok(/no-store/.test((await call('GET', '/api/patients/geo', { token: coordPs })).headers.get('cache-control') || ''));
    });

    // --- F2-07 El cuerpo se analiza después de la sesión (H-04) ---
    await step('F2-07 sin token: un JSON roto recibe 401 (no se analiza antes de exigir la sesión)', async () => {
      const r = await call('POST', '/api/cronicos', { body: '{"roto": ', raw: true });
      assert.strictEqual(r.status, 401, r.text);
    });
    await step('F2-07 el inicio de sesión no acepta cuerpos grandes (413 con 64 KB)', async () => {
      IP = nuevaIp();
      const r = await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'x'.repeat(64 * 1024) } });
      assert.strictEqual(r.status, 413, r.text);
    });
    await step('F2-07 text/plain ya no se acepta como JSON en la API', async () => {
      const r = await call('POST', '/api/appointments/pre-cita', { token: coordPs, body: JSON.stringify({ patient_id: '95100001' }), raw: true, headers: { 'Content-Type': 'text/plain' } });
      assert.strictEqual(r.status, 415, r.status + ' ' + r.text);
    });

    // --- F2-08 Claves heredadas y lotes a medias (H-05) ---
    await step('F2-08 importar-lote con la clave "toString" → 400 de validación, sin mensaje interno', async () => {
      const r = await call('POST', '/api/padron/importar-lote', { token: coordPs, body: [{ dni: '95100001', toString: 'x' }] });
      assert.strictEqual(r.status, 400, r.text);
      assert.ok(!/is not a function|includes/.test(diag(r)), diag(r));
    });
    await step('F2-08 un lote con una fila inválida no guarda las filas válidas (todo o nada)', async () => {
      const r = await call('POST', '/api/padron/importar-lote', { token: coordPs, body: [
        { dni: '95100020', apellidos_nombres: 'PARCIAL F2', red_salud: 'PACIFICO SUR' },
        { dni: '95100001', hasOwnProperty: 'x' }
      ] });
      assert.strictEqual(r.status, 400, r.text);
      assert.strictEqual(await verComoAdmin('95100020'), undefined);
    });

    // --- F2-09 Validación de entradas en el servidor (S-03, H-06) ---
    const lote = list => call('POST', '/api/padron/importar-lote', { token: coordPs, body: list });
    await step('F2-09 importar-lote rechaza DNI inválido, paciente nuevo sin nombre, fecha imposible y fila sin identificador', async () => {
      for (const fila of [
        { dni: 'abc', apellidos_nombres: 'X Y' },
        { dni: '1234567', apellidos_nombres: 'SIETE DIGITOS' },
        { dni: '95100030', apellidos_nombres: '' },
        { dni: '95100031', apellidos_nombres: 'FECHA MALA', fecha_nacimiento: '1960-02-31' },
        { dni: '95100032', apellidos_nombres: 'FECHA BASURA', fecha_nacimiento: 'no-es-fecha' },
        { apellidos_nombres: 'SIN IDENTIFICADOR' },
        { dni: '95100033', apellidos_nombres: 'PA TEXTO', observations: [{ fecha_registro: '2026-11-01', pa_sistolica: '150<img>', pa_diastolica: 90 }] },
        { dni: '95100034', apellidos_nombres: 'CIE HTML', conditions: [{ cie10_cod: '<img src=x onerror=alert(1)>', diagnostico: 'x' }] }
      ]) {
        const r = await lote([fila]);
        assert.strictEqual(r.status, 400, JSON.stringify(fila) + ' → ' + r.status + ' ' + r.text);
        assert.ok(/fila 1/i.test(diag(r)), diag(r));
      }
    });
    await step('F2-09 importar-lote acepta un carné de extranjería y un lote válido normal', async () => {
      const r = await lote([
        { dni: '95100040', tipo_documento: 'DNI', apellidos_nombres: 'VALIDO F2', sexo: 'Femenino', fecha_nacimiento: '1958-12-25', red_salud: 'PACIFICO SUR' },
        { dni: 'X0012345', tipo_documento: 'Carné de extranjería', apellidos_nombres: 'EXTRANJERO F2', red_salud: 'PACIFICO SUR' }
      ]);
      assert.strictEqual(r.status, 200, r.text);
    });
    await step('F2-09 FHIR: identificador no-DNI, fecha basura, Condition sin código o con HTML → 400; nada se inventa', async () => {
      const malos = [
        bundle(Object.assign(patientFhir('95100050'), { identifier: [{ system: DNI_SYSTEM, value: 'no-es-dni' }] })),
        bundle(Object.assign(patientFhir('95100051'), { birthDate: 'no-es-fecha' })),
        bundle(patientFhir('95100052'), { resourceType: 'Condition', subject: { reference: 'Patient/pac-00001741-95100052' } }),
        bundle(patientFhir('95100053'), { resourceType: 'Condition', subject: { reference: 'Patient/pac-00001741-95100053' }, code: { coding: [{ code: '<img src=x onerror=alert(1)>' }] } })
      ];
      for (const b of malos) {
        const r = await call('POST', '/fhir/Bundle', { token: coordPs, body: b });
        assert.strictEqual(r.status, 400, r.text);
      }
      for (const dni of ['95100050', '95100051', '95100052', '95100053']) assert.strictEqual(await verComoAdmin(dni), undefined, dni);
    });
    await step('F2-09 webhook con solo DNI: no inventa financiador SIS ni sexo (S-06)', async () => {
      assert.strictEqual((await call('POST', '/api/webhooks/hosix', { token: coordPs, body: { DNI: '95100060', PACIENTE: 'SOLO DNI F2' } })).status, 200);
      const p = await verComoAdmin('95100060');
      assert.ok(p.financiador === null || p.financiador === undefined || p.financiador === '', 'financiador=' + p.financiador);
      assert.ok(p.sexo === null || p.sexo === undefined || p.sexo === '', 'sexo=' + p.sexo);
    });

    // --- F2-10 Errores sin textos internos (S-13, H-07) ---
    await step('F2-10 tipos inesperados → 400 con un mensaje propio (nunca 500 ni textos de JavaScript)', async () => {
      const a = await call('POST', '/fhir/Bundle', { token: coordPs, body: bundle(patientFhir('95100070'), { resourceType: 'Condition', subject: { reference: 'Patient/pac-00001741-95100070' }, code: { coding: [{ code: 123 }] } }) });
      const b = await call('POST', '/api/appointments/pre-cita', { token: coordPs, body: { patient_id: { toString: 1 } } });
      const c = await call('POST', '/api/appointments/pre-cita', { token: coordPs, body: '{"patient_id": ', raw: true });
      for (const r of [a, b, c]) {
        assert.strictEqual(r.status, 400, r.status + ' ' + r.text);
        assert.ok(!/is not a function|Cannot convert|Unexpected|JSON at position|Expected/.test(diag(r)), diag(r));
      }
    });
    await step('F2-10 ruta inexistente con POST → 404 JSON (no la página HTML de Express)', async () => {
      const r = await call('POST', '/api/no-existe', { token: coordPs, body: {} });
      assert.strictEqual(r.status, 404);
      assert.ok(r.json && r.json.resourceType === 'OperationOutcome', r.text);
    });

    // --- F2-11 Asignación masiva y trazabilidad (H-08) ---
    await step('F2-11 el servidor fija quién modificó el registro; el cliente no puede fijar fuente ni la traza', async () => {
      const r = await lote([{ dni: '95100001', fuente: 'HOSIX', ultima_modificacion_por: 'admin' }]);
      assert.strictEqual(r.status, 200, r.text);
      const p = await verComoAdmin('95100001');
      assert.strictEqual(p.ultima_modificacion_por, 'f2.coord.ps');
      assert.notStrictEqual(p.fuente, 'HOSIX');
    });
    await step('F2-11 importar-lote rechaza un campo de 200 KB y nombres de campo extraños', async () => {
      assert.strictEqual((await lote([{ dni: '95100001', campo_arbitrario: 'z'.repeat(200000) }])).status, 400);
      assert.strictEqual((await lote([{ dni: '95100001', 'campo raro<>': 'x' }])).status, 400);
    });

    // --- F2-12 Sector exacto (H-09) ---
    await step('F2-12 un COORDINADOR del "Sector 6" no ve el "Sector 62"', async () => {
      const lista = (await call('GET', '/api/cronicos', { token: coordS6 })).json;
      const sectores = [...new Set(lista.map(p => p.sector_sanitario))];
      assert.ok(!sectores.includes('Sector 62'), JSON.stringify(sectores));
      assert.ok(lista.some(p => p.dni === '95100002'), 'debe ver su propio sector');
    });

    // --- F2-13 Bitácora: lecturas registradas, sin datos personales y a prueba de inundación (H-12, L-06) ---
    await step('F2-13 la lectura del padrón queda en la bitácora (una vez por usuario y hora)', async () => {
      await call('GET', '/api/cronicos', { token: coordE41 });
      await call('GET', '/api/cronicos', { token: coordE41 });
      const r = await call('GET', '/api/security/audit-logs?evento=LECTURA_PACIENTES&limit=500', { token: admin });
      assert.strictEqual(r.status, 200, r.text);
      const mias = r.json.logs.filter(l => l.actor === 'f2.coord.e41' && l.evento === 'LECTURA_PACIENTES');
      assert.strictEqual(mias.length, 1, JSON.stringify(mias));
    });
    await step('F2-13 la bitácora de una importación dice qué pacientes tocó; la pre-cita no guarda nombre ni DNI en el texto', async () => {
      await lote([{ dni: '95100002', telefono: '999888777' }]);
      const r = await call('GET', '/api/security/audit-logs?evento=BULK_IMPORT&limit=5', { token: admin });
      const imp = r.json.logs.find(l => l.evento === 'BULK_IMPORT');
      assert.ok(imp && imp.payload_json.includes('95100002'), JSON.stringify(imp));
      await call('POST', '/api/appointments/pre-cita', { token: coordPs, body: { patient_id: 'pac-00001741-95100001', comentario: 'Pre-cita para PRUEBA F2 95100001 (DNI: 95100001)' } });
      const pc = (await call('GET', '/api/security/audit-logs?evento=PRE_CITA_GENERADA&limit=5', { token: admin })).json.logs.find(l => l.evento === 'PRE_CITA_GENERADA');
      assert.ok(pc && !pc.payload_json.includes('PRUEBA F2'), JSON.stringify(pc));
    });
    await step('F2-13 600 inicios de sesión fallidos desde muchas IP no desplazan los demás eventos de la bitácora', async () => {
      const contar = async ev => (await call('GET', '/api/security/audit-logs?evento=' + ev + '&limit=500', { token: admin })).json.logs.filter(l => l.evento === ev).length;
      const antes = await contar('USUARIO_CREADO');
      let k = 0;
      await Promise.all(Array.from({ length: 8 }, async () => {
        while (k < 600) {
          const i = k++;
          await call('POST', '/api/auth/login', { body: { username: 'intruso' + i, password: 'x' }, headers: { 'X-Forwarded-For': '10.99.' + Math.floor(i / 200) + '.' + (i % 200) } });
        }
      }));
      const fallidos = await contar('LOGIN_FALLIDO');
      const despues = await contar('USUARIO_CREADO');
      assert.strictEqual(despues, antes, `USUARIO_CREADO ${antes} → ${despues}`);
      assert.ok(fallidos <= 500, 'LOGIN_FALLIDO retenidos: ' + fallidos);
    });

    // --- F2-14 Límite de tasa en /fhir, cupo propio del login y cupo por usuario (S-02, S-04, L-01) ---
    await step('F2-14 /fhir también tiene límite de escrituras (429 con Retry-After)', async () => {
      const tokenTasa = await crearUsuario(admin, 'f2.tasa', 'COORDINADOR', '156');
      let ultimo = null;
      for (let i = 0; i < 125; i++) ultimo = await call('POST', '/fhir/Bundle', { token: tokenTasa, body: { resourceType: 'Nada' } });
      assert.strictEqual(ultimo.status, 429, ultimo.text);
      assert.ok(Number(ultimo.headers.get('retry-after')) > 0, 'Retry-After=' + ultimo.headers.get('retry-after'));
      // Otro usuario detrás de la misma IP sigue pudiendo escribir y cualquiera puede iniciar sesión
      const otro = await call('POST', '/fhir/Bundle', { token: coordPs, body: { resourceType: 'Nada' } });
      assert.strictEqual(otro.status, 400, 'otro usuario: ' + otro.status);
      assert.strictEqual((await login('f2.coord.pn', 'clave-de-f2.coord.pn-123')).status, 200);
    });
    await step('F2-14 inicios de sesión por IP: después de 30 por minuto, 429', async () => {
      IP = nuevaIp();
      const codigos = [];
      for (let i = 0; i < 32; i++) codigos.push((await login('nadie' + i, 'x')).status);
      assert.ok(codigos.slice(0, 30).every(c => c === 401), codigos.join(','));
      assert.strictEqual(codigos[31], 429, codigos.join(','));
    });

    // --- F2-15 Rutas duplicadas (S-11) ---
    await step('F2-15 /api/api/…, /fhir/fhir/…, /api/fhir/… y /fhir/<ruta de la API> responden 404', async () => {
      IP = nuevaIp();
      for (const u of ['/api/api/cronicos', '/fhir/fhir/Bundle', '/api/fhir/Bundle', '/fhir/cronicos', '/fhir/users', '/fhir/auth/me', '/api/Bundle']) {
        const r = await call('GET', u, { token: admin });
        assert.strictEqual(r.status, 404, u + ' → ' + r.status);
      }
      assert.strictEqual((await call('GET', '/fhir/Bundle', { token: admin })).status, 200);
      assert.strictEqual((await call('GET', '/fhir/metadata', { token: admin })).status, 200);
    });

    // --- F2-16 Nombres de usuario reservados (S-12) ---
    await step('F2-16 no se puede crear el usuario "__proto__" ni "constructor"', async () => {
      for (const u of ['__proto__', 'constructor', 'prototype']) {
        const r = await call('POST', '/api/users', { token: admin, body: { username: u, nombre: 'X', role: 'DIRECTOR', red: '156', password: 'clave-larga-de-prueba' } });
        assert.strictEqual(r.status, 400, u + ' → ' + r.status);
      }
    });

    // --- F2-17 CORS, CSP y cabeceras (S-07, H-14, H-15) ---
    await step('F2-17 sin CORS_ORIGINS no se autoriza ningún origen ajeno', async () => {
      const r = await fetch(BASE + '/api/cronicos', { method: 'OPTIONS', headers: { Origin: 'https://ajeno.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
      assert.strictEqual(r.headers.get('access-control-allow-origin'), null);
    });
    await step('F2-17 CSP: connect-src solo el propio sitio, imágenes solo de los mapas base, sin marcos', async () => {
      const csp = (await fetch(BASE + '/')).headers.get('content-security-policy') || '';
      const dir = Object.fromEntries(csp.split(';').map(s => s.trim()).filter(Boolean).map(s => { const [k, ...v] = s.split(/\s+/); return [k, v]; }));
      assert.deepStrictEqual(dir['connect-src'], ["'self'"]);
      assert.ok(!dir['img-src'].includes('https:') && !dir['img-src'].includes('http:'), dir['img-src'].join(' '));
      assert.ok(dir['img-src'].some(s => s.includes('basemaps.cartocdn.com')));
      assert.deepStrictEqual(dir['frame-ancestors'], ["'none'"]);
      assert.ok(!(dir['default-src'] || []).includes("'unsafe-inline'"));
    });
    await step('F2-17 cabeceras: X-XSS-Protection 0, COOP same-origin, X-Frame-Options DENY', async () => {
      const h = (await fetch(BASE + '/')).headers;
      assert.strictEqual(h.get('x-xss-protection'), '0');
      assert.strictEqual(h.get('cross-origin-opener-policy'), 'same-origin');
      assert.strictEqual(h.get('x-frame-options'), 'DENY');
    });
    void coordPn;
  } finally {
    await srv.stop();
  }

  await step('F2-17 con CORS_ORIGINS se autoriza solo el origen indicado', async () => {
    const s2 = await startServer({ port: PORT + 2, env: { NODE_ENV: 'production', AUTH_SECRET: SECRET, ADMIN_PASSWORD: ADMIN_PASS, ADMIN_RESET: '', CORS_ORIGINS: 'https://app.permitida.example' } });
    try {
      const pre = origin => fetch(s2.base + '/api/cronicos', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
      assert.strictEqual((await pre('https://app.permitida.example')).headers.get('access-control-allow-origin'), 'https://app.permitida.example');
      assert.strictEqual((await pre('https://ajeno.example')).headers.get('access-control-allow-origin'), null);
    } finally { await s2.stop(); }
  });

  // --- F2-18 Permisos del archivo de datos (H-13) ---
  await step('F2-18 store.json y store.json.bak quedan con permisos 600 (solo el usuario del servicio)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f2-perm-'));
    const script = "const db=require(" + JSON.stringify(path.join(__dirname, '..', 'db', 'database.js')) + ");db.upsertPatient({id:'pac-perm-1',dni:'95100090',apellidos_nombres:'PERMISOS'});db.flushSync();db.flushSync();";
    await new Promise((resolve, reject) => {
      const c = spawn(process.execPath, ['-e', script], { env: Object.assign({}, process.env, { DATA_DIR: dir }), stdio: 'ignore' });
      c.on('exit', code => (code === 0 ? resolve() : reject(new Error('salida ' + code))));
    });
    for (const f of ['store.json', 'store.json.bak']) {
      const modo = (fs.statSync(path.join(dir, f)).mode & 0o777).toString(8);
      assert.strictEqual(modo, '600', f + ' tiene ' + modo);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // --- F2-19 ADMIN_RESET se aplica una sola vez (H-17) ---
  await step('F2-19 con ADMIN_RESET=true olvidado, reiniciar no revierte la clave que el ADMIN cambió', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f2-reset-'));
    const env = { ADMIN_RESET: 'true', ADMIN_USER: 'admin', ADMIN_PASSWORD: 'clave-de-entorno-f2-1' };
    let s = await servidorConDatos(dir, env, PORT + 3);
    try {
      const t = (await call('POST', '/api/auth/login', { base: s.base, body: { username: 'admin', password: env.ADMIN_PASSWORD } })).json.token;
      assert.strictEqual((await call('PATCH', '/api/users/admin', { base: s.base, token: t, body: { password: 'clave-cambiada-f2-2' } })).status, 200);
      const t2 = (await call('POST', '/api/auth/login', { base: s.base, body: { username: 'admin', password: 'clave-cambiada-f2-2' } })).json.token;
      await s.stop();
      s = await servidorConDatos(dir, env, PORT + 3);
      assert.strictEqual((await call('POST', '/api/auth/login', { base: s.base, body: { username: 'admin', password: 'clave-cambiada-f2-2' } })).status, 200);
      assert.strictEqual((await call('GET', '/api/auth/me', { base: s.base, token: t2 })).status, 200, 'la sesión vigente no debe cerrarse');
      assert.ok(/ADMIN_RESET/.test(s.out()), s.out());
      // Una clave NUEVA en el entorno sí se aplica (recuperación de acceso)
      await s.stop();
      s = await servidorConDatos(dir, Object.assign({}, env, { ADMIN_PASSWORD: 'clave-de-entorno-f2-3' }), PORT + 3);
      assert.strictEqual((await call('POST', '/api/auth/login', { base: s.base, body: { username: 'admin', password: 'clave-de-entorno-f2-3' } })).status, 200);
    } finally {
      await s.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  console.log(`\nResultado Seguridad F2: ${passed} correctas, ${failed} con falla`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
