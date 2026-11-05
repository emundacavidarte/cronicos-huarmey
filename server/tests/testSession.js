/**
 * testSession.js
 * T-03b: módulo de sesión del cliente (client/js/auth/session.js).
 *  - Parte 1: con un fetch y un almacenamiento falsos (datos inventados).
 *  - Parte 2: contra el servidor REAL (puerto 3103, sin tocar store.json).
 * Ejecutar: node server/tests/testSession.js
 */

const assert = require('assert');
const AuthSession = require('../../client/js/auth/session');
const { startServer } = require('./helpers/realServer');

const PORT = 3103;
const ADMIN_PASS = 'clave-admin-sesion-1';
const KEY = 'maxime_cronicos_sesion_v1';

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

// --- Auxiliares de la parte 1 ---
function fakeStorage(initial) {
  const m = new Map(Object.entries(initial || {}));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    dump: () => Array.from(m.values()).join('|'),
    size: () => m.size
  };
}

function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

const EP = { AUTH_LOGIN: 'http://x/api/auth/login', AUTH_ME: 'http://x/api/auth/me' };
const NOW = Date.parse('2026-10-22T12:00:00Z');
const FUTURO = '2026-10-22T20:00:00.000Z';
const PASADO = '2026-10-22T08:00:00.000Z';

function sesionGuardada(expires, role) {
  return JSON.stringify({ token: 'tok.en', expires_at: expires, user: { username: 'ana', nombre: 'ANA', role: role || 'COORDINADOR', red: 'PACIFICO SUR' } });
}

function nueva(extra) {
  const calls = [];
  const expiradas = [];
  const storage = (extra && extra.storage) || fakeStorage();
  const s = AuthSession.create(Object.assign({
    storage,
    now: () => NOW,
    getEndpoints: () => EP,
    onExpired: motivo => expiradas.push(motivo),
    fetchImpl: async (url, init) => { calls.push({ url, init }); return jsonResponse(200, {}); }
  }, extra || {}));
  return { s, calls, expiradas, storage };
}

async function main() {
  console.log('Sesión del cliente: permisos');

  await step('permisosDe: ADMIN todo; COORDINADOR sin usuarios; DIRECTOR solo resumen; rol desconocido nada', () => {
    assert.deepStrictEqual({ ...AuthSession.permisosDe('ADMIN') }, { verResumen: true, verPacientes: true, escribir: true, gestionarUsuarios: true });
    assert.deepStrictEqual({ ...AuthSession.permisosDe('COORDINADOR') }, { verResumen: true, verPacientes: true, escribir: true, gestionarUsuarios: false });
    assert.deepStrictEqual({ ...AuthSession.permisosDe('DIRECTOR') }, { verResumen: true, verPacientes: false, escribir: false, gestionarUsuarios: false });
    for (const r of ['', 'admin', 'ROOT', null, undefined]) {
      assert.deepStrictEqual({ ...AuthSession.permisosDe(r) }, { verResumen: false, verPacientes: false, escribir: false, gestionarUsuarios: false });
    }
    assert.ok(Object.isFrozen(AuthSession.permisosDe('ADMIN')), 'los permisos no deben poder modificarse');
  });

  console.log('Sesión del cliente: inicio y cierre (fetch falso)');

  await step('login correcto: guarda token y usuario, nunca la clave; authFetch envía Bearer y no usa caché', async () => {
    const calls = [];
    const { s, storage } = nueva({
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        if (url === EP.AUTH_LOGIN) return jsonResponse(200, { success: true, token: 'tok.en', token_type: 'Bearer', expires_at: FUTURO, user: { username: 'ana', nombre: 'ANA', role: 'COORDINADOR', red: 'PACIFICO SUR' } });
        return jsonResponse(200, { ok: true });
      }
    });
    const r = await s.login('ana', 'clave-secreta-123');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.user.role, 'COORDINADOR');
    assert.strictEqual(s.isLoggedIn(), true);
    assert.strictEqual(s.getToken(), 'tok.en');
    assert.ok(!storage.dump().includes('clave-secreta-123'), 'la clave no debe guardarse');
    assert.strictEqual(JSON.parse(calls[0].init.body).password, 'clave-secreta-123');

    await s.authFetch('http://x/api/cronicos', { headers: { Accept: 'application/json' } });
    const h = calls[1].init.headers;
    assert.strictEqual(h.Authorization, 'Bearer tok.en');
    assert.strictEqual(h.Accept, 'application/json');
    assert.strictEqual(calls[1].init.cache, 'no-store');
  });

  await step('login con clave mala: ok=false, status 401, mensaje del servidor y nada guardado', async () => {
    const { s, storage } = nueva({
      fetchImpl: async () => jsonResponse(401, { resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'login', diagnostics: 'Usuario o clave incorrectos.' }] })
    });
    const r = await s.login('ana', 'mala');
    assert.deepStrictEqual({ ok: r.ok, status: r.status, message: r.message }, { ok: false, status: 401, message: 'Usuario o clave incorrectos.' });
    assert.strictEqual(s.isLoggedIn(), false);
    assert.strictEqual(storage.size(), 0);
  });

  await step('login bloqueado (429) devuelve el mensaje del servidor; red caída devuelve status 0', async () => {
    const a = nueva({ fetchImpl: async () => jsonResponse(429, { issue: [{ diagnostics: 'Demasiados intentos fallidos. Intente nuevamente en unos minutos.' }] }) });
    const r = await a.s.login('ana', 'x');
    assert.strictEqual(r.status, 429);
    assert.ok(/Demasiados intentos/.test(r.message));
    const b = nueva({ fetchImpl: async () => { throw new TypeError('fetch failed'); } });
    const r2 = await b.s.login('ana', 'x');
    assert.strictEqual(r2.ok, false);
    assert.strictEqual(r2.status, 0);
    assert.ok(/conectar/i.test(r2.message));
  });

  await step('respuesta de login sin token, o con un rol inventado, se rechaza', async () => {
    const a = nueva({ fetchImpl: async () => jsonResponse(200, { success: true, user: { username: 'x', role: 'ADMIN' } }) });
    assert.strictEqual((await a.s.login('x', 'y')).ok, false);
    const b = nueva({ fetchImpl: async () => jsonResponse(200, { token: 't.k', expires_at: FUTURO, user: { username: 'x', role: 'SUPERUSUARIO' } }) });
    assert.strictEqual((await b.s.login('x', 'y')).ok, false);
    assert.strictEqual(b.s.isLoggedIn(), false);
  });

  await step('un 401 en authFetch cierra la sesión y avisa una sola vez; un 403 NO la cierra', async () => {
    let status = 403;
    const { s, expiradas, storage } = nueva({ storage: fakeStorage({ [KEY]: sesionGuardada(FUTURO) }), fetchImpl: async () => jsonResponse(status, {}) });
    assert.strictEqual(s.isLoggedIn(), true);
    const r403 = await s.authFetch('http://x/api/cronicos');
    assert.strictEqual(r403.status, 403);
    assert.strictEqual(s.isLoggedIn(), true);
    assert.strictEqual(expiradas.length, 0);

    status = 401;
    const r401 = await s.authFetch('http://x/api/cronicos');
    assert.strictEqual(r401.status, 401);
    assert.strictEqual(s.isLoggedIn(), false);
    assert.strictEqual(s.getUser(), null);
    assert.strictEqual(storage.size(), 0);
    assert.deepStrictEqual(expiradas, ['expired']);
    await s.authFetch('http://x/api/cronicos');
    assert.strictEqual(expiradas.length, 1, 'sin sesión no debe avisar de nuevo');
  });

  await step('un 401 tardío de un token viejo no mata la sesión nueva', async () => {
    let soltar;
    const espera = new Promise(r => { soltar = r; });
    const { s, expiradas } = nueva({
      storage: fakeStorage({ [KEY]: sesionGuardada(FUTURO) }),
      fetchImpl: async url => {
        if (url === EP.AUTH_LOGIN) return jsonResponse(200, { token: 'otro.token', expires_at: FUTURO, user: { username: 'luis', nombre: 'LUIS', role: 'ADMIN', red: null } });
        await espera;
        return jsonResponse(401, {});
      }
    });
    const pendiente = s.authFetch('http://x/api/cronicos');
    s.logout();
    assert.strictEqual((await s.login('luis', 'clave-larga-123')).ok, true);
    soltar();
    await pendiente;
    assert.strictEqual(s.isLoggedIn(), true);
    assert.strictEqual(s.getToken(), 'otro.token');
    assert.strictEqual(expiradas.length, 0);
  });

  await step('logout borra todo y no dispara onExpired', () => {
    const { s, expiradas, storage } = nueva({ storage: fakeStorage({ [KEY]: sesionGuardada(FUTURO) }) });
    assert.strictEqual(s.isLoggedIn(), true);
    s.logout();
    assert.strictEqual(s.isLoggedIn(), false);
    assert.strictEqual(storage.size(), 0);
    assert.strictEqual(expiradas.length, 0);
  });

  console.log('Sesión del cliente: sesión guardada y restauración (fetch falso)');

  await step('una sesión guardada ya vencida, con JSON dañado o con rol inventado se descarta', () => {
    const malas = [
      sesionGuardada(PASADO),
      '{no es json',
      JSON.stringify({ token: 'a.b', expires_at: FUTURO, user: { username: 'x', role: 'ROOT' } }),
      JSON.stringify({ expires_at: FUTURO })
    ];
    for (const raw of malas) {
      const st = fakeStorage({ [KEY]: raw });
      const { s } = nueva({ storage: st });
      assert.strictEqual(s.isLoggedIn(), false, raw);
      assert.strictEqual(st.size(), 0, 'debe limpiar el almacenamiento: ' + raw);
    }
  });

  await step('restore: el servidor manda y actualiza el rol; con 401 se descarta; sin red conserva la sesión', async () => {
    const a = nueva({
      storage: fakeStorage({ [KEY]: sesionGuardada(FUTURO, 'COORDINADOR') }),
      fetchImpl: async () => jsonResponse(200, { success: true, user: { username: 'ana', nombre: 'ANA', role: 'DIRECTOR', red: 'PACIFICO SUR' } })
    });
    const u = await a.s.restore();
    assert.strictEqual(u.role, 'DIRECTOR');
    assert.strictEqual(a.s.getUser().role, 'DIRECTOR');
    assert.strictEqual(JSON.parse(a.storage.getItem(KEY)).user.role, 'DIRECTOR', 'debe guardar el rol actualizado');

    const b = nueva({ storage: fakeStorage({ [KEY]: sesionGuardada(FUTURO) }), fetchImpl: async () => jsonResponse(401, {}) });
    assert.strictEqual(await b.s.restore(), null);
    assert.strictEqual(b.s.isLoggedIn(), false);

    const c = nueva({ storage: fakeStorage({ [KEY]: sesionGuardada(FUTURO) }), fetchImpl: async () => { throw new TypeError('fetch failed'); } });
    assert.strictEqual(await c.s.restore(), null);
    assert.strictEqual(c.s.isLoggedIn(), true, 'sin red no se puede afirmar que venció');

    const d = nueva();
    assert.strictEqual(await d.s.restore(), null, 'sin sesión guardada devuelve null');
    assert.strictEqual(d.calls.length, 0, 'sin sesión no debe llamar al servidor');
  });

  await step('checkExpiry: cierra la sesión vencida y avisa una vez; con sesión vigente o sin sesión no hace nada', () => {
    let ahora = NOW;
    const { s, expiradas, storage } = nueva({ now: () => ahora, storage: fakeStorage({ [KEY]: sesionGuardada(FUTURO) }) });
    assert.strictEqual(s.checkExpiry(), false);
    assert.strictEqual(s.isLoggedIn(), true);
    ahora = Date.parse('2026-10-22T21:00:00Z');
    assert.strictEqual(s.checkExpiry(), true);
    assert.strictEqual(s.isLoggedIn(), false);
    assert.strictEqual(storage.size(), 0);
    assert.deepStrictEqual(expiradas, ['expired']);
    assert.strictEqual(s.checkExpiry(), false);
    assert.strictEqual(expiradas.length, 1);
  });

  await step('sin sessionStorage disponible usa memoria y funciona igual', async () => {
    const s = AuthSession.create({
      now: () => NOW,
      getEndpoints: () => EP,
      fetchImpl: async () => jsonResponse(200, { token: 'm.t', expires_at: FUTURO, user: { username: 'ana', nombre: 'ANA', role: 'DIRECTOR', red: 'PACIFICO SUR' } })
    });
    assert.strictEqual((await s.login('ana', 'clave-larga-123')).ok, true);
    assert.strictEqual(s.getUser().role, 'DIRECTOR');
  });

  console.log('Sesión del cliente: servidor real');

  let srv;
  try {
    srv = await startServer({
      port: PORT,
      env: { ADMIN_USER: 'admin', ADMIN_PASSWORD: ADMIN_PASS, ADMIN_RESET: '', NODE_ENV: 'test', AUTH_SECRET: 'secreto-sesion-de-prueba-con-mas-de-32-caracteres' }
    });
  } catch (e) {
    console.log('  FALLA no arrancó el servidor: ' + e.message);
    process.exit(1);
  }
  const base = srv.base;
  const eps = () => ({
    AUTH_LOGIN: base + '/api/auth/login',
    AUTH_ME: base + '/api/auth/me',
    AUTH_REDES: base + '/api/auth/redes',
    API_USERS: base + '/api/users',
    API_CRONICOS: base + '/api/cronicos',
    API_ALERTS_SUMMARY: base + '/api/alerts/summary'
  });
  const real = () => {
    const expiradas = [];
    const storage = fakeStorage();
    return { s: AuthSession.create({ storage, getEndpoints: eps, onExpired: m => expiradas.push(m) }), expiradas, storage };
  };

  try {
    await step('clave incorrecta contra el servidor real: ok=false, 401, sin sesión', async () => {
      const { s } = real();
      const r = await s.login('admin', 'clave-equivocada-99');
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.status, 401);
      assert.ok(/incorrectos/i.test(r.message), r.message);
      assert.strictEqual(s.isLoggedIn(), false);
    });

    let admin;
    await step('ADMIN inicia sesión, lee /api/cronicos y /api/auth/me, y registra un DIRECTOR', async () => {
      admin = real();
      const r = await admin.s.login('admin', ADMIN_PASS);
      assert.strictEqual(r.ok, true, r.message);
      assert.strictEqual(r.user.role, 'ADMIN');
      assert.ok(!admin.storage.dump().includes(ADMIN_PASS));

      const lista = await admin.s.authFetch(eps().API_CRONICOS);
      assert.strictEqual(lista.status, 200);
      const me = await admin.s.authFetch(eps().AUTH_ME);
      assert.strictEqual((await me.json()).user.username, 'admin');
      const redes = await (await admin.s.authFetch(eps().AUTH_REDES)).json();
      assert.strictEqual(redes.data.length, 7);

      const crea = await admin.s.authFetch(eps().API_USERS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'dir.prueba', nombre: 'DIRECTOR DE PRUEBA', correo: 'dir.prueba@prueba.example', role: 'DIRECTOR', red: 'PACIFICO SUR', password: 'clave-director-123' })
      });
      assert.strictEqual(crea.status, 201);
    });

    await step('DIRECTOR: /api/cronicos da 403 (la sesión sigue), /api/alerts/summary da 200 con totales', async () => {
      const dir = real();
      assert.strictEqual((await dir.s.login('dir.prueba', 'clave-director-123')).ok, true);
      assert.strictEqual(AuthSession.permisosDe(dir.s.getUser().role).verPacientes, false);
      const pac = await dir.s.authFetch(eps().API_CRONICOS);
      assert.strictEqual(pac.status, 403);
      assert.strictEqual(dir.s.isLoggedIn(), true);
      assert.strictEqual(dir.expiradas.length, 0);
      const resumen = await dir.s.authFetch(eps().API_ALERTS_SUMMARY);
      assert.strictEqual(resumen.status, 200);
      const j = await resumen.json();
      assert.strictEqual(typeof j.total_pacientes, 'number');
      assert.ok(j.alertas && 'vigentes_verde' in j.alertas && 'desertores_rojo' in j.alertas);
    });

    await step('restore con la sesión guardada funciona; con el token alterado cierra la sesión y avisa', async () => {
      const copia = fakeStorage({ [KEY]: admin.storage.getItem(KEY) });
      const ok = AuthSession.create({ storage: copia, getEndpoints: eps });
      assert.strictEqual((await ok.restore()).username, 'admin');

      const guardada = JSON.parse(admin.storage.getItem(KEY));
      guardada.token = guardada.token.slice(0, -3) + 'AAA';
      const mala = fakeStorage({ [KEY]: JSON.stringify(guardada) });
      const expiradas = [];
      const s = AuthSession.create({ storage: mala, getEndpoints: eps, onExpired: m => expiradas.push(m) });
      assert.strictEqual(await s.restore(), null);
      assert.strictEqual(s.isLoggedIn(), false);
      assert.strictEqual(mala.size(), 0);
      assert.strictEqual(expiradas.length, 1);
    });

    await step('tras logout el token anterior ya no se envía y el servidor responde 401', async () => {
      const { s, expiradas } = real();
      await s.login('admin', ADMIN_PASS);
      s.logout();
      const r = await s.authFetch(eps().API_CRONICOS);
      assert.strictEqual(r.status, 401);
      assert.strictEqual(expiradas.length, 0);
    });
  } finally {
    await srv.stop();
  }

  console.log('\nResultado: ' + passed + ' correctas, ' + failed + ' con falla');
  process.exit(failed ? 1 : 0);
}

main().catch(e => {
  console.log('ERROR INESPERADO ' + e.stack);
  process.exit(1);
});
