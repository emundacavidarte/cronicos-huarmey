/**
 * testClavesF4.js
 * Correo obligatorio, cambio de contraseña y recuperación con un código enviado al correo (decisión de Edward,
 * 05/11/2026). Servidor REAL en el puerto 3117 (store.json bloqueado) y un proveedor de correo FALSO local que guarda
 * lo que recibe (no se envía nada fuera). Usuarios inventados. Ejecutar: node server/tests/testClavesF4.js
 */

const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { startServer } = require('./helpers/realServer');

const PORT = 3117;
const ADMIN_PASS = 'clave-admin-de-prueba-claves';
const SECRET = 'f4c-q7Wm2Kx9Lp4Rt8Vz1Nc6Hb3Jd5Fs0Gy-prueba';
let passed = 0;
let failed = 0;
let BASE = '';
let ip = 30;

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
const nuevaIp = () => '10.40.0.' + (++ip);
let IP = nuevaIp();

async function call(method, url, { token, body, headers, base } = {}) {
  const h = Object.assign({ 'X-Forwarded-For': IP }, headers || {});
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch((base || BASE) + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch (e) { /* no JSON */ }
  return { status: r.status, json, text };
}
const diag = r => (r.json && ((r.json.issue && r.json.issue[0] && r.json.issue[0].diagnostics) || r.json.message)) || r.text;

/** Proveedor de correo falso (API tipo Resend) que guarda los correos recibidos. */
function proveedorFalso() {
  const recibidos = [];
  const srv = http.createServer((req, res) => {
    let datos = '';
    req.on('data', d => { datos += d; });
    req.on('end', () => {
      try { recibidos.push({ auth: req.headers.authorization, cuerpo: JSON.parse(datos) }); } catch (e) { /* ignorar */ }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"id":"falso"}');
    });
  });
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({ srv, recibidos, url: `http://127.0.0.1:${srv.address().port}/emails` })));
}
const codigoDe = correo => (/(\d{6})/.exec(correo.cuerpo.text) || [])[1];
async function esperarCorreos(lista, n) {
  for (let i = 0; i < 40 && lista.length < n; i++) await sleep(50);
}

function arranque(env) {
  return new Promise(resolve => {
    const c = spawn(process.execPath, ['--require', path.join(__dirname, 'helpers', 'blockDisk.js'), path.join(__dirname, '..', 'server.js')], {
      env: Object.assign({}, process.env, { PORT: '3118' }, env), stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    c.stdout.on('data', d => { out += d; });
    c.stderr.on('data', d => { out += d; });
    const t = setTimeout(() => { c.kill(); resolve({ code: 'sigue-vivo', out }); }, 8000);
    c.on('exit', code => { clearTimeout(t); resolve({ code, out }); });
  });
}

async function main() {
  console.log('Correo obligatorio, cambio y recuperación de contraseña\n');
  const correo = await proveedorFalso();
  const ENV = { NODE_ENV: 'production', AUTH_SECRET: SECRET, ADMIN_PASSWORD: ADMIN_PASS, ADMIN_RESET: '', TRUST_PROXY: 'true',
    MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'clave-falsa-de-prueba', MAIL_FROM: 'Crónicos Huarmey <no-responder@prueba.example>', MAIL_API_URL: correo.url };
  const srv = await startServer({ port: PORT, env: ENV });
  BASE = srv.base;
  try {
    const admin = (await call('POST', '/api/auth/login', { body: { username: 'admin', password: ADMIN_PASS } })).json.token;
    const nuevo = (username, extra) => call('POST', '/api/users', { token: admin, body: Object.assign({ username, nombre: 'PERSONA ' + username, role: 'DIRECTOR', red: '156', password: 'clave-inicial-' + username }, extra || {}) });

    // --- Correo obligatorio y único ---
    await step('el usuario se registra con correo: sin correo o con uno inválido → 400; repetido → 409', async () => {
      assert.strictEqual((await nuevo('sin.correo')).status, 400);
      assert.ok(/correo/.test(diag(await nuevo('correo.malo', { correo: 'no-es-correo' }))));
      assert.strictEqual((await nuevo('ana.f4', { correo: 'Ana.F4@Prueba.Example' })).status, 201);
      assert.strictEqual((await nuevo('ana.otra', { correo: 'ana.f4@prueba.example' })).status, 409);
      const lista = (await call('GET', '/api/users', { token: admin })).json.data;
      assert.strictEqual(lista.find(u => u.username === 'ana.f4').correo, 'ana.f4@prueba.example');
    });
    await step('el ADMIN cambia el correo de un usuario (válido y no repetido)', async () => {
      assert.strictEqual((await nuevo('beto.f4', { correo: 'beto.f4@prueba.example' })).status, 201);
      assert.strictEqual((await call('PATCH', '/api/users/beto.f4', { token: admin, body: { correo: 'malo' } })).status, 400);
      assert.strictEqual((await call('PATCH', '/api/users/beto.f4', { token: admin, body: { correo: 'ana.f4@prueba.example' } })).status, 409);
      assert.strictEqual((await call('PATCH', '/api/users/beto.f4', { token: admin, body: { correo: 'beto.nuevo@prueba.example' } })).status, 200);
    });

    // --- Cambiar mi contraseña ---
    await step('cambiar mi contraseña: exige la actual, una nueva válida y distinta; cierra las otras sesiones', async () => {
      const t1 = (await call('POST', '/api/auth/login', { body: { username: 'ana.f4', password: 'clave-inicial-ana.f4' } })).json.token;
      const t2 = (await call('POST', '/api/auth/login', { body: { username: 'ana.f4', password: 'clave-inicial-ana.f4' } })).json.token;
      assert.strictEqual((await call('POST', '/api/auth/cambiar-clave', { token: t1, body: { clave_actual: 'equivocada-123', clave_nueva: 'nueva-clave-ana-1' } })).status, 400);
      assert.strictEqual((await call('POST', '/api/auth/cambiar-clave', { token: t1, body: { clave_actual: 'clave-inicial-ana.f4', clave_nueva: 'corta' } })).status, 400);
      assert.strictEqual((await call('POST', '/api/auth/cambiar-clave', { token: t1, body: { clave_actual: 'clave-inicial-ana.f4', clave_nueva: 'clave-inicial-ana.f4' } })).status, 400);
      const ok = await call('POST', '/api/auth/cambiar-clave', { token: t1, body: { clave_actual: 'clave-inicial-ana.f4', clave_nueva: 'nueva-clave-ana-1' } });
      assert.strictEqual(ok.status, 200, ok.text);
      assert.strictEqual((await call('GET', '/api/auth/me', { token: ok.json.token })).status, 200, 'el token nuevo sirve');
      assert.strictEqual((await call('GET', '/api/auth/me', { token: t2 })).status, 401, 'la otra sesión se cierra');
      IP = nuevaIp();
      assert.strictEqual((await call('POST', '/api/auth/login', { body: { username: 'ana.f4', password: 'clave-inicial-ana.f4' } })).status, 401);
      assert.strictEqual((await call('POST', '/api/auth/login', { body: { username: 'ana.f4', password: 'nueva-clave-ana-1' } })).status, 200);
    });
    await step('cambiar mi contraseña: tras 10 intentos con la actual equivocada, 429', async () => {
      IP = nuevaIp();
      const t = (await call('POST', '/api/auth/login', { body: { username: 'beto.f4', password: 'clave-inicial-beto.f4' } })).json.token;
      const codigos = [];
      for (let i = 0; i < 11; i++) codigos.push((await call('POST', '/api/auth/cambiar-clave', { token: t, body: { clave_actual: 'equivocada-' + i, clave_nueva: 'otra-clave-larga-1' } })).status);
      assert.strictEqual(codigos[10], 429, codigos.join(','));
    });

    // --- Recuperar con un código enviado al correo ---
    const pedir = usuario => call('POST', '/api/auth/recuperar', { body: { usuario } });
    const restablecer = (usuario, codigo, clave_nueva) => call('POST', '/api/auth/restablecer', { body: { usuario, codigo, clave_nueva } });
    for (const u of ['caro.f4', 'dani.f4', 'eli.f4']) assert.strictEqual((await nuevo(u, { correo: u + '@prueba.example' })).status, 201);

    await step('recuperar: la respuesta es la misma exista o no el usuario; solo se envía correo si existe', async () => {
      IP = nuevaIp();
      const antes = correo.recibidos.length;
      const noExiste = await pedir('nadie.existe');
      const existe = await pedir('caro.f4');
      assert.strictEqual(noExiste.status, 200);
      assert.strictEqual(existe.status, 200);
      assert.strictEqual(noExiste.text, existe.text, 'las respuestas deben ser idénticas');
      await esperarCorreos(correo.recibidos, antes + 1);
      assert.strictEqual(correo.recibidos.length, antes + 1);
      const c = correo.recibidos[correo.recibidos.length - 1];
      assert.deepStrictEqual(c.cuerpo.to, ['caro.f4@prueba.example']);
      assert.strictEqual(c.auth, 'Bearer clave-falsa-de-prueba');
      assert.ok(/^\d{6}$/.test(codigoDe(c)), c.cuerpo.text);
    });
    await step('restablecer con el código: cierra las sesiones, la nueva contraseña entra y el código no se reutiliza', async () => {
      IP = nuevaIp();
      const viejo = (await call('POST', '/api/auth/login', { body: { username: 'caro.f4', password: 'clave-inicial-caro.f4' } })).json.token;
      const codigo = codigoDe(correo.recibidos[correo.recibidos.length - 1]);
      assert.strictEqual((await restablecer('caro.f4', codigo, 'corta')).status, 400, 'clave débil');
      const r = await restablecer('caro.f4', codigo, 'clave-recuperada-caro-1');
      assert.strictEqual(r.status, 200, r.text);
      assert.strictEqual((await call('GET', '/api/auth/me', { token: viejo })).status, 401);
      assert.strictEqual((await call('POST', '/api/auth/login', { body: { username: 'caro.f4', password: 'clave-recuperada-caro-1' } })).status, 200);
      assert.strictEqual((await restablecer('caro.f4', codigo, 'otra-clave-caro-2')).status, 400, 'un solo uso');
    });
    await step('recuperar por correo (sin importar mayúsculas); tras 5 códigos equivocados el correcto ya no sirve', async () => {
      IP = nuevaIp();
      const antes = correo.recibidos.length;
      assert.strictEqual((await pedir('DANI.F4@prueba.example')).status, 200);
      await esperarCorreos(correo.recibidos, antes + 1);
      const codigo = codigoDe(correo.recibidos[correo.recibidos.length - 1]);
      for (let i = 0; i < 5; i++) {
        const malo = String((Number(codigo) + 1 + i) % 1000000).padStart(6, '0');
        assert.strictEqual((await restablecer('dani.f4', malo, 'clave-nueva-dani-1')).status, 400);
      }
      const r = await restablecer('dani.f4', codigo, 'clave-nueva-dani-1');
      assert.strictEqual(r.status, 400, 'el código debe quedar inválido tras 5 intentos');
      assert.ok(/inválido o vencido/.test(diag(r)));
    });
    await step('recuperar: un segundo pedido inmediato no envía otro correo (límite de envíos)', async () => {
      IP = nuevaIp();
      const antes = correo.recibidos.length;
      await pedir('eli.f4');
      await esperarCorreos(correo.recibidos, antes + 1);
      const r2 = await pedir('eli.f4');
      assert.strictEqual(r2.status, 200);
      await sleep(400);
      assert.strictEqual(correo.recibidos.length, antes + 1);
    });
    await step('la bitácora registra la recuperación sin el código', async () => {
      const logs = (await call('GET', '/api/security/audit-logs?limit=200', { token: admin })).json.logs;
      const eventos = logs.filter(l => ['RECUPERACION_SOLICITADA', 'CLAVE_RESTABLECIDA', 'CLAVE_CAMBIADA'].includes(l.evento));
      assert.ok(eventos.some(l => l.evento === 'CLAVE_RESTABLECIDA') && eventos.some(l => l.evento === 'CLAVE_CAMBIADA'));
      const codigos = correo.recibidos.map(codigoDe);
      assert.ok(eventos.every(l => !codigos.some(c => l.payload_json.includes(c))), 'un código quedó en la bitácora');
    });
    await step('recuperar y restablecer comparten el cupo del login: más de 30 por minuto desde una IP → 429', async () => {
      IP = nuevaIp();
      let ultimo = null;
      for (let i = 0; i < 31; i++) ultimo = await pedir('nadie' + i);
      assert.strictEqual(ultimo.status, 429);
    });
  } finally {
    await srv.stop();
  }

  await step('el código vence (vigencia corta de prueba)', async () => {
    const s2 = await startServer({ port: PORT + 2, env: Object.assign({}, ENV, { RECUPERACION_VIGENCIA_MIN: '0.02' }) });
    try {
      const base = s2.base;
      const admin = (await call('POST', '/api/auth/login', { base, body: { username: 'admin', password: ADMIN_PASS } })).json.token;
      await call('POST', '/api/users', { base, token: admin, body: { username: 'fede.f4', nombre: 'FEDE', correo: 'fede.f4@prueba.example', role: 'DIRECTOR', red: '156', password: 'clave-inicial-fede' } });
      const antes = correo.recibidos.length;
      await call('POST', '/api/auth/recuperar', { base, body: { usuario: 'fede.f4' } });
      await esperarCorreos(correo.recibidos, antes + 1);
      const codigo = codigoDe(correo.recibidos[correo.recibidos.length - 1]);
      await sleep(1500);
      assert.strictEqual((await call('POST', '/api/auth/restablecer', { base, body: { usuario: 'fede.f4', codigo, clave_nueva: 'clave-nueva-fede-1' } })).status, 400);
    } finally { await s2.stop(); }
  });

  await step('sin proveedor de correo, la recuperación responde que no está disponible (503)', async () => {
    const s3 = await startServer({ port: PORT + 3, env: Object.assign({}, ENV, { MAIL_PROVIDER: '', MAIL_API_KEY: '', MAIL_FROM: '' }) });
    try {
      const r = await call('POST', '/api/auth/recuperar', { base: s3.base, body: { usuario: 'admin' } });
      assert.strictEqual(r.status, 503);
      assert.ok(/Administrador/.test(diag(r)));
    } finally { await s3.stop(); }
  });

  await step('producción no arranca con MAIL_PROVIDER=consola ni con un proveedor sin clave', async () => {
    const base = { NODE_ENV: 'production', AUTH_SECRET: SECRET, ADMIN_PASSWORD: ADMIN_PASS, ADMIN_RESET: '' };
    const a = await arranque(Object.assign({}, base, { MAIL_PROVIDER: 'consola' }));
    assert.strictEqual(a.code, 1, a.out);
    assert.ok(/consola no se permite/.test(a.out), a.out);
    const b = await arranque(Object.assign({}, base, { MAIL_PROVIDER: 'resend', MAIL_API_KEY: '', MAIL_FROM: 'x@prueba.example' }));
    assert.strictEqual(b.code, 1, b.out);
  });

  correo.srv.close();
  console.log(`\nResultado Claves F4: ${passed} correctas, ${failed} con falla`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
