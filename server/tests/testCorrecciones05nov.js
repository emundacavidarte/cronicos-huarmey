/**
 * testCorrecciones05nov.js
 * Correcciones del reporte de prueba en navegador del 05/11/2026 (docs/REPORTE_PRUEBA_NAVEGADOR_2026-11-05.md):
 * trabajo sin conexión (F-4), carga de CSV en el servidor (F-1), ida y vuelta del Excel con el padrón inicial (F-2),
 * tablero del DIRECTOR (F-3), fecha del WhatsApp (F-6), totales sin fallecidos (O-3) y rutas de la API (T-04, T-05).
 * Servidor REAL en el puerto 3110 sin tocar store.json; pacientes y usuarios inventados.
 * Ejecutar: node server/tests/testCorrecciones05nov.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { startServer } = require('./helpers/realServer');

const CLIENT = path.join(__dirname, '..', '..', 'client');
global.XLSX = require('../../client/libs/xlsx.full.min.js');
const schema = require('../../client/js/data/padronSchema.js');
const parser = require('../../client/js/data/padronExcelParser.js');
const exportador = require('../../client/js/data/padronExportV4.js');
const hosixParser = require('../../client/js/data/hosixParser.js');
const notifier = require('../../client/js/clinical/whatsappNotifier.js');
const resumenTablero = require('../../client/js/clinical/resumenTablero.js');
const semaforo = require('../../client/js/clinical/semaforo.js');
const fechaLima = require('../../client/js/utils/fechaLima.js');
const { DEFAULT_ESTABLISHMENTS } = require('../../client/js/map/establecimientos.js');

const PORT = 3110;
const ADMIN_PASS = 'clave-admin-correcciones-1';

let passed = 0;
let failed = 0;
let BASE = '';

async function step(name, fn) {
  try { await fn(); passed++; console.log('  OK    ' + name); }
  catch (e) { failed++; console.log('  FALLA ' + name + '\n        ' + e.message); }
}

async function call(method, url, { token, body, raw } = {}) {
  const h = {};
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined || raw !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers: h, body: raw !== undefined ? raw : (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* no era JSON */ }
  return { status: res.status, json, text };
}

const leer = rel => fs.readFileSync(path.join(CLIENT, rel), 'utf8');

async function main() {
  console.log('F-4: trabajo sin conexión');

  await step('index.html ya no borra las cachés del trabajador de servicio (borraba la vigente en cada carga)', async () => {
    const html = leer('index.html');
    assert.ok(!/caches\.delete/.test(html), 'index.html no debe llamar a caches.delete');
  });

  await step('cada script y hoja de estilo de la página está en la caché con la MISMA versión (?v=)', async () => {
    const html = leer('index.html');
    const sw = leer('sw.js');
    const refs = [...html.matchAll(/(?:src|href)="((?:css|js|libs|data)\/[^"]+)"/g)].map(m => m[1]);
    assert.ok(refs.length > 30);
    const faltan = refs.filter(r => !sw.includes("'./" + r + "'"));
    assert.deepStrictEqual(faltan, []);
    assert.ok(/cache\.add\(url\)\.catch/.test(sw), 'la instalación guarda archivo por archivo');
  });

  console.log('F-1: carga de CSV de HOSIX / Galenos');

  const CAB = 'NRO_DOCUMENTO,HISTORIA_CLINICA,APELLIDOS_NOMBRES,SEXO,EDAD,TELEFONO,DIRECCION,DISTRITO,CIE10_COD,DIAGNOSTICO,FEC_ULTIMA_ATENCION,FEC_PROXIMA_CITA,PA_SISTOLICA,PA_DIASTOLICA,HBA1C,ESTADO_CONTROL,COD_IPRESS_ORIGEN';
  const csv = '﻿' + CAB + '\r\n' +
    '70000301,HC-301,PACIENTE INVENTADO CSV UNO,F,61,987000301,"Av. Inventada 120,\nMz A",HUARMEY,I10,Hipertension esencial,2026-10-20,2026-12-30,132,84,,Controlado,00001744\r\n' +
    ',,PACIENTE SIN DOCUMENTO,F,61,,,,,,,,,,,,\r\n' +
    '70000302,,,M,50,,,,,,,,,,,,\r\n';

  await step('el analizador respeta comillas con salto de línea, la marca BOM y los campos vacíos', async () => {
    const recs = hosixParser.parseCSV(csv);
    assert.strictEqual(recs.length, 3);
    assert.strictEqual(recs[0].NRO_DOCUMENTO, '70000301');
    assert.strictEqual(recs[0].DIRECCION, 'Av. Inventada 120,\nMz A');
    assert.strictEqual(recs[0].HBA1C, '');
    assert.strictEqual(recs[0].COD_IPRESS_ORIGEN, '00001744');
  });

  await step('no se inventan DNI, nombres ni diagnósticos: las filas sin documento o sin nombre se descartan con su motivo', async () => {
    const { validos, descartados } = hosixParser.procesarParaServidor(hosixParser.parseCSV(csv));
    assert.strictEqual(validos.length, 1);
    assert.deepStrictEqual(descartados.map(d => d.fila), [3, 4]);
    assert.ok(/documento/.test(descartados[0].motivo) && /nombres/.test(descartados[1].motivo));
    const p = validos[0];
    assert.strictEqual(p.dni, '70000301');
    assert.deepStrictEqual(p.diagnosticos, ['I10']);
    assert.strictEqual(p.conditions[0].diagnostico, 'Hipertension esencial');
    assert.ok(p.establecimiento_control.includes('(00001744)'), 'el código del archivo viaja al servidor');
    assert.strictEqual(p.semaforo, undefined, 'el semáforo lo calcula el servidor');
    // una fila con diagnóstico vacío ya no recibe «I10» inventado
    const sinDx = hosixParser.procesarParaServidor(hosixParser.parseCSV(CAB + '\n70000303,,PACIENTE INVENTADO SIN DX,F,40,,,,,,,,,,,,')).validos[0];
    assert.deepStrictEqual(sinDx.diagnosticos, []);
    assert.deepStrictEqual(sinDx.conditions, []);
  });

  console.log('F-2: el Excel exportado se vuelve a importar');

  await step('el padrón inicial exportado e importado no tiene observaciones si sus pacientes ya están en el sistema', async () => {
    const semilla = require('../db/padron_inicial.js');
    const lista = Array.isArray(semilla) ? semilla : Object.values(semilla)[0];
    const wb = exportador.construirLibro(XLSX, lista, {});
    const parsed = await parser.parseWorkbook(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true }));
    assert.strictEqual(parsed.patients.length, lista.length);
    // la cuadrícula marca así a los pacientes que ya existen sin consentimiento (precargarConsentimiento)
    parsed.patients.forEach(r => { if (!r.consentimiento) r._consentimientoPendiente = true; });
    const res = schema.validateBatch(parsed.patients);
    const detalle = res.rowResults.filter(r => !r.isValid).map(r => JSON.stringify(r.errors)).slice(0, 3).join(' | ');
    assert.strictEqual(res.totalErrors, 0, detalle);
  });

  await step('a un paciente NUEVO se le sigue exigiendo el consentimiento', async () => {
    const fila = {
      tipo_documento: 'DNI', nro_documento: '70000304', apellidos_nombres: 'PACIENTE INVENTADO NUEVO', sexo: 'Femenino',
      fecha_nacimiento: '1970-01-01', seguro_salud: 'SIS', sector: 'Sector I – Centro', direccion: 'Calle Inventada 1',
      establecimiento_adscripcion: 'Hospital de Apoyo Huarmey (00001741, II-1)', establecimiento_control: 'Hospital de Apoyo Huarmey (00001741, II-1)',
      estado_paciente: 'Activo', consentimiento: ''
    };
    const res = schema.validateBatch([fila]);
    assert.ok(/obligatorio/i.test(res.rowResults[0].errors.consentimiento));
  });

  await step('un establecimiento del catálogo oficial con su código es válido (P. S. Culebras); uno inventado no', async () => {
    assert.strictEqual(schema.validateCell('establecimiento_control', 'P. S. Culebras (00001743, I-2)', {}), null);
    assert.ok(schema.validateCell('establecimiento_control', 'Posta Inventada (99999999, I-1)', {}));
  });

  console.log('F-6: fecha del mensaje de WhatsApp');

  const base = { telefono: '987000301', consentimiento: 'Sí, firmado', puerta_entrada: 'NUEVO HOSPITAL DE APOYO HUARMEY' };
  const texto = url => decodeURIComponent(url.split('text=')[1]);

  await step('con cita futura el mensaje lleva la fecha real de la cita (no «hoy + 3 días»)', async () => {
    const futura = fechaLima.hoy(20);
    const [a, m, d] = futura.split('-');
    const msg = texto(notifier.generarEnlace({ ...base, fecha_limite: futura }));
    assert.ok(msg.includes(`próximo control es el *${d}/${m}/${a}*`), msg);
    assert.ok(!msg.includes(fechaLima.hoy(3).split('-').reverse().join('/')));
  });

  await step('con la cita vencida pide reprogramar; sin cita no inventa fecha; fallecido no genera enlace', async () => {
    const pasada = fechaLima.hoy(-15);
    assert.ok(/está pendiente/.test(texto(notifier.generarEnlace({ ...base, fecha_limite: pasada }))));
    const sinCita = texto(notifier.generarEnlace({ ...base }));
    assert.ok(/programar su cita/.test(sinCita) && !/\d{2}\/\d{2}\/\d{4}/.test(sinCita));
    assert.strictEqual(notifier.generarEnlace({ ...base, fecha_limite: pasada, fallecido: true }), null);
  });

  console.log('O-3 y F-3: resumen del tablero');

  const inventados = [
    { id: 'a', semaforo: 'green', diagnosticos: ['I10'], pa_sistolica: 120, pa_diastolica: 80, puerta_entrada_id: '00001741' },
    { id: 'b', semaforo: 'red', diagnosticos: ['I10', 'E11'], pa_sistolica: 150, pa_diastolica: 95, puerta_entrada_id: '00001744' },
    { id: 'c', semaforo: 'yellow', diagnosticos: ['E11'], puerta_entrada_id: '00001744' },
    { id: 'd', semaforo: 'gray', diagnosticos: ['I10'], puerta_entrada_id: '00001741' },
    { id: 'e', semaforo: 'black', fallecido: true, diagnosticos: ['I10'], puerta_entrada_id: '00001741' },
    { id: 'f', semaforo: 'purple', fuente: 'HOSIX', diagnosticos: ['I10'], puerta_entrada_id: '00001741' }
  ];

  await step('«Total» y población activa no cuentan fallecidos; «sin cita» no se cuenta como cita vigente', async () => {
    const r = resumenTablero.calcular(inventados, DEFAULT_ESTABLISHMENTS);
    assert.strictEqual(r.total_registros, 6);
    assert.strictEqual(r.activos, 5);
    assert.deepStrictEqual(r.semaforo, { green: 1, yellow: 1, red: 1, purple: 1, gray: 1, black: 1 });
    assert.deepStrictEqual(r.patologias, { hta: 4, dm: 2, erc: 0, dislipidemia: 0, obesidad: 0 });
    assert.deepStrictEqual(r.presion, { con_medicion: 2, controlados: 1 });
    const lv = r.ipress.find(x => x.nombre.includes('LA VICTORIA'));
    assert.ok(lv && lv.total === 2 && lv.desercion === 1 && lv.categoria === 'I-3');
  });

  let srv;
  try {
    srv = await startServer({
      port: PORT,
      env: { ADMIN_USER: 'admin', ADMIN_PASSWORD: ADMIN_PASS, ADMIN_RESET: '', NODE_ENV: 'test', AUTH_SECRET: 'secreto-correcciones-de-prueba-con-mas-de-32-caracteres' }
    });
  } catch (e) {
    console.log('  FALLA no arranco el servidor: ' + e.message);
    process.exit(1);
  }
  BASE = srv.base;

  try {
    const admin = (await call('POST', '/api/auth/login', { body: { username: 'admin', password: ADMIN_PASS } })).json.token;
    const crear = async (username, role) => {
      const password = 'clave-de-' + username + '-123';
      const r = await call('POST', '/api/users', { token: admin, body: { username, nombre: 'USUARIO ' + username, role, password, red: 'Pacífico Sur' } });
      assert.strictEqual(r.status, 201, r.text);
      return (await call('POST', '/api/auth/login', { body: { username, password } })).json.token;
    };
    const director = await crear('dir_correcciones', 'DIRECTOR');

    console.log('F-1 y F-3 contra el servidor');

    await step('el CSV procesado se guarda en el servidor y el establecimiento sale del código del archivo', async () => {
      const { validos } = hosixParser.procesarParaServidor(hosixParser.parseCSV(csv));
      const r = await call('POST', '/api/padron/importar-lote', { token: admin, body: { patients: validos } });
      assert.strictEqual(r.status, 200, r.text);
      const lista = (await call('GET', '/api/cronicos', { token: admin })).json;
      const p = lista.find(x => x.dni === '70000301');
      assert.ok(p, 'el paciente quedó guardado');
      assert.strictEqual(p.puerta_entrada_id, '00001744');
      assert.ok(/LA VICTORIA/i.test(p.puerta_entrada));
    });

    await step('el DIRECTOR recibe el resumen del tablero (agregado) y coincide con el cálculo sobre la lista completa', async () => {
      const otros = [
        { id: 'pac-00001741-70000305', dni: '70000305', apellidos_nombres: 'PACIENTE INVENTADO CINCO', puerta_entrada_id: '00001741', diagnosticos: ['I10'], pa_sistolica: 128, pa_diastolica: 82, appointments: [{ fecha_cita: fechaLima.hoy(30), estado: 'booked' }] },
        { id: 'pac-00001741-70000306', dni: '70000306', apellidos_nombres: 'PACIENTE INVENTADO SEIS', puerta_entrada_id: '00001741', diagnosticos: ['E11'], fallecido: true }
      ];
      assert.strictEqual((await call('POST', '/api/padron/importar-lote', { token: admin, body: { patients: otros } })).status, 200);
      const r = await call('GET', '/api/alerts/summary', { token: director });
      assert.strictEqual(r.status, 200, r.text);
      const t = r.json.tablero;
      assert.ok(t && t.semaforo && Array.isArray(t.ipress), 'trae el bloque «tablero»');
      const completos = (await call('GET', '/api/cronicos', { token: admin })).json
        .map(p => Object.assign({}, p, { semaforo: semaforo.calcularSemaforo(p, new Date()).semaforo }));
      const esperado = resumenTablero.calcular(completos, DEFAULT_ESTABLISHMENTS);
      assert.deepStrictEqual(t, esperado);
      assert.strictEqual(t.activos, r.json.total_pacientes - r.json.fallecidos);
      assert.ok(!JSON.stringify(t).includes('70000305'), 'sin datos individuales');
    });

    console.log('T-04 y T-05: rutas y errores');

    await step('las rutas con doble prefijo ya no existen (404) y las canónicas siguen respondiendo', async () => {
      for (const u of ['/api/api/cronicos', '/fhir/api/cronicos', '/fhir/fhir/metadata', '/api/fhir/metadata', '/fhir/fhir/Patient/70000301']) {
        assert.strictEqual((await call('GET', u, { token: admin })).status, 404, u);
      }
      for (const u of ['/api/cronicos', '/fhir/metadata', '/fhir/loinc-catalog', '/fhir/Patient/70000301/bundle']) {
        assert.strictEqual((await call('GET', u, { token: admin })).status, 200, u);
      }
      assert.strictEqual((await call('POST', '/fhir/fhir/Bundle', { token: admin, body: { resourceType: 'Bundle', type: 'transaction', entry: [] } })).status, 404);
    });

    await step('/fhir/Patient/:id entrega un recurso Patient y /bundle el expediente completo', async () => {
      const p = await call('GET', '/fhir/Patient/70000301', { token: admin });
      assert.strictEqual(p.status, 200);
      assert.strictEqual(p.json.resourceType, 'Patient');
      const b = await call('GET', '/fhir/Patient/70000301/bundle', { token: admin });
      assert.strictEqual(b.json.resourceType, 'Bundle');
    });

    await step('un JSON mal formado responde 400 con un mensaje claro, sin el texto interno del analizador', async () => {
      const r = await call('POST', '/fhir/Bundle', { token: admin, raw: '{malo' });
      assert.strictEqual(r.status, 400);
      assert.strictEqual(r.json.issue[0].diagnostics, 'El contenido enviado no es un JSON válido.');
      assert.ok(!/position|Unexpected|Expected property/i.test(r.text));
    });

    await step('el límite de escrituras por minuto también aplica en /fhir', async () => {
      let limitadas = 0;
      for (let i = 0; i < 130; i++) {
        const r = await call('POST', '/fhir/Bundle', { token: admin, raw: '{}' });
        if (r.status === 429) limitadas++;
      }
      assert.ok(limitadas > 0, 'después de 120 escrituras debe responder 429');
    });
  } catch (e) {
    failed++;
    console.log('  FALLA ' + e.message);
    console.log('--- salida del servidor ---\n' + srv.getLog());
  } finally {
    await srv.stop();
  }

  console.log('\nResultado Correcciones 05-nov: ' + passed + ' correctas, ' + failed + ' con falla');
  process.exit(failed === 0 ? 0 : 1);
}

main();
