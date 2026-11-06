/**
 * testClinicoF3.js
 * Motor clínico técnico del cliente, Fase 4b (hallazgos de la Fase 3, docs/produccion/F3_cliente_clinica.md):
 *   T3-01 fechas locales · T3-02 una sola implementación (heartsEngine y padronCalculadora usan ReglasClinicas y semaforo.js)
 *   T3-03 sin efectos secundarios · T3-05 sin respaldos «verde / Controlado» · T3-06 documentos CE y pasaporte
 *   K3-01/K3-05 estado de control desde las mediciones · K3-02 fallecidos · K3-03 aviso de WhatsApp sin fecha inventada
 *   K3-06 cita cumplida · K3-07/K3-08 una sola meta y diagnósticos I10-I15 / E10-E14 · K3-09 sin valores supuestos
 *   K3-10 importación de HOSIX sin datos inventados · K3-11 (solo documentación del tablero del convenio).
 * Funciones puras, datos inventados (DNI 96…). No toca store.json ni abre puertos.
 * Ejecutar: node server/tests/testClinicoF3.js
 * Las pruebas con fechas se repiten en procesos hijos con TZ=America/Lima, UTC y Pacific/Auckland.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', 'client', 'js');
const R = require(CLI + '/clinical/reglasClinicas.js');
const S = require(CLI + '/clinical/semaforo.js');
const hearts = require(CLI + '/clinical/heartsEngine.js');
const calc = require(CLI + '/clinical/padronCalculadora.js');
const wa = require(CLI + '/clinical/whatsappNotifier.js');
const alertas = require(CLI + '/clinical/alertsManager.js');
const hosix = require(CLI + '/data/hosixParser.js');

let passed = 0, failed = 0;
function step(name, fn) {
  try { fn(); passed++; console.log('  OK    ' + name); }
  catch (e) { failed++; console.log('  FALLA ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); }
}

const p2 = n => String(n).padStart(2, '0');
/** Fecha local de hoy + off días, como AAAA-MM-DD (con el TZ del proceso). */
function ymd(off) { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }

const HOY = new Date(2026, 10, 4, 21, 30); // 4-nov-2026, 21:30 hora local (de noche en Lima el UTC ya es «mañana»)
const HTA = [{ cie10_cod: 'I10', diagnostico: 'Hipertensión Arterial' }];
const DM = [{ cie10_cod: 'E11.9', diagnostico: 'Diabetes Mellitus Tipo 2' }];
const obs = (fecha, pas, pad, extra) => Object.assign({ fecha_registro: fecha, pa_sistolica: pas, pa_diastolica: pad }, extra || {});
const ev = (p, hoy) => hearts.evaluatePatient(p, hoy || HOY);

// ---------------------------------------------------------------------------------------------------------------
// Casos que dependen de la zona horaria: se corren aquí y en procesos hijos con TZ de Lima, UTC y Auckland
// ---------------------------------------------------------------------------------------------------------------
function casosFechas(tz) {
  const etq = `[${tz}] `;

  step(etq + 'T3-01: padronCalculadora.evaluarCita: hoy = amarillo «Cita hoy»; +8 días = verde; ayer = 1 día de atraso (fecha real de hoy)', () => {
    const hoy = calc.evaluarCita(ymd(0));
    assert.strictEqual(hoy.semaforo, 'amarillo'); assert.strictEqual(hoy.estadoCita, 'Cita hoy'); assert.strictEqual(hoy.diasAtraso, 0);
    assert.strictEqual(calc.evaluarCita(ymd(8)).semaforo, 'verde');
    assert.strictEqual(calc.evaluarCita(ymd(7)).semaforo, 'amarillo');
    const ayer = calc.evaluarCita(ymd(-1));
    assert.strictEqual(ayer.diasAtraso, 1); assert.strictEqual(ayer.semaforo, 'rojo');
  });

  step(etq + 'T3-01: evaluarCita con fecha de referencia fija (4-nov-2026 de noche)', () => {
    assert.strictEqual(calc.evaluarCita('2026-11-04', HOY).estadoCita, 'Cita hoy');
    assert.strictEqual(calc.evaluarCita('2026-11-12', HOY).semaforo, 'verde');
    assert.strictEqual(calc.evaluarCita('2026-11-11', HOY).estadoCita, 'En 7 día(s)');
    assert.strictEqual(calc.evaluarCita('2026-11-02', HOY).diasAtraso, 2);
    assert.strictEqual(calc.evaluarCita('2026-02-30', HOY).estadoCita, 'Fecha inválida');
    assert.strictEqual(calc.evaluarCita('', HOY).semaforo, 'gris');
  });

  step(etq + 'T3-01: heartsEngine: cita a +8 días = 8 días restantes, verde y fecha_limite igual a la fecha dada', () => {
    const r = ev({ appointments: [{ fecha_cita: ymd(8) }] }, new Date());
    assert.strictEqual(r.dias_restantes, 8); assert.strictEqual(r.semaforo, 'green'); assert.strictEqual(r.fecha_limite, ymd(8));
    const h = ev({ appointments: [{ fecha_cita: ymd(0) }] }, new Date());
    assert.strictEqual(h.semaforo, 'yellow'); assert.strictEqual(h.dias_restantes, 0);
    const a = ev({ appointments: [{ fecha_cita: ymd(-1) }] }, new Date());
    assert.strictEqual(a.semaforo, 'red'); assert.strictEqual(a.dias_vencido, 1);
  });

  step(etq + 'T3-01: medicación hasta = último control + meses × 30 días, sin correr un día', () => {
    assert.strictEqual(calc.calcularMedacionHasta('2026-09-01', '3'), '2026-11-30');
    assert.strictEqual(calc.calcularMedacionHasta('2026-01-01', 1), '2026-01-31');
    assert.strictEqual(calc.calcularPadron({ fecha_ultimo_control: '2026-09-01', meses_medicacion: '3' }, HOY).medicacion_hasta, '2026-11-30');
  });

  step(etq + 'T3-01: la vigencia de un examen se mide en fechas locales (vence el mismo día del año siguiente)', () => {
    const base = { cie10_dm: 'E11', hba1c: '6.5', creatinina: '1', albuminuria: 'Menor de 30 mg/g (A1)', colesterol_ldl: '90', proxima_cita: '2026-12-01', fecha_evaluacion_pie: '2026-10-01', fecha_creatinina: '2026-10-01', fecha_albuminuria: '2026-10-01', fecha_perfil_lipidico: '2026-10-01' };
    assert.ok(/^Al día/.test(calc.calcularPadron({ ...base, fecha_hba1c: '2025-11-04' }, HOY).que_le_falta), 'justo 12 meses: vigente');
    assert.ok(/HbA1c vencida/.test(calc.calcularPadron({ ...base, fecha_hba1c: '2025-11-03' }, HOY).que_le_falta), 'un día más: vencida');
  });

  step(etq + 'T3-03: semaforo.js y heartsEngine dan el mismo resultado (día, color y fecha) con la misma referencia', () => {
    const p = { appointments: [{ fecha_cita: '2026-11-12' }] };
    const a = S.calcularSemaforo(p, HOY), b = ev(p);
    assert.strictEqual(b.semaforo, a.semaforo); assert.strictEqual(b.dias_restantes, a.dias_restantes); assert.strictEqual(b.fecha_limite, a.fecha_limite);
  });
}

if (process.argv[2] === 'fechas') {
  casosFechas(process.env.TZ || 'sistema');
  console.log(`\nResultado Clínico F3 (fechas, TZ=${process.env.TZ}): ${passed} correctas, ${failed} con falla`);
  process.exit(failed ? 1 : 0);
}

// ---------------------------------------------------------------------------------------------------------------
console.log('T3-01 · fechas locales (zona del sistema y procesos hijos)');
casosFechas(process.env.TZ || 'sistema');
for (const tz of ['America/Lima', 'UTC', 'Pacific/Auckland']) {
  const r = spawnSync(process.execPath, [__filename, 'fechas'], { env: Object.assign({}, process.env, { TZ: tz }), encoding: 'utf8', timeout: 30000 });
  step(`T3-01: las fechas locales son correctas con TZ=${tz}`, () => { assert.strictEqual(r.status, 0, (r.stdout || '') + (r.stderr || '')); });
}

// ---------------------------------------------------------------------------------------------------------------
console.log('\nT3-02 · una sola implementación');
step('T3-02: heartsEngine y padronCalculadora no calculan fechas con new Date(texto) ni toISOString (UTC)', () => {
  for (const f of ['heartsEngine.js', 'padronCalculadora.js', 'semaforo.js', 'whatsappNotifier.js']) {
    const src = fs.readFileSync(path.join(CLI, 'clinical', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/toISOString/.test(src), f + ' usa toISOString');
    assert.ok(!/new Date\(\s*(?:p\.|patient\.|latest|cita|fecha|prox|str|valor)[\w.]*\s*\)/i.test(src), f + ' lee una fecha AAAA-MM-DD con new Date(texto)');
  }
});
step('T3-02: heartsEngine, padronCalculadora y semaforo cargan reglasClinicas.js (no tienen lógica propia de meta ni de diagnóstico)', () => {
  for (const f of ['heartsEngine.js', 'padronCalculadora.js', 'semaforo.js']) {
    const src = fs.readFileSync(path.join(CLI, 'clinical', f), 'utf8');
    assert.ok(/reglasClinicas/.test(src), f + ' no usa reglasClinicas');
  }
  const hs = fs.readFileSync(path.join(CLI, 'clinical', 'heartsEngine.js'), 'utf8');
  assert.ok(/semaforo/.test(hs), 'heartsEngine no delega el semáforo');
  assert.ok(!/pa_sistolica\s*<\s*140|pas\s*<\s*140|hba1c\s*<\s*7/.test(hs), 'heartsEngine repite umbrales');
});
step('T3-02: la interfaz de salida de heartsEngine conserva sus nombres de campo', () => {
  const r = ev({ conditions: HTA, observations: [obs('2026-11-01', 120, 70)], appointments: [{ fecha_cita: '2026-12-01' }] });
  for (const k of ['hasHta', 'hasDm2', 'estado_control', 'frecuencia_hearts', 'semaforo', 'dias_restantes', 'dias_vencido', 'fecha_limite', 'recomendacion']) {
    assert.ok(k in r, 'falta ' + k);
  }
});
step('T3-02: la interfaz de salida de padronCalculadora.calcularPadron conserva sus 25 campos', () => {
  const r = calc.calcularPadron({}, HOY);
  const claves = ['edad_anios', 'imc', 'valoracion_nutricional', 'nivel_riesgo_cv', 'alto_riesgo_cv', 'meta_presion', 'ultima_pas', 'ultima_pad', 'mes_ultima_pa', 'pa_en_meta', 'controlado_estable', 'cumple_ip04', 'hba1c_en_meta', 'tfge', 'estadio_erc', 'ldl_en_meta', 'dias_atraso', 'estado_cita', 'que_le_falta', 'alerta_del_dato', 'distrito_residencia', 'controles_en_el_anio', 'medicacion_hasta', 'puede_telemonitoreo', 'semaforo_hearts'];
  claves.forEach(k => assert.ok(k in r, 'falta ' + k));
  assert.strictEqual(Object.keys(r).length, claves.length);
});
step('T3-02: heartsEngine delega el semáforo en semaforo.js (mismo color, días y fecha en 8 casos)', () => {
  const casos = [
    { appointments: [{ fecha_cita: '2026-11-20' }] },
    { appointments: [{ fecha_cita: '2026-11-04' }] },
    { appointments: [{ fecha_cita: '2026-10-20' }] },
    { appointments: [] },
    { appointments: [{ fecha_cita: 'no-es-fecha' }] },
    { fallecido: true, appointments: [{ fecha_cita: '2026-10-20' }] },
    { estado_paciente: 'Fallecido', appointments: [{ fecha_cita: '2026-10-20' }] },
    { fuente: 'HOSIX', appointments: [{ fecha_cita: '2026-10-20' }] },
    { appointments: [{ fecha_cita: '2026-10-20' }], observations: [obs('2026-10-21', 120, 80)] }
  ];
  for (const p of casos) {
    const a = S.calcularSemaforo(p, HOY), b = ev(p);
    assert.strictEqual(b.semaforo, a.semaforo, JSON.stringify(p));
    assert.strictEqual(b.dias_restantes, a.dias_restantes, JSON.stringify(p));
    assert.strictEqual(b.dias_vencido, a.dias_vencido, JSON.stringify(p));
  }
});
step('T3-02: los módulos cargan como <script> en el orden de index.html (contexto de navegador) y se usan entre sí vía window', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  const orden = ['utils/fechaLima.js', 'clinical/reglasClinicas.js', 'clinical/semaforo.js', 'clinical/heartsEngine.js', 'clinical/alertsManager.js',
    'clinical/whatsappNotifier.js', 'clinical/indicadoresConvenio.js', 'data/hosixParser.js', 'clinical/padronCalculadora.js'];
  for (const f of orden) vm.runInContext(fs.readFileSync(path.join(CLI, f), 'utf8'), ctx, { filename: f });
  for (const k of ['ReglasClinicas', 'SemaforoHearts', 'HeartsEngine', 'AlertsManager', 'WhatsappNotifier', 'HosixParser', 'PadronCalculadora']) {
    assert.ok(ctx.window[k], 'falta window.' + k);
  }
  const r = ctx.window.HeartsEngine.evaluatePatient({ estado_paciente: 'Fallecido' });
  assert.strictEqual(r.semaforo, 'black');
  assert.strictEqual(ctx.window.PadronCalculadora.calcularPadron({ estado_paciente: 'Fallecido' }, HOY).semaforo_hearts, 'negro');
  const res = ctx.window.HosixParser.processRecords([{ DNI: '96000001', PACIENTE: 'x', CIE10_COD: 'N18.3', HBA1C: '11' }]);
  assert.strictEqual(res.length, 1); assert.strictEqual(res[0].conditions[0].diagnostico, 'Enfermedad Renal Crónica');
  const abiertos = [];
  ctx.window.open = (...a) => abiertos.push(a);
  ctx.window.alert = () => {};
  assert.strictEqual(ctx.window.WhatsappNotifier.sendDirect({ telefono: '987654321', consentimiento: 'Sí, firmado', fecha_limite: '2026-12-05' }), true);
  assert.strictEqual(abiertos[0][2], 'noopener');
});
step('T3-02: semaforo.js sigue cargando en Node sin DOM ni window, y reparte UMBRAL_PROXIMA_DIAS desde REGLAS', () => {
  const r = spawnSync(process.execPath, ['-e', `
    if (typeof window !== 'undefined' || typeof document !== 'undefined') process.exit(3);
    const S = require(${JSON.stringify(CLI + '/clinical/semaforo.js')});
    const R = require(${JSON.stringify(CLI + '/clinical/reglasClinicas.js')});
    if (S.UMBRAL_PROXIMA_DIAS !== R.REGLAS.UMBRAL_PROXIMA_DIAS) process.exit(4);
    if (S.calcularSemaforo({ estado_paciente: 'Fallecido' }, new Date(2026, 10, 4)).semaforo !== 'black') process.exit(5);
  `], { encoding: 'utf8', timeout: 20000 });
  assert.strictEqual(r.status, 0, (r.stdout || '') + (r.stderr || ''));
});

// ---------------------------------------------------------------------------------------------------------------
console.log('\nK3-02 · fallecidos');
step('K3-02: estado_paciente «Fallecido» (sin la bandera) → negro, no rojo, en semaforo.js', () => {
  assert.strictEqual(S.calcularSemaforo({ estado_paciente: 'Fallecido', appointments: [{ fecha_cita: '2026-10-01' }] }, HOY).semaforo, 'black');
  assert.strictEqual(S.calcularSemaforo({ estado_paciente: ' fallecido ', appointments: [] }, HOY).semaforo, 'black');
  assert.strictEqual(S.calcularSemaforo({ fallecido: true }, HOY).semaforo, 'black');
  assert.strictEqual(S.calcularSemaforo({ estado_paciente: 'Activo', appointments: [{ fecha_cita: '2026-10-01' }] }, HOY).semaforo, 'red');
  assert.strictEqual(S.calcularSemaforo({ estado_paciente: 'Fallecido', fuente: 'HOSIX' }, HOY).semaforo, 'black', 'el fallecido gana a HOSIX');
});
step('K3-02: heartsEngine → negro para el fallecido por estado y por bandera, con recomendación que no manda controlar', () => {
  const r = ev({ estado_paciente: 'Fallecido', conditions: HTA, observations: [obs('2026-10-01', 180, 100)], appointments: [{ fecha_cita: '2026-10-05' }] });
  assert.strictEqual(r.semaforo, 'black');
  assert.ok(/fallecid/i.test(r.recomendacion), r.recomendacion);
  assert.ok(!/control mensual|ajuste terap/i.test(r.recomendacion), r.recomendacion);
  assert.strictEqual(ev({ fallecido: true, appointments: [] }).semaforo, 'black');
});
step('K3-02: padronCalculadora → semaforo_hearts «negro» con estado «Fallecido» o la bandera', () => {
  assert.strictEqual(calc.calcularPadron({ estado_paciente: 'Fallecido', proxima_cita: '2026-10-01' }, HOY).semaforo_hearts, 'negro');
  assert.strictEqual(calc.calcularPadron({ fallecido: true, proxima_cita: '2026-10-01' }, HOY).semaforo_hearts, 'negro');
  assert.strictEqual(calc.calcularPadron({ estado_paciente: 'Activo', proxima_cita: '2026-10-01' }, HOY).semaforo_hearts, 'rojo');
});
step('K3-02: whatsappNotifier no genera enlace para fallecidos (bandera o estado) aunque hayan firmado el consentimiento', () => {
  const tel = { telefono: '987654321', consentimiento: 'Sí, firmado', puerta_entrada: 'Hospital', fecha_limite: '2026-11-20' };
  assert.ok(wa.generateLink(tel), 'control: el paciente vivo sí genera enlace');
  assert.strictEqual(wa.generateLink({ ...tel, fallecido: true }), null);
  assert.strictEqual(wa.generateLink({ ...tel, estado_paciente: 'Fallecido' }), null);
  assert.strictEqual(wa.generarEnlace({ ...tel, estado_paciente: 'Fallecido' }, '20/11/2026'), null);
});

// ---------------------------------------------------------------------------------------------------------------
console.log('\nK3-06 · una cita a la que el paciente asistió no es «desertor»');
const cita = (f, extra) => Object.assign({ appointments: [{ fecha_cita: f }] }, extra || {});
step('K3-06: control registrado el día de la cita vencida → gris «cita_cumplida» (antes rojo)', () => {
  const r = S.calcularSemaforo(cita('2026-10-25', { observations: [obs('2026-10-25', 120, 80)] }), HOY);
  assert.strictEqual(r.semaforo, 'gray'); assert.strictEqual(r.motivo, 'cita_cumplida');
  assert.strictEqual(r.dias_vencido, 0); assert.strictEqual(r.dias_restantes, null);
});
step('K3-06: un control posterior a la cita también la cierra; un control anterior no (sigue rojo)', () => {
  assert.strictEqual(S.calcularSemaforo(cita('2026-10-25', { observations: [obs('2026-10-30', 120, 80)] }), HOY).motivo, 'cita_cumplida');
  const antes = S.calcularSemaforo(cita('2026-10-25', { observations: [obs('2026-10-24', 120, 80)] }), HOY);
  assert.strictEqual(antes.semaforo, 'red'); assert.strictEqual(antes.dias_vencido, 10);
});
step('K3-06: también cierra con fecha_ultimo_control o con un evento de la línea de tiempo de tipo «control»', () => {
  assert.strictEqual(S.calcularSemaforo(cita('2026-10-25', { fecha_ultimo_control: '2026-10-25' }), HOY).motivo, 'cita_cumplida');
  assert.strictEqual(S.calcularSemaforo(cita('2026-10-25', { _eventos: [{ tipo: 'control', fecha: '2026-10-26' }] }), HOY).motivo, 'cita_cumplida');
  assert.strictEqual(S.calcularSemaforo(cita('2026-10-25', { _eventos: [{ tipo: 'telemonitoreo', fecha: '2026-10-26' }] }), HOY).semaforo, 'red', 'un telemonitoreo no es un control');
  assert.strictEqual(S.calcularSemaforo(cita('2026-10-25', { fecha_ultimo_control: '2026-10-01' }), HOY).semaforo, 'red');
});
step('K3-06: solo cierra citas que ya pasaron: la de hoy y las futuras conservan su color', () => {
  assert.strictEqual(S.calcularSemaforo(cita('2026-11-04', { observations: [obs('2026-11-04', 120, 80)] }), HOY).semaforo, 'yellow');
  assert.strictEqual(S.calcularSemaforo(cita('2026-12-01', { observations: [obs('2026-12-05', 120, 80)] }), HOY).semaforo, 'green');
});
step('K3-06: se compara con la cita MÁS RECIENTE (una cita nueva sin control vuelve a contar)', () => {
  const p = { appointments: [{ fecha_cita: '2026-09-01' }, { fecha_cita: '2026-10-20' }], observations: [obs('2026-09-02', 120, 80)] };
  assert.strictEqual(S.calcularSemaforo(p, HOY).semaforo, 'red');
  assert.strictEqual(S.calcularSemaforo({ ...p, observations: [obs('2026-10-21', 120, 80)] }, HOY).motivo, 'cita_cumplida');
});
step('K3-06: con la cita cumplida no se cuenta como desertor en aplicarSemaforo y heartsEngine lo refleja', () => {
  const lista = [cita('2026-10-25', { observations: [obs('2026-10-25', 120, 80)], semaforo: 'red' })];
  S.aplicarSemaforo(lista, HOY);
  assert.strictEqual(lista[0].semaforo, 'gray'); assert.strictEqual(lista[0].semaforo_guardado, 'red');
  assert.strictEqual(ev(lista[0]).semaforo, 'gray');
});
step('K3-06: la regla vive en REGLAS (ASISTENCIA_CIERRA_CITA) y UMBRAL_PROXIMA_DIAS sale de ahí', () => {
  assert.strictEqual(R.REGLAS.ASISTENCIA_CIERRA_CITA, true);
  assert.strictEqual(S.UMBRAL_PROXIMA_DIAS, R.REGLAS.UMBRAL_PROXIMA_DIAS);
  const src = fs.readFileSync(path.join(CLI, 'clinical', 'semaforo.js'), 'utf8');
  assert.ok(/ASISTENCIA_CIERRA_CITA/.test(src) && !/UMBRAL_PROXIMA_DIAS\s*=\s*7/.test(src));
});
step('K3-06: la ficha (padronCalculadora) también cierra la cita con fecha_ultimo_control', () => {
  const r = calc.calcularPadron({ proxima_cita: '2026-10-25', fecha_ultimo_control: '2026-10-25' }, HOY);
  assert.strictEqual(r.semaforo_hearts, 'gris'); assert.strictEqual(r.dias_atraso, 0);
  assert.ok(!/vencida/i.test(r.que_le_falta), r.que_le_falta);
  assert.strictEqual(calc.calcularPadron({ proxima_cita: '2026-10-25', fecha_ultimo_control: '2026-10-01' }, HOY).semaforo_hearts, 'rojo');
});

// ---------------------------------------------------------------------------------------------------------------
console.log('\nK3-01 / K3-05 · el estado de control sale de las mediciones');
step('K3-01: la etiqueta guardada «Controlado» no manda sobre la cifra: PA 190/110 → No Controlado, 30 días', () => {
  const r = ev({ conditions: HTA, observations: [obs('2026-11-01', 190, 110, { estado_control: 'Controlado' })], appointments: [] });
  assert.strictEqual(r.estado_control, 'No Controlado'); assert.strictEqual(r.frecuencia_hearts, 30);
});
step('K3-01: diabético con HbA1c 11 % y sin presión, etiquetado «Controlado» → No Controlado, 30 días (antes 90)', () => {
  const r = ev({ conditions: DM, observations: [obs('2026-11-01', null, null, { hba1c: 11, estado_control: 'Controlado' })], appointments: [] });
  assert.strictEqual(r.estado_control, 'No Controlado'); assert.strictEqual(r.frecuencia_hearts, 30);
});
step('K3-01: sin ninguna medición NUNCA «Controlado»: la etiqueta «Controlado» o ausente → Sin Datos', () => {
  assert.strictEqual(ev({ conditions: HTA, observations: [{ fecha_registro: '2026-11-01', estado_control: 'Controlado' }] }).estado_control, R.SIN_DATOS);
  assert.strictEqual(ev({ conditions: HTA, estado_control: 'Controlado' }).estado_control, R.SIN_DATOS);
  assert.strictEqual(ev({ conditions: HTA }).estado_control, R.SIN_DATOS);
  assert.strictEqual(ev({}).estado_control, R.SIN_DATOS);
  assert.strictEqual(ev({ conditions: HTA, observations: [{ fecha_registro: '2026-11-01', estado_control: 'Quizás' }] }).estado_control, R.SIN_DATOS);
  assert.strictEqual(ev({ conditions: HTA }).frecuencia_hearts, 30);
});
step('K3-01: sin mediciones, la etiqueta «No Controlado» sí se respeta (es la dirección segura)', () => {
  assert.strictEqual(ev({ conditions: HTA, observations: [{ fecha_registro: '2026-11-01', estado_control: 'No Controlado' }] }).estado_control, 'No Controlado');
  assert.strictEqual(ev({ conditions: HTA, estado_control: 'No Controlado' }).estado_control, 'No Controlado');
});
step('K3-01: el valor devuelto es solo uno de los tres rótulos de reglasClinicas', () => {
  const validos = ['Controlado', 'No Controlado', R.SIN_DATOS];
  [ev({}), ev({ conditions: HTA, observations: [obs('2026-11-01', 120, 70)] }), ev({ conditions: HTA, observations: [obs('2026-11-01', 160, 100)] })]
    .forEach(r => assert.ok(validos.includes(r.estado_control), r.estado_control));
});
step('K3-01: se usa la medición más reciente aunque la lista venga desordenada; y la glucosa/HbA1c del paciente completa lo que falte', () => {
  const p = { conditions: HTA, observations: [obs('2026-11-01', 120, 70), obs('2026-06-01', 170, 100)], appointments: [] };
  assert.strictEqual(ev(p).estado_control, 'Controlado');
  const q = { conditions: HTA, observations: [obs('2026-06-01', 120, 70), obs('2026-11-01', 170, 100)], appointments: [] };
  assert.strictEqual(ev(q).estado_control, 'No Controlado');
  assert.strictEqual(ev({ conditions: HTA, pa_sistolica: 150, pa_diastolica: 95 }).estado_control, 'No Controlado', 'sin observaciones usa las cifras del paciente');
  assert.strictEqual(ev({ conditions: DM, observations: [obs('2026-11-01', 120, 70)], hba1c: 8.4 }).estado_control, 'No Controlado', 'la HbA1c del paciente entra');
});
step('K3-05: «controlado y estable» = las 3 últimas mediciones en meta → 90 días; con 1 o 2, o una fuera de meta, 30 días', () => {
  const tres = [obs('2026-08-01', 120, 70), obs('2026-10-01', 118, 72), obs('2026-09-01', 125, 75)]; // desordenadas a propósito
  const a = ev({ conditions: HTA, observations: tres });
  assert.strictEqual(a.estado_control, 'Controlado'); assert.strictEqual(a.frecuencia_hearts, 90);
  const uno = ev({ conditions: HTA, observations: [obs('2026-10-01', 118, 72)] });
  assert.strictEqual(uno.estado_control, 'Controlado'); assert.strictEqual(uno.frecuencia_hearts, 30, 'una sola medición no da 90 días');
  assert.strictEqual(ev({ conditions: HTA, observations: tres.slice(0, 2) }).frecuencia_hearts, 30);
  const medioFuera = [obs('2026-08-01', 120, 70), obs('2026-09-01', 150, 95), obs('2026-10-01', 118, 72)];
  assert.strictEqual(ev({ conditions: HTA, observations: medioFuera }).frecuencia_hearts, 30);
  const cuatro = [obs('2026-06-01', 170, 100), obs('2026-08-01', 120, 70), obs('2026-09-01', 125, 75), obs('2026-10-01', 118, 72)];
  assert.strictEqual(ev({ conditions: HTA, observations: cuatro }).frecuencia_hearts, 90, 'solo cuentan las 3 últimas');
  assert.strictEqual(R.REGLAS.CONTROLES_PARA_ESTABLE, 3);
});
step('K3-05: el no controlado siempre va a 30 días, aunque antes haya tenido tres controles en meta', () => {
  const p = { conditions: HTA, observations: [obs('2026-08-01', 120, 70), obs('2026-09-01', 118, 72), obs('2026-10-01', 125, 75), obs('2026-11-01', 165, 100)] };
  assert.strictEqual(ev(p).estado_control, 'No Controlado'); assert.strictEqual(ev(p).frecuencia_hearts, 30);
});
step('K3-05 (decisión): en un diabético cada una de las 3 últimas observaciones debe estar en meta por sí sola (PA y HbA1c)', () => {
  const todas = ['2026-08-01', '2026-09-01', '2026-10-01'].map(f => obs(f, 120, 70, { hba1c: 6.5 }));
  assert.strictEqual(ev({ conditions: [...HTA, ...DM], observations: todas }).frecuencia_hearts, 90);
  const sinHb = [todas[0], obs('2026-09-01', 120, 70), todas[2]];
  assert.strictEqual(ev({ conditions: [...HTA, ...DM], observations: sinHb }).frecuencia_hearts, 30);
});
step('K3-07: DM2 + HTA con 135/85 y HbA1c 6,5 % → No Controlado, igual que dice la ficha (una sola meta: la de alto riesgo de REGLAS)', () => {
  const r = ev({ conditions: [...HTA, ...DM], observations: [obs('2026-11-01', 135, 85, { hba1c: 6.5 })] });
  assert.strictEqual(r.estado_control, 'No Controlado');
  const ficha = calc.calcularPadron({ cie10_dm: 'E11.9', cie10_hta: 'I10', pas_oct: '135', pad_oct: '85', hba1c: '6.5' }, HOY);
  assert.strictEqual(ficha.pa_en_meta, 'No');
  const m = R.REGLAS.META_PA_ALTO_RIESGO; assert.ok(ficha.meta_presion.includes(`${m.sistolica}/${m.diastolica}`), ficha.meta_presion);
  // el 90 diastólico viene de la vía (solo fija la sistólica); un 125/85 con DM ya está en meta
  assert.strictEqual(R.estadoControl({ pas: 125, pad: 85, hba1c: 6.5 }, { dm: true, hta: true }), 'Controlado');
});
step('K3-07: riesgo CV 25 % sin DM/ERC/ECV usa la meta de alto riesgo en el motor y en la ficha', () => {
  const r = ev({ conditions: HTA, riesgo_cv_porcentaje: '25', observations: [obs('2026-11-01', 135, 85)] });
  assert.strictEqual(r.estado_control, 'No Controlado');
  const ficha = calc.calcularPadron({ riesgo_cv_porcentaje: '25', pas_oct: '135', pad_oct: '85', cie10_hta: 'I10' }, HOY);
  assert.ok(ficha.meta_presion.includes('130'), ficha.meta_presion);
  assert.ok(/riesgo CV/.test(ficha.meta_presion), ficha.meta_presion);
  assert.strictEqual(ficha.pa_en_meta, 'No');
});
step('K3-07: hipertenso sin alto riesgo con 135/85 sigue en meta (< 140/90)', () => {
  assert.strictEqual(ev({ conditions: HTA, observations: [obs('2026-11-01', 135, 85)] }).estado_control, 'Controlado');
});
step('K3-07: el motor y la ficha dan la misma meta de PA para los mismos pacientes', () => {
  const casos = [
    { dx: HTA, ficha: { cie10_hta: 'I10' } },
    { dx: DM, ficha: { cie10_dm: 'E11.9' } },
    { dx: [...HTA, { cie10_cod: 'N18.3' }], ficha: { cie10_hta: 'I10', cie10_erc: 'N18.3' } },
    { dx: HTA, ficha: { cie10_hta: 'I10', enfermedad_cardiovascular: 'Sí (infarto, angina, ACV, arteriopatía periférica)' }, extra: { enfermedad_cardiovascular: 'Sí (infarto, angina, ACV, arteriopatía periférica)' } }
  ];
  for (const c of casos) {
    for (const [s, d] of [[128, 78], [134, 84], [139, 89]]) {
      const motor = ev({ conditions: c.dx, ...(c.extra || {}), observations: [obs('2026-11-01', s, d, { hba1c: 6.5 })] }).estado_control; // con HbA1c en meta, solo cuenta la PA
      const ficha = calc.calcularPadron({ ...c.ficha, pas_oct: String(s), pad_oct: String(d) }, HOY).pa_en_meta;
      assert.strictEqual(motor === 'Controlado', ficha === 'Sí', `${JSON.stringify(c.ficha)} ${s}/${d}: motor=${motor} ficha=${ficha}`);
    }
  }
});
step('K3-05: controlado_estable de la ficha usa REGLAS.CONTROLES_PARA_ESTABLE y la meta de metaPA (riesgo ≥ 10 % → 130/80)', () => {
  const tres = { pas_oct: '135', pad_oct: '85', pas_set: '135', pad_set: '85', pas_ago: '135', pad_ago: '85' };
  assert.strictEqual(calc.calcularPadron({ cie10_hta: 'I10', ...tres }, HOY).controlado_estable, 'Sí');
  assert.strictEqual(calc.calcularPadron({ cie10_hta: 'I10', riesgo_cv_porcentaje: '25', ...tres }, HOY).controlado_estable, 'No', 'con riesgo 25 % la meta es 130/80');
  assert.strictEqual(calc.calcularPadron({ cie10_hta: 'I10', pas_oct: '120', pad_oct: '70' }, HOY).controlado_estable, 'Sí (Parcial)');
  assert.strictEqual(calc.calcularPadron({ cie10_hta: 'I10' }, HOY).controlado_estable, 'No');
});

// ---------------------------------------------------------------------------------------------------------------
console.log('\nK3-08 · diagnósticos I10-I15 y E10-E14');
step('K3-08: heartsEngine reconoce HTA en I10 a I15 y DM en E10 a E14 (antes solo I10 y E11)', () => {
  ['I10', 'I11.9', 'I12.9', 'I13.0', 'I15.1'].forEach(c => assert.strictEqual(ev({ conditions: [{ cie10_cod: c }] }).hasHta, true, c));
  ['E11.9', 'E10.9', 'E13', 'E14'].forEach(c => assert.strictEqual(ev({ conditions: [{ cie10_cod: c }] }).hasDm2, true, c));
  ['E78.2', 'N18.3', 'I25.2'].forEach(c => { const r = ev({ conditions: [{ cie10_cod: c }] }); assert.ok(!r.hasHta && !r.hasDm2, c); });
});
step('K3-08: un diabético E10 o E13 sin dato glucémico no se da por controlado; con HbA1c 6,5 y PA en meta sí', () => {
  assert.strictEqual(ev({ conditions: [{ cie10_cod: 'E10.9' }], observations: [obs('2026-11-01', 120, 70)] }).estado_control, 'No Controlado');
  assert.strictEqual(ev({ conditions: [{ cie10_cod: 'E13' }], observations: [obs('2026-11-01', 120, 70, { hba1c: 6.5 })] }).estado_control, 'Controlado');
});
step('K3-08: el diagnóstico también puede llegar por diagnosticos[] o por los campos cie10_* del padrón', () => {
  assert.strictEqual(ev({ diagnosticos: ['I11.9'] }).hasHta, true);
  assert.strictEqual(ev({ cie10_dm: 'E10 – Diabetes tipo 1' }).hasDm2, true);
  assert.strictEqual(ev({ conditions: [{ diagnostico: 'Hipertensión arterial' }] }).hasHta, true);
});
step('K3-08/K3-09: la ficha reconoce I11 como HTA y E10 como DM (pide HbA1c y examen de pie)', () => {
  const r = calc.calcularPadron({ cie10_dm: 'E10.9', cie10_hta: 'I11.9', proxima_cita: '2026-12-01' }, HOY);
  assert.ok(/HbA1c/.test(r.que_le_falta) && /pie/i.test(r.que_le_falta), r.que_le_falta);
  assert.strictEqual(r.alto_riesgo_cv, 'Sí');
});
step('K3-09: «-», «No» y «Ninguno» en cie10_dm / cie10_hta / cie10_erc no cuentan como diagnóstico', () => {
  for (const v of ['-', 'No', 'Ninguno', '']) {
    const r = calc.calcularPadron({ cie10_dm: v, cie10_erc: v, cie10_hta: v }, HOY);
    assert.strictEqual(r.nivel_riesgo_cv, 'Sin dato', v); assert.strictEqual(r.alto_riesgo_cv, 'Sin dato', v);
    assert.ok(/< 140\/90/.test(r.meta_presion) && !/DM|ERC/.test(r.meta_presion), r.meta_presion);
    assert.ok(!/HbA1c|pie/i.test(r.que_le_falta), v + ' → ' + r.que_le_falta);
  }
});

// ---------------------------------------------------------------------------------------------------------------
console.log('\nT3-03 · sin efectos secundarios ni excepciones');
step('T3-03: evaluatePatient no reordena patient.observations ni modifica al paciente', () => {
  const lista = [obs('2026-01-01', 150, 95), obs('2026-06-01', 120, 70)];
  const p = { conditions: HTA, observations: lista, appointments: [{ fecha_cita: '2026-12-01' }, { fecha_cita: '2026-01-01' }] };
  const antes = JSON.stringify(p);
  ev(p);
  assert.strictEqual(JSON.stringify(p), antes);
  assert.strictEqual(p.observations, lista);
  assert.deepStrictEqual(p.observations.map(o => o.fecha_registro), ['2026-01-01', '2026-06-01']);
});
step('T3-03: una fecha de cita inválida no lanza excepción: sale gris y sin fecha límite', () => {
  for (const f of ['no-es-fecha', '2026-02-30', '', null, undefined, 12345, {}]) {
    let r;
    assert.doesNotThrow(() => { r = ev({ appointments: [{ fecha_cita: f }] }); }, String(f));
    assert.strictEqual(r.semaforo, 'gray', String(f)); assert.strictEqual(r.dias_restantes, null);
    assert.ok(!r.fecha_limite || r.fecha_limite === 'Sin fecha', String(r.fecha_limite));
  }
});
step('T3-03: tolera paciente nulo, listas ausentes o con elementos nulos', () => {
  assert.doesNotThrow(() => ev(null));
  assert.doesNotThrow(() => ev(undefined));
  assert.doesNotThrow(() => ev({ conditions: [null, {}], observations: [null, {}], appointments: [null, {}] }));
  assert.strictEqual(ev({ conditions: null, observations: 'x', appointments: 5 }).semaforo, 'gray');
});
step('T3-03: fecha_limite sin cita no es una cadena que el servidor rechace como fecha (null, no «Sin fecha»)', () => {
  assert.strictEqual(ev({ appointments: [] }).fecha_limite, null);
});

// ---------------------------------------------------------------------------------------------------------------
console.log('\nK3-09 · sin valores supuestos en la ficha');
const TFGE_MUJER_64 = { creatinina: '1.0', sexo: 'Femenino', fecha_nacimiento: '1962-03-10' }; // 64 años a 4-nov-2026
step('K3-09: TFGe sin fecha de nacimiento → null / «Sin dato» (antes suponía 50 años)', () => {
  const r = calc.calcularPadron({ creatinina: '1.4', sexo: 'Femenino' }, HOY);
  assert.strictEqual(r.tfge, null); assert.strictEqual(r.estadio_erc, 'Sin dato');
});
step('K3-09: TFGe sin sexo reconocible → null / «Sin dato» (antes se calculaba como hombre)', () => {
  for (const s of [undefined, '', 'X', 'otro']) {
    const r = calc.calcularPadron({ ...TFGE_MUJER_64, sexo: s }, HOY);
    assert.strictEqual(r.tfge, null, String(s)); assert.strictEqual(r.estadio_erc, 'Sin dato', String(s));
  }
  assert.deepStrictEqual(calc.calcularTfge('1.0', 64, ''), { tfge: null, estadio: 'Sin dato' });
  assert.deepStrictEqual(calc.calcularTfge('1.0', null, 'Femenino'), { tfge: null, estadio: 'Sin dato' });
});
step('K3-09/P3-07: el sexo «F»/«M» (HOSIX, FHIR, semilla) y «Femenino»/«Masculino» dan la misma TFGe (mujer 63, hombre 84)', () => {
  for (const s of ['F', 'f', 'Femenino', 'femenino']) assert.strictEqual(calc.calcularPadron({ ...TFGE_MUJER_64, sexo: s }, HOY).tfge, 63, s);
  for (const s of ['M', 'Masculino']) assert.strictEqual(calc.calcularPadron({ ...TFGE_MUJER_64, sexo: s }, HOY).tfge, 84, s);
});
step('K3-09/Q18: la categoría de TFGe no se rotula «Estadio ERC» (lo que devuelve la calculadora)', () => {
  const r = calc.calcularPadron(TFGE_MUJER_64, HOY);
  assert.ok(/^G[1-5]/.test(r.estadio_erc), r.estadio_erc);
  assert.ok(!/estadio\s*erc/i.test(r.estadio_erc), r.estadio_erc);
  const src = fs.readFileSync(path.join(CLI, 'clinical', 'padronCalculadora.js'), 'utf8');
  assert.ok(/Categoría de TFGe/.test(src), 'el módulo debe documentar «Categoría de TFGe»');
  assert.ok(!/Estadio ERC/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'el código no debe rotular «Estadio ERC»');
});
step('K3-09: «medicación hasta» sin meses de medicación válidos → «Sin fecha de entrega» (antes suponía 1 mes)', () => {
  assert.strictEqual(calc.calcularPadron({ fecha_ultimo_control: '2026-09-01' }, HOY).medicacion_hasta, 'Sin fecha de entrega');
  for (const m of ['', undefined, null, '0', '-1', 'abc', 'x3', 0, NaN, '1.5']) {
    assert.strictEqual(calc.calcularMedacionHasta('2026-09-01', m), 'Sin fecha de entrega', String(m));
  }
  assert.strictEqual(calc.calcularMedacionHasta('', '3'), 'Sin fecha de entrega');
  assert.strictEqual(calc.calcularMedacionHasta('basura', '3'), 'Sin fecha de entrega');
  assert.strictEqual(calc.calcularMedacionHasta('2026-09-01', '1'), '2026-10-01');
  assert.strictEqual(calc.calcularMedacionHasta('2026-09-01', 2), '2026-10-31');
});
step('K3-09: nivel de riesgo CV «Sin dato» si no hay riesgo numérico ni condición de alto riesgo (antes «Bajo (< 5%)»)', () => {
  const r = calc.calcularPadron({}, HOY);
  assert.strictEqual(r.nivel_riesgo_cv, 'Sin dato'); assert.strictEqual(r.alto_riesgo_cv, 'Sin dato');
});
step('K3-09: el riesgo numérico y las condiciones de alto riesgo siguen funcionando', () => {
  assert.strictEqual(calc.calcularPadron({ riesgo_cv_porcentaje: '3' }, HOY).nivel_riesgo_cv, 'Bajo (< 5%)');
  assert.strictEqual(calc.calcularPadron({ riesgo_cv_porcentaje: '3' }, HOY).alto_riesgo_cv, 'No');
  assert.strictEqual(calc.calcularPadron({ riesgo_cv_porcentaje: '7' }, HOY).nivel_riesgo_cv, 'Moderado (5–9%)');
  assert.strictEqual(calc.calcularPadron({ riesgo_cv_porcentaje: '12' }, HOY).alto_riesgo_cv, 'Sí');
  assert.strictEqual(calc.calcularPadron({ riesgo_cv_porcentaje: '25' }, HOY).nivel_riesgo_cv, 'Muy Alto (≥ 20%)');
  assert.strictEqual(calc.calcularPadron({ cie10_dm: 'E11' }, HOY).nivel_riesgo_cv, 'Alto (Diabetes Mellitus)');
  assert.strictEqual(calc.calcularPadron({ cie10_erc: 'N18.3' }, HOY).nivel_riesgo_cv, 'Muy Alto (Criterio clínico ECV/ERC)');
  assert.strictEqual(calc.calcularPadron({ enfermedad_cardiovascular: 'Sí (infarto, angina, ACV, arteriopatía periférica)' }, HOY).alto_riesgo_cv, 'Sí');
  assert.strictEqual(calc.calcularPadron({ enfermedad_cardiovascular: 'No' }, HOY).nivel_riesgo_cv, 'Sin dato');
});
step('K3-09: la HbA1c en meta sale de REGLAS (< 7): 6,9 sí, 7,0 no', () => {
  assert.strictEqual(calc.calcularPadron({ hba1c: '6.9' }, HOY).hba1c_en_meta, 'Sí');
  assert.strictEqual(calc.calcularPadron({ hba1c: '7.0' }, HOY).hba1c_en_meta, 'No');
  assert.strictEqual(calc.calcularPadron({}, HOY).hba1c_en_meta, 'Sin dato');
});

console.log('\nK3-09 · «Qué le falta» mira las fechas de los exámenes');
const vigente = { cie10_dm: 'E11', hba1c: '6.5', fecha_hba1c: '2026-09-01', creatinina: '1', fecha_creatinina: '2026-09-01', albuminuria: 'Menor de 30 mg/g (A1)', fecha_albuminuria: '2026-09-01', colesterol_ldl: '90', fecha_perfil_lipidico: '2026-09-01', fecha_evaluacion_pie: '2026-09-01', proxima_cita: '2026-12-01' };
const falta = (extra) => calc.calcularPadron({ ...vigente, ...extra }, HOY).que_le_falta;
step('K3-09: con todos los exámenes vigentes y sin cita vencida → «Al día…»', () => {
  assert.ok(/^Al día/.test(falta({})), falta({}));
});
step('K3-09: HbA1c y examen de pie de hace más de 4 años → pendientes, ya no «Al día»', () => {
  const t = falta({ fecha_hba1c: '2022-03-01', fecha_evaluacion_pie: '2022-01-01' });
  assert.ok(/HbA1c vencida/.test(t), t); assert.ok(/pie.*vencid/i.test(t), t); assert.ok(!/^Al día/.test(t), t);
});
step('K3-09: examen con valor pero sin fecha → «sin fecha»; sin valor → pendiente', () => {
  const t = falta({ fecha_hba1c: '', fecha_creatinina: undefined });
  assert.ok(/HbA1c sin fecha/.test(t), t); assert.ok(/Creatinina.*sin fecha/i.test(t), t);
  const u = falta({ hba1c: '', creatinina: '', albuminuria: '', colesterol_ldl: '', fecha_evaluacion_pie: '' });
  assert.ok(/HbA1c/.test(u) && /Creatinina/.test(u) && /Albuminuria/.test(u) && /lip[ií]dico/i.test(u) && /pie/i.test(u), u);
  assert.ok(!/vencida|sin fecha/.test(u.split(' · ').filter(x => /HbA1c/.test(x)).join('')), 'sin valor no es «vencida»');
});
step('K3-09: albuminuria y perfil lipídico vencidos o sin fecha también salen pendientes', () => {
  const t = falta({ fecha_albuminuria: '2024-01-01', fecha_perfil_lipidico: '' });
  assert.ok(/Albuminuria.*vencid/i.test(t), t); assert.ok(/lip[ií]dico.*sin fecha/i.test(t), t);
});
step('K3-09: el hipertenso sin diabetes no necesita HbA1c ni examen de pie; sí creatinina, albuminuria y lípidos', () => {
  const t = calc.calcularPadron({ cie10_hta: 'I10', proxima_cita: '2026-12-01' }, HOY).que_le_falta;
  assert.ok(!/HbA1c|pie/i.test(t), t); assert.ok(/Creatinina/.test(t), t);
});
step('K3-09: una cita vencida sigue apareciendo y la vigencia sale de REGLAS.VIGENCIA_EXAMEN_MESES', () => {
  assert.ok(/Cita médica vencida \(3d\)/.test(falta({ proxima_cita: '2026-11-01' })), falta({ proxima_cita: '2026-11-01' }));
  assert.strictEqual(R.REGLAS.VIGENCIA_EXAMEN_MESES.hba1c, 12);
  assert.ok(/HbA1c\b/.test(falta({ fecha_hba1c: '2025-10-01' })), 'con 12 meses una HbA1c de oct-2025 ya venció el 4-nov-2026');
});

console.log('\nT3-06 · documentos: DNI, carné de extranjería y pasaporte');
const alertaDoc = (tipo, nro) => calc.calcularPadron({ apellidos_nombres: 'X', direccion: 'Y', establecimiento_adscripcion: 'Z', tipo_documento: tipo, nro_documento: nro }, HOY).alerta_del_dato;
step('T3-06: carné de extranjería (9 dígitos) y pasaporte (AB123456) válidos → «Dato conforme»', () => {
  assert.strictEqual(alertaDoc('Carné de extranjería', '001234567'), 'Dato conforme');
  assert.strictEqual(alertaDoc('Pasaporte', 'AB123456'), 'Dato conforme');
  assert.strictEqual(alertaDoc('pasaporte', 'ab123456789012'), 'Dato conforme');
  assert.strictEqual(alertaDoc('Carné de extranjería', '123456'), 'Dato conforme');
});
step('T3-06: carné o pasaporte fuera de 6 a 15 letras o dígitos → alerta, pero no la de «DNI»', () => {
  for (const [t, n] of [['Pasaporte', 'AB123'], ['Carné de extranjería', '1234567890123456'], ['Pasaporte', 'AB#12'], ['Pasaporte', '']]) {
    const a = alertaDoc(t, n);
    assert.notStrictEqual(a, 'Dato conforme', t + ' ' + n); assert.ok(!/^DNI no tiene/.test(a), a);
  }
});
step('T3-06: DNI = 8 dígitos; 7 o 9 dígitos, letras o vacío → «DNI no tiene 8 dígitos»', () => {
  assert.strictEqual(alertaDoc('DNI', '96000001'), 'Dato conforme');
  for (const n of ['9600000', '960000012', 'ABCDEFGH', '']) assert.strictEqual(alertaDoc('DNI', n), 'DNI no tiene 8 dígitos', n);
});
step('T3-06: sin tipo de documento se infiere: 8 dígitos = DNI; otro formato alerta', () => {
  assert.strictEqual(alertaDoc(undefined, '96000001'), 'Dato conforme');
  assert.strictEqual(alertaDoc('', '96000001'), 'Dato conforme');
  assert.strictEqual(alertaDoc('', '9600000'), 'DNI no tiene 8 dígitos');
  assert.strictEqual(alertaDoc(undefined, undefined), 'DNI no tiene 8 dígitos');
});
step('T3-06: «sin documento» no es válido y las demás alertas se conservan', () => {
  assert.notStrictEqual(alertaDoc('Sin documento', '96000001'), 'Dato conforme');
  const a = calc.calcularPadron({ tipo_documento: 'Pasaporte', nro_documento: 'AB123456' }, HOY).alerta_del_dato;
  assert.ok(/Falta nombres/.test(a) && /Falta dirección/.test(a) && /Falta EESS/.test(a) && !/DNI/.test(a), a);
});

// ---------------------------------------------------------------------------------------------------------------
console.log('\nK3-03 · aviso de WhatsApp sin fecha inventada');
const conTel = { telefono: '987654321', consentimiento: 'Sí, firmado', puerta_entrada: 'NUEVO HOSPITAL DE APOYO HUARMEY' };
const mensajeDe = (url) => decodeURIComponent(url.split('?text=')[1]);
step('K3-03: sin fecha (ni customDate ni fecha_limite) no hay enlace; ya no dice «esta semana»', () => {
  assert.strictEqual(wa.generateLink(conTel), null);
  assert.strictEqual(wa.generateLink(conTel, null), null);
  assert.strictEqual(wa.generateLink(conTel, ''), null);
  assert.strictEqual(wa.generateLink(conTel, '   '), null);
  assert.strictEqual(wa.generateLink({ ...conTel, fecha_limite: '' }), null);
  assert.strictEqual(wa.generateLink({ ...conTel, fecha_limite: 'Sin fecha' }), null);
  assert.strictEqual(wa.generarEnlace(conTel), null);
});
step('K3-03: con customDate o con fecha_limite el mensaje lleva esa fecha; customDate manda sobre fecha_limite', () => {
  const a = wa.generateLink(conTel, '20/11/2026');
  assert.ok(a && a.startsWith('https://wa.me/51987654321?text='));
  assert.ok(mensajeDe(a).includes('*20/11/2026*'), mensajeDe(a));
  const b = wa.generateLink({ ...conTel, fecha_limite: '2026-12-05' });
  assert.ok(mensajeDe(b).includes('2026-12-05'), mensajeDe(b));
  assert.ok(mensajeDe(wa.generateLink({ ...conTel, fecha_limite: '2026-12-05' }, '8/11/2026')).includes('8/11/2026'));
  assert.ok(!/esta semana/i.test(mensajeDe(a)) && !/esta semana/i.test(mensajeDe(b)));
});
step('K3-03: se conservan el consentimiento y el mensaje sin nombre, DNI ni diagnóstico', () => {
  const base = { ...conTel, apellidos_nombres: 'PEREZ QUISPE JUAN', dni: '96000001', diagnosticos: ['E11', 'I10'], conditions: [{ cie10_cod: 'E11', diagnostico: 'Diabetes' }] };
  const m = mensajeDe(wa.generateLink(base, '20/11/2026'));
  assert.ok(!/PEREZ|QUISPE|JUAN|96000001|E11|I10|diabetes|hipertens/i.test(m), m);
  assert.strictEqual(wa.generateLink({ ...base, consentimiento: '' }, '20/11/2026'), null);
  assert.strictEqual(wa.generateLink({ ...base, consentimiento: 'No' }, '20/11/2026'), null);
  assert.strictEqual(wa.generateLink({ ...base, telefono: '123' }, '20/11/2026'), null);
});
step('K3-03: sendDirect abre con window.open(enlace, "_blank", "noopener") y avisa si no hay enlace', () => {
  const abiertos = [], avisos = [];
  global.window = { open: (...a) => { abiertos.push(a); } };
  global.alert = (m) => { avisos.push(m); };
  try {
    assert.strictEqual(wa.sendDirect({ ...conTel, fecha_limite: '2026-12-05' }), true);
    assert.strictEqual(abiertos.length, 1); assert.ok(abiertos[0][0].startsWith('https://wa.me/'));
    assert.strictEqual(abiertos[0][1], '_blank'); assert.strictEqual(abiertos[0][2], 'noopener');
    assert.strictEqual(wa.sendDirect(conTel), false, 'sin fecha no se abre');
    assert.strictEqual(wa.sendDirect({ ...conTel, fecha_limite: '2026-12-05', estado_paciente: 'Fallecido' }), false, 'fallecido no se abre');
    assert.strictEqual(wa.sendDirect({ ...conTel, fecha_limite: '2026-12-05', consentimiento: '' }), false);
    assert.strictEqual(abiertos.length, 1); assert.strictEqual(avisos.length, 3);
    assert.ok(/fecha/i.test(avisos[0]), avisos[0]); assert.ok(/fallecid/i.test(avisos[1]), avisos[1]); assert.ok(/consentimiento/i.test(avisos[2]), avisos[2]);
  } finally { delete global.window; delete global.alert; }
});

// ---------------------------------------------------------------------------------------------------------------
console.log('\nalertsManager · pre-citas sin datos inventados');
step('alertsManager: carga en Node sin DOM; sin fecha sugerida válida no se crea la pre-cita (no inventa «hoy + 3»)', () => {
  alertas.precitas = [];
  const pac = { dni: '96000001', apellidos_nombres: 'PACIENTE INVENTADO UNO', historia_clinica: '1', conditions: HTA };
  assert.strictEqual(alertas.crearPreCita(pac), null);
  assert.strictEqual(alertas.crearPreCita(pac, ''), null);
  assert.strictEqual(alertas.crearPreCita(pac, '2026-02-30'), null);
  assert.strictEqual(alertas.obtenerTodas().length, 0);
  const ok = alertas.crearPreCita(pac, '2026-11-20', 'Consultorio de prueba');
  assert.ok(ok && ok.fecha_sugerida === '2026-11-20' && ok.estado === 'PENDIENTE_ADMISIÓN' && ok.diagnosticos === 'I10');
  assert.strictEqual(alertas.obtenerTodas().length, 1);
  alertas.precitas = [];
});
step('alertsManager: registrarPreCita con un DNI que no está en la lista no inventa un paciente cuyo nombre es el DNI', () => {
  alertas.precitas = [];
  assert.strictEqual(alertas.registrarPreCita('96000009', '2026-11-20'), null);
  assert.strictEqual(alertas.obtenerTodas().length, 0);
});

// ---------------------------------------------------------------------------------------------------------------
console.log('\nK3-10 · importación de HOSIX sin datos inventados');
const fila = (extra) => Object.assign({ DNI: '96000001', PACIENTE: 'paciente uno', FEC_ULTIMA_ATENCION: ymd(-3) }, extra || {});
step('K3-10: una fila sin documento NO entra al arreglo y se informa en observados (fila desde 1)', () => {
  const res = hosix.processRecords([fila(), fila({ DNI: '' }), fila({ DNI: '96000003' }), { PACIENTE: 'sin documento', CIE10_COD: 'I10' }]);
  assert.strictEqual(res.length, 2);
  assert.deepStrictEqual(res.map(p => p.dni), ['96000001', '96000003']);
  assert.ok(Array.isArray(res.observados)); assert.strictEqual(res.observados.length, 2);
  assert.deepStrictEqual(res.observados.map(o => o.fila), [2, 4]);
  res.observados.forEach(o => assert.ok(typeof o.motivo === 'string' && /documento/i.test(o.motivo), o.motivo));
  assert.ok(!res.some(p => /^DNI-\d+$/.test(p.dni)), 'no inventa «DNI-n»');
});
step('K3-10: observados existe (vacío) cuando todas las filas son válidas', () => {
  const res = hosix.processRecords([fila()]);
  assert.strictEqual(res.length, 1); assert.deepStrictEqual(res.observados, []);
  assert.deepStrictEqual(hosix.processRecords([]).observados, []);
});
step('K3-10: documento válido = DNI de 8 dígitos o carné/pasaporte de 6 a 15 letras o dígitos; lo demás se observa', () => {
  const docs = ['96000001', '001234567', 'AB123456', 'ab123456789012', '1234', '12345678901234567', 'AB 123456', '96-000001', 'ñandú123', '  96000002  '];
  const res = hosix.processRecords(docs.map(d => fila({ DNI: d })));
  assert.deepStrictEqual(res.map(p => p.dni), ['96000001', '001234567', 'AB123456', 'AB123456789012', '96000002']);
  assert.deepStrictEqual(res.observados.map(o => o.fila), [5, 6, 7, 8, 9]);
});
step('K3-10: si el archivo trae el tipo de documento, se valida según el tipo (DNI exige 8 dígitos) y se conserva', () => {
  const res = hosix.processRecords([
    fila({ DNI: '9600001', TIPO_DOCUMENTO: 'DNI' }),
    fila({ DNI: '96000002', TIPO_DOCUMENTO: 'DNI' }),
    fila({ DNI: 'AB123456', TIPO_DOCUMENTO: 'Pasaporte' }),
    fila({ DNI: '001234567', TIPO_DOCUMENTO: 'Carné de extranjería' })
  ]);
  assert.deepStrictEqual(res.map(p => p.dni), ['96000002', 'AB123456', '001234567']);
  assert.deepStrictEqual(res.map(p => p.tipo_documento), ['DNI', 'Pasaporte', 'Carné de extranjería']);
  assert.deepStrictEqual(res.observados.map(o => o.fila), [1]);
});
step('K3-10 (decisión): sin tipo en el archivo, 8 dígitos = DNI y otro documento se rotula carné (solo dígitos) o pasaporte (con letras)', () => {
  const res = hosix.processRecords([fila({ DNI: '96000001' }), fila({ DNI: '001234567' }), fila({ DNI: 'AB123456' })]);
  assert.deepStrictEqual(res.map(p => p.tipo_documento), ['DNI', 'Carné de extranjería', 'Pasaporte']);
});
step('K3-10: sin diagnóstico → conditions [] y diagnosticos []; sin historia clínica ni nombre no inventa HC-1000 ni «PACIENTE REGISTRADO»', () => {
  const p = hosix.processRecords([{ DNI: '96000001', FEC_ULTIMA_ATENCION: ymd(-3) }])[0];
  assert.deepStrictEqual(p.conditions, []); assert.deepStrictEqual(p.diagnosticos, []);
  assert.strictEqual(p.historia_clinica, ''); assert.strictEqual(p.apellidos_nombres, '');
  assert.strictEqual(p.hasHta, false); assert.strictEqual(p.hasDm2, false);
  assert.ok(!/I10|Hipertensi|PACIENTE REGISTRADO|HC-\d+/.test(JSON.stringify(p)), JSON.stringify(p));
});
step('K3-10: el rótulo del diagnóstico sale del código (N18.3 ya no es «Diabetes Mellitus Tipo 2»)', () => {
  const rot = (c) => hosix.processRecords([fila({ CIE10_COD: c })])[0].conditions[0];
  assert.strictEqual(rot('N18.3').diagnostico, 'Enfermedad Renal Crónica');
  assert.strictEqual(rot('E11').diagnostico, 'Diabetes Mellitus Tipo 2');
  assert.strictEqual(rot('E10.9').diagnostico, 'Diabetes Mellitus Tipo 1');
  assert.strictEqual(rot('I11.9').diagnostico, 'Hipertensión Arterial');
  assert.strictEqual(rot('I10').cie10_cod, 'I10');
  assert.ok(!/Diabetes/.test(rot('N18.3').diagnostico));
  assert.strictEqual(rot('E66').cie10_cod, 'E66'); assert.ok(rot('E66').diagnostico && !/Diabetes|Hipertensi/.test(rot('E66').diagnostico));
});
step('K3-10: un texto sin código CIE-10 no se convierte en diagnóstico inventado', () => {
  const p = hosix.processRecords([fila({ CIE10_COD: 'sin dato' })])[0];
  assert.deepStrictEqual(p.conditions, []);
});
step('K3-10: varios códigos en la misma celda («I10; E11») generan un diagnóstico por código', () => {
  const p = hosix.processRecords([fila({ CIE10_COD: 'I10; E11.9' })])[0];
  assert.deepStrictEqual(p.diagnosticos, ['I10', 'E11.9']);
  assert.strictEqual(p.hasHta, true); assert.strictEqual(p.hasDm2, true);
});
step('K3-10: DM2 con HbA1c 11 % y sin presión → No Controlado, 30 días (antes «Controlado»)', () => {
  const p = hosix.processRecords([fila({ CIE10_COD: 'E11', HBA1C: '11' })])[0];
  assert.strictEqual(p.estado_control, 'No Controlado'); assert.strictEqual(p.frecuencia_hearts, 30);
  assert.strictEqual(p.observations[0].estado_control, 'No Controlado');
});
step('K3-10: el estado se calcula de las cifras: la etiqueta ESTADO_CONTROL del archivo no manda', () => {
  const p = hosix.processRecords([fila({ CIE10_COD: 'I10', PA_SISTOLICA: '190', PA_DIASTOLICA: '110', ESTADO_CONTROL: 'Controlado' })])[0];
  assert.strictEqual(p.estado_control, 'No Controlado'); assert.strictEqual(p.observations[0].estado_control, 'No Controlado');
  const q = hosix.processRecords([fila({ CIE10_COD: 'I10', PA_SISTOLICA: '120', PA_DIASTOLICA: '70', ESTADO_CONTROL: 'No Controlado' })])[0];
  assert.strictEqual(q.estado_control, 'Controlado'); assert.strictEqual(q.frecuencia_hearts, 30, 'una sola medición no da 90 días');
});
step('K3-10: sin mediciones no hay observaciones ni «Controlado» (Sin Datos), aunque el archivo diga «Controlado»', () => {
  const p = hosix.processRecords([fila({ CIE10_COD: 'I10', ESTADO_CONTROL: 'Controlado' })])[0];
  assert.deepStrictEqual(p.observations, []); assert.strictEqual(p.estado_control, R.SIN_DATOS);
});
step('K3-10: el semáforo y las fechas de la fila salen de los módulos compartidos (cita futura verde; cita cumplida gris)', () => {
  const fut = hosix.processRecords([fila({ FEC_PROXIMA_CITA: ymd(20) })])[0];
  assert.strictEqual(fut.semaforo, 'green'); assert.strictEqual(fut.dias_restantes, 20); assert.strictEqual(fut.fecha_limite, ymd(20));
  const cum = hosix.processRecords([fila({ CIE10_COD: 'I10', PA_SISTOLICA: '120', PA_DIASTOLICA: '70', FEC_ULTIMA_ATENCION: ymd(-10), FEC_PROXIMA_CITA: ymd(-10) })])[0];
  assert.strictEqual(cum.semaforo, 'gray');
});
step('K3-10: sin nada que geocodificar el paciente queda sin coordenadas (no en un punto fijo)', () => {
  const p = hosix.processRecords([fila()])[0];
  assert.strictEqual(p.latitud, null); assert.strictEqual(p.longitud, null);
});

// T3-05 usa un contexto aislado sin HeartsEngine (como si el script no hubiera cargado en el navegador)
const SRC_HOSIX = fs.readFileSync(path.join(CLI, 'data', 'hosixParser.js'), 'utf8');
function cargarHosixEnNavegadorSimulado(extraWindow) {
  const win = Object.assign({ ReglasClinicas: R }, extraWindow || {});
  vm.runInNewContext(SRC_HOSIX, { window: win, console });
  return win;
}
console.log('\nT3-05 · sin respaldos «a prueba de todo»');
step('T3-05: si el motor clínico no cargó, processRecords lanza «Motor clínico no cargado» (no devuelve verde / Controlado)', () => {
  const win = cargarHosixEnNavegadorSimulado();
  assert.ok(win.HosixParser, 'el módulo debe cargar sin HeartsEngine');
  assert.throws(() => win.HosixParser.processRecords([{ DNI: '96000001', PACIENTE: 'x', CIE10_COD: 'I10' }]), /Motor clínico no cargado/);
  assert.throws(() => win.HosixParser.processRecords([]), /Motor clínico no cargado/);
});
step('T3-05: con el motor presente en window el parser lo usa; el respaldo del geocodificador es {lat:null, lng:null, matched:false}', () => {
  let visto = null;
  const win = cargarHosixEnNavegadorSimulado({ HeartsEngine: hearts, FechaLima: { hoy: () => '2026-11-04' } });
  const res = win.HosixParser.processRecords([{ DNI: '96000001', PACIENTE: 'x', DIRECCION: 'Jr. Prueba 1', CIE10_COD: 'I10', PA_SISTOLICA: '120', PA_DIASTOLICA: '70' }]);
  assert.strictEqual(res.length, 1); assert.strictEqual(res[0].latitud, null); assert.strictEqual(res[0].longitud, null);
  assert.strictEqual(res[0].observations[0].fecha_registro, '2026-11-04', 'usa FechaLima.hoy() para el control sin fecha');
  const win2 = cargarHosixEnNavegadorSimulado({ HeartsEngine: hearts, AncashGeocoder: { geocode: (d) => { visto = d; return { lat: -10.07, lng: -78.15, sector: 'Sector I', matched: true }; } } });
  const r2 = win2.HosixParser.processRecords([{ DNI: '96000001', PACIENTE: 'x', DIRECCION: 'Av. Prueba 2' }]);
  assert.strictEqual(visto, 'Av. Prueba 2'); assert.strictEqual(r2[0].latitud, -10.07); assert.strictEqual(r2[0].sector_sanitario, 'Sector I');
});
step('T3-05: hosixParser.js y heartsEngine.js ya no contienen el respaldo verde/Controlado ni coordenadas fijas', () => {
  const src = SRC_HOSIX.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/semaforo:\s*["']green["']/.test(src) && !/estado_control:\s*["']Controlado["']\s*\}\)/.test(src), 'respaldo verde/Controlado');
  assert.ok(!/-10\.0689|-78\.1524|matched:\s*true/.test(src), 'coordenadas fijas');
  assert.ok(!/window\.FechaLima\.hoy\(\)/.test(src), 'no debe depender de window a nivel de módulo');
});

// ---------------------------------------------------------------------------------------------------------------
console.log('\nK3-11 · indicadoresConvenio.js (solo documentación)');
step('K3-11: la cabecera dice que «atendido» es un control O un examen, y deja las definiciones como [PENDIENTE: …]', () => {
  const src = fs.readFileSync(path.join(CLI, 'clinical', 'indicadoresConvenio.js'), 'utf8');
  const cabecera = src.slice(0, src.indexOf('(function (root, factory)'));
  assert.ok(/control O un examen|un control o un examen/i.test(cabecera), 'la cabecera debe describir el cálculo real');
  assert.ok(!/Atendido" = paciente con al menos un control con fecha dentro del periodo en los datos del prototipo\./.test(cabecera), 'queda la definición antigua');
  const pend = cabecera.match(/\[PENDIENTE:[^\]]+\]/g) || [];
  assert.ok(pend.length >= 4, 'se esperan 4 [PENDIENTE: …] y hay ' + pend.length);
  assert.ok(/I15\.0/.test(cabecera) && /Anexo 04/.test(cabecera) && /pas_/.test(cabecera) && /denominador/i.test(cabecera));
});

// ---- Integración de la Fase 4b: cortes de riesgo y LDL en REGLAS, alto riesgo coherente con la meta de PA, cita de HOSIX ----
step('K3-09/P6: los cortes de riesgo CV y las metas de LDL salen de REGLAS (no de números sueltos)', () => {
  assert.strictEqual(R.REGLAS.RIESGO_CV_CORTES.alto, 10); assert.strictEqual(R.REGLAS.LDL_META.altoRiesgo, 70);
  const src = fs.readFileSync(path.join(CLI, 'clinical/padronCalculadora.js'), 'utf8');
  assert.ok(!/corteLdl\s*=\s*altoRiesgoCv\s*\?\s*70/.test(src), 'LDL 70/100 escrito en padronCalculadora.js');
  assert.ok(!/riesgoNum\s*>=\s*20\b/.test(src), 'corte 20 % escrito en padronCalculadora.js');
});
step('un diabético con riesgo numérico bajo es de alto riesgo (misma regla que la meta de PA) y su LDL se mide con la meta de alto riesgo', () => {
  const r = calc.calcularPadron({ cie10_dm: 'E11', riesgo_cv_porcentaje: '7', colesterol_ldl: '85' });
  assert.strictEqual(r.alto_riesgo_cv, 'Sí'); assert.strictEqual(r.ldl_en_meta, 'No');
  assert.ok(/130/.test(r.meta_presion), r.meta_presion);
});
step('sin diabetes, ERC, ECV ni riesgo ≥ 10 %, el LDL 85 está en meta (< 100) y el alto riesgo es «No»', () => {
  const r = calc.calcularPadron({ cie10_hta: 'I10', riesgo_cv_porcentaje: '7', colesterol_ldl: '85' });
  assert.strictEqual(r.alto_riesgo_cv, 'No'); assert.strictEqual(r.ldl_en_meta, 'Sí');
});
step('K3-10: el CSV de HOSIX sin próxima cita NO agenda la fecha de la última atención como cita «booked»', () => {
  const hoy = R.aTexto(new Date());
  const [sinProxima] = hosix.processRecords([{ DNI: '96000041', PACIENTE: 'prueba', CIE10_COD: 'I10', FEC_ULTIMA_ATENCION: hoy }]);
  assert.deepStrictEqual(sinProxima.appointments, []);
  const [conProxima] = hosix.processRecords([{ DNI: '96000042', PACIENTE: 'prueba', CIE10_COD: 'I10', FEC_ULTIMA_ATENCION: hoy, FEC_PROXIMA_CITA: R.sumarDias(hoy, 30) }]);
  assert.strictEqual(conProxima.appointments.length, 1); assert.strictEqual(conProxima.appointments[0].fecha_cita, R.sumarDias(hoy, 30));
});

console.log(`\nResultado Clínico F3: ${passed} correctas, ${failed} con falla`);
process.exit(failed ? 1 : 0);
