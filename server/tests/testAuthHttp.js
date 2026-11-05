/**
 * testAuthHttp.js
 * T-03a contra el servidor REAL (puerto 3101, sin tocar store.json): 401 sin token, 403 por rol,
 * filtro por red en lectura y escritura, ETag por alcance, usuarios, desactivación y bloqueo de intentos.
 * Pacientes y usuarios inventados. Ejecutar: node server/tests/testAuthHttp.js
 */

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const { startServer } = require('./helpers/realServer');

const PORT = 3101;
const ADMIN_PASS = 'clave-admin-de-prueba-1';
const DNI_SYSTEM = 'urn:oid:2.16.840.1.113883.4.904';

let passed = 0;
let failed = 0;
let BASE = '';

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

async function call(method, url, { token, body, headers } = {}) {
  const h = Object.assign({}, headers || {});
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* no era JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function login(username, password) {
  const r = await call('POST', '/api/auth/login', { body: { username, password } });
  return r;
}

function bundleFor(dni, orgCode) {
  const patient = {
    resourceType: 'Patient', id: 'pac-00001741-' + dni,
    identifier: [{ system: DNI_SYSTEM, value: dni }],
    name: [{ text: 'Prueba Auth ' + dni }], gender: 'female'
  };
  if (orgCode) patient.managingOrganization = { reference: 'Organization/' + orgCode };
  return { resourceType: 'Bundle', type: 'transaction', entry: [{ resource: patient }] };
}

const dnisOf = list => list.map(p => String(p.dni)).sort();

async function crearUsuario(adminToken, username, role, red) {
  const body = { username, nombre: 'USUARIO ' + username.toUpperCase(), role, password: 'clave-de-' + username + '-123' };
  if (red) body.red = red;
  const r = await call('POST', '/api/users', { token: adminToken, body });
  assert.strictEqual(r.status, 201, r.text);
  const l = await login(username, body.password);
  assert.strictEqual(l.status, 200, l.text);
  return l.json.token;
}

/** Arranca server.js con una configuración que debe ser rechazada y devuelve su código de salida. */
function exitCodeWith(env) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['--require', path.join(__dirname, 'helpers', 'blockDisk.js'), path.join(__dirname, '..', 'server.js')], {
      env: Object.assign({}, process.env, { PORT: '3102' }, env),
      stdio: 'ignore'
    });
    const timer = setTimeout(() => { child.kill(); resolve('sigue-vivo'); }, 8000);
    child.on('exit', code => { clearTimeout(timer); resolve(code); });
  });
}

async function main() {
  let srv;
  try {
    srv = await startServer({
      port: PORT,
      env: { ADMIN_USER: 'admin', ADMIN_PASSWORD: ADMIN_PASS, ADMIN_RESET: '', NODE_ENV: 'test', AUTH_SECRET: 'secreto-http-de-prueba-con-mas-de-32-caracteres' }
    });
  } catch (e) {
    console.log('  FALLA no arranco el servidor: ' + e.message);
    process.exit(1);
  }
  BASE = srv.base;
  console.log('Servidor arrancado en ' + BASE);

  let admin; let coordPs; let coordCs; let director;
  try {
    console.log('T-03a HTTP: sin sesión');

    await step('sin token: toda ruta de /api y /fhir responde 401 (con WWW-Authenticate)', async () => {
      for (const [m, u] of [['GET', '/api/cronicos'], ['GET', '/api/patients/geo'], ['GET', '/api/alerts/summary'], ['GET', '/fhir/Bundle'],
        ['GET', '/fhir/metadata'], ['GET', '/api/establishments'], ['GET', '/api/security/audit-logs'], ['GET', '/api/users'],
        ['POST', '/api/webhooks/hosix'], ['POST', '/fhir/Bundle'], ['POST', '/api/appointments/pre-cita']]) {
        const r = await call(m, u, m === 'POST' ? { body: {} } : {});
        assert.strictEqual(r.status, 401, m + ' ' + u + ' -> ' + r.status);
        assert.ok(/Bearer/.test(r.headers.get('www-authenticate') || ''), m + ' ' + u + ' sin WWW-Authenticate');
      }
    });

    await step('/health y los archivos públicos siguen abiertos', async () => {
      assert.strictEqual((await call('GET', '/health')).status, 200);
      assert.strictEqual((await call('GET', '/index.html')).status, 200);
    });

    await step('el encabezado x-clinical-role: ADMIN ya no abre nada (sigue 401)', async () => {
      const r = await call('GET', '/api/security/audit-logs', { headers: { 'x-clinical-role': 'ADMIN', 'x-clinical-user': 'intruso' } });
      assert.strictEqual(r.status, 401);
    });

    await step('un token falso o manipulado -> 401', async () => {
      assert.strictEqual((await call('GET', '/api/cronicos', { token: 'falso.falso' })).status, 401);
      const ok = (await login('admin', ADMIN_PASS)).json.token;
      const [body, sig] = ok.split('.');
      assert.strictEqual((await call('GET', '/api/cronicos', { token: body + '.' + sig.slice(0, -3) + 'AAA' })).status, 401);
    });

    console.log('T-03a HTTP: inicio de sesión');

    await step('login con clave incorrecta o usuario inexistente -> 401 con el mismo mensaje', async () => {
      const a = await login('admin', 'clave-equivocada-99');
      const b = await login('no.existe', 'clave-equivocada-99');
      assert.strictEqual(a.status, 401);
      assert.strictEqual(b.status, 401);
      assert.strictEqual(a.text, b.text);
    });

    await step('login sin datos -> 400; login correcto -> token Bearer sin hash de clave', async () => {
      assert.strictEqual((await call('POST', '/api/auth/login', { body: {} })).status, 400);
      const r = await login('ADMIN', ADMIN_PASS);
      assert.strictEqual(r.status, 200, r.text);
      assert.strictEqual(r.json.token_type, 'Bearer');
      assert.strictEqual(r.json.user.role, 'ADMIN');
      assert.ok(!/password|hash|scrypt/i.test(r.text), 'la respuesta no debe incluir la clave ni su hash');
      admin = r.json.token;
    });

    await step('GET /api/auth/me devuelve el usuario de la sesión; /api/auth/redes lista las 7 RIS', async () => {
      const me = await call('GET', '/api/auth/me', { token: admin });
      assert.strictEqual(me.status, 200);
      assert.strictEqual(me.json.user.username, 'admin');
      const redes = await call('GET', '/api/auth/redes', { token: admin });
      assert.strictEqual(redes.status, 200);
      assert.strictEqual(redes.json.data.length, 7);
    });

    console.log('T-03a HTTP: usuarios');

    await step('ADMIN registra usuarios; COORDINADOR y DIRECTOR exigen una de las 7 RIS', async () => {
      const base = { nombre: 'PRUEBA', password: 'clave-de-prueba-123' };
      const post = body => call('POST', '/api/users', { token: admin, body: { ...base, ...body } });
      assert.strictEqual((await post({ username: 'sinred', role: 'COORDINADOR' })).status, 400);
      assert.strictEqual((await post({ username: 'redmala', role: 'DIRECTOR', red: 'RED INVENTADA' })).status, 400);
      assert.strictEqual((await post({ username: 'rolmalo', role: 'MEDICO', red: 'PACIFICO SUR' })).status, 400);
      assert.strictEqual((await post({ username: 'clavecorta', role: 'DIRECTOR', red: '156', password: 'corta' })).status, 400);
      coordPs = await crearUsuario(admin, 'coord_ps', 'COORDINADOR', 'Pacífico Sur');
      coordCs = await crearUsuario(admin, 'coord_cs', 'COORDINADOR', 'CONCHUCOS SUR (N° 87)');
      director = await crearUsuario(admin, 'dir_ps', 'DIRECTOR', '156');
      assert.strictEqual((await post({ username: 'coord_ps', role: 'DIRECTOR', red: '156' })).status, 409);
    });

    await step('la red queda en su forma canónica y GET /api/users no expone claves', async () => {
      const r = await call('GET', '/api/users', { token: admin });
      assert.strictEqual(r.status, 200);
      assert.ok(!/password|hash|scrypt/i.test(r.text));
      const byName = Object.fromEntries(r.json.data.map(u => [u.username, u]));
      assert.strictEqual(byName.coord_ps.red, 'PACIFICO SUR');
      assert.strictEqual(byName.coord_cs.red, 'CONCHUCOS SUR');
      assert.strictEqual(byName.dir_ps.red, 'PACIFICO SUR');
      assert.strictEqual(byName.admin.red, null);
    });

    await step('COORDINADOR y DIRECTOR no gestionan usuarios ni ven la auditoría (403)', async () => {
      for (const t of [coordPs, director]) {
        assert.strictEqual((await call('GET', '/api/users', { token: t })).status, 403);
        const nuevo = { username: 'xx11', nombre: 'X', role: 'ADMIN', password: 'clave-de-prueba-123' };
        assert.strictEqual((await call('POST', '/api/users', { token: t, body: nuevo })).status, 403);
        assert.strictEqual((await call('PATCH', '/api/users/coord_cs', { token: t, body: { activo: false } })).status, 403);
        assert.strictEqual((await call('GET', '/api/security/audit-logs', { token: t })).status, 403);
      }
    });

    console.log('T-03a HTTP: lectura por red');

    const A = '93200001'; // red Pacifico Sur (establecimiento 00001744)
    const B = '93200002'; // establecimiento fuera del catalogo: red desconocida, solo ADMIN
    const idA = 'pac-00001741-' + A;
    const idB = 'pac-00001741-' + B;

    await step('ADMIN registra un paciente de Pacifico Sur y uno de red desconocida', async () => {
      assert.strictEqual((await call('POST', '/fhir/Bundle', { token: admin, body: bundleFor(A, '00001744') })).status, 200);
      assert.strictEqual((await call('POST', '/fhir/Bundle', { token: admin, body: bundleFor(B, '99999999') })).status, 200);
    });

    await step('lectura: ADMIN ve ambos; coord Pacifico Sur solo A; coord Conchucos Sur ninguno', async () => {
      const ver = async t => dnisOf((await call('GET', '/api/cronicos', { token: t })).json);
      assert.deepStrictEqual(await ver(admin), [A, B]);
      assert.deepStrictEqual(await ver(coordPs), [A]);
      assert.deepStrictEqual(await ver(coordCs), []);
      assert.deepStrictEqual(dnisOf((await call('GET', '/api/patients', { token: coordPs })).json.data), [A]);
      const fb = await call('GET', '/fhir/Bundle', { token: coordPs });
      assert.strictEqual(fb.json.total, 1);
    });

    await step('expediente /fhir/Patient/:id: de otra red o sin red responde 404 (como si no existiera)', async () => {
      assert.strictEqual((await call('GET', '/fhir/Patient/' + A + '/bundle', { token: coordPs })).status, 200);
      assert.strictEqual((await call('GET', '/fhir/Patient/' + A + '/bundle', { token: coordCs })).status, 404);
      assert.strictEqual((await call('GET', '/fhir/Patient/' + B + '/bundle', { token: coordPs })).status, 404);
      assert.strictEqual((await call('GET', '/fhir/Patient/' + idB, { token: admin })).status, 200);
    });

    await step('DIRECTOR: ve el resumen agregado de SU red, pero ningún dato individual (403)', async () => {
      const s = await call('GET', '/api/alerts/summary', { token: director });
      assert.strictEqual(s.status, 200);
      assert.strictEqual(s.json.total_pacientes, 1);
      assert.ok(!/93200001|dni"/i.test(JSON.stringify(s.json)) || s.json.personas_unicas_dni === 1);
      assert.strictEqual((await call('GET', '/api/cronicos', { token: director })).status, 403);
      assert.strictEqual((await call('GET', '/api/patients/geo', { token: director })).status, 403);
      assert.strictEqual((await call('GET', '/fhir/Bundle', { token: director })).status, 403);
      assert.strictEqual((await call('GET', '/fhir/Patient/' + A, { token: director })).status, 403);
      assert.strictEqual((await call('GET', '/api/establishments', { token: director })).status, 200);
    });

    await step('resumen y establecimientos por red: ADMIN ve todo, coord Conchucos Sur nada de otra red', async () => {
      assert.strictEqual((await call('GET', '/api/alerts/summary', { token: admin })).json.total_pacientes, 2);
      assert.strictEqual((await call('GET', '/api/alerts/summary', { token: coordCs })).json.total_pacientes, 0);
      assert.strictEqual((await call('GET', '/api/establishments', { token: coordCs })).json.count, 0);
      assert.ok((await call('GET', '/api/establishments', { token: coordPs })).json.count > 0);
    });

    await step('ETag por alcance: el 304 de un usuario nunca se aplica a otro', async () => {
      const a = await call('GET', '/api/cronicos', { token: admin });
      const etagAdmin = a.headers.get('etag');
      const p = await call('GET', '/api/cronicos', { token: coordPs });
      assert.notStrictEqual(p.headers.get('etag'), etagAdmin);
      const probe = await call('GET', '/api/cronicos', { token: coordPs, headers: { 'If-None-Match': etagAdmin } });
      assert.strictEqual(probe.status, 200, 'el ETag de ADMIN no debe dar 304 a otro alcance');
      assert.deepStrictEqual(dnisOf(probe.json), [A]);
      const again = await call('GET', '/api/cronicos', { token: coordPs, headers: { 'If-None-Match': p.headers.get('etag') } });
      assert.strictEqual(again.status, 304);
      assert.ok(/private/.test(p.headers.get('cache-control') || ''));
    });

    console.log('T-03a HTTP: escritura por red');

    const C = '93200003';
    await step('coord Pacifico Sur: puede registrar un paciente en su red (200)', async () => {
      assert.strictEqual((await call('POST', '/fhir/Bundle', { token: coordPs, body: bundleFor(C, '00001744') })).status, 200);
      assert.deepStrictEqual(dnisOf((await call('GET', '/api/cronicos', { token: coordPs })).json), [A, C]);
    });

    await step('coord Conchucos Sur: no puede registrar en Pacifico Sur ni tocar pacientes ajenos (403)', async () => {
      assert.strictEqual((await call('POST', '/fhir/Bundle', { token: coordCs, body: bundleFor('93200004', '00001744') })).status, 403);
      assert.strictEqual((await call('POST', '/fhir/Bundle', { token: coordCs, body: bundleFor(A, '00001744') })).status, 403);
      assert.strictEqual((await call('POST', '/fhir/Bundle', { token: coordPs, body: bundleFor(B, '99999999') })).status, 403);
      assert.deepStrictEqual(dnisOf((await call('GET', '/api/cronicos', { token: admin })).json), [A, B, C]);
    });

    await step('webhook: un lote con un registro ajeno se rechaza ENTERO (no se escribe nada)', async () => {
      const lote = [
        { NRO_DOCUMENTO: '93200005', APELLIDOS_NOMBRES: 'PRUEBA LOTE UNO' },
        { NRO_DOCUMENTO: B, APELLIDOS_NOMBRES: 'PRUEBA LOTE AJENO' }
      ];
      const r = await call('POST', '/api/webhooks/hosix', { token: coordPs, body: lote });
      assert.strictEqual(r.status, 403, r.text);
      assert.ok(!dnisOf((await call('GET', '/api/cronicos', { token: admin })).json).includes('93200005'), 'el primer registro no debe haberse guardado');
    });

    await step('pre-cita: coord de su red puede (200); de otra red o paciente inexistente no (404, sin revelar si existe: F2-04)', async () => {
      const ok = await call('POST', '/api/appointments/pre-cita', { token: coordPs, body: { patient_id: idA, fecha_sugerida: '2026-12-01' } });
      assert.strictEqual(ok.status, 200, ok.text);
      assert.strictEqual((await call('POST', '/api/appointments/pre-cita', { token: coordCs, body: { patient_id: idA } })).status, 404);
      assert.strictEqual((await call('POST', '/api/appointments/pre-cita', { token: coordPs, body: { patient_id: 'no-existe-123' } })).status, 404);
      assert.strictEqual((await call('POST', '/api/appointments/pre-cita', { token: director, body: { patient_id: idA } })).status, 403);
    });

    await step('DIRECTOR no puede escribir nada (403)', async () => {
      assert.strictEqual((await call('POST', '/fhir/Bundle', { token: director, body: bundleFor('93200006', '00001744') })).status, 403);
      assert.strictEqual((await call('POST', '/api/webhooks/hosix', { token: director, body: [{ NRO_DOCUMENTO: '93200006' }] })).status, 403);
    });

    console.log('T-03a HTTP: cambios de usuarios y bloqueo');

    await step('cambiar la red de un usuario cierra sus sesiones anteriores y aplica el nuevo alcance', async () => {
      const antes = await call('GET', '/api/cronicos', { token: coordCs });
      assert.strictEqual(antes.status, 200);
      const r = await call('PATCH', '/api/users/coord_cs', { token: admin, body: { red: 'Pacífico Sur' } });
      assert.strictEqual(r.status, 200, r.text);
      assert.strictEqual(r.json.user.red, 'PACIFICO SUR');
      assert.strictEqual((await call('GET', '/api/cronicos', { token: coordCs })).status, 401, 'el token anterior ya no vale');
      const nuevo = await login('coord_cs', 'clave-de-coord_cs-123');
      assert.strictEqual(nuevo.status, 200);
      assert.deepStrictEqual(dnisOf((await call('GET', '/api/cronicos', { token: nuevo.json.token })).json), [A, C]);
    });

    await step('desactivar un usuario: su token y su login dejan de funcionar; reactivarlo lo devuelve', async () => {
      const t = (await login('coord_cs', 'clave-de-coord_cs-123')).json.token;
      assert.strictEqual((await call('PATCH', '/api/users/coord_cs', { token: admin, body: { activo: false } })).status, 200);
      assert.strictEqual((await call('GET', '/api/cronicos', { token: t })).status, 401);
      assert.strictEqual((await login('coord_cs', 'clave-de-coord_cs-123')).status, 401);
      assert.strictEqual((await call('PATCH', '/api/users/coord_cs', { token: admin, body: { activo: true } })).status, 200);
      assert.strictEqual((await login('coord_cs', 'clave-de-coord_cs-123')).status, 200);
    });

    await step('cambiar la clave de un usuario: la anterior deja de valer', async () => {
      const r = await call('PATCH', '/api/users/dir_ps', { token: admin, body: { password: 'clave-nueva-del-director-9' } });
      assert.strictEqual(r.status, 200, r.text);
      assert.strictEqual((await login('dir_ps', 'clave-de-dir_ps-123')).status, 401);
      assert.strictEqual((await login('dir_ps', 'clave-nueva-del-director-9')).status, 200);
      assert.strictEqual((await call('PATCH', '/api/users/dir_ps', { token: admin, body: { password: 'corta' } })).status, 400);
    });

    await step('validaciones de PATCH: usuario inexistente 404; rol o red inválidos 400', async () => {
      assert.strictEqual((await call('PATCH', '/api/users/no_existe', { token: admin, body: { activo: false } })).status, 404);
      assert.strictEqual((await call('PATCH', '/api/users/dir_ps', { token: admin, body: { role: 'SUPERUSUARIO' } })).status, 400);
      assert.strictEqual((await call('PATCH', '/api/users/dir_ps', { token: admin, body: { red: 'RED INVENTADA' } })).status, 400);
      assert.strictEqual((await call('PATCH', '/api/users/dir_ps', { token: admin, body: { activo: 'no' } })).status, 400);
    });

    await step('siempre queda un ADMIN activo: no se puede desactivar ni degradar al último (409)', async () => {
      assert.strictEqual((await call('PATCH', '/api/users/admin', { token: admin, body: { activo: false } })).status, 409);
      assert.strictEqual((await call('PATCH', '/api/users/admin', { token: admin, body: { role: 'DIRECTOR', red: '156' } })).status, 409);
      assert.strictEqual((await call('GET', '/api/auth/me', { token: admin })).status, 200);
    });

    await step('la auditoría registra los accesos y cambios, sin claves', async () => {
      const r = await call('GET', '/api/security/audit-logs?limit=500', { token: admin });
      assert.strictEqual(r.status, 200);
      const eventos = new Set(r.json.logs.map(l => l.evento));
      for (const e of ['LOGIN_OK', 'LOGIN_FALLIDO', 'USUARIO_CREADO', 'USUARIO_MODIFICADO']) assert.ok(eventos.has(e), 'falta el evento ' + e);
      assert.ok(!/clave-|password_hash|scrypt\$/i.test(r.text), 'la auditoría no debe contener claves ni hashes');
    });

    await step('tras 10 intentos fallidos el login responde 429 (también con la clave correcta)', async () => {
      let ultimo = 0;
      for (let i = 0; i < 10; i++) ultimo = (await login('coord_ps', 'intento-fallido-' + i)).status;
      assert.strictEqual(ultimo, 401);
      assert.strictEqual((await login('coord_ps', 'intento-fallido-final')).status, 429);
      assert.strictEqual((await login('coord_ps', 'clave-de-coord_ps-123')).status, 429);
      assert.strictEqual((await login('admin', ADMIN_PASS)).status, 200, 'el bloqueo es por usuario: otro usuario no se ve afectado');
    });
  } catch (e) {
    failed++;
    console.log('  FALLA ' + e.message);
    console.log('--- salida del servidor ---\n' + srv.getLog());
  } finally {
    await srv.stop();
    const free = await srv.portIsFree();
    console.log('Servidor apagado: ' + (srv.isExited() ? 'si' : 'NO') + '; puerto ' + PORT + ' libre: ' + (free ? 'si' : 'NO'));
  }

  const arranque = await exitCodeWith({ NODE_ENV: 'production', AUTH_SECRET: '', ADMIN_PASSWORD: 'clave-admin-de-prueba-1' });
  await step('NODE_ENV=production sin AUTH_SECRET: el servidor NO arranca (sale con error)', async () => {
    assert.ok(typeof arranque === 'number' && arranque !== 0, 'codigo de salida: ' + arranque);
  });
  const arranque2 = await exitCodeWith({ NODE_ENV: 'production', AUTH_SECRET: 'x'.repeat(40), ADMIN_PASSWORD: '' });
  await step('NODE_ENV=production sin ADMIN_PASSWORD (y sin admin): el servidor NO arranca', async () => {
    assert.ok(typeof arranque2 === 'number' && arranque2 !== 0, 'codigo de salida: ' + arranque2);
  });

  console.log('\nResultado: ' + passed + ' correctas, ' + failed + ' con falla');
  process.exit(failed === 0 ? 0 : 1);
}

main();
