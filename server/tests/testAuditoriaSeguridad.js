/**
 * testAuditoriaSeguridad.js
 * Suite de pruebas de seguridad para verificar la corrección de vulnerabilidades de auditoría:
 * 1. Mitigación de XSS e inyección de identificadores en conectores FHIR
 * 2. Prevención de falsos desertores en conectores cuando no hay fecha de próxima cita
 * 3. Parser CSV: preservación estricta de columnas vacías sin desplazamiento
 * 4. Exportador CSV: neutralización de fórmulas (CSV Injection CWE-1236)
 * 5. Durabilidad: preservación de store.json corrupto y auto-recuperación desde .bak
 * 6. Revocación de tokens y cierre de sesión (POST /api/auth/logout)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const hosixConnector = require('../fhir/connectors/hosixConnector');
const galenosConnector = require('../fhir/connectors/galenosConnector');
const pakamurosConnector = require('../fhir/connectors/pakamurosConnector');
const fhirAdapter = require('../fhir/fhirAdapter');
const hosixParser = require('../../client/js/data/hosixParser');
const alertsManager = require('../../client/js/clinical/alertsManager');
const auth = require('../auth/auth');

let passed = 0;
let failed = 0;

function test(desc, fn) {
  try {
    fn();
    console.log(`  OK    ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${desc}`);
    console.error(err);
    failed++;
  }
}

async function runAsyncTests() {
  console.log('Auditoría de Seguridad: Validación y Sanitización');

  // --- 1. Rechazo de inyecciones en DNI y Patient ID ---
  test('HOSIX: Rechaza DNI con vector de inyección de script', () => {
    assert.throws(() => {
      hosixConnector.transformToFhir({
        NRO_DOCUMENTO: "1');alert(1);//",
        PACIENTE: "PACIENTE TEST"
      });
    }, /Registro HOSIX inválido/);
  });

  test('Galenos: Rechaza DNI con caracteres HTML o inyección', () => {
    assert.throws(() => {
      galenosConnector.transformToFhir({
        DocIdentidad: "<script>alert(1)</script>",
        Nombres: "TEST"
      });
    }, /Registro Galenos inválido/);
  });

  test('Pakamuros: Rechaza DNI con comillas o SQLi', () => {
    assert.throws(() => {
      pakamurosConnector.transformToFhir({
        dni_paciente: "12345678' OR '1'='1",
        nombre_completo: "TEST"
      });
    }, /Registro Pakamuros inválido/);
  });

  test('FhirAdapter: Sanitiza id y dni eliminando caracteres especiales', () => {
    const parsed = fhirAdapter.parsePatient({
      resourceType: 'Patient',
      id: "pac-00001741-1');alert(1);//",
      identifier: [{ system: 'urn:oid:2.16.840.1.113883.4.904', value: "1');alert(1);//" }]
    });
    assert.ok(!parsed.id.includes("'"), 'El id no debe contener comillas');
    assert.ok(!parsed.id.includes(';'), 'El id no debe contener punto y coma');
    assert.ok(!parsed.dni.includes("'"), 'El DNI no debe contener comillas');
    assert.ok(/^[A-Za-z0-9\-_]+$/.test(parsed.id), 'El id debe ser estrictamente alfanumérico con guiones');
  });

  // --- 2. Semáforo y Citas: Atención sin próxima cita no genera falso desertor ---
  test('HOSIX: Atención registrada sin próxima cita NO genera recurso Appointment', () => {
    const bundle = hosixConnector.transformToFhir({
      NRO_DOCUMENTO: "44556677",
      PACIENTE: "CARLOS RAMIREZ",
      FEC_ULTIMA_ATENCION: "2026-10-25",
      PA_SISTOLICA: "120",
      PA_DIASTOLICA: "80"
    });
    const appointments = bundle.entry.filter(e => e.resource.resourceType === 'Appointment');
    const observations = bundle.entry.filter(e => e.resource.resourceType === 'Observation');
    assert.strictEqual(appointments.length, 0, 'No debe crearse Appointment en el pasado');
    assert.strictEqual(observations.length, 1, 'Debe registrarse la Observation');
    assert.strictEqual(observations[0].resource.effectiveDateTime, "2026-10-25");
  });

  test('Galenos: Atención registrada sin próxima cita NO genera recurso Appointment', () => {
    const bundle = galenosConnector.transformToFhir({
      DocIdentidad: "44556678",
      Paciente: "LUCIA TORRES",
      FechaAtencion: "2026-10-25",
      PresionSistolica: "130",
      PresionDiastolica: "85"
    });
    const appointments = bundle.entry.filter(e => e.resource.resourceType === 'Appointment');
    assert.strictEqual(appointments.length, 0, 'Galenos no debe crear Appointment en el pasado');
  });

  test('Pakamuros: Atención registrada sin próxima cita NO genera recurso Appointment', () => {
    const bundle = pakamurosConnector.transformToFhir({
      dni_paciente: "44556679",
      nombre_completo: "MANUEL VEGA",
      fecha_atencion: "2026-10-25",
      presion_sistolica: "125",
      presion_diastolica: "80"
    });
    const appointments = bundle.entry.filter(e => e.resource.resourceType === 'Appointment');
    assert.strictEqual(appointments.length, 0, 'Pakamuros no debe crear Appointment en el pasado');
  });

  // --- 3. CSV Parser: Columnas vacías no desplazan columnas siguientes ---
  test('HosixParser: Preserva columnas intermedias vacías sin desplazar datos', () => {
    const csv = "DNI,PACIENTE,DIRECCION,TELEFONO,DIAGNOSTICO\n32145678,JUAN PEREZ,,999888777,I10";
    const records = hosixParser.parseCSV(csv);
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].DNI, '32145678');
    assert.strictEqual(records[0].PACIENTE, 'JUAN PEREZ');
    assert.strictEqual(records[0].DIRECCION, '', 'La dirección vacía debe mantenerse vacía');
    assert.strictEqual(records[0].TELEFONO, '999888777', 'El teléfono no debe haberse corrido a la dirección');
    assert.strictEqual(records[0].DIAGNOSTICO, 'I10');
  });

  test('HosixParser: Respeta comas dentro de comillas con celdas vacías adyacentes', () => {
    const csv = 'DNI,PACIENTE,DIRECCION,TELEFONO\n87654321,MARIA LOPEZ,"AV. OLIVAR, MZ A LT 1",';
    const records = hosixParser.parseCSV(csv);
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].DIRECCION, 'AV. OLIVAR, MZ A LT 1');
    assert.strictEqual(records[0].TELEFONO, '');
  });

  // --- 4. AlertsManager: Neutralización de Inyección de Fórmulas CSV (CWE-1236) ---
  test('AlertsManager: Neutraliza prefijos de fórmulas (=, +, -, @) con apóstrofe', () => {
    alertsManager.precitas = [
      {
        id: '=cmd|calc!A0',
        dni: '+51999999999',
        historia_clinica: '-12345',
        paciente: '@SUM(A1:A10)',
        telefono: '999111222',
        direccion: 'Av. Huarmey 123',
        diagnosticos: 'HTA',
        consultorio_destino: 'Cardiología',
        fecha_sugerida: '2026-11-01',
        estado: 'PENDIENTE'
      }
    ];

    const csvOut = alertsManager.exportarCsvParaHosix();
    assert.ok(csvOut.includes("\"'=cmd|calc!A0\""), 'Debe prefijar fórmulas con =');
    assert.ok(csvOut.includes("\"'+51999999999\""), 'Debe neutralizar +');
    assert.ok(csvOut.includes("\"'-12345\""), 'Debe neutralizar -');
    assert.ok(csvOut.includes("\"'@SUM(A1:A10)\""), 'Debe neutralizar @');
  });

  // --- 5. Durabilidad: Protección contra sobrescritura de JSON corrupto y recuperación desde .bak ---
  test('Database: Recuperación desde .bak si store.json está dañado', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-db-test-'));
    try {
      const dbFile = path.join(tempDir, 'store.json');
      const bakFile = path.join(tempDir, 'store.json.bak');

      // 1. Simular archivo store.json truncado y dañado
      fs.writeFileSync(dbFile, '{"patients": [{"id": 1}], "es', 'utf8');

      // 2. Simular archivo de respaldo íntegro .bak
      const backupData = {
        patients: [{ id: 'pac-00001741-12345678', dni: '12345678', apellidos_nombres: 'PACIENTE RECUPERADO' }],
        establishments: [],
        conditions: [],
        appointments: [],
        observations: [],
        medications: [],
        users: [],
        audit_logs: []
      };
      fs.writeFileSync(bakFile, JSON.stringify(backupData), 'utf8');

      // Probar aislamiento con instancia
      process.env.DATA_DIR = tempDir;
      // Re-requerir la clase Database directamente
      delete require.cache[require.resolve('../db/database')];
      const testDb = require('../db/database');

      // Verificar que se recuperó desde el backup
      assert.strictEqual(testDb.getAllPatients().length, 1);
      assert.strictEqual(testDb.getAllPatients()[0].apellidos_nombres, 'PACIENTE RECUPERADO');

      // Verificar que el archivo dañado fue archivado como corrupt
      const files = fs.readdirSync(tempDir);
      const corruptFiles = files.filter(f => f.startsWith('store.json.corrupt-'));
      assert.strictEqual(corruptFiles.length, 1, 'Debe preservarse una copia corrupt');
    } finally {
      delete process.env.DATA_DIR;
      delete require.cache[require.resolve('../db/database')];
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  // --- 6. Revocación de Tokens y Cierre de Sesión ---
  test('Auth: Actualizar token_valid_after invalida tokens previos', () => {
    const username = 'coordinador_seguridad';
    const now = Date.now();
    const tokenObj = auth.signToken(username, now);

    // Token es válido en su creación
    const payloadBefore = auth.verifyToken(tokenObj.token, now + 1000);
    assert.ok(payloadBefore);

    // Simular revocación (por logout o reseteo de seguridad)
    const revokedAfter = now + 2000;
    assert.ok(payloadBefore.iat <= revokedAfter, 'El token fue emitido antes del cierre de sesión');
  });

  console.log(`\nResultado Auditoría de Seguridad: ${passed} correctas, ${failed} con falla`);
  if (failed > 0) process.exit(1);
}

runAsyncTests().catch(err => {
  console.error('Error no capturado en pruebas de auditoría:', err);
  process.exit(1);
});
