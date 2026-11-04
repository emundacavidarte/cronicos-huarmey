/**
 * testPadronExcel.js
 * Pruebas unitarias y de integración para el esquema del Padrón Huarmey (v4),
 * el parser de Excel con SheetJS y la validación celda por celda / en caliente.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

global.XLSX = require('../../client/libs/xlsx.full.min.js');
const schema = require('../../client/js/data/padronSchema.js');
const parser = require('../../client/js/data/padronExcelParser.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  OK    ' + name);
  } catch (e) {
    failed++;
    console.log('  FALLA ' + name + '\n        ' + e.message);
  }
}

async function runAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  OK    ' + name);
  } catch (e) {
    failed++;
    console.log('  FALLA ' + name + '\n        ' + e.message);
  }
}

console.log('Padrón Estandarizado Huarmey: Esquema y Validación en Pantalla');

test('Schema: Contiene 76 columnas normativas divididas en 11 bloques temáticos (A a K)', () => {
  assert.strictEqual(schema.COLUMNAS.length, 76, 'Deben existir exactamente 76 columnas manuales');
  const bloques = new Set(schema.COLUMNAS.map(c => c.bloque));
  assert.strictEqual(bloques.size, 11, 'Deben existir 11 bloques temáticos A-K');
});

test('Schema: Validador de DNI exige 8 dígitos numéricos y reporta duplicados', () => {
  const row = { tipo_documento: 'DNI' };
  assert.strictEqual(schema.validateCell('nro_documento', '10000001', row, new Map()), null);
  assert.ok(/8 dígitos/i.test(schema.validateCell('nro_documento', '1234567', row, new Map())));
  assert.ok(/8 dígitos/i.test(schema.validateCell('nro_documento', '123456789', row, new Map())));

  const counts = new Map([['10000001', 2]]);
  assert.ok(/repetido/i.test(schema.validateCell('nro_documento', '10000001', row, counts)));
});

test('Schema: Validador de fechas rechaza fechas futuras y anteriores a 1900', () => {
  assert.strictEqual(schema.validateCell('fecha_nacimiento', '1980-05-15', {}), null);
  assert.strictEqual(schema.validateCell('fecha_nacimiento', '15/05/1980', {}), null);
  assert.ok(/futura/i.test(schema.validateCell('fecha_nacimiento', '2099-01-01', {})));
  assert.ok(/anterior a 1900/i.test(schema.validateCell('fecha_nacimiento', '1899-12-31', {})));
  assert.ok(/inválida/i.test(schema.validateCell('fecha_nacimiento', 'texto-no-fecha', {})));
});

test('Schema: Validador de rangos clínicos (PAS 70-260, PAD 40-150, HbA1c 3-20)', () => {
  assert.strictEqual(schema.validateCell('pas_oct', '120', {}), null);
  assert.ok(/máximo/i.test(schema.validateCell('pas_oct', '300', {})));
  assert.ok(/mínimo/i.test(schema.validateCell('pas_oct', '50', {})));

  assert.strictEqual(schema.validateCell('pad_oct', '80', {}), null);
  assert.ok(/máximo/i.test(schema.validateCell('pad_oct', '180', {})));

  assert.strictEqual(schema.validateCell('hba1c', '6.8', {}), null);
  assert.ok(/máximo/i.test(schema.validateCell('hba1c', '25', {})));
});

test('Schema: Listas desplegables oficiales respetan catálogos de Huarmey', () => {
  assert.strictEqual(schema.validateCell('sector', 'Sector I – Centro', {}), null);
  assert.strictEqual(schema.validateCell('establecimiento_adscripcion', 'Hospital de Apoyo Huarmey (00001741, II-1)', {}), null);
  assert.ok(/no válida/i.test(schema.validateCell('sector', 'Distrito Inventado Inexistente', {})));
  assert.ok(/no válida/i.test(schema.validateCell('sexo', 'Otro', {})));
});

async function runAll() {
  await runAsync('ExcelParser: Lee un Excel v4 con filas inventadas (sin datos reales)', async () => {
    const headers = ['N.º de documento (DNI)', 'Apellidos y nombres', 'Sexo', 'Sector sanitario', 'Fecha de nacimiento', 'Seguro de salud', 'Establecimiento de adscripción', 'Establecimiento de control'];
    const rows = [
      headers,
      ['10000001', 'PACIENTE INVENTADO UNO', 'Femenino', 'Sector IV – Buenos Aires', '1950-01-01', 'SIS', 'Hospital de Apoyo Huarmey (00001741, II-1)', 'Hospital de Apoyo Huarmey (00001741, II-1)']
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PADRON_CRONICOS');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const parsed = await parser.parseWorkbook(buf);
    assert.strictEqual(parsed.totalRowsParsed, 1);
    assert.strictEqual(parsed.patients[0].nro_documento, '10000001');
    assert.strictEqual(parsed.patients[0].apellidos_nombres, 'PACIENTE INVENTADO UNO');
    assert.strictEqual(parsed.patients[0].sexo, 'Femenino');
    assert.strictEqual(parsed.patients[0].sector, 'Sector IV – Buenos Aires');
  });

  await runAsync('BatchValidation: Evalúa dataset en caliente calculando score y lista de celdas observadas', async () => {
    const sampleRows = [
      {
        tipo_documento: 'DNI',
        nro_documento: '10000001',
        apellidos_nombres: 'PACIENTE VALIDO UNO',
        sexo: 'Femenino',
        fecha_nacimiento: '1975-04-12',
        seguro_salud: 'SIS',
        sector: 'Sector I – Centro',
        direccion: 'Jr. Grau 120',
        establecimiento_adscripcion: 'Hospital de Apoyo Huarmey (00001741, II-1)',
        establecimiento_control: 'Hospital de Apoyo Huarmey (00001741, II-1)',
        estado_paciente: 'Activo',
        consentimiento: 'Sí, firmado'
      },
      {
        tipo_documento: 'DNI',
        nro_documento: '12345', // Error: 5 dígitos
        apellidos_nombres: 'PACIENTE OBSERVADO DOS',
        sexo: 'Masculino',
        fecha_nacimiento: '1982-10-20',
        seguro_salud: 'SIS',
        sector: 'Sector II – La Victoria',
        direccion: 'Calle Victoria 45',
        establecimiento_adscripcion: 'C. S. La Victoria (00001744, I-3)',
        establecimiento_control: 'C. S. La Victoria (00001744, I-3)',
        estado_paciente: 'Activo',
        consentimiento: 'No',
        pas_oct: 320 // Error: fuera de rango
      }
    ];

    const res = schema.validateBatch(sampleRows);
    assert.strictEqual(res.totalRows, 2);
    assert.strictEqual(res.validRows, 1);
    assert.strictEqual(res.rowsWithErrors, 1);
    assert.strictEqual(res.totalErrors, 2); // DNI corto y PAS 320
    assert.strictEqual(res.percent, 50);

    // Simular corrección en caliente en pantalla por el usuario:
    sampleRows[1].nro_documento = '45678901';
    sampleRows[1].pas_oct = 130;

    const resAfterFix = schema.validateBatch(sampleRows);
    assert.strictEqual(resAfterFix.validRows, 2);
    assert.strictEqual(resAfterFix.totalErrors, 0);
    assert.strictEqual(resAfterFix.percent, 100);
  });

  await runAsync('ExcelParser: Lee un Excel de propuesta inventado con 3 pacientes al 100% sin sobreescritura de calculadas', async () => {
    let buf;
    {
      const headers = ['N.º de documento (DNI)', 'Apellidos y nombres', 'Sexo', 'Sector sanitario', 'Fecha de nacimiento', 'Seguro de salud', 'Establecimiento de adscripción', 'Establecimiento de control', 'Estado del paciente', 'Dirección y referencia', 'Consentimiento del paciente'];
      const rows = [
        headers,
        ['10000001', 'PACIENTE UNO', 'Femenino', 'Sector I – Centro', '1960-01-01', 'SIS', 'Hospital de Apoyo Huarmey (00001741, II-1)', 'Hospital de Apoyo Huarmey (00001741, II-1)', 'Activo', 'Calle Inventada 101, Huarmey', 'Sí, firmado'],
        ['10000002', 'PACIENTE DOS', 'Masculino', 'Sector II – La Victoria', '1965-02-02', 'SIS', 'C. S. La Victoria (00001744, I-3)', 'C. S. La Victoria (00001744, I-3)', 'Activo', 'Calle Inventada 102, Huarmey', 'No'],
        ['10000003', 'PACIENTE TRES', 'Femenino', 'Sector III – Santo Domingo', '1970-03-03', 'SIS', 'Hospital de Apoyo Huarmey (00001741, II-1)', 'Hospital de Apoyo Huarmey (00001741, II-1)', 'Activo', 'Calle Inventada 103, Huarmey', 'si']
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Propuesta');
      buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    }
    const parsed = await parser.parseWorkbook(buf);
    assert.strictEqual(parsed.patients.length, 3, 'Debe parsear exactamente 3 pacientes');
    const val = schema.validateBatch(parsed.patients);
    assert.strictEqual(val.totalErrors, 0, 'No debe tener inconsistencias falsas generadas por columnas calculadas');
    assert.strictEqual(val.percent, 100, 'Debe alcanzar el 100% Válido');
  });

  await runAsync('Consentimiento en el Excel: la columna se lee, se normaliza a Sí, firmado / No y llega a los pacientes', async () => {
    const headers = ['N.º de documento (DNI)', 'Apellidos y nombres', 'Sexo', 'Sector sanitario', 'Fecha de nacimiento', 'Seguro de salud', 'Dirección y referencia', 'Consentimiento del paciente'];
    const valores = ['Sí, firmado', 'Sí', 'SI', 'si firmado', 'Firmado', 'No', 'no', ' NO ', 'Quizás', ''];
    const rows = [headers].concat(valores.map((v, i) => ['1000010' + i, 'PACIENTE INVENTADO ' + i, 'Femenino', 'Sector I – Centro', '1960-01-01', 'SIS', 'Calle Inventada ' + i, v]));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'PADRON_CRONICOS');
    const parsed = await parser.parseWorkbook(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    assert.deepStrictEqual(parsed.patients.map(p => p.consentimiento),
      ['Sí, firmado', 'Sí, firmado', 'Sí, firmado', 'Sí, firmado', 'Sí, firmado', 'No', 'No', 'No', 'Quizás', '']);
  });

  await runAsync('Consentimiento obligatorio: una fila sin respuesta o con texto fuera de la lista queda observada y no se carga', async () => {
    const base = {
      tipo_documento: 'DNI', apellidos_nombres: 'PACIENTE INVENTADO', sexo: 'Femenino', fecha_nacimiento: '1970-01-01', seguro_salud: 'SIS',
      sector: 'Sector I – Centro', direccion: 'Calle Inventada 1', establecimiento_adscripcion: 'Hospital de Apoyo Huarmey (00001741, II-1)',
      establecimiento_control: 'Hospital de Apoyo Huarmey (00001741, II-1)', estado_paciente: 'Activo'
    };
    const filas = [
      { ...base, nro_documento: '20000001', consentimiento: 'Sí, firmado' },
      { ...base, nro_documento: '20000002', consentimiento: 'No' },
      { ...base, nro_documento: '20000003', consentimiento: '' },
      { ...base, nro_documento: '20000004', consentimiento: 'Quizás' }
    ];
    const res = schema.validateBatch(filas);
    assert.strictEqual(res.validRows, 2);
    assert.ok(/obligatorio/i.test(res.rowResults[2].errors.consentimiento));
    assert.ok(/no válida/i.test(res.rowResults[3].errors.consentimiento));
    assert.strictEqual(res.rowResults[0].isValid && res.rowResults[1].isValid, true);
    // al responder en pantalla (lista desplegable Sí, firmado / No) la fila queda válida
    filas[2].consentimiento = 'No';
    filas[3].consentimiento = 'Sí, firmado';
    assert.strictEqual(schema.validateBatch(filas).totalErrors, 0);
  });

  console.log(`\nResultado Padrón Estandarizado: ${passed} correctas, ${failed} con falla`);
  if (failed > 0) process.exit(1);
}

runAll();
