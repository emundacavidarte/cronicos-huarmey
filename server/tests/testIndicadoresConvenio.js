/**
 * testIndicadoresConvenio.js
 * A8: IP02, IP03 e IP04 del convenio SIS, control y cobertura HEARTS y telemonitoreo, calculados con
 * pacientes inventados y comparados con el cálculo hecho a mano (comentado en cada caso).
 * Periodo del convenio: 2026-01-01 a 2026-08-31. Ejecutar: node server/tests/testIndicadoresConvenio.js
 */

const assert = require('assert');
const ind = require('../../client/js/clinical/indicadoresConvenio.js');

let passed = 0;
let failed = 0;
function step(name, fn) {
  try { fn(); passed++; console.log('  OK    ' + name); }
  catch (e) { failed++; console.log('  FALLA ' + name + '\n        ' + e.message); }
}

const A = '00001744'; // centro de salud I-3 (el IP02 y el IP03 son meta)
const H = '00001741'; // hospital II-1 (el IP02 y el IP03 son seguimiento)

const pacientes = [
  // 1: HTA, I-3. Controles en enero (150/95) y abril (130/80): dos controles y uno en meta. Última medición en meta.
  { id: 'p1', puerta_entrada_id: A, diagnosticos: ['I10'], pas_ene: 150, pad_ene: 95, pas_abr: 130, pad_abr: 80,
    _eventos: [{ tipo: 'telemonitoreo', fecha: '2026-03-01' }, { tipo: 'telemonitoreo', fecha: '2026-09-10' }] },
  // 2: HTA, I-3. Dos controles, ninguno en meta (150/95 y 145/92). Última medición fuera de meta.
  { id: 'p2', puerta_entrada_id: A, diagnosticos: ['I10'], pas_mar: 150, pad_mar: 95, pas_jun: 145, pad_jun: 92 },
  // 3: HTA, I-3. Un solo control (mayo, en meta): atendido pero no cumple IP04.
  { id: 'p3', puerta_entrada_id: A, diagnosticos: ['I10'], pas_may: 120, pad_may: 80 },
  // 4: HTA, I-3. Solo control en octubre: fuera del periodo del convenio (no es atendido), pero sí cuenta en HEARTS (año).
  { id: 'p4', puerta_entrada_id: A, diagnosticos: ['I10'], pas_oct: 120, pad_oct: 80 },
  // 5: HTA y DM, I-3. Presión en febrero (130/80) y julio (150/90); HbA1c, creatinina y albuminuria en marzo.
  { id: 'p5', puerta_entrada_id: A, diagnosticos: ['E11', 'I10'], pas_feb: 130, pad_feb: 80, pas_jul: 150, pad_jul: 90,
    hba1c: 7, fecha_hba1c: '2026-03-10', creatinina: 0.9, fecha_creatinina: '2026-03-10', albuminuria: '30', fecha_albuminuria: '2026-03-10',
    _eventos: [{ tipo: 'telemonitoreo', fecha: '2025-12-01' }] },
  // 6: DM, I-3. Atendida por su último control (junio). HbA1c el 1-sep (fuera del periodo); creatinina sin albuminuria.
  { id: 'p6', puerta_entrada_id: A, diagnosticos: ['E11'], fecha_ultimo_control: '2026-06-05',
    hba1c: 8, fecha_hba1c: '2026-09-01', creatinina: 1, fecha_creatinina: '2026-04-01' },
  // 7: DM, hospital. HbA1c y control el 2-may.
  { id: 'p7', puerta_entrada_id: H, diagnosticos: ['E11'], hba1c: 6.5, fecha_hba1c: '2026-05-02', fecha_ultimo_control: '2026-05-02' },
  // 8: HTA fallecido: no entra en nada.
  { id: 'p8', puerta_entrada_id: A, diagnosticos: ['I10'], estado_paciente: 'Fallecido', pas_ene: 120, pad_ene: 80, pas_feb: 120, pad_feb: 80 },
  // 9: sin diagnóstico de HTA ni DM: no entra.
  { id: 'p9', puerta_entrada_id: A, diagnosticos: ['E78.2'], pas_ene: 120, pad_ene: 80, pas_feb: 120, pad_feb: 80 },
  // 10: I15.0 (renovascular) y E12 quedan fuera del Anexo 04: no entran.
  { id: 'p10', puerta_entrada_id: A, diagnosticos: ['I15.0', 'E12'], pas_ene: 120, pad_ene: 80, pas_mar: 120, pad_mar: 80, hba1c: 6, fecha_hba1c: '2026-03-01' },
  // 11: HTA, hospital. Controles en enero (120/80) y febrero (118/78): cumple IP04.
  { id: 'p11', puerta_entrada_id: H, diagnosticos: ['I10'], pas_ene: 120, pad_ene: 80, pas_feb: 118, pad_feb: 78 },
  // 12: DM, hospital. Atendida solo por una observación del 3-feb con HbA1c 7,2 (sin creatinina ni albuminuria).
  { id: 'p12', puerta_entrada_id: H, diagnosticos: ['E10'], observations: [{ fecha_registro: '2026-02-03', hba1c: 7.2 }] }
];

const categoriaDe = p => (p.puerta_entrada_id === A ? 'I-3' : 'II-1');
const r = ind.calcular(pacientes, { categoriaDe, esperados: { hta: 10, dm: 8 } });
const t = r.total;

step('el periodo del convenio es enero a agosto de 2026 y las metas son 10 %, 10 % y 50 %', () => {
  assert.deepStrictEqual(r.periodo, { desde: '2026-01-01', hasta: '2026-08-31' });
  assert.deepStrictEqual(r.metas, { ip02: 10, ip03: 10, ip04: 50 });
});

step('códigos del Anexo 04: I10.X y E10, E11, E13, E14 sí; I15.0, E12 y O24 no', () => {
  for (const c of ['I10', 'I10.0', 'I11.0', 'I13.9', 'I15.1', 'I15.9']) assert.ok(ind.esHta(c), c);
  for (const c of ['I15.0', 'I20', 'E11', 'N18']) assert.ok(!ind.esHta(c), c);
  for (const c of ['E10', 'E11.9', 'E13', 'E14.0']) assert.ok(ind.esDm(c), c);
  for (const c of ['E12', 'O24.4', 'I10']) assert.ok(!ind.esDm(c), c);
});

step('IP02 total: 3 de 4 diabéticos atendidos tienen HbA1c en el periodo (75,0 %); la HbA1c del 1-sep no cuenta', () => {
  // atendidos DM: p5, p6, p7, p12 = 4. Con HbA1c en el periodo: p5, p7, p12 = 3. p6 la tiene el 1-sep (fuera).
  assert.strictEqual(t.ip02.denominador, 4);
  assert.strictEqual(t.ip02.numerador, 3);
  assert.strictEqual(t.ip02.porcentaje, 75);
});

step('IP03 total: 1 de 4 (25,0 %); exige creatinina Y albuminuria en el periodo', () => {
  // solo p5 tiene ambas. p6 tiene creatinina sin albuminuria; p7 y p12 no tienen ninguna.
  assert.strictEqual(t.ip03.denominador, 4);
  assert.strictEqual(t.ip03.numerador, 1);
  assert.strictEqual(t.ip03.porcentaje, 25);
});

step('IP04 total: 3 de 5 hipertensos atendidos (60,0 %): al menos dos controles y una presión < 140/90', () => {
  // atendidos HTA: p1, p2, p3, p5, p11 = 5 (p4 solo en octubre, p8 fallecido, p9 y p10 no son HTA).
  // cumplen: p1 (2 controles, abril en meta), p5 (feb en meta), p11 = 3. p2 sin presión en meta; p3 un solo control.
  assert.strictEqual(t.ip04.denominador, 5);
  assert.strictEqual(t.ip04.numerador, 3);
  assert.strictEqual(t.ip04.porcentaje, 60);
});

step('control HEARTS: 4 de 6 hipertensos con medición tienen la última presión en meta (66,7 %)', () => {
  // con medición en el año: p1, p2, p3, p4, p5, p11 = 6. Última en meta: p1 (130/80), p3, p4, p11 = 4. p2 (145/92) y p5 (150/90) no.
  assert.strictEqual(t.hearts.hta_con_medicion, 6);
  assert.strictEqual(t.hearts.hta_en_meta, 4);
  assert.strictEqual(t.hearts.control_porcentaje, 66.7);
});

step('cobertura HEARTS: padrón entre esperados declarados; sin esperados no se calcula', () => {
  assert.strictEqual(t.hearts.hta_padron, 6);
  assert.strictEqual(t.hearts.dm_padron, 4);
  assert.deepStrictEqual(t.hearts.cobertura_hta, { padron: 6, esperados: 10, porcentaje: 60 });
  assert.deepStrictEqual(t.hearts.cobertura_dm, { padron: 4, esperados: 8, porcentaje: 50 });
  const sin = ind.calcular(pacientes, { categoriaDe });
  assert.strictEqual(sin.total.hearts.cobertura_hta.porcentaje, null);
  assert.strictEqual(sin.total.hearts.cobertura_hta.esperados, null);
});

step('telemonitoreo: 2 atenciones a 1 de 9 pacientes con HTA o DM (11,1 %); la de 2025 no cuenta', () => {
  // población HTA o DM activa: p1, p2, p3, p4, p5, p6, p7, p11, p12 = 9. Eventos de 2026: p1 tiene dos; el de p5 es de 2025.
  assert.strictEqual(t.telemonitoreo.poblacion, 9);
  assert.strictEqual(t.telemonitoreo.pacientes_atendidos, 1);
  assert.strictEqual(t.telemonitoreo.atenciones, 2);
  assert.strictEqual(t.telemonitoreo.porcentaje, 11.1);
});

step('por establecimiento: el I-3 mide IP02 e IP03 contra meta y el hospital solo como seguimiento', () => {
  const a = r.por_establecimiento[A];
  assert.deepStrictEqual([a.ip02.numerador, a.ip02.denominador, a.ip02.porcentaje, a.ip02.modo, a.ip02.meta], [1, 2, 50, 'meta', 10]);
  assert.deepStrictEqual([a.ip03.numerador, a.ip03.denominador, a.ip03.porcentaje], [1, 2, 50]);
  assert.deepStrictEqual([a.ip04.numerador, a.ip04.denominador, a.ip04.porcentaje, a.ip04.meta], [2, 4, 50, 50]);
  const h = r.por_establecimiento[H];
  assert.deepStrictEqual([h.ip02.numerador, h.ip02.denominador, h.ip02.porcentaje, h.ip02.modo, h.ip02.meta], [2, 2, 100, 'seguimiento', null]);
  assert.deepStrictEqual([h.ip03.numerador, h.ip03.denominador, h.ip03.porcentaje], [0, 2, 0]);
  assert.deepStrictEqual([h.ip04.numerador, h.ip04.denominador, h.ip04.porcentaje, h.ip04.meta], [1, 1, 100, 50]);
});

step('con pacientes de todos los niveles el total de IP02 e IP03 es seguimiento; solo de I-3 o I-4, meta', () => {
  assert.strictEqual(t.ip02.modo, 'seguimiento');
  assert.strictEqual(t.ip02.meta, null);
  assert.strictEqual(t.ip04.modo, 'meta');
  const soloA = ind.calcular(pacientes.filter(p => p.puerta_entrada_id === A), { categoriaDe });
  assert.strictEqual(soloA.total.ip02.modo, 'meta');
  assert.strictEqual(soloA.total.ip02.meta, 10);
});

step('cada indicador lleva su fuente normativa', () => {
  for (const k of ['ip02', 'ip03', 'ip04']) assert.ok(/Convenio SIS/.test(t[k].fuente), k);
  assert.ok(/HEARTS/.test(t.hearts.fuente));
  assert.ok(/NTS 235/.test(t.telemonitoreo.fuente));
});

step('sin pacientes no hay porcentajes inventados: todo en cero y porcentaje nulo', () => {
  const v = ind.calcular([], {});
  assert.strictEqual(v.total.ip04.denominador, 0);
  assert.strictEqual(v.total.ip04.porcentaje, null);
  assert.strictEqual(v.total.hearts.control_porcentaje, null);
  assert.strictEqual(v.total.telemonitoreo.porcentaje, null);
});

// Las cuatro definiciones de «hipertenso controlado» sobre pacientes pensados a mano (presión < 140/90 = en meta)
const definiciones = [
  // p1: dos mediciones (ene 150/95 fuera, abr 130/80 en meta)
  pacientes[0],
  // p3: una medición en mayo, en meta
  pacientes[2],
  // p4: una medición en octubre, en meta (fuera de enero a agosto)
  pacientes[3],
  // p13: seis mediciones de enero a junio: 150/95, 140/90 (no es menor de 140), 130/80, 128/78, 126/78, 124/76 -> en meta 4 de 6
  { id: 'p13', puerta_entrada_id: A, diagnosticos: ['I10'], pas_ene: 150, pad_ene: 95, pas_feb: 140, pad_feb: 90, pas_mar: 130, pad_mar: 80, pas_abr: 128, pad_abr: 78, pas_may: 126, pad_may: 78, pas_jun: 124, pad_jun: 76 },
  // p14: tres mediciones de septiembre a noviembre: 150/95, 130/80, 150/95 -> la última fuera de meta
  { id: 'p14', puerta_entrada_id: A, diagnosticos: ['I10'], pas_set: 150, pad_set: 95, pas_oct: 130, pad_oct: 80, pas_nov: 150, pad_nov: 95 }
];
const cd = ind.calcular(definiciones, { categoriaDe }).total.control_definiciones;

step('«paciente controlado» tiene cuatro definiciones y cada una declara su regla y su fuente', () => {
  assert.deepStrictEqual(Object.keys(cd), ['hearts', 'his', 'pp0018', 'sis']);
  for (const k of Object.keys(cd)) {
    assert.ok(cd[k].nombre && cd[k].regla && cd[k].fuente, k);
  }
});

step('HEARTS (última medición en meta): 4 de 5 con medición en el año (80,0 %)', () => {
  // con medición: p1, p3, p4, p13, p14 = 5. Última en meta: p1 (130/80), p3, p4 y p13 (124/76) = 4. p14 termina en 150/95.
  assert.deepStrictEqual([cd.hearts.numerador, cd.hearts.denominador, cd.hearts.porcentaje, cd.hearts.no_evaluables], [4, 5, 80, 0]);
});

step('Manual HIS (tres últimas en meta): 1 de 2 evaluables (50,0 %); 3 no tienen tres mediciones', () => {
  // evaluables (3 o más mediciones): p13 (seis) y p14 (tres). p13: las tres últimas (128, 126, 124) están en meta. p14: la última no.
  assert.deepStrictEqual([cd.his.numerador, cd.his.denominador, cd.his.porcentaje, cd.his.no_evaluables], [1, 2, 50, 3]);
});

step('PP 0018 2026 (cuatro de las seis últimas en meta): 1 de 1 evaluable (100,0 %); 4 no tienen seis mediciones', () => {
  // solo p13 tiene seis: en meta marzo, abril, mayo y junio = 4 de 6 (febrero 140/90 no es menor de 140).
  assert.deepStrictEqual([cd.pp0018.numerador, cd.pp0018.denominador, cd.pp0018.porcentaje, cd.pp0018.no_evaluables], [1, 1, 100, 4]);
});

step('SIS IP04 (dos controles de enero a agosto y una presión en meta): 2 de 3 (66,7 %)', () => {
  // atendidos de enero a agosto: p1, p3, p13 (p4 y p14 solo tienen mediciones de septiembre en adelante). Cumplen p1 y p13.
  assert.deepStrictEqual([cd.sis.numerador, cd.sis.denominador, cd.sis.porcentaje], [2, 3, 66.7]);
  const ip04 = ind.calcular(definiciones, { categoriaDe }).total.ip04;
  assert.deepStrictEqual([ip04.numerador, ip04.denominador], [cd.sis.numerador, cd.sis.denominador], 'el SIS de la lista de definiciones es el IP04');
});

step('la misma persona puede estar controlada con una definición y no con otra (por eso cada cifra declara la suya)', () => {
  // p1: HEARTS sí (última en meta) y SIS sí, pero no es evaluable por HIS ni por PP 0018. p14: ninguna lo da por controlado.
  const solo = (p) => ind.calcular([p], { categoriaDe }).total.control_definiciones;
  assert.strictEqual(solo(pacientes[0]).hearts.numerador, 1);
  assert.strictEqual(solo(pacientes[0]).his.denominador, 0);
  assert.strictEqual(solo(definiciones[4]).hearts.numerador, 0);
  assert.strictEqual(solo(definiciones[4]).his.numerador, 0);
});

console.log('\nResultado Indicadores del convenio: ' + passed + ' correctas, ' + failed + ' con falla');
process.exit(failed === 0 ? 0 : 1);
