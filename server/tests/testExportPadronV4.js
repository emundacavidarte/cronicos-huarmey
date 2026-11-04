/**
 * testExportPadronV4.js
 * El Excel que se exporta tiene el mismo formato del padrón propuesto (v4) que se importa: mismas hojas, mismos
 * encabezados y orden de las 100 columnas, fórmulas de las calculadas y ida y vuelta sin cambios (incluido el
 * consentimiento). Pacientes inventados. Ejecutar: node server/tests/testExportPadronV4.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.XLSX = require('../../client/libs/xlsx.full.min.js');
const plantilla = require('../../client/js/data/padronPlantillaV4.js');
const schema = require('../../client/js/data/padronSchema.js');
const parser = require('../../client/js/data/padronExcelParser.js');
const exportador = require('../../client/js/data/padronExportV4.js');

let passed = 0;
let failed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  OK    ' + name); }
  catch (e) { failed++; console.log('  FALLA ' + name + '\n        ' + e.message); }
}

const HOSP = 'Hospital de Apoyo Huarmey (00001741, II-1)';
const CS = 'C. S. La Victoria (00001744, I-3)';

// Pacientes inventados con campos del padrón v4 (los que el sistema guarda al cargar un Excel)
const pacientes = [
  {
    id: 'pac-00001741-10000001', dni: '10000001', nro_documento: '10000001', tipo_documento: 'DNI', historia_clinica: 'HC-0001',
    apellidos_nombres: 'PACIENTE INVENTADO UNO', sexo: 'Femenino', fecha_nacimiento: '1960-03-15', seguro_salud: 'SIS',
    telefono: '943111001', sector: 'Sector I – Centro', direccion: 'Calle Inventada 101, Huarmey',
    establecimiento_adscripcion: HOSP, establecimiento_control: HOSP,
    cie10_hta: 'I10.X – Hipertensión esencial (primaria)', estado_paciente: 'Activo', consentimiento: 'Sí, firmado',
    pas_ene: 150, pad_ene: 95, pas_abr: 130, pad_abr: 80, hba1c: 7.2, fecha_hba1c: '2026-03-10',
    creatinina: 0.9, fecha_creatinina: '2026-03-10', fecha_ultimo_control: '2026-04-20', proxima_cita: '2026-11-20'
  },
  {
    id: 'pac-00001741-10000002', dni: '10000002', nro_documento: '10000002', tipo_documento: 'DNI',
    apellidos_nombres: 'PACIENTE INVENTADO DOS', sexo: 'Masculino', fecha_nacimiento: '1955-11-02', seguro_salud: 'SIS',
    sector: 'Sector II – La Victoria', direccion: 'Calle Inventada 102, Huarmey',
    establecimiento_adscripcion: CS, establecimiento_control: CS,
    cie10_dm: 'E11.9 – Diabetes mellitus tipo 2 sin mención de complicación', estado_paciente: 'Activo', consentimiento: 'No',
    peso: 72, talla: 1.65, fecha_ultimo_control: '2026-05-02'
  },
  // paciente cargado por la vía anterior: sin campos v4, solo con los nombres del sistema
  {
    id: 'pac-00001741-10000003', dni: '10000003', apellidos_nombres: 'PACIENTE INVENTADO TRES', sexo: 'Femenino',
    fecha_nacimiento: '1970-01-01', seguro: 'SIS', sector_sanitario: 'Sector I – Centro', direccion: 'Calle Inventada 103',
    establecimiento_adscripcion: HOSP, puerta_entrada: HOSP, diagnosticos: ['I10', 'E11'], fallecido: false,
    observations: [{ fecha_registro: '2026-06-01', pa_sistolica: 128, pa_diastolica: 78, hba1c: 6.8 }],
    appointments: [{ fecha_cita: '2026-12-01', estado: 'booked' }], consentimiento: 'Sí, firmado'
  }
];

const wb = exportador.construirLibro(XLSX, pacientes, { fechaCorte: new Date(2026, 9, 29) });
const ws = wb.Sheets['Padrón'];
const celda = (a) => ws[a];
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true });

(async () => {
  console.log('Exportación con el formato del padrón v4');

  await step('el libro tiene las mismas tres hojas del padrón propuesto: Instrucciones, Padrón y Listas', async () => {
    assert.deepStrictEqual(wb.SheetNames, ['Instrucciones', 'Padrón', 'Listas']);
  });

  await step('los 100 encabezados están en la fila 7, en el mismo orden que el padrón propuesto', async () => {
    assert.strictEqual(plantilla.columnas, 100);
    plantilla.cabeceras.forEach((h, i) => {
      assert.strictEqual(celda(XLSX.utils.encode_cell({ r: 6, c: i })).v, h, 'columna ' + (i + 1));
    });
    assert.strictEqual(celda('A7').v, 'N.º');
    assert.strictEqual(celda('D7').v, 'N.º de documento (clave)');
  });

  await step('los encabezados coinciden con los del Excel propuesto (si el archivo está en la carpeta del proyecto)', async () => {
    const ruta = path.resolve(__dirname, '../../../Propuesta_Padron_Cronicos_Huarmey.xlsx');
    if (!fs.existsSync(ruta)) return; // el archivo no viaja con el prototipo
    const orig = XLSX.read(fs.readFileSync(ruta), { type: 'buffer' });
    const hoja = orig.Sheets['Padrón'];
    plantilla.cabeceras.forEach((h, i) => {
      const c = hoja[XLSX.utils.encode_cell({ r: 6, c: i })];
      assert.strictEqual(c && c.v, h, 'columna ' + (i + 1));
    });
  });

  await step('las 76 columnas que se escriben se reconocen una por una (ninguna sin reconocer ni repetida)', async () => {
    const claves = exportador.clavesPorColumna().filter(Boolean);
    assert.strictEqual(claves.length, 76);
    assert.strictEqual(new Set(claves).size, 76);
    assert.deepStrictEqual([...claves].sort(), schema.COLUMNAS.map(c => c.key).sort());
  });

  await step('las 24 columnas calculadas (N.º y 23) llevan su fórmula, ajustada a la fila de cada paciente', async () => {
    assert.strictEqual(plantilla.formulas.filter(Boolean).length, 24);
    assert.strictEqual(celda('A8').f, 'ROW()-7');
    assert.strictEqual(celda('A10').f, 'ROW()-7');
    const edad = plantilla.cabeceras.indexOf('Edad (años)');
    const f9 = celda(XLSX.utils.encode_cell({ r: 8, c: edad })).f; // segundo paciente, fila 9
    assert.ok(f9.includes('$D9') && f9.includes('$H9') && !f9.includes('$D8'), f9);
    assert.ok(f9.includes('$D$3'), 'la fecha de corte sigue fija en D3');
    // rango fijo del duplicado de DNI: termina en la última fila de pacientes (10), no en la 310 de la plantilla
    const alerta = plantilla.cabeceras.indexOf('Alerta del dato');
    const fa = celda(XLSX.utils.encode_cell({ r: 7, c: alerta })).f;
    assert.ok(/\$D\$8:\$D\$10/.test(fa) && !/\$310/.test(fa), fa);
  });

  await step('bloques, fecha de corte y títulos: igual a la propuesta (sin la leyenda de la fila de ejemplo)', async () => {
    assert.strictEqual(celda('B6').v, 'A · Captación e identificación');
    assert.ok(ws['!merges'].some(m => XLSX.utils.encode_range(m) === 'B6:I6'));
    assert.strictEqual(celda('D3').t, 'd');
    assert.strictEqual(celda('D3').v.getUTCFullYear(), 2026);
    assert.ok(/^Padrón nominal/.test(celda('A1').v));
    assert.ok(!Object.values(ws).some(c => c && typeof c.v === 'string' && /^Fila de ejemplo/.test(c.v)));
  });

  await step('las fechas se escriben como fechas de Excel y los números como números', async () => {
    const col = k => plantilla.cabeceras.findIndex((h, i) => exportador.clavesPorColumna()[i] === k);
    assert.strictEqual(celda(XLSX.utils.encode_cell({ r: 7, c: col('fecha_nacimiento') })).t, 'd');
    assert.strictEqual(celda(XLSX.utils.encode_cell({ r: 7, c: col('pas_ene') })).t, 'n');
    assert.strictEqual(celda(XLSX.utils.encode_cell({ r: 7, c: col('pas_ene') })).v, 150);
  });

  console.log('Ida y vuelta: lo que se exporta se vuelve a importar igual');

  const parsed = await parser.parseWorkbook(buf);

  await step('se importan los tres pacientes y cada columna conserva su valor', async () => {
    assert.strictEqual(parsed.totalRowsParsed, 3);
    const p1 = parsed.patients[0];
    assert.strictEqual(p1.nro_documento, '10000001');
    assert.strictEqual(p1.apellidos_nombres, 'PACIENTE INVENTADO UNO');
    assert.strictEqual(p1.fecha_nacimiento, '1960-03-15');
    assert.strictEqual(p1.fecha_hba1c, '2026-03-10');
    assert.strictEqual(String(p1.pas_ene), '150');
    assert.strictEqual(String(p1.hba1c), '7.2');
    assert.strictEqual(p1.cie10_hta, 'I10.X – Hipertensión esencial (primaria)');
    assert.strictEqual(p1.proxima_cita, '2026-11-20');
    assert.strictEqual(parsed.patients[1].cie10_dm, 'E11.9 – Diabetes mellitus tipo 2 sin mención de complicación');
  });

  await step('el consentimiento ida y vuelta: Sí, firmado y No se conservan', async () => {
    assert.deepStrictEqual(parsed.patients.map(p => p.consentimiento), ['Sí, firmado', 'No', 'Sí, firmado']);
  });

  await step('un paciente cargado con los nombres del sistema (sin campos v4) sale con sus datos en las columnas del padrón', async () => {
    const p3 = parsed.patients[2];
    assert.strictEqual(p3.seguro_salud, 'SIS');
    assert.strictEqual(p3.sector, 'Sector I – Centro');
    assert.strictEqual(p3.establecimiento_control, HOSP);
    assert.ok(/^I10/.test(p3.cie10_hta) && /^E11/.test(p3.cie10_dm), 'diagnósticos pasados a las columnas de CIE-10');
    assert.strictEqual(String(p3.hba1c), '6.8');
    assert.strictEqual(p3.fecha_ultimo_control, '2026-06-01');
    assert.strictEqual(p3.proxima_cita, '2026-12-01');
  });

  await step('lo exportado vuelve a pasar la validación del padrón sin observaciones', async () => {
    const res = schema.validateBatch(parsed.patients);
    assert.strictEqual(res.totalErrors, 0, JSON.stringify(res.rowResults.map(r => r.errors)));
  });

  await step('sin pacientes, el libro conserva los encabezados y no escribe filas', async () => {
    const vacio = exportador.construirLibro(XLSX, [], {});
    assert.strictEqual(vacio.Sheets['Padrón'].D7.v, 'N.º de documento (clave)');
    assert.strictEqual(vacio.Sheets['Padrón'].D8, undefined);
  });

  console.log('\nResultado Exportación v4: ' + passed + ' correctas, ' + failed + ' con falla');
  process.exit(failed === 0 ? 0 : 1);
})();
