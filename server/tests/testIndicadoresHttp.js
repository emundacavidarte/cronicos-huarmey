/**
 * testIndicadoresHttp.js
 * A8 contra el servidor REAL (puerto 3107, sin tocar store.json): GET /api/indicadores/convenio calcula los
 * indicadores con pacientes inventados, respeta el alcance por red y valida los parámetros.
 * Ejecutar: node server/tests/testIndicadoresHttp.js
 */

const assert = require('assert');
const { startServer } = require('./helpers/realServer');

const PORT = 3107;
const ADMIN_PASS = 'clave-admin-de-prueba-1';
const CS_I3 = '00001744'; // centro de salud I-3 de Pacífico Sur

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
  const r = await call('POST', '/api/users', { token: adminToken, body: { username, nombre: 'USUARIO ' + username.toUpperCase(), correo: username + '@prueba.example', role, password, red } });
  assert.strictEqual(r.status, 201, r.text);
  const l = await call('POST', '/api/auth/login', { body: { username, password } });
  assert.strictEqual(l.status, 200, l.text);
  return l.json.token;
}

async function main() {
  let srv;
  try {
    srv = await startServer({
      port: PORT,
      env: { ADMIN_USER: 'admin', ADMIN_PASSWORD: ADMIN_PASS, ADMIN_RESET: '', NODE_ENV: 'test', AUTH_SECRET: 'secreto-indicadores-de-prueba-con-mas-de-32-caracteres' }
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

    const lote = { patients: [
      // hipertenso: controles en enero (150/95) y abril (130/80)
      { id: 'pac-00001741-93600001', dni: '93600001', apellidos_nombres: 'PACIENTE INVENTADO UNO', puerta_entrada_id: CS_I3, diagnosticos: ['I10'], pas_ene: 150, pad_ene: 95, pas_abr: 130, pad_abr: 80 },
      // diabético: HbA1c y control el 10-mar; sin creatinina ni albuminuria
      { id: 'pac-00001741-93600002', dni: '93600002', apellidos_nombres: 'PACIENTE INVENTADO DOS', puerta_entrada_id: CS_I3, diagnosticos: ['E11'], hba1c: 7, fecha_hba1c: '2026-03-10', fecha_ultimo_control: '2026-03-10' }
    ] };
    assert.strictEqual((await call('POST', '/api/padron/importar-lote', { token: coordPs, body: lote })).status, 200);
    assert.strictEqual((await call('POST', '/api/patients/pac-00001741-93600001/eventos', { token: coordPs, body: { tipo: 'telemonitoreo', fecha: '2026-04-02', establecimiento_id: CS_I3 } })).status, 201);

    console.log('A8: servidor');

    await step('sin token responde 401', async () => {
      assert.strictEqual((await call('GET', '/api/indicadores/convenio')).status, 401);
    });

    await step('los indicadores del servidor coinciden con el cálculo a mano', async () => {
      const r = await call('GET', '/api/indicadores/convenio', { token: coordPs });
      assert.strictEqual(r.status, 200, r.text);
      const t = r.json.total;
      assert.deepStrictEqual(r.json.periodo, { desde: '2026-01-01', hasta: '2026-08-31' });
      // IP04: 1 hipertenso atendido, con dos controles y uno en meta = 1 de 1
      assert.deepStrictEqual([t.ip04.numerador, t.ip04.denominador, t.ip04.porcentaje], [1, 1, 100]);
      // IP02: 1 diabético atendido con HbA1c = 1 de 1; IP03: sin creatinina ni albuminuria = 0 de 1
      assert.deepStrictEqual([t.ip02.numerador, t.ip02.denominador, t.ip02.porcentaje], [1, 1, 100]);
      assert.deepStrictEqual([t.ip03.numerador, t.ip03.denominador, t.ip03.porcentaje], [0, 1, 0]);
      // El establecimiento es un I-3: IP02 e IP03 son meta (10 %)
      assert.strictEqual(t.ip02.modo, 'meta');
      assert.strictEqual(t.ip02.meta, 10);
      // HEARTS: última presión 130/80 en meta = 1 de 1; telemonitoreo: 1 de 2 pacientes con HTA o DM, 1 atención
      assert.deepStrictEqual([t.hearts.hta_en_meta, t.hearts.hta_con_medicion, t.hearts.control_porcentaje], [1, 1, 100]);
      assert.deepStrictEqual([t.telemonitoreo.pacientes_atendidos, t.telemonitoreo.poblacion, t.telemonitoreo.atenciones, t.telemonitoreo.porcentaje], [1, 2, 1, 50]);
      const est = r.json.por_establecimiento[CS_I3];
      assert.ok(est && est.categoria === 'I-3');
      assert.strictEqual(est.ip04.numerador, 1);
    });

    await step('los esperados declarados dan la cobertura; sin ellos no se inventa', async () => {
      const sin = (await call('GET', '/api/indicadores/convenio', { token: coordPs })).json.total.hearts;
      assert.strictEqual(sin.cobertura_hta.porcentaje, null);
      const con = (await call('GET', '/api/indicadores/convenio?esperados_hta=4&esperados_dm=5', { token: coordPs })).json.total.hearts;
      assert.deepStrictEqual(con.cobertura_hta, { padron: 1, esperados: 4, porcentaje: 25 });
      assert.deepStrictEqual(con.cobertura_dm, { padron: 1, esperados: 5, porcentaje: 20 });
    });

    await step('un periodo propio cambia el resultado: solo marzo deja al hipertenso sin controles', async () => {
      const r = await call('GET', '/api/indicadores/convenio?desde=2026-03-01&hasta=2026-03-31', { token: coordPs });
      assert.strictEqual(r.status, 200, r.text);
      assert.strictEqual(r.json.total.ip04.denominador, 0);
      assert.strictEqual(r.json.total.ip04.porcentaje, null);
      assert.strictEqual(r.json.total.ip02.denominador, 1);
    });

    await step('parámetros inválidos responden 400', async () => {
      for (const q of ['desde=2026-01-01', 'desde=2026-09-01&hasta=2026-01-01', 'desde=x&hasta=y', 'esperados_hta=0', 'esperados_hta=abc', 'esperados_dm=-5', 'esperados_hta=2.5']) {
        const r = await call('GET', '/api/indicadores/convenio?' + q, { token: coordPs });
        assert.strictEqual(r.status, 400, q + ' -> ' + r.status);
      }
    });

    await step('alcance: otra red ve ceros; el DIRECTOR de la misma red ve los mismos agregados', async () => {
      const otra = (await call('GET', '/api/indicadores/convenio', { token: coordCs })).json.total;
      assert.strictEqual(otra.ip04.denominador, 0);
      assert.strictEqual(otra.ip02.denominador, 0);
      assert.strictEqual(otra.telemonitoreo.poblacion, 0);
      const dir = await call('GET', '/api/indicadores/convenio', { token: director });
      assert.strictEqual(dir.status, 200, dir.text);
      assert.strictEqual(dir.json.total.ip04.denominador, 1);
    });
  } catch (e) {
    failed++;
    console.log('  FALLA ' + e.message);
    console.log('--- salida del servidor ---\n' + srv.getLog());
  } finally {
    await srv.stop();
  }

  console.log('\nResultado Indicadores HTTP: ' + passed + ' correctas, ' + failed + ' con falla');
  process.exit(failed === 0 ? 0 : 1);
}

main();
