/**
 * testAuth.js
 * T-03a: redes (las 7 RIS de GeoRIS), contraseñas (scrypt), token HMAC, alcance de lectura y de escritura
 * por red, arranque del administrador y middleware authenticate/requireScope.
 * Usa pacientes y usuarios inventados, todo en memoria.
 * Ejecutar: node server/tests/testAuth.js
 */

const assert = require('assert');

process.env.AUTH_SECRET = 'secreto-de-prueba-que-tiene-mas-de-32-caracteres';

const { db, resetDb, closeDb } = require('./helpers/memoryDb');
const auth = require('../auth/auth');
const { RIS, normalizeRed, sameRed } = require('../auth/redes');
const scope = require('../auth/scope');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  resetDb();
  try {
    await fn();
    passed++;
    console.log('  OK    ' + name);
  } catch (e) {
    failed++;
    console.log('  FALLA ' + name + '\n        ' + e.message);
  }
}

function fakeRes() {
  const r = {
    code: null,
    body: null,
    headers: {},
    setHeader(k, v) { r.headers[k] = v; },
    status(c) { r.code = c; return r; },
    json(b) { r.body = b; return r; }
  };
  return r;
}

function runMiddleware(mw, req) {
  const res = fakeRes();
  let nexted = false;
  mw(req, res, () => { nexted = true; });
  return { res, nexted };
}

function withEnv(vars, fn) {
  const previous = {};
  for (const k of Object.keys(vars)) {
    previous[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  const restore = () => {
    for (const k of Object.keys(vars)) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
  };
  try {
    const out = fn();
    if (out && typeof out.then === 'function') return out.finally(restore);
    restore();
    return out;
  } catch (e) {
    restore();
    throw e;
  }
}

const ADMIN = { username: 'adm', role: 'ADMIN', red: null };
const COORD_PS = { username: 'c1', role: 'COORDINADOR', red: 'PACIFICO SUR' };
const COORD_CS = { username: 'c2', role: 'COORDINADOR', red: 'CONCHUCOS SUR' };
const DIR_SIN_RED = { username: 'd1', role: 'DIRECTOR', red: null };

// Tres pacientes inventados: uno en Pacifico Sur (por defecto), uno de Conchucos Sur (red explicita)
// y uno con un establecimiento que no esta en el catalogo (red desconocida).
function sembrarPacientes() {
  db.upsertPatient({ id: 'p-ps', dni: '93000001', apellidos_nombres: 'PRUEBA UNO' });
  db.upsertPatient({ id: 'p-cs', dni: '93000002', apellidos_nombres: 'PRUEBA DOS', red_salud: 'Conchucos Sur' });
  db.upsertPatient({ id: 'p-x', dni: '93000003', apellidos_nombres: 'PRUEBA TRES', puerta_entrada_id: '99999999' });
}

function parsedVacio(extra) {
  return Object.assign({ patients: [], conditions: [], appointments: [], observations: [], medications: [] }, extra);
}

function crearUsuario(extra) {
  return db.createUser(Object.assign({
    username: 'ana', nombre: 'ANA PRUEBA', role: 'COORDINADOR', red: 'PACIFICO SUR',
    password_hash: 'no-importa', activo: true, creado: new Date().toISOString()
  }, extra));
}

async function main() {
  console.log('T-03a: redes');

  await test('hay 7 RIS y son las de GeoRIS', () => {
    assert.strictEqual(RIS.length, 7);
    assert.deepStrictEqual(RIS.map(r => r.nombre).sort(), [
      'CONCHUCOS NORTE', 'CONCHUCOS SUR', 'HUAYLAS NORTE', 'HUAYLAS SUR 1', 'HUAYLAS SUR 2', 'PACIFICO NORTE', 'PACIFICO SUR'
    ]);
  });

  await test('normalizeRed acepta nombre, tildes, codigo y el texto de GeoRIS', () => {
    assert.strictEqual(normalizeRed('Pacífico Sur'), 'PACIFICO SUR');
    assert.strictEqual(normalizeRed('PACIFICO SUR (N° 156)'), 'PACIFICO SUR');
    assert.strictEqual(normalizeRed('156'), 'PACIFICO SUR');
    assert.strictEqual(normalizeRed('ris 156'), 'PACIFICO SUR');
    assert.strictEqual(normalizeRed('  conchucos norte '), 'CONCHUCOS NORTE');
    assert.strictEqual(normalizeRed('HUAYLAS SUR 1'), 'HUAYLAS SUR 1');
    assert.strictEqual(normalizeRed('Huaylas Sur 2 (N° 104)'), 'HUAYLAS SUR 2');
    assert.strictEqual(normalizeRed('RED INVENTADA'), null);
    assert.strictEqual(normalizeRed(''), null);
    assert.strictEqual(normalizeRed(null), null);
  });

  await test('sameRed compara redes ya normalizadas y nunca iguala nulos', () => {
    assert.strictEqual(sameRed('Pacífico Sur', '156'), true);
    assert.strictEqual(sameRed('PACIFICO SUR', 'PACIFICO NORTE'), false);
    assert.strictEqual(sameRed(null, null), false);
    assert.strictEqual(sameRed('PACIFICO SUR', null), false);
  });

  console.log('T-03a: contraseñas');

  await test('hashPassword + verifyPassword: correcta, incorrecta y almacenado invalido', async () => {
    const h = await auth.hashPassword('clave-de-prueba-1');
    assert.ok(h.startsWith('scrypt$'));
    assert.ok(!h.includes('clave-de-prueba-1'));
    assert.strictEqual(await auth.verifyPassword('clave-de-prueba-1', h), true);
    assert.strictEqual(await auth.verifyPassword('otra-clave-distinta', h), false);
    assert.strictEqual(await auth.verifyPassword('clave-de-prueba-1', null), false);
    assert.strictEqual(await auth.verifyPassword('clave-de-prueba-1', 'basura'), false);
    assert.notStrictEqual(await auth.hashPassword('clave-de-prueba-1'), h, 'cada hash lleva su propia sal');
  });

  await test('validatePassword exige entre 10 y 128 caracteres', () => {
    assert.ok(auth.validatePassword('corta'));
    assert.ok(auth.validatePassword(''));
    assert.ok(auth.validatePassword(12345678901));
    assert.ok(auth.validatePassword('x'.repeat(129)));
    assert.strictEqual(auth.validatePassword('suficientemente-larga'), null);
  });

  console.log('T-03a: token');

  await test('signToken + verifyToken: ida y vuelta', () => {
    const t = auth.signToken('ana');
    assert.ok(t.token.includes('.'));
    assert.ok(!Number.isNaN(Date.parse(t.expires_at)));
    const p = auth.verifyToken(t.token);
    assert.strictEqual(p.sub, 'ana');
  });

  await test('verifyToken rechaza payload manipulado, firma manipulada, vencido y basura', () => {
    const t = auth.signToken('ana');
    const [body, sig] = t.token.split('.');
    const forjado = Buffer.from(JSON.stringify({ sub: 'admin', iat: 1, exp: 9999999999 })).toString('base64url') + '.' + sig;
    assert.strictEqual(auth.verifyToken(forjado), null);
    assert.strictEqual(auth.verifyToken(body + '.' + sig.slice(0, -2) + 'AA'), null);
    assert.strictEqual(auth.verifyToken(t.token, Date.now() + (auth.TOKEN_TTL_SECONDS + 5) * 1000), null);
    for (const basura of ['', 'a.b', 'a.b.c', null, undefined, 123, {}]) {
      assert.strictEqual(auth.verifyToken(basura), null);
    }
  });

  console.log('T-03a: alcance de lectura por red');

  await test('filterPatients: ADMIN ve todo; cada rol de red solo su red; sin red o sin usuario, nada', () => {
    sembrarPacientes();
    const todos = db.getAllPatients();
    assert.strictEqual(scope.filterPatients(ADMIN, todos).length, 3);
    assert.deepStrictEqual(scope.filterPatients(COORD_PS, todos).map(p => p.dni), ['93000001']);
    assert.deepStrictEqual(scope.filterPatients(COORD_CS, todos).map(p => p.dni), ['93000002']);
    assert.deepStrictEqual(scope.filterPatients(DIR_SIN_RED, todos), []);
    assert.deepStrictEqual(scope.filterPatients(null, todos), []);
  });

  await test('canSeePatient: el paciente sin red conocida solo lo ve ADMIN', () => {
    sembrarPacientes();
    const x = db.getPatientByDni('93000003');
    assert.strictEqual(scope.canSeePatient(ADMIN, x), true);
    assert.strictEqual(scope.canSeePatient(COORD_PS, x), false);
    assert.strictEqual(scope.canSeePatient(COORD_CS, x), false);
  });

  await test('filterEstablishments: cada red ve solo sus establecimientos', () => {
    const todos = db.getEstablishments();
    assert.strictEqual(scope.filterEstablishments(ADMIN, todos).length, todos.length);
    assert.ok(scope.filterEstablishments(COORD_PS, todos).length > 0);
    assert.strictEqual(scope.filterEstablishments(COORD_CS, todos).length, 0);
  });

  await test('etagFor: cambia con el usuario y su alcance (F2-06), igual para el mismo usuario', () => {
    const base = 'W/"cronicos-v1-3"';
    assert.strictEqual(scope.etagFor(ADMIN, base), base);
    assert.notStrictEqual(scope.etagFor(COORD_PS, base), base);
    assert.notStrictEqual(scope.etagFor(COORD_PS, base), scope.etagFor(COORD_CS, base));
    assert.strictEqual(scope.etagFor(COORD_PS, base), scope.etagFor(Object.assign({}, COORD_PS), base));
    // Dos usuarios de la misma red y rol, con distinto establecimiento, no comparten ETag (antes sí: 304 cruzado)
    const otroDeLaRed = Object.assign({}, COORD_PS, { username: 'otro.coord', establecimiento_id: '00001744' });
    assert.notStrictEqual(scope.etagFor(COORD_PS, base), scope.etagFor(otroDeLaRed, base));
    assert.ok(/^W\/".*"$/.test(scope.etagFor(COORD_PS, base)));
  });

  console.log('T-03a: alcance de escritura por red');

  await test('checkWrite: ADMIN escribe donde sea; sin usuario, nunca', () => {
    sembrarPacientes();
    assert.strictEqual(scope.checkWrite(ADMIN, [parsedVacio({ patients: [{ id: 'n1', dni: '93100001' }] })]), null);
    assert.ok(scope.checkWrite(null, [parsedVacio()]));
  });

  await test('checkWrite: paciente nuevo sin establecimiento cae en Pacifico Sur (el valor por defecto)', () => {
    sembrarPacientes();
    const lote = [parsedVacio({ patients: [{ id: 'n1', dni: '93100001' }] })];
    assert.strictEqual(scope.checkWrite(COORD_PS, lote), null);
    assert.ok(scope.checkWrite(COORD_CS, lote), 'otra red no puede crear pacientes en Pacifico Sur');
  });

  await test('checkWrite: paciente nuevo con la red explicita de la persona se permite', () => {
    sembrarPacientes();
    const lote = [parsedVacio({ patients: [{ id: 'n2', dni: '93100002', red_salud: 'Conchucos Sur' }] })];
    assert.strictEqual(scope.checkWrite(COORD_CS, lote), null);
    assert.ok(scope.checkWrite(COORD_PS, lote));
  });

  await test('checkWrite: no se puede tocar un paciente existente de otra red ni uno sin red', () => {
    sembrarPacientes();
    assert.ok(scope.checkWrite(COORD_PS, [parsedVacio({ patients: [{ id: 'otro-id', dni: '93000002' }] })]));
    assert.ok(scope.checkWrite(COORD_PS, [parsedVacio({ patients: [{ id: 'otro-id', dni: '93000003' }] })]));
    assert.strictEqual(scope.checkWrite(COORD_PS, [parsedVacio({ patients: [{ id: 'otro-id', dni: '93000001' }] })]), null);
  });

  await test('checkWrite: no se puede sacar a un paciente propio de la red cambiandole la red', () => {
    sembrarPacientes();
    const lote = [parsedVacio({ patients: [{ id: 'p-ps', dni: '93000001', red_salud: 'CONCHUCOS SUR' }] })];
    assert.ok(scope.checkWrite(COORD_PS, lote));
  });

  await test('checkWrite: no se puede mover un paciente fuera de la red cambiando su establecimiento', () => {
    sembrarPacientes();
    const aOtraRed = [parsedVacio({ patients: [{ id: 'p-ps', dni: '93000001', puerta_entrada_id: '99999999' }] })];
    const aPropiaRed = [parsedVacio({ patients: [{ id: 'p-ps', dni: '93000001', puerta_entrada_id: '00001744' }] })];
    assert.ok(scope.checkWrite(COORD_PS, aOtraRed), 'establecimiento fuera del catalogo = fuera de la red');
    assert.strictEqual(scope.checkWrite(COORD_PS, aPropiaRed), null);
    assert.ok(scope.checkWrite(COORD_CS, aPropiaRed));
  });

  await test('checkWrite: citas y observaciones de un paciente de otra red se rechazan', () => {
    sembrarPacientes();
    const obsAjena = [parsedVacio({ observations: [{ id: 'o1', patient_id: 'p-cs' }] })];
    const obsPropia = [parsedVacio({ observations: [{ id: 'o2', patient_id: 'p-ps' }] })];
    const citaPorDni = [parsedVacio({ appointments: [{ id: 'a1', patient_id: '93000002' }] })];
    assert.ok(scope.checkWrite(COORD_PS, obsAjena));
    assert.strictEqual(scope.checkWrite(COORD_PS, obsPropia), null);
    assert.ok(scope.checkWrite(COORD_PS, citaPorDni));
  });

  console.log('T-03a: arranque y middleware');

  await test('checkConfig: en produccion exige AUTH_SECRET de 32+ caracteres', () => {
    withEnv({ NODE_ENV: 'production', AUTH_SECRET: undefined }, () => {
      assert.throws(() => auth.checkConfig(), /AUTH_SECRET/);
    });
    withEnv({ NODE_ENV: 'production', AUTH_SECRET: 'corto' }, () => {
      assert.throws(() => auth.checkConfig(), /AUTH_SECRET/);
    });
    // F2-01: un secreto de un solo carácter repetido ya no se acepta; uno variado sí
    withEnv({ NODE_ENV: 'production', AUTH_SECRET: 'x'.repeat(40) }, () => {
      assert.throws(() => auth.checkConfig(), /AUTH_SECRET/);
    });
    withEnv({ NODE_ENV: 'production', AUTH_SECRET: 'f2-q7Wm2Kx9Lp4Rt8Vz1Nc6Hb3Jd5Fs0Gy-prueba' }, () => {
      assert.doesNotThrow(() => auth.checkConfig());
    });
  });

  await test('bootstrapAdmin: crea el administrador una sola vez con ADMIN_PASSWORD', async () => {
    await withEnv({ ADMIN_USER: undefined, ADMIN_PASSWORD: 'clave-inicial-segura-1', NODE_ENV: 'test' }, async () => {
      const r = await auth.bootstrapAdmin();
      assert.strictEqual(r.created, true);
      assert.strictEqual(r.username, 'admin');
      assert.strictEqual(r.generatedPassword, undefined);
      assert.strictEqual((await auth.bootstrapAdmin()).created, false);
    });
    const u = db.getUserByUsername('admin');
    assert.strictEqual(u.role, 'ADMIN');
    assert.strictEqual(u.red, null);
    assert.strictEqual(u.activo, true);
    assert.ok(u.password_hash.startsWith('scrypt$'));
    assert.strictEqual(await auth.verifyPassword('clave-inicial-segura-1', u.password_hash), true);
  });

  await test('bootstrapAdmin: en produccion sin ADMIN_PASSWORD no arranca; en desarrollo genera una clave', async () => {
    await withEnv({ NODE_ENV: 'production', ADMIN_PASSWORD: undefined }, async () => {
      await assert.rejects(() => auth.bootstrapAdmin(), /ADMIN_PASSWORD/);
    });
    assert.strictEqual(db.listUsers().length, 0);
    await withEnv({ NODE_ENV: 'test', ADMIN_PASSWORD: undefined, ADMIN_USER: 'root' }, async () => {
      const r = await auth.bootstrapAdmin();
      assert.strictEqual(r.created, true);
      assert.strictEqual(r.username, 'root');
      assert.ok(r.generatedPassword && r.generatedPassword.length >= 10);
      assert.ok(!db.getUserByUsername('root').password_hash.includes(r.generatedPassword));
    });
  });

  await test('bootstrapAdmin: ADMIN_RESET=true restablece la clave del administrador y cierra sus sesiones', async () => {
    await withEnv({ ADMIN_USER: undefined, ADMIN_PASSWORD: 'clave-inicial-segura-1', NODE_ENV: 'test' }, () => auth.bootstrapAdmin());
    const sesionVieja = auth.signToken('admin');
    await withEnv({ ADMIN_PASSWORD: 'clave-nueva-segura-22', ADMIN_RESET: 'true', NODE_ENV: 'test' }, async () => {
      const r = await auth.bootstrapAdmin();
      assert.strictEqual(r.created, false);
      assert.strictEqual(r.reset, true);
    });
    const u = db.getUserByUsername('admin');
    assert.strictEqual(await auth.verifyPassword('clave-nueva-segura-22', u.password_hash), true);
    assert.strictEqual(await auth.verifyPassword('clave-inicial-segura-1', u.password_hash), false);
    const req = { headers: { authorization: 'Bearer ' + sesionVieja.token } };
    assert.strictEqual(runMiddleware(auth.authenticate, req).res.code, 401, 'la sesion anterior al reinicio ya no vale');
    await withEnv({ ADMIN_PASSWORD: 'clave-nueva-segura-22', ADMIN_RESET: undefined, NODE_ENV: 'test' }, async () => {
      assert.strictEqual((await auth.bootstrapAdmin()).reset, undefined, 'sin ADMIN_RESET no se reinicia nada');
    });
  });

  await test('bootstrapAdmin: una ADMIN_PASSWORD debil se rechaza', async () => {
    await withEnv({ NODE_ENV: 'test', ADMIN_PASSWORD: 'corta' }, async () => {
      await assert.rejects(() => auth.bootstrapAdmin(), /ADMIN_PASSWORD/);
    });
    assert.strictEqual(db.listUsers().length, 0);
  });

  await test('authenticate: sin encabezado, con esquema distinto o con token falso -> 401', () => {
    crearUsuario();
    for (const headers of [{}, { authorization: 'Basic abc' }, { authorization: 'Bearer falso' }, { authorization: 'Bearer ' }]) {
      const { res, nexted } = runMiddleware(auth.authenticate, { headers, ip: '127.0.0.1' });
      assert.strictEqual(res.code, 401);
      assert.strictEqual(nexted, false);
      assert.ok(/Bearer/.test(res.headers['WWW-Authenticate'] || ''));
    }
  });

  await test('authenticate: token valido -> req.user con el rol y la red guardados, no los del token', () => {
    crearUsuario();
    const { token } = auth.signToken('ana');
    const req = { headers: { authorization: 'Bearer ' + token }, ip: '127.0.0.1' };
    const { nexted } = runMiddleware(auth.authenticate, req);
    assert.strictEqual(nexted, true);
    assert.strictEqual(req.user.username, 'ana');
    assert.strictEqual(req.user.role, 'COORDINADOR');
    assert.strictEqual(req.user.red, 'PACIFICO SUR');
    assert.strictEqual(req.user.password_hash, undefined);
    assert.strictEqual(req.auditContext.actor, 'ana');
  });

  await test('authenticate: usuario desactivado o inexistente -> 401 aunque el token sea valido', () => {
    crearUsuario({ activo: false });
    const { token } = auth.signToken('ana');
    assert.strictEqual(runMiddleware(auth.authenticate, { headers: { authorization: 'Bearer ' + token } }).res.code, 401);
    const fantasma = auth.signToken('fantasma').token;
    assert.strictEqual(runMiddleware(auth.authenticate, { headers: { authorization: 'Bearer ' + fantasma } }).res.code, 401);
  });

  await test('x-clinical-role ya no vale: el rol sale del usuario guardado y requireScope devuelve 403', () => {
    crearUsuario();
    const { token } = auth.signToken('ana');
    const req = { headers: { authorization: 'Bearer ' + token, 'x-clinical-role': 'ADMIN', 'x-clinical-user': 'otro' }, ip: '127.0.0.1' };
    runMiddleware(auth.authenticate, req);
    assert.strictEqual(req.user.role, 'COORDINADOR');
    assert.strictEqual(req.auditContext.actor, 'ana');
    const { res, nexted } = runMiddleware(auth.requireScope(['ADMIN']), req);
    assert.strictEqual(res.code, 403);
    assert.strictEqual(nexted, false);
    assert.strictEqual(runMiddleware(auth.requireScope(['ADMIN', 'COORDINADOR']), req).nexted, true);
  });

  await test('requireScope sin usuario autenticado -> 401', () => {
    const { res, nexted } = runMiddleware(auth.requireScope(['ADMIN']), { headers: {} });
    assert.strictEqual(res.code, 401);
    assert.strictEqual(nexted, false);
  });

  closeDb();
  console.log('\nResultado: ' + passed + ' correctas, ' + failed + ' con falla');
  process.exit(failed === 0 ? 0 : 1);
}

main();
