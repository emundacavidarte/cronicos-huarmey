/**
 * testReglasClinicas.js
 * Reglas clínicas compartidas (client/js/clinical/reglasClinicas.js): K3-01, K3-02, K3-05, K3-07, K3-08, K3-09, T3-01, P3-07.
 * Funciones puras, datos inventados. Ejecutar: node server/tests/testReglasClinicas.js
 * Se corre en la zona horaria del sistema; la sección de fechas se vuelve a correr con TZ=America/Lima en un proceso hijo.
 */
const assert = require('assert');
const { spawnSync } = require('child_process');
const R = require('../../client/js/clinical/reglasClinicas.js');

let passed = 0, failed = 0;
function step(name, fn) {
  try { fn(); passed++; console.log('  OK    ' + name); }
  catch (e) { failed++; console.log('  FALLA ' + name + '\n        ' + e.message); }
}
const perfil = (o) => Object.assign({ hta: false, dm: false, erc: false, ecv: false, riesgoPorc: null }, o);

if (process.argv[2] === 'fechas') {
  // Se ejecuta bajo TZ=America/Lima: «AAAA-MM-DD» no debe correrse un día
  const hoy = new Date(2026, 10, 4, 21, 30); // 4-nov-2026 21:30 hora local
  step('Lima: una cita de hoy está a 0 días, la de ayer a -1 y la de +8 a 8', () => {
    assert.strictEqual(R.diasHasta('2026-11-04', hoy), 0);
    assert.strictEqual(R.diasHasta('2026-11-03', hoy), -1);
    assert.strictEqual(R.diasHasta('2026-11-12', hoy), 8);
  });
  step('Lima: sumarDias no cambia de día (2026-09-01 + 90 = 2026-11-30)', () => assert.strictEqual(R.sumarDias('2026-09-01', 90), '2026-11-30'));
  step('fechas imposibles se rechazan', () => { assert.strictEqual(R.diasHasta('2026-02-30', hoy), null); assert.strictEqual(R.parseFechaLocal('abc'), null); });
  console.log(`\nResultado Reglas clínicas (fechas, TZ=${process.env.TZ}): ${passed} correctas, ${failed} con falla`);
  process.exit(failed ? 1 : 0);
}

step('K3-01: solo HbA1c 11 % en un diabético SIN presión → No Controlado (antes «Controlado»)', () => {
  assert.strictEqual(R.estadoControl({ hba1c: 11 }, perfil({ dm: true })), 'No Controlado');
});
step('K3-01: ninguna medición → «Sin Datos…», nunca «Controlado»', () => {
  assert.strictEqual(R.estadoControl({}, perfil({ dm: true, hta: true })), R.SIN_DATOS);
  assert.strictEqual(R.estadoControl({ pas: null, pad: undefined, hba1c: '', glucosa: NaN }, perfil({ hta: true })), R.SIN_DATOS);
});
step('K3-01/K3-07: la etiqueta guardada no manda: PA 190/110 es No Controlado', () => {
  assert.strictEqual(R.estadoControl({ pas: 190, pad: 110 }, perfil({ hta: true })), 'No Controlado');
});
step('hipertenso 120/70 → Controlado; 140/90 → No Controlado (el corte es < 140/90)', () => {
  assert.strictEqual(R.estadoControl({ pas: 120, pad: 70 }, perfil({ hta: true })), 'Controlado');
  assert.strictEqual(R.estadoControl({ pas: 140, pad: 80 }, perfil({ hta: true })), 'No Controlado');
  assert.strictEqual(R.estadoControl({ pas: 130, pad: 90 }, perfil({ hta: true })), 'No Controlado');
});
step('K3-07: una sola meta para el paciente: DM2 con 135/85 es No Controlado en TODOS los módulos (130/80 en alto riesgo)', () => {
  assert.strictEqual(R.estadoControl({ pas: 135, pad: 85, hba1c: 6.5 }, perfil({ dm: true, hta: true })), 'No Controlado');
  assert.strictEqual(R.metaPA(perfil({ dm: true })).sistolica, 130);
  assert.strictEqual(R.metaPA(perfil({ hta: true })).sistolica, 140);
});
step('K3-07: riesgo CV ≥ 10 % sin DM/ERC/ECV también usa la meta de alto riesgo', () => {
  const m = R.metaPA(perfil({ hta: true, riesgoPorc: 25 }));
  assert.strictEqual(m.sistolica, 130); assert.ok(/riesgo CV/.test(m.texto), m.texto);
  assert.strictEqual(R.metaPA(perfil({ riesgoPorc: 9 })).sistolica, 140);
  assert.ok(/por DM\/ERC\/ECV/.test(R.metaPA(perfil({ dm: true })).texto));
});
step('diabético: HbA1c exactamente 7,0 no está en meta (< 7); 6,9 sí', () => {
  assert.strictEqual(R.estadoControl({ pas: 120, pad: 70, hba1c: 7.0 }, perfil({ dm: true, hta: true })), 'No Controlado');
  assert.strictEqual(R.estadoControl({ pas: 120, pad: 70, hba1c: 6.9 }, perfil({ dm: true, hta: true })), 'Controlado');
});
step('diabético sin dato glucémico no se da por controlado', () => {
  assert.strictEqual(R.estadoControl({ pas: 120, pad: 70 }, perfil({ dm: true, hta: true })), 'No Controlado');
});
step('K3-08: HTA = I10 a I15 y DM = E10 a E14 (antes solo I10 y E11)', () => {
  ['I10', 'I11.9', 'I12.9', 'I13.0', 'I15.1', 'I10 – Hipertensión esencial', 'Hipertensión arterial'].forEach(c => assert.ok(R.esHta(c), c));
  ['E10.9', 'E11.9', 'E13', 'E14', 'E11 – Diabetes mellitus tipo 2', 'Diabetes tipo 2'].forEach(c => assert.ok(R.esDm(c), c));
  ['E78.2', 'N18.3', 'I25.2', 'E66'].forEach(c => { assert.ok(!R.esHta(c) && !R.esDm(c), c); });
});
step('K3-09: «-», «No», «Ninguno» y vacío no cuentan como diagnóstico', () => {
  ['-', 'No', 'Ninguno', '', null, undefined, '   '].forEach(v => { assert.ok(!R.esDm(v) && !R.esHta(v) && !R.esErc(v), String(v)); });
  const p = R.perfilClinico({ cie10_dm: '-', cie10_hta: 'No', cie10_erc: 'Ninguno' });
  assert.ok(!p.dm && !p.hta && !p.erc);
});
step('P3-09: el rótulo sale del código (E10 no es tipo 2; N18 no es diabetes)', () => {
  assert.strictEqual(R.rotuloCie10('E11.9'), 'Diabetes Mellitus Tipo 2');
  assert.strictEqual(R.rotuloCie10('E10.9'), 'Diabetes Mellitus Tipo 1');
  assert.strictEqual(R.rotuloCie10('N18.3'), 'Enfermedad Renal Crónica');
  assert.strictEqual(R.rotuloCie10('I10'), 'Hipertensión Arterial');
  assert.strictEqual(R.rotuloCie10('E78.5'), 'Dislipidemia');
  assert.strictEqual(R.rotuloCie10('Z00'), '');
});
step('perfilClinico lee cualquier forma de registro (padrón v4, conditions, diagnosticos)', () => {
  assert.ok(R.perfilClinico({ conditions: [{ cie10_cod: 'I11.9' }, { cie10_cod: 'E10.9' }] }).hta);
  assert.ok(R.perfilClinico({ conditions: [{ cie10_cod: 'I11.9' }, { cie10_cod: 'E10.9' }] }).dm);
  assert.ok(R.perfilClinico({ diagnosticos: ['E13'] }).dm);
  assert.ok(R.perfilClinico({ enfermedad_cardiovascular: 'Sí' }).ecv && !R.perfilClinico({ enfermedad_cardiovascular: 'No' }).ecv);
  assert.strictEqual(R.perfilClinico({ riesgo_cv_porcentaje: '12' }).riesgoPorc, 12);
});
step('K3-02: fallecido por la bandera O por estado_paciente (lo único que envía la interfaz)', () => {
  assert.ok(R.esFallecido({ fallecido: true }));
  assert.ok(R.esFallecido({ estado_paciente: 'Fallecido' }));
  assert.ok(R.esFallecido({ estado_paciente: ' fallecido ' }));
  assert.ok(!R.esFallecido({ estado_paciente: 'Activo' }) && !R.esFallecido({}) && !R.esFallecido(null));
  assert.ok(!R.esFallecido({ estado_paciente: 'Abandono (solo después de intentar contactarlo)' }));
});
step('P3-07: «M»/«F» (HOSIX, FHIR, semilla) y «Masculino»/«Femenino» se reconocen', () => {
  assert.strictEqual(R.normalizarSexo('F'), 'Femenino'); assert.strictEqual(R.normalizarSexo('m'), 'Masculino');
  assert.strictEqual(R.normalizarSexo('Femenino'), 'Femenino'); assert.strictEqual(R.normalizarSexo('Masculino'), 'Masculino');
  assert.strictEqual(R.normalizarSexo(''), ''); assert.strictEqual(R.normalizarSexo('otro'), '');
});
step('K3-04: 90 días solo si está controlado Y estable; si no, 30', () => {
  assert.strictEqual(R.frecuenciaDias('Controlado', true), 90);
  assert.strictEqual(R.frecuenciaDias('Controlado', false), 30);
  assert.strictEqual(R.frecuenciaDias('No Controlado', true), 30);
  assert.strictEqual(R.frecuenciaDias(R.SIN_DATOS, true), 30);
});
step('K3-04: la cita que excede el intervalo se detecta', () => {
  assert.deepStrictEqual(R.citaExcedeIntervalo('2026-11-01', '2026-12-01', 30), { dias: 30, excede: false, maximo: 30 });
  assert.strictEqual(R.citaExcedeIntervalo('2026-11-01', '2027-05-20', 30).excede, true);
  assert.strictEqual(R.citaExcedeIntervalo('x', '2026-12-01', 30), null);
});
step('K3-09: un examen de hace más de 12 meses está vencido; sin fecha no se da por vigente', () => {
  const hoy = new Date(2026, 10, 4);
  assert.strictEqual(R.vigenciaExamen('8.1', '2022-03-01', 12, hoy), 'vencido');
  assert.strictEqual(R.vigenciaExamen('6.5', '2026-05-01', 12, hoy), 'vigente');
  assert.strictEqual(R.vigenciaExamen('6.5', '2025-11-04', 12, hoy), 'vigente');
  assert.strictEqual(R.vigenciaExamen('6.5', '2025-11-03', 12, hoy), 'vencido');
  assert.strictEqual(R.vigenciaExamen('6.5', '', 12, hoy), 'sin_fecha');
  assert.strictEqual(R.vigenciaExamen('', '2026-05-01', 12, hoy), 'sin_dato');
  assert.strictEqual(R.vigenciaExamen('-', '2026-05-01', 12, hoy), 'sin_dato');
});
step('las reglas están congeladas (nadie las cambia en silencio en tiempo de ejecución)', () => {
  assert.ok(Object.isFrozen(R.REGLAS) && Object.isFrozen(R.REGLAS.META_PA));
  assert.throws(() => { 'use strict'; R.REGLAS.HBA1C_META = 9; }, TypeError);
});

// T3-01: en la zona horaria de los usuarios (Lima) las fechas no se corren un día
const r = spawnSync(process.execPath, [__filename, 'fechas'], { env: Object.assign({}, process.env, { TZ: 'America/Lima' }), encoding: 'utf8', timeout: 20000 });
step('T3-01: las fechas locales son correctas con TZ=America/Lima', () => { assert.strictEqual(r.status, 0, (r.stdout || '') + (r.stderr || '')); });

console.log(`\nResultado Reglas clínicas: ${passed} correctas, ${failed} con falla`);
process.exit(failed ? 1 : 0);
