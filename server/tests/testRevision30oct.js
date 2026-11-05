/**
 * testRevision30oct.js
 * Correcciones de la revisión del 29-oct (R1 a R11) contra el servidor REAL (puerto 3108, sin tocar store.json):
 * establecimiento al cargar (R2), usuarios con establecimiento de extremo a extremo (R3), fechas reales y no futuras
 * (R7), fecha de Lima (R8), campos numéricos (R1), rutas desconocidas y CSP (R1, R11). Pacientes y usuarios inventados.
 * Ejecutar: node server/tests/testRevision30oct.js
 */

const assert = require('assert');
const { startServer } = require('./helpers/realServer');
const fechaLima = require('../../client/js/utils/fechaLima.js');

const PORT = 3108;
const ADMIN_PASS = 'clave-admin-de-prueba-1';
const HOSP = '00001741';
const LAVICTORIA = '00001744';

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
  return { status: res.status, json, text, headers: res.headers };
}

async function crearUsuario(adminToken, username, role, red, extra = {}) {
  const password = 'clave-de-' + username + '-123';
  const r = await call('POST', '/api/users', { token: adminToken, body: { username, nombre: 'USUARIO ' + username.toUpperCase(), role, password, red, ...extra } });
  if (r.status !== 201) return { r };
  const l = await call('POST', '/api/auth/login', { body: { username, password } });
  assert.strictEqual(l.status, 200, l.text);
  return { r, token: l.json.token };
}

const lote = (dni, extra = {}) => ({ patients: [{ id: 'pac-00001741-' + dni, dni, apellidos_nombres: 'PACIENTE INVENTADO ' + dni, ...extra }] });

async function main() {
  console.log('R8: fecha de Lima y calendario real');

  await step('a las 8 p. m. en Lima la fecha sigue siendo la de Lima (no la de UTC) y 2026-02-31 no es una fecha', async () => {
    assert.strictEqual(fechaLima.deInstante(new Date('2026-10-29T20:00:00-05:00')), '2026-10-29');
    assert.strictEqual(new Date('2026-10-29T20:00:00-05:00').toISOString().slice(0, 10), '2026-10-30', 'así falla UTC');
    assert.strictEqual(fechaLima.deInstante(new Date('2026-10-30T04:59:00Z')), '2026-10-29');
    assert.strictEqual(fechaLima.deInstante(new Date('2026-10-30T05:00:00Z')), '2026-10-30');
    for (const f of ['2026-02-31', '2026-13-01', '2026-00-10', '2026-04-31', '2026-1-1', '', null, 20260101]) assert.ok(!fechaLima.esFechaReal(f), String(f));
    for (const f of ['2026-02-28', '2028-02-29', '2026-12-31']) assert.ok(fechaLima.esFechaReal(f), f);
    assert.ok(!fechaLima.esFechaReal('2027-02-29'));
    assert.strictEqual(fechaLima.hoy(3) > fechaLima.hoy(), true);
  });

  let srv;
  try {
    srv = await startServer({
      port: PORT,
      env: { ADMIN_USER: 'admin', ADMIN_PASSWORD: ADMIN_PASS, ADMIN_RESET: '', NODE_ENV: 'test', AUTH_SECRET: 'secreto-revision-de-prueba-con-mas-de-32-caracteres' }
    });
  } catch (e) {
    console.log('  FALLA no arranco el servidor: ' + e.message);
    process.exit(1);
  }
  BASE = srv.base;

  try {
    const admin = (await call('POST', '/api/auth/login', { body: { username: 'admin', password: ADMIN_PASS } })).json.token;
    const coordRed = (await crearUsuario(admin, 'coord_red', 'COORDINADOR', 'Pacífico Sur')).token;

    console.log('R2: el establecimiento que controla manda');

    await step('un paciente controlado en La Victoria queda en La Victoria, con su nombre y su red (no en el hospital)', async () => {
      const r = await call('POST', '/api/padron/importar-lote', { token: coordRed, body: lote('94000001', {
        establecimiento_control: 'C. S. La Victoria (00001744, I-3)', puerta_entrada_id: HOSP, puerta_entrada: 'Hospital de Apoyo Huarmey II-1', red_salud: 'PACIFICO SUR'
      }) });
      assert.strictEqual(r.status, 200, r.text);
      const p = (await call('GET', '/api/cronicos', { token: admin })).json.find(x => x.dni === '94000001');
      assert.strictEqual(p.puerta_entrada_id, LAVICTORIA);
      assert.ok(/VICTORIA/i.test(p.puerta_entrada), p.puerta_entrada);
      assert.strictEqual(p.red_salud, 'PACIFICO SUR');
    });

    await step('si el texto no trae un código del catálogo, no se toca lo que ya venía', async () => {
      const r = await call('POST', '/api/padron/importar-lote', { token: coordRed, body: lote('94000002', { establecimiento_control: 'Centro inventado (99999999, I-1)', puerta_entrada_id: HOSP }) });
      assert.strictEqual(r.status, 200, r.text);
      const p = (await call('GET', '/api/cronicos', { token: admin })).json.find(x => x.dni === '94000002');
      assert.strictEqual(p.puerta_entrada_id, HOSP);
    });

    console.log('R3: usuarios con establecimiento');

    let coordA; let coordH;
    await step('el establecimiento del usuario se valida: debe ser un código del catálogo y de su red', async () => {
      for (const est of ['abc', '1234567', '12345678', 5, {}]) {
        const x = await crearUsuario(admin, 'malo' + String(typeof est === 'string' ? est.length : 9), 'COORDINADOR', 'Pacífico Sur', { establecimiento_id: est });
        assert.strictEqual(x.r.status, 400, JSON.stringify(est) + ' -> ' + x.r.status);
      }
      const x = await crearUsuario(admin, 'sector_largo', 'COORDINADOR', 'Pacífico Sur', { sector_sanitario: 'x'.repeat(200) });
      assert.strictEqual(x.r.status, 400);
    });

    await step('se crean usuarios de La Victoria y del hospital; el servidor devuelve su establecimiento', async () => {
      const a = await crearUsuario(admin, 'coord_a', 'COORDINADOR', 'Pacífico Sur', { establecimiento_id: LAVICTORIA });
      assert.strictEqual(a.r.status, 201, a.r.text);
      assert.strictEqual(a.r.json.user.establecimiento_id, LAVICTORIA);
      coordA = a.token;
      const h = await crearUsuario(admin, 'coord_h', 'COORDINADOR', 'Pacífico Sur', { establecimiento_id: HOSP });
      assert.strictEqual(h.r.status, 201, h.r.text);
      coordH = h.token;
      const me = await call('GET', '/api/auth/me', { token: coordA });
      assert.strictEqual(me.json.user.establecimiento_id, LAVICTORIA);
      const lista = (await call('GET', '/api/users', { token: admin })).json.data;
      assert.strictEqual(lista.find(u => u.username === 'coord_a').establecimiento_id, LAVICTORIA);
    });

    await step('un usuario de La Victoria solo ve pacientes de La Victoria; el del hospital, los del hospital', async () => {
      const dnisA = (await call('GET', '/api/cronicos', { token: coordA })).json.map(p => p.dni);
      const dnisH = (await call('GET', '/api/cronicos', { token: coordH })).json.map(p => p.dni);
      assert.ok(dnisA.includes('94000001') && !dnisA.includes('94000002'), dnisA.join(','));
      assert.ok(dnisH.includes('94000002') && !dnisH.includes('94000001'), dnisH.join(','));
      const ind = (await call('GET', '/api/indicadores/convenio', { token: coordA })).json;
      assert.deepStrictEqual(Object.keys(ind.por_establecimiento), [LAVICTORIA]);
    });

    await step('no puede escribir ni leer eventos de otro establecimiento (404, sin revelar que existe: F2-04) ni registrar pacientes en otro (403)', async () => {
      const ajeno = 'pac-00001741-94000002';
      assert.strictEqual((await call('GET', `/api/patients/${ajeno}/eventos`, { token: coordA })).status, 404);
      assert.strictEqual((await call('POST', `/api/patients/${ajeno}/eventos`, { token: coordA, body: { tipo: 'control', fecha: '2026-05-01' } })).status, 404);
      assert.strictEqual((await call('PUT', `/api/patients/${ajeno}/consentimiento`, { token: coordA, body: { consentimiento: 'No' } })).status, 404);
      const nuevo = await call('POST', '/api/padron/importar-lote', { token: coordA, body: lote('94000003', { establecimiento_control: 'Hospital de Apoyo Huarmey (00001741, II-1)' }) });
      assert.strictEqual(nuevo.status, 403, nuevo.text);
      const propio = await call('POST', '/api/padron/importar-lote', { token: coordA, body: lote('94000004', { establecimiento_control: 'C. S. La Victoria (00001744, I-3)' }) });
      assert.strictEqual(propio.status, 200, propio.text);
    });

    await step('el ADMIN no tiene establecimiento (se ignora) y puede cambiar el de un usuario, lo que cierra sus sesiones', async () => {
      const adm = await crearUsuario(admin, 'otro_admin', 'ADMIN', undefined, { establecimiento_id: LAVICTORIA });
      assert.strictEqual(adm.r.status, 201, adm.r.text);
      assert.strictEqual(adm.r.json.user.establecimiento_id, null);
      const mal = await call('PATCH', '/api/users/coord_a', { token: admin, body: { establecimiento_id: '12345678' } });
      assert.strictEqual(mal.status, 400);
      const ok = await call('PATCH', '/api/users/coord_a', { token: admin, body: { establecimiento_id: HOSP } });
      assert.strictEqual(ok.status, 200, ok.text);
      assert.strictEqual(ok.json.user.establecimiento_id, HOSP);
      assert.strictEqual((await call('GET', '/api/auth/me', { token: coordA })).status, 401, 'el token anterior debe quedar sin efecto');
      const limpio = await call('PATCH', '/api/users/coord_a', { token: admin, body: { establecimiento_id: null } });
      assert.strictEqual(limpio.json.user.establecimiento_id, null);
    });

    console.log('R7: fechas de eventos');

    await step('un evento exige una fecha real; solo la cita puede ser futura', async () => {
      const url = '/api/patients/pac-00001741-94000001/eventos';
      for (const f of ['2026-02-31', '2026-13-01', '2099-01-01']) {
        assert.strictEqual((await call('POST', url, { token: coordRed, body: { tipo: 'control', fecha: f } })).status, 400, f);
      }
      assert.strictEqual((await call('POST', url, { token: coordRed, body: { tipo: 'telemonitoreo', fecha: '2099-01-01' } })).status, 400);
      assert.strictEqual((await call('POST', url, { token: coordRed, body: { tipo: 'cita', fecha: fechaLima.hoy(30) } })).status, 201);
      assert.strictEqual((await call('POST', url, { token: coordRed, body: { tipo: 'control', fecha: '2026-02-28' } })).status, 201);
    });

    await step('el periodo de los indicadores también exige fechas reales', async () => {
      for (const q of ['desde=2026-02-31&hasta=2026-08-31', 'desde=2026-01-01&hasta=2026-13-01']) {
        assert.strictEqual((await call('GET', '/api/indicadores/convenio?' + q, { token: coordRed })).status, 400, q);
      }
      assert.strictEqual((await call('GET', '/api/indicadores/convenio?desde=2026-01-01&hasta=2026-08-31', { token: coordRed })).status, 200);
    });

    console.log('R1, R11: campos numéricos, rutas desconocidas y CSP');

    await step('los campos numéricos de la ficha no admiten texto: se descartan al cargar', async () => {
      const r = await call('POST', '/api/padron/importar-lote', { token: coordRed, body: lote('94000005', { dias_restantes: '<img src=x onerror=alert(1)>', dias_vencido: 'abc', edad: '<b>', frecuencia_hearts: '9<script>', fila_excel: 'x' }) });
      assert.strictEqual(r.status, 200, r.text);
      const p = (await call('GET', '/api/cronicos', { token: admin })).json.find(x => x.dni === '94000005');
      for (const campo of ['dias_vencido', 'edad', 'frecuencia_hearts', 'fila_excel']) assert.ok(p[campo] === undefined || Number.isFinite(Number(p[campo])), campo + '=' + p[campo]);
      assert.ok(!/[<>]/.test(JSON.stringify([p.dias_restantes, p.dias_vencido, p.edad, p.frecuencia_hearts, p.fila_excel])));
    });

    await step('una ruta que no existe responde 404 (antes devolvía la página de inicio con 200); la página de inicio sigue abierta', async () => {
      assert.strictEqual((await call('GET', '/x')).status, 404);
      assert.strictEqual((await call('GET', '/ruta/que/no/existe')).status, 404);
      assert.strictEqual((await call('GET', '/')).status, 200);
      assert.strictEqual((await call('GET', '/index.html')).status, 200);
    });

    await step('la CSP ya no permite eval ni objetos incrustados', async () => {
      const csp = (await call('GET', '/')).headers.get('content-security-policy') || '';
      assert.ok(!/unsafe-eval/.test(csp), csp);
      assert.ok(/object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp), csp);
      assert.ok(!/fonts\.googleapis/.test(csp));
    });

    await step('la página de inicio ya no pide Google Fonts (la CSP lo bloqueaba)', async () => {
      const html = (await call('GET', '/')).text;
      assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(html));
      assert.ok(/js\/utils\/fechaLima\.js/.test(html));
    });

    await step('todo script de la página está en la caché sin conexión del service worker', async () => {
      const html = (await call('GET', '/')).text;
      const sw = (await call('GET', '/sw.js')).text;
      const scripts = [...html.matchAll(/src="(js\/[^"?]+)/g)].map(m => m[1]);
      const faltan = scripts.filter(s => !sw.includes(s));
      assert.deepStrictEqual(faltan, []);
    });
  } catch (e) {
    failed++;
    console.log('  FALLA ' + e.message);
    console.log('--- salida del servidor ---\n' + srv.getLog());
  } finally {
    await srv.stop();
  }

  console.log('\nResultado Revisión 30-oct: ' + passed + ' correctas, ' + failed + ' con falla');
  process.exit(failed === 0 ? 0 : 1);
}

main();
