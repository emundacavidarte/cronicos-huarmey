/**
 * testCorreccionesF4.js
 * Correcciones de la Fase 4 en la importación del padrón y en los diagnósticos (C-05, C-06, C-08, C-09 y el tipo de
 * documento). Funciones puras del cliente y un servidor REAL en el puerto 3115 (store.json bloqueado con blockDisk.js).
 * Datos inventados. Ejecutar: node server/tests/testCorreccionesF4.js
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
const { startServer } = require('./helpers/realServer');

const schema = require('../../client/js/data/padronSchema.js');
const exportV4 = require('../../client/js/data/padronExportV4.js');
const calculadora = require('../../client/js/clinical/padronCalculadora.js');

const PORT = 3115;
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

async function main() {
  console.log('Correcciones de la Fase 4: importación del padrón y diagnósticos\n');

  // --- C-05: validación de la importación ---
  await step('C-05 fechas imposibles (31/02/1960, 2026-02-30) y textos sueltos no son fechas', () => {
    for (const f of ['31/02/1960', '1960-02-31', '2026-02-30', '30/13/1960', 'marzo 5 1960']) {
      assert.strictEqual(schema.parseDateOnly(f), null, f);
      assert.ok(/inválida/i.test(schema.validateCell('fecha_nacimiento', f, {})), f);
    }
    assert.ok(schema.parseDateOnly('29/02/1960'), '1960 fue bisiesto');
    assert.strictEqual(schema.validateCell('fecha_nacimiento', '15/05/1980', {}), null);
  });
  await step('C-05 «12abc» o «150<img>» ya no pasan como números; «12,5» sí', () => {
    assert.ok(/numérico/i.test(schema.validateCell('peso', '12abc', {})));
    assert.ok(/numérico/i.test(schema.validateCell('peso', '150<img src=x>', {})));
    assert.strictEqual(schema.validateCell('peso', '72,5', {}), null);
  });

  // --- Tipo de documento (pendiente de la Fase 2) ---
  await step('documento: el carné de extranjería y el pasaporte conservan sus letras; «Sin documento» va vacío', () => {
    const ce = { tipo_documento: 'Carné de extranjería', nro_documento: 'x-001234' };
    assert.strictEqual(schema.documentoNormalizado(ce), 'X001234');
    assert.strictEqual(schema.validateCell('nro_documento', ce.nro_documento, ce, new Map()), null);
    assert.ok(schema.validateCell('nro_documento', 'ab', { tipo_documento: 'Pasaporte' }, new Map()));
    const sin = { tipo_documento: 'Sin documento' };
    assert.strictEqual(schema.validateCell('nro_documento', '', sin, new Map()), null, 'sin número es válido');
    assert.ok(/vacío/i.test(schema.validateCell('nro_documento', '12345678', sin, new Map())));
    assert.strictEqual(schema.documentoNormalizado({ tipo_documento: 'DNI', nro_documento: '10.000.001' }), '10000001');
  });

  // --- C-06: edad exacta, también con la zona horaria de Lima ---
  await step('C-06 la edad es la cumplida (no año actual menos año de nacimiento)', () => {
    const hoy = new Date(2026, 10, 5, 12);
    assert.strictEqual(calculadora.calcularEdad('1966-12-25', hoy), 59);
    assert.strictEqual(calculadora.calcularEdad('1966-11-05', hoy), 60);
    assert.strictEqual(calculadora.calcularEdad('1966-11-06', hoy), 59);
  });
  await step('C-06 con TZ=America/Lima, nacido el 06/11 no cumple el 05/11 (antes la fecha se corría un día)', () => {
    const script = `const c=require(${JSON.stringify(path.join(__dirname, '..', '..', 'client', 'js', 'clinical', 'padronCalculadora.js'))});` +
      `process.stdout.write(String(c.calcularEdad('1966-11-06', new Date(2026, 10, 5, 12))));`;
    const r = spawnSync(process.execPath, ['-e', script], { env: Object.assign({}, process.env, { TZ: 'America/Lima' }), encoding: 'utf8' });
    assert.strictEqual(r.stdout, '59', r.stderr || r.stdout);
  });

  // --- C-09: lo que exporta el sistema lo acepta su propio importador ---
  await step('C-09 exportar y volver a importar la semilla: solo queda pendiente el consentimiento (por diseño)', () => {
    const semilla = require('../db/padron_inicial.js');
    const filas = semilla.map(p => {
      const fila = {};
      for (const col of schema.COLUMNAS) {
        const v = exportV4.valorDe(p, col.key);
        fila[col.key] = v === null || v === undefined ? '' : v;
      }
      return fila;
    });
    const res = schema.validateBatch(filas);
    const errores = {};
    res.rowResults.forEach(r => Object.keys(r.errors).forEach(k => { errores[k] = (errores[k] || 0) + 1; }));
    // El consentimiento se pregunta una sola vez (A12): sin respuesta registrada, la cuadrícula lo pide al reimportar
    delete errores.consentimiento;
    assert.deepStrictEqual(errores, {}, JSON.stringify(errores));
  });

  // --- C-08: los diagnósticos no se pierden al importar o registrar una atención ---
  const srv = await startServer({ port: PORT, env: { NODE_ENV: 'production', AUTH_SECRET: 'f4-q7Wm2Kx9Lp4Rt8Vz1Nc6Hb3Jd5Fs0Gy-prueba', ADMIN_PASSWORD: 'clave-admin-de-prueba-f4', ADMIN_RESET: '' } });
  try {
    const call = async (method, url, { token, body } = {}) => {
      const h = {};
      if (token) h.Authorization = 'Bearer ' + token;
      if (body !== undefined) h['Content-Type'] = 'application/json';
      const r = await fetch(srv.base + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch (e) { /* no JSON */ }
      return { status: r.status, json, text };
    };
    const admin = (await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'clave-admin-de-prueba-f4' } })).json.token;
    const base = { dni: '96400001', apellidos_nombres: 'PACIENTE INVENTADO F4', red_salud: 'PACIFICO SUR' };
    await step('C-08 una atención que no repite la dislipidemia ya no la borra de los diagnósticos', async () => {
      assert.strictEqual((await call('POST', '/api/padron/importar-lote', { token: admin, body: [Object.assign({}, base, {
        conditions: [{ cie10_cod: 'I10', diagnostico: 'Hipertensión' }, { cie10_cod: 'E78.2', diagnostico: 'Dislipidemia' }]
      })] })).status, 200);
      assert.strictEqual((await call('POST', '/api/padron/importar-lote', { token: admin, body: [Object.assign({}, base, {
        conditions: [{ cie10_cod: 'I10', diagnostico: 'Hipertensión' }, { cie10_cod: 'E11', diagnostico: 'Diabetes' }]
      })] })).status, 200);
      const p = (await call('GET', '/api/cronicos', { token: admin })).json.find(x => x.dni === '96400001');
      assert.deepStrictEqual([...p.diagnosticos].sort(), ['E11', 'E78.2', 'I10']);
    });
    await step('«Sin documento»: el servidor acepta el id propio que genera el cliente y la fila sin número', async () => {
      const r = await call('POST', '/api/padron/importar-lote', { token: admin, body: [{ id: 'pac-sd-1a2b3c4d', tipo_documento: 'Sin documento', dni: '', apellidos_nombres: 'PACIENTE SIN DOCUMENTO F4', red_salud: 'PACIFICO SUR' }] });
      assert.strictEqual(r.status, 200, r.text);
    });
  } finally {
    await srv.stop();
  }

  console.log(`\nResultado Correcciones F4: ${passed} correctas, ${failed} con falla`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
