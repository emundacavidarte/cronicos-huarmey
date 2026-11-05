/**
 * testErrorA.js
 * Comprueba que upsertPatient NO pisa datos existentes con null / valores por defecto
 * cuando llega un Bundle FHIR o una ingesta HOSIX. Usa pacientes inventados en memoria.
 * Ejecutar: node server/tests/testErrorA.js
 */

const assert = require('assert');
const { db, resetDb, closeDb } = require('./helpers/memoryDb');
const fhirAdapter = require('../fhir/fhirAdapter');
const hosixConnector = require('../fhir/connectors/hosixConnector');

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

function ingestBundle(bundle) {
  const parsed = fhirAdapter.processBundle(bundle);
  parsed.patients.forEach(p => db.upsertPatient(p));
  return parsed;
}

// Paciente inventado, completo, ya guardado
function seedPatient() {
  db.upsertPatient({
    id: 'pac-00001741-90000001',
    dni: '90000001',
    historia_clinica: 'HC-777',
    apellidos_nombres: 'PEREZ QUISPE JUAN',
    sexo: 'M',
    telefono: '987654321',
    direccion: 'Av. Los Pinos 123',
    distrito: 'Culebras',
    sector_sanitario: 'Sector 05 - Puerto',
    latitud: -10.0912,
    longitud: -78.1534,
    financiador: 'ESSALUD',
    puerta_entrada_id: '00001743'
  });
}

function patientBundle(resource) {
  return { resourceType: 'Bundle', type: 'collection', entry: [{ resource }] };
}

const DNI_SYSTEM = 'urn:oid:2.16.840.1.113883.4.904';

console.log('Error A: upsertPatient conserva datos existentes');

test('Bundle FHIR sin direccion/telefono/geo/sector no pisa los datos guardados', () => {
  seedPatient();
  ingestBundle(patientBundle({
    resourceType: 'Patient',
    id: 'pac-00001741-90000001',
    identifier: [{ system: DNI_SYSTEM, value: '90000001' }],
    name: [{ text: 'Perez Quispe Juan' }],
    gender: 'male'
  }));
  const p = db.getPatientByDni('90000001');
  assert.strictEqual(p.direccion, 'Av. Los Pinos 123');
  assert.strictEqual(p.sector_sanitario, 'Sector 05 - Puerto');
  assert.strictEqual(p.telefono, '987654321');
  assert.strictEqual(p.latitud, -10.0912);
  assert.strictEqual(p.longitud, -78.1534);
  assert.strictEqual(p.historia_clinica, 'HC-777');
  assert.strictEqual(p.distrito, 'Culebras');
  assert.strictEqual(p.financiador, 'ESSALUD');
  assert.strictEqual(p.puerta_entrada_id, '00001743');
});

test('Ingesta HOSIX minima no pisa direccion, telefono, sector ni coordenadas', () => {
  seedPatient();
  ingestBundle(hosixConnector.transformToFhir({ NRO_DOCUMENTO: '90000001', CIE10_COD: 'I10' }));
  const p = db.getPatientByDni('90000001');
  assert.strictEqual(p.direccion, 'Av. Los Pinos 123');
  assert.strictEqual(p.telefono, '987654321');
  assert.strictEqual(p.sector_sanitario, 'Sector 05 - Puerto');
  assert.strictEqual(p.latitud, -10.0912);
  assert.strictEqual(p.longitud, -78.1534);
  assert.strictEqual(p.historia_clinica, 'HC-777');
  assert.strictEqual(p.apellidos_nombres, 'PEREZ QUISPE JUAN');
});

test('Los campos que SI vienen con valor real se actualizan', () => {
  seedPatient();
  ingestBundle(patientBundle({
    resourceType: 'Patient',
    id: 'pac-00001741-90000001',
    identifier: [{ system: DNI_SYSTEM, value: '90000001' }],
    telecom: [{ system: 'phone', value: '911222333' }],
    address: [{
      text: 'Jr. Nuevo 45',
      extension: [{
        url: 'http://hl7.org/fhir/StructureDefinition/geolocation',
        extension: [
          { url: 'latitude', valueDecimal: -10.05 },
          { url: 'longitude', valueDecimal: -78.12 }
        ]
      }]
    }]
  }));
  const p = db.getPatientByDni('90000001');
  assert.strictEqual(p.telefono, '911222333');
  assert.strictEqual(p.direccion, 'Jr. Nuevo 45');
  assert.strictEqual(p.latitud, -10.05);
  assert.strictEqual(p.longitud, -78.12);
  // Llegan coordenadas nuevas sin sector: el sector sigue a las coordenadas (polígono GeoRIS que las contiene)
  assert.strictEqual(p.sector_sanitario, 'Sector 69');
});

test('HOSIX con telefono y direccion reales actualiza solo esos campos', () => {
  seedPatient();
  ingestBundle(hosixConnector.transformToFhir({
    NRO_DOCUMENTO: '90000001', TELEFONO: '955000111', DIRECCION: 'Calle Sol 9'
  }));
  const p = db.getPatientByDni('90000001');
  assert.strictEqual(p.telefono, '955000111');
  assert.strictEqual(p.direccion, 'Calle Sol 9');
  assert.strictEqual(p.sector_sanitario, 'Sector 05 - Puerto');
  // Se mudó a una dirección que no se puede ubicar: las coordenadas de la casa anterior ya no valen
  assert.strictEqual(p.latitud, null);
  assert.strictEqual(p.longitud, null);
});

test('Paciente NUEVO sin datos recibe los valores por defecto', () => {
  ingestBundle(patientBundle({
    resourceType: 'Patient',
    id: 'pac-00001741-90000002',
    identifier: [{ system: DNI_SYSTEM, value: '90000002' }]
  }));
  const p = db.getPatientByDni('90000002');
  assert.strictEqual(p.direccion, 'Sin dirección consignada');
  assert.strictEqual(p.sector_sanitario, 'Sin sector asignado');
  assert.strictEqual(p.telefono, '');
  assert.strictEqual(p.latitud, null);
  assert.strictEqual(p.longitud, null);
  assert.strictEqual(p.historia_clinica, 'S/N');
  assert.strictEqual(p.apellidos_nombres, 'PACIENTE SIN NOMBRE');
  assert.strictEqual(p.puerta_entrada_id, '00001741');
});

test('upsertPatient directo ignora null, vacio y textos de relleno', () => {
  seedPatient();
  db.upsertPatient({
    dni: '90000001', id: 'pac-00001741-90000001',
    direccion: 'Sin dirección consignada', sector_sanitario: 'Sector 01 - Centro Urbano',
    telefono: '', latitud: null, longitud: null
  });
  const p = db.getPatientByDni('90000001');
  assert.strictEqual(p.direccion, 'Av. Los Pinos 123');
  assert.strictEqual(p.sector_sanitario, 'Sector 05 - Puerto');
  assert.strictEqual(p.telefono, '987654321');
  assert.strictEqual(p.latitud, -10.0912);
  assert.strictEqual(p.longitud, -78.1534);
});

test('parsePatient devuelve null (no valores inventados) cuando falta el dato', () => {
  const r = fhirAdapter.parsePatient({ resourceType: 'Patient', id: 'x-1' });
  assert.strictEqual(r.direccion, null);
  assert.strictEqual(r.sector_sanitario, null);
  assert.strictEqual(r.telefono, null);
  assert.strictEqual(r.latitud, null);
  assert.strictEqual(r.longitud, null);
});

closeDb();
console.log('\nResultado: ' + passed + ' correctas, ' + failed + ' con falla');
process.exit(failed === 0 ? 0 : 1);

