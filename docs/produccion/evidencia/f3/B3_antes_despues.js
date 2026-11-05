// Evidencia Fase 3 (B3) — valores por defecto de Registro Clínico: guardar una atención SIN tocar los campos y comparar al paciente en el
// servidor antes y después. Interfaz real (Chromium). Solo datos inventados y la semilla de 20 pacientes simulados.
'use strict';
const { chromium } = require('playwright');
const C = require('./B0_comun');
const U = require('./B0_ui');
const { api, H, resumen, sleep, fila } = C;

const p = (s = '') => console.log(s);
const clave = process.env.CLAVE_USUARIOS;
const IGNORAR = new Set(['ultima_modificacion_fecha', 'ultima_modificacion_por', 'semaforo', 'dias_restantes', 'dias_vencido', 'fecha_limite', 'consentimiento_fecha', 'consentimiento_registrado_por', 'puerta_entrada']);
const ANIDADOS = ['observations', 'appointments', 'conditions', 'diagnosticos', 'medications'];
const vacio = v => v === undefined || v === null || v === '';
const j = v => JSON.stringify(v);

async function indicadores(A) {
  const r = await api('GET', '/api/indicadores/convenio', A);
  const h = r.json && r.json.total && r.json.total.control_definiciones && r.json.total.control_definiciones.hearts;
  return h ? `HEARTS control: ${h.numerador}/${h.denominador} (${h.porcentaje} %)` : 'sin datos';
}

async function paciente(A, doc) {
  const r = await api('GET', '/api/cronicos?q=' + encodeURIComponent(doc), A);
  return (r.json || []).find(x => String(x.dni) === doc) || null;
}

/** Compara dos versiones del paciente y lo imprime separando: campos que no existían, campos que cambiaron y listas. */
function comparar(antes, despues) {
  const nuevos = [], cambiados = [];
  const claves = new Set([...Object.keys(antes || {}), ...Object.keys(despues || {})]);
  for (const k of [...claves].sort()) {
    if (IGNORAR.has(k) || ANIDADOS.includes(k) || k.startsWith('_')) continue;
    const a = antes ? antes[k] : undefined, d = despues[k];
    if (j(a) === j(d)) continue;
    if (vacio(a) && !vacio(d)) nuevos.push(`${k} = ${resumen(j(d), 60)}`);
    else if (!vacio(a) && !vacio(d)) cambiados.push(`${k}: ${resumen(j(a), 36)} → ${resumen(j(d), 36)}`);
  }
  p('    Campos que ANTES estaban vacíos o no existían y ahora tienen valor:');
  p('      ' + (nuevos.length ? nuevos.join('\n      ') : '(ninguno)'));
  p('    Campos que tenían un valor y ahora tienen OTRO:');
  p('      ' + (cambiados.length ? cambiados.join('\n      ') : '(ninguno)'));
  p(`    red: ${antes ? antes.red_salud : '∅'} → ${despues.red_salud} · establecimiento: ${antes ? antes.puerta_entrada_id : '∅'} → ${despues.puerta_entrada_id}`);
  p(`    semáforo (servidor): ${antes ? antes.semaforo : '∅'} → ${despues.semaforo} · fallecido: ${antes ? antes.fallecido : '∅'} → ${despues.fallecido} · estado_paciente: ${antes ? antes.estado_paciente : '∅'} → ${despues.estado_paciente}`);
  for (const k of ['observations', 'appointments', 'conditions', 'diagnosticos']) {
    const a = (antes && antes[k]) || [], d = despues[k] || [];
    const f = x => j(x.map(e => (typeof e === 'object' ? Object.fromEntries(Object.entries(e).filter(([c]) => !['id', 'patient_id'].includes(c))) : e)));
    if (f(a) === f(d)) { p(`    ${k}: sin cambios (${a.length})`); continue; }
    p(`    ${k}: ${a.length} → ${d.length}`);
    const previos = new Set(a.map(x => f([x])));
    const posteriores = new Set(d.map(x => f([x])));
    d.filter(x => !previos.has(f([x]))).forEach(x => p(`        nuevo/cambiado: ${resumen(f([x]), 150)}`));
    if (k === 'conditions') a.filter(x => !posteriores.has(f([x]))).forEach(x => p(`        ANTES era:      ${resumen(f([x]), 150)}`));
  }
}

/** Abre el paciente en el formulario, no toca nada salvo el consentimiento (si lo pregunta) y guarda. */
async function guardarSinTocar(browser, A, usuario, claveUsuario, doc, titulo, antesDeGuardar) {
  p(`\n### ${titulo}`);
  const antes = await paciente(A, doc);
  const { ctx, page } = await U.abrir(browser, usuario, claveUsuario);
  const c = await U.buscar(page, doc);
  p(`    pantalla: ${resumen(c.alerta, 80)}`);
  p(`    precargado en el formulario: sexo=«${c.sexo}» seguro=«${c.seguro}» sector=«${c.sector}» EESS-control=«${resumen(c.ctrl, 26)}» dx-confirmado=«${c.dxc}» ECV=«${c.ecv}» estatina=«${c.estatina}» AAS=«${c.aas}» meses=«${c.meses}» estado=«${c.estadoP}» PAS/PAD=«${c.pas}/${c.pad}» próxima cita=«${c.prox}» consentimiento=${c.consentVisible ? 'pregunta' : c.consent}`);
  if (antesDeGuardar) await antesDeGuardar(page, c);
  await U.responderConsentimiento(page, 'No');
  const msg = await U.guardar(page);
  p(`    al Guardar: «${resumen(msg, 130)}»`);
  const despues = await paciente(A, doc);
  comparar(antes, despues);
  await ctx.close();
  return { antes, despues, c };
}

(async () => {
  p('# B3 — Valores por defecto de Registro Clínico: guardar sin tocar y comparar en el servidor (Fase 3)');
  p(`Servidor ${C.BASE} · ${new Date().toISOString()} · fecha de hoy en el servidor: ${new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10)} (Lima)`);
  const A = await C.preparar();
  const browser = await chromium.launch();

  // D1 — paciente con datos incompletos, guardar sin tocar
  const d1 = await guardarSinTocar(browser, A, 'f3.coord.ps', clave, '96400001', 'D1 Paciente con DATOS INCOMPLETOS (sin sexo, seguro, sector, diagnóstico, medicación, controles ni citas): se guarda sin tocar nada');
  // D1b — solo HbA1c, sin presión
  await guardarSinTocar(browser, A, 'f3.coord.ps', clave, '96400007', 'D1b Paciente incompleto: el usuario solo anota una HbA1c de 9,5 % y NO mide la presión (PAS/PAD vacías)', async page => { await page.fill('#reg-hba1c', '9.5'); });
  // D2 — semilla con un control previo
  await guardarSinTocar(browser, A, 'f3.coord.ps', clave, '10000001', 'D2 Semilla 10000001 (HTA, control previo 120/75 del 15-oct): se guarda sin tocar nada');
  // D3 — fallecido
  await guardarSinTocar(browser, A, 'f3.coord.ps', clave, '10000006', 'D3 Semilla 10000006 (FALLECIDO, infarto antiguo): se guarda sin tocar nada');
  // D4 — enfermedad cardiovascular previa
  await guardarSinTocar(browser, A, 'f3.coord.ps', clave, '96400005', 'D4 Paciente con infarto previo (I25.2) y SIN el campo «enfermedad cardiovascular previa»: se guarda sin tocar nada');
  // D6 — meses de medicación = 0
  await guardarSinTocar(browser, A, 'f3.coord.ps', clave, '10000018', 'D6 Semilla 10000018 (deserción, 0 meses de medicación, cita incumplida): se guarda sin tocar nada');

  // D5 — sexo guardado como M/F
  p('\n### D5 Sexo guardado como «F» (HOSIX/FHIR y la semilla usan M/F; Excel y el formulario usan Femenino/Masculino): TFGe con creatinina 1,0 mg/dl');
  {
    const { ctx, page } = await U.abrir(browser, 'f3.coord.ps', clave);
    let c = await U.buscar(page, '10000002');
    p(`    10000002 (mujer de 64 años, sexo guardado «F»): el selector de sexo muestra «${c.sexo}» (vacío = ninguna opción coincide)`);
    await page.fill('#reg-creatinina', '1.0');
    await sleep(200);
    c = await U.leer(page);
    p(`    con creatinina 1,0 y el sexo en blanco → TFGe ${c.tfge} · ${c.estadioErc}`);
    await page.selectOption('#reg-sexo', 'Femenino');
    await sleep(200);
    c = await U.leer(page);
    p(`    eligiendo «Femenino» a mano → TFGe ${c.tfge} · ${c.estadioErc}`);
    await ctx.close();
  }

  // D8 — qué control se precarga cuando hay dos (el más antiguo primero)
  p('\n### D8 Paciente con dos controles guardados en orden cronológico (1-jun 150/95 y 1-oct 118/74): ¿cuál se precarga en «PAS/PAD de hoy»?');
  {
    const { ctx, page } = await U.abrir(browser, 'f3.coord.ps', clave);
    const c = await U.buscar(page, '96400004');
    const pac = await paciente(A, '96400004');
    p(`    el servidor entrega observations = ${j((pac.observations || []).map(o => `${o.fecha_registro}: ${o.pa_sistolica}/${o.pa_diastolica}`))}`);
    p(`    el formulario precarga PAS/PAD de hoy = ${c.pas}/${c.pad}  (último control real: 118/74 del 2026-10-01)`);
    await ctx.close();
  }

  // D8b — guardar sin tocar al paciente con dos controles: el valor precargado es el MÁS ANTIGUO y queda como medición de hoy
  const indAntes = await indicadores(A);
  await guardarSinTocar(browser, A, 'f3.coord.ps', clave, '96400004', 'D8b Mismo paciente (dos controles: 1-jun 150/95 y 1-oct 118/74): se guarda sin tocar nada');
  p(`    indicador antes: ${indAntes} · después: ${await indicadores(A)}  (el último control del año pasó de 118/74 a 150/95 con fecha de hoy)`);

  // D10 — diagnósticos: fecha y nombre
  await guardarSinTocar(browser, A, 'f3.coord.ps', clave, '96400009', 'D10 Paciente con HTA y diabetes tipo 1 (E10), diagnosticados el 1-mar-2019: se guarda sin tocar nada');

  // D11 — el ADMIN guarda sin tocar a un paciente de OTRA red: ¿se mueve de red por el EESS por defecto?
  await guardarSinTocar(browser, A, 'admin', process.env.ADMIN_PASSWORD, '96310001', 'D11 El ADMIN guarda sin tocar nada a un paciente de PACIFICO NORTE (sin establecimiento guardado)');

  // D7 — lista desactualizada: un colega creó el paciente después de que este usuario inició sesión
  p('\n### D7 Lista desactualizada: otro usuario creó al paciente DESPUÉS de que éste inició sesión; al escribir el documento sale «Paciente Nuevo»');
  {
    const { ctx, page } = await U.abrir(browser, 'f3.coord.ps', clave);
    const stale = fila('96400006', 'DNI', 'PACIENTE INVENTADO CREADO POR UN COLEGA', {
      sexo: 'Masculino', seguro_salud: 'EsSalud', sector: 'Puerto Huarmey', sector_sanitario: 'Puerto Huarmey', telefono: '943000006',
      establecimiento_adscripcion: 'P. S. Puerto Huarmey (00001742, I-2)', establecimiento_control: 'P. S. Puerto Huarmey (00001742, I-2)',
      estatina: 'Sí', aspirina_aas: 'Sí', meses_medicacion: '3', dx_confirmado: 'En estudio', enfermedad_cardiovascular: 'Sí (infarto, angina, ACV, arteriopatía periférica)',
      tratamiento_dm: 'Metformina 850 mg c/12h', riesgo_cv_porcentaje: '22',
      conditions: [{ cie10_cod: 'I10', diagnostico: 'Hipertensión Arterial' }, { cie10_cod: 'E11', diagnostico: 'Diabetes Mellitus Tipo 2' }]
    });
    const crea = await api('POST', '/api/padron/importar-lote', A, { patients: [stale] });
    p(`    el colega lo crea por otra vía: ${crea.status}`);
    const antes = await paciente(A, '96400006');
    const c = await U.buscar(page, '96400006');
    p(`    pantalla del usuario con la lista vieja: «${resumen(c.alerta, 60)}»`);
    await U.llenarNuevo(page, 'PACIENTE INVENTADO CREADO POR UN COLEGA');
    const msg = await U.guardar(page);
    p(`    al Guardar: «${resumen(msg, 110)}»`);
    const despues = await paciente(A, '96400006');
    comparar(antes, despues);
    await ctx.close();
  }

  // D9 — dos sesiones: la segunda tiene la lista vieja
  p('\n### D9 Dos usuarios: A (lista vieja) y B guardan una atención del mismo paciente (10000011); ¿se conserva la de B?');
  {
    const a = await U.abrir(browser, 'f3.coord.ps', clave);        // A inicia sesión primero (su lista queda fija)
    const b = await U.abrir(browser, 'admin', process.env.ADMIN_PASSWORD);
    await U.buscar(b.page, '10000011');
    await U.responderConsentimiento(b.page, 'No');
    await b.page.fill('#reg-pas-hoy', '111'); await b.page.fill('#reg-pad-hoy', '71');
    p(`    B guarda PAS/PAD 111/71: «${resumen(await U.guardar(b.page), 70)}»`);
    p(`    servidor tras B: ${j((await paciente(A, '10000011')).observations.map(o => `${o.fecha_registro}: ${o.pa_sistolica}/${o.pa_diastolica}`))}`);
    await U.buscar(a.page, '10000011');
    await U.responderConsentimiento(a.page, 'No');
    await a.page.fill('#reg-pas-hoy', '133'); await a.page.fill('#reg-pad-hoy', '83');
    p(`    A (con la lista vieja, sin la atención de B) guarda PAS/PAD 133/83: «${resumen(await U.guardar(a.page), 70)}»`);
    const fin = await paciente(A, '10000011');
    p(`    servidor al final: ${j(fin.observations.map(o => `${o.fecha_registro}: ${o.pa_sistolica}/${o.pa_diastolica}`))}`);
    p(`    ¿sigue la atención de B (111/71)? ${fin.observations.some(o => o.pa_sistolica === 111) ? 'sí' : 'NO: fue sobrescrita por la de A (mismo id de control por posición)'}`);
    await a.ctx.close(); await b.ctx.close();
  }

  await browser.close();
  p('\nFin de B3.');
})().catch(e => { console.log('ERROR B3:', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e); process.exit(1); });
