/**
 * testErrorB.js
 * Comprueba que se usa la cita / observacion con la FECHA MAS RECIENTE (no la posicion [0]),
 * en latestRecord, database.upsertObservation, apiRoutes (/patients/geo y /alerts/summary)
 * y fhirAdapter.toFhirBundle. Usa pacientes inventados en memoria.
 * Ejecutar: node server/tests/testErrorB.js
 */

const assert = require('assert');
const Module = require('module');

// 'express' no esta instalado en server/ y no se instalan librerias nuevas:
// se sustituye SOLO en esta prueba por un router falso que registra las rutas.
// Los manejadores de apiRoutes.js que se ejecutan son los reales.
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'express') {
    const express = () => ({});
    express.json = () => (req, res, next) => next && next();
    express.Router = () => {
      const stack = [];
      const add = method => (path, ...handlers) => {
        if (typeof path === 'function') return;
        const paths = Array.isArray(path) ? path : [path];
        for (const p of paths) {
          stack.push({ route: { path: p, methods: { [method]: true }, stack: handlers.map(h => ({ handle: h })) } });
        }
      };
      return { stack, get: add('get'), post: add('post'), put: add('put'), delete: add('delete'), patch: add('patch'), use() {} };
    };
    return express;
  }
  return originalLoad.call(this, request, ...rest);
};

const { db, resetDb, closeDb } = require('./helpers/memoryDb');
const fhirAdapter = require('../fhir/fhirAdapter');
const router = require('../routes/apiRoutes');
Module._load = originalLoad;
const { getLatestByDate, getLatestAppointment, getLatestObservation } = require('../utils/latestRecord');

let passed = 0;
let failed = 0;

function test(name, fn) {
  resetDb();
  try {
    fn();
    passed++;
    console.log('  OK    ' + name);
  } catch (e) {
    failed++;
    console.log('  FALLA ' + name + '\n        ' + e.message);
  }
}

function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
}

// Ejecuta el manejador real de una ruta GET del router, con req/res falsos
function callGet(path) {
  const layer = router.stack.find(l => l.route && l.route.path === path && l.route.methods.get);
  assert.ok(layer, 'No se encontro la ruta ' + path);
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  let body;
  const res = {
    setHeader() {},
    status() { return res; },
    end() {},
    json(b) { body = b; return res; }
  };
  handler({ headers: {}, query: {}, user: { username: 'adm', role: 'ADMIN', red: null } }, res);
  return body;
}

console.log('Error B: se usa la cita/observacion mas reciente por fecha');

test('getLatestByDate elige la fecha mas alta aunque no este en [0] ni al final', () => {
  const lista = [
    { id: 'a', fecha_cita: '2026-03-01' },
    { id: 'b', fecha_cita: '2026-09-15' },
    { id: 'c', fecha_cita: '2026-05-10' }
  ];
  assert.strictEqual(getLatestAppointment(lista).id, 'b');
});

test('getLatestByDate: lista vacia o inexistente devuelve undefined', () => {
  assert.strictEqual(getLatestByDate([], 'fecha_cita'), undefined);
  assert.strictEqual(getLatestByDate(undefined, 'fecha_cita'), undefined);
});

test('getLatestByDate: empate o fecha invalida -> gana la valida / la ultima agregada', () => {
  assert.strictEqual(getLatestObservation([
    { id: 'x', fecha_registro: '2026-06-01' },
    { id: 'y', fecha_registro: '2026-06-01' }
  ]).id, 'y');
  assert.strictEqual(getLatestObservation([
    { id: 'ok', fecha_registro: '2026-06-01' },
    { id: 'mala', fecha_registro: 'no-es-fecha' }
  ]).id, 'ok');
});

test('upsertObservation: una observacion ANTIGUA que llega despues no pisa los signos vitales nuevos', () => {
  db.upsertPatient({ id: 'pac-t-1', dni: '91000001', apellidos_nombres: 'TEST UNO' });
  db.upsertObservation({ id: 'o-nueva', patient_id: 'pac-t-1', fecha_registro: '2026-09-01', pa_sistolica: 120, pa_diastolica: 80, estado_control: 'Controlado' });
  db.upsertObservation({ id: 'o-vieja', patient_id: 'pac-t-1', fecha_registro: '2026-01-01', pa_sistolica: 170, pa_diastolica: 100, estado_control: 'No Controlado' });
  const p = db.getPatientByDni('91000001');
  assert.strictEqual(p.pa_sistolica, 120);
  assert.strictEqual(p.pa_diastolica, 80);
  assert.strictEqual(p.estado_control, 'Controlado');
});

test('upsertObservation: una observacion NUEVA si actualiza los signos vitales', () => {
  db.upsertPatient({ id: 'pac-t-2', dni: '91000002', apellidos_nombres: 'TEST DOS' });
  db.upsertObservation({ id: 'o1', patient_id: 'pac-t-2', fecha_registro: '2026-01-01', pa_sistolica: 170, pa_diastolica: 100, estado_control: 'No Controlado' });
  db.upsertObservation({ id: 'o2', patient_id: 'pac-t-2', fecha_registro: '2026-09-01', pa_sistolica: 118, pa_diastolica: 76, estado_control: 'Controlado' });
  const p = db.getPatientByDni('91000002');
  assert.strictEqual(p.pa_sistolica, 118);
  assert.strictEqual(p.estado_control, 'Controlado');
});

test('/patients/geo usa la cita y observacion mas recientes (la ultima de la lista NO es la mas reciente)', () => {
  db.upsertPatient({ id: 'pac-t-3', dni: '91000003', apellidos_nombres: 'TEST TRES', latitud: -10.05, longitud: -78.15 });
  // Orden de llegada: primero la cita futura (+30 dias), luego una vencida (-60 dias) agregada al final
  db.upsertAppointment({ id: 'a-futura', patient_id: 'pac-t-3', fecha_cita: isoDaysFromNow(30) });
  db.upsertAppointment({ id: 'a-vencida', patient_id: 'pac-t-3', fecha_cita: isoDaysFromNow(-60) });
  // Observaciones: la mas reciente llega primero y la antigua al final
  db.upsertObservation({ id: 'o-reciente', patient_id: 'pac-t-3', fecha_registro: '2026-09-01', estado_control: 'Controlado' });
  db.upsertObservation({ id: 'o-antigua', patient_id: 'pac-t-3', fecha_registro: '2026-01-01', estado_control: 'No Controlado' });
  const feat = callGet('/patients/geo').features.find(f => f.properties.dni === '91000003');
  assert.ok(feat, 'el paciente debe aparecer en el mapa');
  assert.strictEqual(feat.properties.semaforo, 'green');
  assert.ok(feat.properties.dias_restantes > 7);
  assert.strictEqual(feat.properties.estado_control, 'Controlado');
  assert.strictEqual(feat.properties.frecuencia_hearts, 90);
});

test('/patients/geo: cita nueva agregada al final es la que manda (caso normal)', () => {
  db.upsertPatient({ id: 'pac-t-4', dni: '91000004', apellidos_nombres: 'TEST CUATRO', latitud: -10.05, longitud: -78.15 });
  db.upsertAppointment({ id: 'a1', patient_id: 'pac-t-4', fecha_cita: isoDaysFromNow(-90) });
  db.upsertAppointment({ id: 'a2', patient_id: 'pac-t-4', fecha_cita: isoDaysFromNow(45) });
  const feat = callGet('/patients/geo').features.find(f => f.properties.dni === '91000004');
  assert.strictEqual(feat.properties.semaforo, 'green');
  assert.ok(feat.properties.dias_restantes > 7);
});

test('/alerts/summary cuenta segun la cita mas reciente por fecha', () => {
  // Cita vieja primero, cita futura despues -> verde
  db.upsertPatient({ id: 'pac-t-5', dni: '91000005', apellidos_nombres: 'TEST CINCO' });
  db.upsertAppointment({ id: 'b1', patient_id: 'pac-t-5', fecha_cita: isoDaysFromNow(-120) });
  db.upsertAppointment({ id: 'b2', patient_id: 'pac-t-5', fecha_cita: isoDaysFromNow(60) });
  // Cita futura primero, vencida despues: la mas reciente por fecha es la futura -> verde
  db.upsertPatient({ id: 'pac-t-6', dni: '91000006', apellidos_nombres: 'TEST SEIS' });
  db.upsertAppointment({ id: 'c1', patient_id: 'pac-t-6', fecha_cita: isoDaysFromNow(20) });
  db.upsertAppointment({ id: 'c2', patient_id: 'pac-t-6', fecha_cita: isoDaysFromNow(-200) });
  // Solo citas vencidas -> rojo
  db.upsertPatient({ id: 'pac-t-7', dni: '91000007', apellidos_nombres: 'TEST SIETE' });
  db.upsertAppointment({ id: 'd1', patient_id: 'pac-t-7', fecha_cita: isoDaysFromNow(-100) });
  db.upsertAppointment({ id: 'd2', patient_id: 'pac-t-7', fecha_cita: isoDaysFromNow(-10) });
  const a = callGet('/alerts/summary').alertas;
  assert.strictEqual(a.vigentes_verde, 2);
  assert.strictEqual(a.desertores_rojo, 1);
  assert.strictEqual(a.sin_cita_gris, 0);
});

test('toFhirBundle: usa la fecha de la observacion mas reciente y el historial excluye esa', () => {
  const p = {
    id: 'pac-t-8', dni: '91000008', apellidos_nombres: 'TEST OCHO',
    pa_sistolica: 118, pa_diastolica: 76,
    observations: [
      { id: 'h-vieja', fecha_registro: '2026-01-10', pa_sistolica: 160, pa_diastolica: 95 },
      { id: 'h-nueva', fecha_registro: '2026-09-20', pa_sistolica: 118, pa_diastolica: 76 }
    ]
  };
  const bundle = fhirAdapter.toFhirBundle(p);
  const bp = bundle.entry.find(e => e.resource.id === 'pac-t-8-obs-bp');
  assert.ok(bp, 'debe existir la Observation de presion arterial');
  assert.strictEqual(bp.resource.effectiveDateTime, '2026-09-20');
  const ids = bundle.entry.map(e => e.resource.id);
  assert.ok(ids.includes('h-vieja'), 'la observacion antigua debe ir al historial');
  assert.ok(!ids.includes('h-nueva'), 'la mas reciente no debe duplicarse en el historial');
});

closeDb();
console.log('\nResultado: ' + passed + ' correctas, ' + failed + ' con falla');
process.exit(failed === 0 ? 0 : 1);

