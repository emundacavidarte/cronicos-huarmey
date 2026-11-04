/**
 * testIdempotencia.js
 * F4: upsertPatient NO cambia el id de un paciente existente (no deja huérfanas sus citas/atenciones).
 * F5: reenviar el mismo registro (HOSIX / Galenos / Bundle FHIR) NO duplica citas ni atenciones.
 * Usa pacientes inventados en memoria.
 * Ejecutar: node server/tests/testIdempotencia.js
 */

const assert = require('assert');
const { db, resetDb, closeDb } = require('./helpers/memoryDb');
const fhirAdapter = require('../fhir/fhirAdapter');
const hosixConnector = require('../fhir/connectors/hosixConnector');
const galenosConnector = require('../fhir/connectors/galenosConnector');

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

// Misma secuencia que apiRoutes.handleConnectorWebhook
function ingestConnector(connector, record) {
  const parsed = fhirAdapter.processBundle(connector.transformToFhir(record));
  db.runTransaction(() => {
    parsed.patients.forEach(p => db.upsertPatient(p));
    parsed.conditions.forEach(c => db.upsertCondition(c));
    parsed.appointments.forEach(a => db.upsertAppointment(a));
    parsed.observations.forEach(o => db.upsertObservation(o));
    (parsed.medications || []).forEach(m => db.upsertMedication(m));
  });
}

function countFor(list, pid) {
  return list.filter(x => x.patient_id === pid).length;
}

const HOSIX_REC = {
  NRO_DOCUMENTO: '92000001',
  PACIENTE: 'PACIENTE INVENTADO UNO',
  CIE10_COD: 'I10',
  FEC_ULTIMA_ATENCION: '2026-09-01',
  FEC_PROXIMA_CITA: '2026-12-01',
  PA_SISTOLICA: '150',
  PA_DIASTOLICA: '95'
};

console.log('F4: upsertPatient conserva el id');

test('Un paciente existente con otro id sigue con su id y conserva sus citas y atenciones', () => {
  db.upsertPatient({ id: 'pac-viejo-1', dni: '92000001', apellidos_nombres: 'INVENTADO UNO' });
  db.upsertAppointment({ id: 'a-1', patient_id: 'pac-viejo-1', fecha_cita: '2026-11-01' });
  db.upsertObservation({ id: 'o-1', patient_id: 'pac-viejo-1', fecha_registro: '2026-09-01', pa_sistolica: 130, pa_diastolica: 80 });

  db.upsertPatient({ id: 'pac-00001741-92000001', dni: '92000001', telefono: '911000111' });

  assert.strictEqual(db.data.patients.length, 1);
  const p = db.getPatientByDni('92000001');
  assert.strictEqual(p.id, 'pac-viejo-1');
  assert.strictEqual(p.telefono, '911000111');
  assert.strictEqual(p.appointments.length, 1);
  assert.strictEqual(p.observations.length, 1);
});

test('Una cita enviada con el id nuevo (pac-<renipress>-<dni>) se asocia al paciente existente', () => {
  db.upsertPatient({ id: 'pac-viejo-2', dni: '92000002', apellidos_nombres: 'INVENTADO DOS' });
  db.upsertAppointment({ id: 'a-x', patient_id: 'pac-00001741-92000002', fecha_cita: '2026-12-01' });
  db.upsertObservation({ id: 'o-x', patient_id: 'pac-00001741-92000002', fecha_registro: '2026-09-01', pa_sistolica: 120 });
  assert.strictEqual(countFor(db.data.appointments, 'pac-viejo-2'), 1);
  assert.strictEqual(countFor(db.data.observations, 'pac-viejo-2'), 1);
  assert.strictEqual(countFor(db.data.appointments, 'pac-00001741-92000002'), 0);
});

test('Ingesta HOSIX sobre un paciente con otro id no deja citas ni atenciones huérfanas', () => {
  db.upsertPatient({ id: 'pac-viejo-3', dni: '92000001', apellidos_nombres: 'INVENTADO UNO' });
  ingestConnector(hosixConnector, HOSIX_REC);
  const ids = new Set(db.data.patients.map(p => p.id));
  assert.ok(db.data.appointments.every(a => ids.has(a.patient_id)), 'cita huérfana');
  assert.ok(db.data.observations.every(o => ids.has(o.patient_id)), 'atención huérfana');
  assert.ok(db.data.conditions.every(c => ids.has(c.patient_id)), 'diagnóstico huérfano');
});

console.log('F5: la ingesta es idempotente');

test('Reenviar 3 veces el mismo registro HOSIX deja 1 paciente, 1 cita y 1 atención', () => {
  ingestConnector(hosixConnector, HOSIX_REC);
  ingestConnector(hosixConnector, HOSIX_REC);
  ingestConnector(hosixConnector, HOSIX_REC);
  assert.strictEqual(db.data.patients.length, 1);
  assert.strictEqual(db.data.appointments.length, 1);
  assert.strictEqual(db.data.observations.length, 1);
  assert.strictEqual(db.data.conditions.length, 1);
});

test('Reenviar el mismo registro Galenos no duplica citas ni atenciones', () => {
  const rec = {
    DocIdentidad: '92000003', Nombres: 'JUANA', ApellidoPaterno: 'INVENTADA', ApellidoMaterno: 'TRES',
    CodigoCIE10: 'E11', FechaAtencion: '2026-08-10', FechaProximaCita: '2026-11-10',
    PresionSistolica: '125', PresionDiastolica: '78', HbA1c: '6.8'
  };
  ingestConnector(galenosConnector, rec);
  ingestConnector(galenosConnector, rec);
  assert.strictEqual(db.data.appointments.length, 1);
  assert.strictEqual(db.data.observations.length, 1);
});

test('Una cita con fecha distinta SÍ se agrega', () => {
  ingestConnector(hosixConnector, HOSIX_REC);
  ingestConnector(hosixConnector, Object.assign({}, HOSIX_REC, { FEC_PROXIMA_CITA: '2027-03-01' }));
  assert.strictEqual(db.data.appointments.length, 2);
});

test('Una atención con la misma fecha pero valores distintos se conserva (no se pierde)', () => {
  ingestConnector(hosixConnector, HOSIX_REC);
  ingestConnector(hosixConnector, Object.assign({}, HOSIX_REC, { PA_SISTOLICA: '120', PA_DIASTOLICA: '75' }));
  assert.strictEqual(db.data.observations.length, 2);
});

test('Una atención con otra fecha SÍ se agrega', () => {
  ingestConnector(hosixConnector, HOSIX_REC);
  ingestConnector(hosixConnector, Object.assign({}, HOSIX_REC, { FEC_ULTIMA_ATENCION: '2026-10-05' }));
  assert.strictEqual(db.data.observations.length, 2);
});

test('Reenviar con ids fijos no duplica (comportamiento previo intacto)', () => {
  db.upsertPatient({ id: 'pac-t-9', dni: '92000009' });
  db.upsertAppointment({ id: 'ap-fijo', patient_id: 'pac-t-9', fecha_cita: '2026-12-01' });
  db.upsertAppointment({ id: 'ap-fijo', patient_id: 'pac-t-9', fecha_cita: '2026-12-01', comentarios: 'x' });
  db.upsertObservation({ id: 'ob-fijo', patient_id: 'pac-t-9', fecha_registro: '2026-09-01', pa_sistolica: 130 });
  db.upsertObservation({ id: 'ob-fijo', patient_id: 'pac-t-9', fecha_registro: '2026-09-01', pa_sistolica: 130 });
  assert.strictEqual(db.data.appointments.length, 1);
  assert.strictEqual(db.data.appointments[0].comentarios, 'x');
  assert.strictEqual(db.data.observations.length, 1);
});

test('Una pre-cita y una cita en la misma fecha son registros distintos', () => {
  db.upsertPatient({ id: 'pac-t-10', dni: '92000010' });
  db.upsertAppointment({ id: 'precita-1', patient_id: 'pac-t-10', fecha_cita: '2026-12-01', es_precita: 1 });
  db.upsertAppointment({ id: 'apt-1', patient_id: 'pac-t-10', fecha_cita: '2026-12-01', es_precita: 0 });
  assert.strictEqual(db.data.appointments.length, 2);
});

closeDb();
console.log('\nResultado: ' + passed + ' correctas, ' + failed + ' con falla');
process.exit(failed === 0 ? 0 : 1);
