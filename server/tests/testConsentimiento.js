/**
 * testConsentimiento.js
 * A12: sin consentimiento no se genera el enlace de WhatsApp; el mensaje no lleva diagnóstico, tratamiento ni nombre;
 * nadie queda con consentimiento "por defecto"; el servidor registra el consentimiento con el usuario de la sesión
 * y respeta el alcance por red. Servidor real en el puerto 3106 (sin tocar store.json). Pacientes y usuarios inventados.
 * Ejecutar: node server/tests/testConsentimiento.js
 */

const assert = require('assert');
const { startServer } = require('./helpers/realServer');

global.XLSX = require('../../client/libs/xlsx.full.min.js');
const notifier = require('../../client/js/clinical/whatsappNotifier.js');
const schema = require('../../client/js/data/padronSchema.js');
const parser = require('../../client/js/data/padronExcelParser.js');

const PORT = 3106;
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

async function unitarias() {
  console.log('A12: notificador y valores por defecto');
  const base = {
    telefono: '943111001', apellidos_nombres: 'PEREZ QUISPE JUAN', puerta_entrada: 'NUEVO HOSPITAL DE APOYO HUARMEY',
    fecha_limite: '2026-11-20', diagnosticos: ['E11', 'I10']
  };

  await step('sin consentimiento (vacío, ausente, "No" o texto raro) no se genera el enlace', async () => {
    for (const c of [undefined, null, '', '  ', 'No', 'no', 'Sí', 'si', 'Pendiente']) {
      assert.strictEqual(notifier.generarEnlace({ ...base, consentimiento: c }), null, 'consentimiento=' + JSON.stringify(c));
    }
    assert.strictEqual(notifier.estadoConsentimiento({ ...base }), 'sin_registrar');
    assert.strictEqual(notifier.estadoConsentimiento({ ...base, consentimiento: 'No' }), 'no');
  });

  await step('con "Sí, firmado" se genera el enlace; sin teléfono válido sigue sin generarse', async () => {
    const url = notifier.generarEnlace({ ...base, consentimiento: 'Sí, firmado' }, '20/11/2026');
    assert.ok(url && url.startsWith('https://wa.me/51943111001?text='));
    assert.strictEqual(notifier.generarEnlace({ ...base, consentimiento: 'Sí, firmado', telefono: '123' }), null);
  });

  await step('el mensaje no lleva diagnóstico, tratamiento ni nombre del paciente (diabético, hipertenso o ambos)', async () => {
    for (const dx of [['E11'], ['I10'], ['E11', 'I10'], ['I10', 'N18']]) {
      const url = notifier.generarEnlace({ ...base, diagnosticos: dx, consentimiento: 'Sí, firmado' }, '20/11/2026');
      const msg = decodeURIComponent(url.split('?text=')[1]);
      assert.ok(!/diabetes|hipertensi|mellitus|arterial|tratamiento|farmac|PEREZ|QUISPE|JUAN|E11|I10/i.test(msg), msg);
      assert.ok(msg.includes('20/11/2026'), 'debe llevar la fecha');
      assert.ok(msg.includes('NUEVO HOSPITAL DE APOYO HUARMEY'), 'debe llevar el lugar');
    }
  });

  await step('el esquema v4 ya no presume consentimiento: sin columna en el Excel queda vacío', async () => {
    const col = schema.COLUMNAS.find(c => c.key === 'consentimiento');
    assert.ok(col && col.default === undefined);
    const rows = [
      ['N.º de documento (DNI)', 'Apellidos y nombres', 'Sexo', 'Sector sanitario', 'Fecha de nacimiento', 'Seguro de salud'],
      ['10000099', 'PACIENTE INVENTADO CERO', 'Femenino', 'Sector I – Centro', '1960-01-01', 'SIS']
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'PADRON_CRONICOS');
    const parsed = await parser.parseWorkbook(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    assert.strictEqual(parsed.patients[0].consentimiento, '');
  });
}

async function http() {
  let srv;
  try {
    srv = await startServer({
      port: PORT,
      env: { ADMIN_USER: 'admin', ADMIN_PASSWORD: ADMIN_PASS, ADMIN_RESET: '', NODE_ENV: 'test', AUTH_SECRET: 'secreto-consentimiento-de-prueba-con-mas-de-32-caracteres' }
    });
  } catch (e) {
    console.log('  FALLA no arranco el servidor: ' + e.message);
    failed++;
    return;
  }
  BASE = srv.base;
  try {
    console.log('A12: servidor');
    const admin = (await call('POST', '/api/auth/login', { body: { username: 'admin', password: ADMIN_PASS } })).json.token;
    const coordPs = await crearUsuario(admin, 'coord_ps', 'COORDINADOR', 'Pacífico Sur');
    const coordCs = await crearUsuario(admin, 'coord_cs', 'COORDINADOR', 'CONCHUCOS SUR (N° 87)');
    const director = await crearUsuario(admin, 'dir_ps', 'DIRECTOR', '156');
    const DNI = '93400001';
    const id = 'pac-00001741-' + DNI;
    const url = '/api/patients/' + id + '/consentimiento';
    assert.strictEqual((await call('POST', '/fhir/Bundle', { token: admin, body: bundleFor(DNI, '00001744') })).status, 200);

    await step('un paciente nuevo no trae consentimiento', async () => {
      const lista = (await call('GET', '/api/cronicos', { token: coordPs })).json;
      const p = lista.find(x => x.id === id);
      assert.ok(p);
      assert.ok(!p.consentimiento, 'consentimiento=' + p.consentimiento);
    });

    await step('sin token responde 401; valor inválido 400; paciente inexistente 404', async () => {
      assert.strictEqual((await call('PUT', url, { body: { consentimiento: 'Sí, firmado' } })).status, 401);
      for (const v of [undefined, '', 'Sí', 'si', 'Pendiente', 5]) {
        assert.strictEqual((await call('PUT', url, { token: coordPs, body: { consentimiento: v } })).status, 400, JSON.stringify(v));
      }
      assert.strictEqual((await call('PUT', '/api/patients/no-existe-99/consentimiento', { token: admin, body: { consentimiento: 'No' } })).status, 404);
    });

    await step('otra red (404, igual que inexistente: F2-04) y el DIRECTOR (403) no pueden registrar el consentimiento', async () => {
      assert.strictEqual((await call('PUT', url, { token: coordCs, body: { consentimiento: 'Sí, firmado' } })).status, 404);
      assert.strictEqual((await call('PUT', url, { token: director, body: { consentimiento: 'Sí, firmado' } })).status, 403);
      const p = (await call('GET', '/api/cronicos', { token: admin })).json.find(x => x.id === id);
      assert.ok(!p.consentimiento);
    });

    await step('el COORDINADOR registra el consentimiento: queda con fecha y su usuario, aunque el cuerpo diga otro', async () => {
      const r = await call('PUT', url, { token: coordPs, body: { consentimiento: 'Sí, firmado', consentimiento_registrado_por: 'otro.usuario' } });
      assert.strictEqual(r.status, 200, r.text);
      assert.strictEqual(r.json.data.consentimiento, 'Sí, firmado');
      assert.strictEqual(r.json.data.consentimiento_registrado_por, 'coord_ps');
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.json.data.consentimiento_fecha));
      const p = (await call('GET', '/api/cronicos', { token: coordPs })).json.find(x => x.id === id);
      assert.strictEqual(p.consentimiento, 'Sí, firmado');
      assert.strictEqual(notifier.tieneConsentimiento(p), true);
    });

    await step('el paciente puede retirar el consentimiento ("No") y desde ese momento no hay enlace', async () => {
      const r = await call('PUT', url, { token: coordPs, body: { consentimiento: 'No' } });
      assert.strictEqual(r.status, 200, r.text);
      const p = (await call('GET', '/api/cronicos', { token: coordPs })).json.find(x => x.id === id);
      assert.strictEqual(p.consentimiento, 'No');
      assert.strictEqual(notifier.generarEnlace({ ...p, telefono: '943111001' }), null);
    });

    await step('un Excel o un lote sin consentimiento no borra el que ya está registrado', async () => {
      await call('PUT', url, { token: coordPs, body: { consentimiento: 'Sí, firmado' } });
      const b = bundleFor(DNI, '00001744');
      assert.strictEqual((await call('POST', '/fhir/Bundle', { token: coordPs, body: b })).status, 200);
      const p = (await call('GET', '/api/cronicos', { token: coordPs })).json.find(x => x.id === id);
      assert.strictEqual(p.consentimiento, 'Sí, firmado');
    });

    await step('al registrar al paciente el consentimiento se guarda una sola vez, con el usuario de la sesión; reenviarlo no lo cambia', async () => {
      const DNI2 = '93400002';
      const id2 = 'pac-00001741-' + DNI2;
      const lote = c => ({ patients: [{ id: id2, dni: DNI2, apellidos_nombres: 'PACIENTE INVENTADO DOS', puerta_entrada_id: '00001744', consentimiento: c, consentimiento_registrado_por: 'otro.usuario', consentimiento_fecha: '2001-01-01' }] });
      const leer = async () => (await call('GET', '/api/cronicos', { token: admin })).json.find(x => x.id === id2);

      assert.strictEqual((await call('POST', '/api/padron/importar-lote', { token: coordPs, body: lote('Sí, firmado') })).status, 200);
      let p = await leer();
      assert.strictEqual(p.consentimiento, 'Sí, firmado');
      assert.strictEqual(p.consentimiento_registrado_por, 'coord_ps');
      assert.notStrictEqual(p.consentimiento_fecha, '2001-01-01');
      const fecha = p.consentimiento_fecha;

      // otro usuario reenvía el mismo valor: no se vuelve a registrar
      assert.strictEqual((await call('POST', '/api/padron/importar-lote', { token: admin, body: lote('Sí, firmado') })).status, 200);
      p = await leer();
      assert.strictEqual(p.consentimiento_registrado_por, 'coord_ps');
      assert.strictEqual(p.consentimiento_fecha, fecha);

      // un lote sin respuesta (o con un valor inventado) no borra ni cambia lo registrado
      for (const c of ['', 'Quizás', undefined]) {
        assert.strictEqual((await call('POST', '/api/padron/importar-lote', { token: admin, body: lote(c) })).status, 200);
      }
      p = await leer();
      assert.strictEqual(p.consentimiento, 'Sí, firmado');
      assert.strictEqual(p.consentimiento_registrado_por, 'coord_ps');
    });

    await step('un paciente nuevo registrado sin responder no queda con consentimiento', async () => {
      const id3 = 'pac-00001741-93400003';
      assert.strictEqual((await call('POST', '/api/padron/importar-lote', { token: coordPs, body: { patients: [{ id: id3, dni: '93400003', apellidos_nombres: 'PACIENTE INVENTADO TRES', puerta_entrada_id: '00001744', consentimiento: 'Quizás' }] } })).status, 200);
      const p = (await call('GET', '/api/cronicos', { token: admin })).json.find(x => x.id === id3);
      assert.ok(!p.consentimiento && !p.consentimiento_fecha);
    });

    await step('cada registro de consentimiento deja huella en la auditoría', async () => {
      const logs = (await call('GET', '/api/security/audit-logs?limit=500', { token: admin })).json.logs || [];
      assert.ok(logs.filter(l => l.evento === 'CONSENTIMIENTO_REGISTRADO').length >= 3);
    });
  } catch (e) {
    failed++;
    console.log('  FALLA ' + e.message);
    console.log('--- salida del servidor ---\n' + srv.getLog());
  } finally {
    await srv.stop();
  }
}

(async () => {
  await unitarias();
  await http();
  console.log('\nResultado Consentimiento: ' + passed + ' correctas, ' + failed + ' con falla');
  process.exit(failed === 0 ? 0 : 1);
})();
