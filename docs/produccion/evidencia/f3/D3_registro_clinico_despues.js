// Evidencia Fase 3 (D3) — correcciones del formulario del Registro Clínico y de la precarga por documento (agente R2).
// Casos: P3-01, P3-02, P3-03, P3-04/K3-01, P3-05, P3-07, P3-08/K3-04, P3-10, P3-14, T3-04, T3-05, C3-02 (reiniciar) y la etiqueta «Categoría de TFGe».
// Cada comprobación sale como OK o FALLA contra el servidor REAL (se consulta /api/cronicos antes y después de guardar), con Chromium real.
// Solo datos inventados (documentos 96…) y la semilla de 20 pacientes simulados. El servidor se levanta aquí mismo en el puerto 3275,
// con una carpeta temporal (nunca server/db/) y claves al azar generadas en memoria: no se escriben en ningún archivo y la salida las oculta (***).
//
// Se corre dos veces: con el navegador en UTC y con timezoneId «America/Lima». El reloj del navegador se fija a las 23:30 del 5-nov-2026 en Lima
// (04:30 UTC del día 6) para que la fecha UTC y la de Lima NO coincidan y T3-04 se vea siempre, a cualquier hora en que se corra.
// Uso:  node D3_registro_clinico_despues.js            (salida estándar; el lanzador del README la guarda en out_D3_registro_clinico_despues.txt)
'use strict';
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = process.env.D3_PORT || '3275';
process.env.BASE = 'http://127.0.0.1:' + PORT;                       // antes de cargar B0_comun (lee BASE al cargarse)
const SECRETOS = {
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || ('Prueba-D3-' + crypto.randomBytes(8).toString('hex')),
  AUTH_SECRET: process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex'),
  CLAVE_USUARIOS: process.env.CLAVE_USUARIOS || ('Usr-D3-' + crypto.randomBytes(8).toString('hex'))
};
Object.assign(process.env, SECRETOS);

const { chromium } = require('playwright');
const C = require('./B0_comun');
const { api, H, LV, fila, resumen } = C;
const RAIZ = path.resolve(__dirname, '../../../..');
const FIJO = '2026-11-06T04:30:00Z';                                  // 23:30 del 5-nov-2026 en Lima
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- salida (sin claves) ----------
const ocultar = s => Object.values(SECRETOS).reduce((t, v) => t.split(v).join('***'), String(s));
const p = (s = '') => console.log(ocultar(s));
let nOK = 0, nFalla = 0; const fallas = [];
let corridaActual = '';
function chk(id, cond, detalle) {
  const ok = !!cond;
  if (ok) nOK++; else { nFalla++; fallas.push(corridaActual + ' · ' + id); }
  p(`  [${ok ? 'OK   ' : 'FALLA'}] ${id}${detalle ? ' — ' + detalle : ''}`);
  return ok;
}
const info = s => p('  [INFO ] ' + s);
async function prueba(titulo, fn) {
  p('\n### ' + titulo);
  try { await fn(); } catch (e) { chk(titulo + ' [error del script]', false, String((e && e.message) || e).split('\n')[0].slice(0, 200)); }
}

// ---------- servidor ----------
function levantarServidor() {
  const datos = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'd3-datos-'));
  const env = Object.assign({}, process.env, { DATA_DIR: datos, PORT, NODE_ENV: 'production', ADMIN_USER: 'admin' });
  const proc = spawn(process.execPath, [path.join(RAIZ, 'server/server.js')], { env, stdio: 'ignore' });
  return (async () => {
    let listo = false;
    for (let i = 0; i < 80 && !listo; i++) { try { const r = await fetch(process.env.BASE + '/health'); listo = r.ok; } catch (e) { /* aún no */ } if (!listo) await sleep(200); }
    if (!listo) { try { proc.kill(); } catch (e) { /* nada */ } throw new Error('El servidor de prueba no respondió en el puerto ' + PORT + ' (¿puerto ocupado?)'); }
    return { proc, datos, parar() { try { proc.kill(); } catch (e) { /* ya cerrado */ } try { fs.rmSync(datos, { recursive: true, force: true }); } catch (e) { /* nada */ } } };
  })();
}

// ---------- pacientes extra de esta prueba ----------
const SIN_CONTROLES = { observations: [], appointments: [] };
function extras() {
  const meses = { pas_jul: 122, pad_jul: 78, pas_ago: 124, pad_ago: 79, pas_set: 121, pad_set: 76 };
  return [
    // HTA con tres controles mensuales en meta (jul, ago, set) y sin cita: «controlado y estable» si hoy también está en meta
    fila('96500001', 'DNI', 'PACIENTE INVENTADO ESTABLE TRES CONTROLES', Object.assign({}, SIN_CONTROLES, meses)),
    // Atendido en un establecimiento que el selector de 4 no ofrecía (Culebras, 00001743)
    fila('96500002', 'DNI', 'PACIENTE INVENTADO CULEBRAS', Object.assign({}, SIN_CONTROLES, {
      establecimiento_adscripcion: 'P. S. Culebras (00001743, I-2)', establecimiento_control: 'P. S. Culebras (00001743, I-2)',
      sector: 'Culebras', sector_sanitario: 'Culebras'
    }))
  ];
}

// ---------- ayudas de navegador ----------
async function abrir(browser, usuario, clave, opciones) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1366, height: 900 } }, opciones || {}));
  await ctx.clock.setFixedTime(new Date(FIJO));
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  page.dialogos = []; page.posts = []; page.errores = [];
  page.on('dialog', d => { page.dialogos.push(d.message()); d.accept().catch(() => { }); });
  page.on('pageerror', e => page.errores.push(String(e.message).slice(0, 140)));
  page.on('request', r => {
    if (r.method() === 'POST' && r.url().includes('/api/padron/importar-lote')) { try { page.posts.push(JSON.parse(r.postData())); } catch (e) { /* sin cuerpo */ } }
  });
  await page.goto(C.BASE + '/');
  await page.waitForSelector('#login-overlay.active');
  await page.fill('#login-username', usuario);
  await page.fill('#login-password', clave);
  await page.click('#login-submit');
  await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active'));
  await sleep(1400);
  return { ctx, page };
}

const leer = page => page.evaluate(() => {
  const g = id => { const e = document.getElementById(id); return e ? e.value : null; };
  const t = id => { const e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
  const vis = id => { const e = document.getElementById(id); if (!e) return false; const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0; };
  const nEess = id => { const e = document.getElementById(id); return e ? Array.from(e.options).filter(o => /\(\d{8}\b/.test(o.value)).length : null; };
  const al = document.getElementById('reg-dni-status-alert');
  return {
    alerta: al && al.style.display !== 'none' ? al.textContent.replace(/\s+/g, ' ').trim() : '',
    tipoDoc: g('reg-tipo-documento'), sexo: g('reg-sexo'), seguro: g('reg-seguro-salud'), sector: g('reg-sector'), ads: g('reg-eess-adscripcion'), ctrl: g('reg-eess-control'),
    dxc: g('reg-dx-confirmado'), ecv: g('reg-enfermedad-cv'), estatina: g('reg-estatina'), aas: g('reg-aspirina'), meses: g('reg-meses-medicacion'),
    estadoP: g('reg-estado-paciente'), pas: g('reg-pas-hoy'), pad: g('reg-pad-hoy'), hba1c: g('reg-hba1c'), glucosa: g('reg-glucosa'),
    prox: g('reg-proxima-cita'), proxDisabled: (document.getElementById('reg-proxima-cita') || {}).disabled === true,
    fechaAt: g('reg-fecha-atencion'), mes: g('reg-mes-control'), direccion: g('reg-direccion'),
    pista: t('reg-pista-ultimo-control'), pistaCita: t('reg-pista-proxima-cita'),
    liveEstado: t('live-estado-control'), liveAviso: vis('live-aviso-cita') ? t('live-aviso-cita') : '',
    liveMeta: t('live-meta-presion'), livePaBadge: t('live-pa-meta-badge'), liveTfge: t('live-tfge'), liveErc: t('live-estadio-erc'),
    liveEstadoCita: t('live-estado-cita'), liveSem: t('live-semaforo-pill'), liveDias: t('live-dias-atraso'),
    nEessCtrl: nEess('reg-eess-control'), nEessAds: nEess('reg-eess-adscripcion'),
    consentVisible: vis('reg-field-consentimiento')
  };
});

async function esperarBusqueda(page) {
  for (let i = 0; i < 80; i++) {
    const t = await page.evaluate(() => { const a = document.getElementById('reg-dni-status-alert'); return a && a.style.display !== 'none' ? a.textContent : ''; });
    if (/Encontrado|Nuevo|Ingrese/.test(t)) break;
    await sleep(100);
  }
  await sleep(350);
}
async function abrirModal(page, doc, usarEnter) {
  await page.evaluate(() => window.RegistroClinicoModal.open());
  await sleep(250);
  if (doc) {
    await page.fill('#reg-input-dni', doc);
    if (usarEnter) await page.press('#reg-input-dni', 'Enter');
    await esperarBusqueda(page);
  }
}
async function responderConsentimiento(page, valor) {
  if (await page.$eval('#reg-field-consentimiento', e => getComputedStyle(e).display !== 'none').catch(() => false)) await page.selectOption('#reg-consentimiento', valor || 'No');
}
async function guardar(page) {
  const n0 = page.dialogos.length; page.posts.length = 0;
  await page.click('#reg-btn-guardar');
  for (let i = 0; i < 60 && page.dialogos.length === n0; i++) await sleep(150);
  await sleep(400);
  const cuerpo = page.posts.length ? page.posts[page.posts.length - 1] : null;
  return { msg: page.dialogos.slice(n0).join(' | '), body: cuerpo && cuerpo.patients && cuerpo.patients[0] };
}
async function nuevo(page, doc, o = {}) {
  await abrirModal(page, doc);
  await page.fill('#reg-apellidos-nombres', 'PACIENTE INVENTADO ' + doc);
  await page.fill('#reg-fecha-nacimiento', o.nacimiento || '1960-05-10');
  await page.fill('#reg-direccion', o.direccion || 'Jr. Prueba 300 Huarmey');
  await page.selectOption('#reg-consentimiento', 'No');
  if (o.sexo) await page.selectOption('#reg-sexo', o.sexo);
  if (o.hta) await page.fill('#reg-cie10-hta', o.hta);
  if (o.dm) await page.fill('#reg-cie10-dm', o.dm);
  if (o.pas) await page.fill('#reg-pas-hoy', String(o.pas));
  if (o.pad) await page.fill('#reg-pad-hoy', String(o.pad));
  if (o.hba1c) await page.fill('#reg-hba1c', String(o.hba1c));
  await sleep(400);
}
const hoyLima = (page, n) => page.evaluate(d => window.FechaLima.hoy(d), n || 0);
const vacios = o => {
  const r = [];
  const mirar = (obj, pre) => { for (const [k, v] of Object.entries(obj || {})) { if (v === '' || v === null || v === undefined) r.push(pre + k); } };
  mirar(o, '');
  ['observations', 'appointments', 'conditions'].forEach(l => (o && o[l] || []).forEach((e, i) => mirar(e, l + '[' + i + '].')));
  return r;
};
const resumenObs = l => (l || []).map(o => `${o.fecha_registro}:${o.pa_sistolica}/${o.pa_diastolica}${o.hba1c ? ' hb' + o.hba1c : ''}${o.estado_control ? ' ' + o.estado_control : ''}`);

(async () => {
  const modo = [
    { nombre: 'navegador en UTC', opciones: {}, lima: false },
    { nombre: "navegador con timezoneId 'America/Lima'", opciones: { timezoneId: 'America/Lima' }, lima: true }
  ];
  p('# D3 — Registro Clínico y precarga por documento: comprobaciones contra el servidor real (Fase 3, agente R2)');
  p(`Servidor ${C.BASE} (carpeta temporal) · reloj del navegador fijado en ${FIJO} (23:30 del 5-nov-2026 en Lima) · Chromium ${chromium.name()}`);
  for (const m of modo) {
    const n0 = nOK, f0 = nFalla;
    corridaActual = m.nombre;
    p('\n==================================================================================================');
    p('CORRIDA: ' + m.nombre);
    p('==================================================================================================');
    const srv = await levantarServidor();
    let browser;
    try {
      const A = await C.preparar();
      const imp = await api('POST', '/api/padron/importar-lote', A, { patients: extras() });
      if (imp.status !== 200) throw new Error('No se sembraron los pacientes extra (código ' + imp.status + ' ' + imp.text.slice(0, 160) + ')');
      browser = await chromium.launch();
      await correr(browser, A, m);
    } catch (e) {
      chk('preparación de la corrida', false, String((e && e.message) || e).split('\n')[0].slice(0, 220));
    } finally {
      if (browser) await browser.close().catch(() => { });
      srv.parar();
    }
    p(`\nResumen de la corrida «${m.nombre}»: ${nOK - n0} OK · ${nFalla - f0} FALLA`);
  }
  p('\n==================================================================================================');
  p(`RESUMEN TOTAL: ${nOK} comprobaciones OK · ${nFalla} FALLA · ${nOK + nFalla} en total`);
  if (fallas.length) { p('Con FALLA:'); fallas.forEach(f => p('  - ' + f)); }
  process.exit(nFalla ? 1 : 0);
})().catch(e => { p('ERROR D3: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); process.exit(2); });

async function correr(browser, A, m) {
  const paciente = async doc => ((await api('GET', '/api/cronicos', A)).json || []).find(x => String(x.dni) === doc) || null;
  const hearts = async () => { const r = await api('GET', '/api/indicadores/convenio', A); const h = r.json && r.json.total && r.json.total.control_definiciones && r.json.total.control_definiciones.hearts; return h ? `${h.numerador}/${h.denominador}` : 'sin datos'; };
  const { ctx, page } = await abrir(browser, 'admin', SECRETOS.ADMIN_PASSWORD, m.opciones);
  const hoy = await hoyLima(page, 0);
  info(`hoy (Lima) según el navegador = ${hoy} · hoy+30 = ${await hoyLima(page, 30)} · hoy+90 = ${await hoyLima(page, 90)} · zona del navegador: ${await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)}`);

  // ------------------------------------------------------------------------------------------------------------------------------
  await prueba('P3-01 · el control anterior NO se copia como la medición de hoy (semilla 10000001: último control 120/75 del 15-oct)', async () => {
    await abrirModal(page, '10000001');
    let c = await leer(page);
    chk('P3-01.a PAS, PAD, HbA1c y glucosa de hoy empiezan vacíos', c.pas === '' && c.pad === '' && c.hba1c === '' && c.glucosa === '', `PAS/PAD=«${c.pas}/${c.pad}» HbA1c=«${c.hba1c}» glucosa=«${c.glucosa}»`);
    chk('P3-01.b el último control se muestra como pista (no en el campo)', /Último control: 120\/75/.test(c.pista || '') && /15-oct/.test(c.pista || ''), `pista=«${c.pista}»`);
    const antes = await paciente('10000001');
    await responderConsentimiento(page, 'No');
    const r = await guardar(page);
    const despues = await paciente('10000001');
    chk('P3-01.c guardar sin tocar no agrega ninguna observación', (despues.observations || []).length === (antes.observations || []).length, `controles ${resumenObs(antes.observations)} → ${resumenObs(despues.observations)}`);
    chk('P3-01.d el servidor conserva la PA raíz (120/75) y la fecha del último control', despues.pa_sistolica === antes.pa_sistolica && despues.pa_diastolica === antes.pa_diastolica, `PA raíz ${antes.pa_sistolica}/${antes.pa_diastolica} → ${despues.pa_sistolica}/${despues.pa_diastolica}`);
    chk('P3-01.e el cuerpo enviado no trae lista de observaciones', !(r.body && r.body.observations && r.body.observations.length), `claves enviadas: ${r.body ? Object.keys(r.body).length : 0}`);
  });

  await prueba('P3-01 · paciente con DOS controles guardados en orden cronológico (1-jun 150/95 y 1-oct 118/74): se guarda sin tocar', async () => {
    await abrirModal(page, '96400004');
    const c = await leer(page);
    chk('P3-01.f la pista muestra el control MÁS RECIENTE por fecha (118/74), no el primero de la lista', /118\/74/.test(c.pista || '') && !/150\/95/.test(c.pista || ''), `pista=«${c.pista}»`);
    chk('P3-01.g PAS/PAD de hoy vacías', c.pas === '' && c.pad === '', `PAS/PAD=«${c.pas}/${c.pad}»`);
    const h0 = await hearts(); const antes = await paciente('96400004');
    await responderConsentimiento(page, 'No');
    await guardar(page);
    const h1 = await hearts(); const despues = await paciente('96400004');
    chk('P3-01.h el indicador HEARTS del convenio no cambia al guardar sin tocar', h0 === h1, `HEARTS ${h0} → ${h1}`);
    chk('P3-01.i las observaciones del paciente no cambian', JSON.stringify(resumenObs(antes.observations)) === JSON.stringify(resumenObs(despues.observations)), `${resumenObs(despues.observations).join(' | ')}`);
  });

  await prueba('P3-01 · cuando la persona SÍ anota un valor, se agrega UNA observación con la fecha de hoy (10000011, PA 111/71)', async () => {
    await abrirModal(page, '10000011');
    const antes = await paciente('10000011');
    await responderConsentimiento(page, 'No');
    await page.fill('#reg-pas-hoy', '111'); await page.fill('#reg-pad-hoy', '71'); await sleep(300);
    const c = await leer(page);
    const r = await guardar(page);
    const despues = await paciente('10000011');
    const nuevaObs = (despues.observations || []).find(o => o.fecha_registro === hoy && o.pa_sistolica === 111 && o.pa_diastolica === 71);
    chk('P3-01.j se guardó una observación nueva de hoy con 111/71', (despues.observations || []).length === (antes.observations || []).length + 1 && !!nuevaObs, `controles ${resumenObs(despues.observations).join(' | ')}`);
    chk('P3-01.k el estado guardado en la observación es el mismo que mostraba la pantalla', !!nuevaObs && !!c.liveEstado && c.liveEstado.includes(nuevaObs.estado_control), `pantalla=«${c.liveEstado}» · guardado=«${nuevaObs && nuevaObs.estado_control}»`);
    chk('P3-01.l no se enviaron cadenas vacías ni nulos', r.body && vacios(r.body).length === 0, `vacíos: ${r.body ? vacios(r.body).join(', ') || '(ninguno)' : 'sin cuerpo'}`);
  });

  // ------------------------------------------------------------------------------------------------------------------------------
  await prueba('P3-02 · el estado «Fallecido» se precarga y no vuelve a «Activo» (semilla 10000006)', async () => {
    await abrirModal(page, '10000006');
    const c = await leer(page);
    chk('P3-02.a el selector de estado muestra «Fallecido»', c.estadoP === 'Fallecido', `estado=«${c.estadoP}»`);
    chk('P3-02.b no se propone cita a un fallecido', c.prox === '' || c.proxDisabled, `próxima cita=«${c.prox}» deshabilitada=${c.proxDisabled}`);
    const antes = await paciente('10000006');
    await responderConsentimiento(page, 'No');
    const r = await guardar(page);
    const d = await paciente('10000006');
    chk('P3-02.c tras guardar sigue «Fallecido» (estado y bandera) y en negro', d.estado_paciente === 'Fallecido' && d.fallecido === true && d.semaforo === 'black', `estado=«${d.estado_paciente}» fallecido=${d.fallecido} semáforo=${d.semaforo}`);
    chk('P3-02.d no se le programó ninguna cita ni control', (d.appointments || []).length === (antes.appointments || []).length && (d.observations || []).length === (antes.observations || []).length, `citas ${(antes.appointments || []).length}→${(d.appointments || []).length} · controles ${(antes.observations || []).length}→${(d.observations || []).length}`);
    chk('P3-02.e se envió estado_paciente «Fallecido» (y fallecido true)', r.body && r.body.estado_paciente === 'Fallecido' && r.body.fallecido === true, `enviado: estado=«${r.body && r.body.estado_paciente}» fallecido=${r.body && r.body.fallecido}`);
  });

  await prueba('P3-02 · un paciente NUEVO empieza «Activo»', async () => {
    await abrirModal(page, '96600001');
    const c = await leer(page);
    chk('P3-02.f el estado del paciente nuevo es «Activo»', c.estadoP === 'Activo', `estado=«${c.estadoP}»`);
  });

  // ------------------------------------------------------------------------------------------------------------------------------
  await prueba('P3-03 / K3-09 · lo que falta NO se guarda como dato', async () => {
    const CAMPOS = ['sexo', 'seguro', 'sector', 'ads', 'ctrl', 'dxc', 'ecv', 'estatina', 'aas', 'meses'];
    await abrirModal(page, '96600002');
    let c = await leer(page);
    const llenos = CAMPOS.filter(k => c[k] !== '');
    chk('P3-03.a paciente NUEVO: sexo, seguro, sector, EESS, dx confirmado, ECV, estatina, AAS y meses comienzan en blanco', llenos.length === 0, llenos.length ? 'con valor por omisión: ' + llenos.map(k => `${k}=«${resumen(c[k], 24)}»`).join(', ') : 'todos en blanco');

    await abrirModal(page, '96400001');
    c = await leer(page);
    const llenos2 = CAMPOS.filter(k => k !== 'ctrl' && c[k] !== '');
    chk('P3-03.b paciente EXISTENTE incompleto (96400001): se precargan solo los datos guardados', llenos2.length === 0, llenos2.length ? 'con valor inventado: ' + llenos2.map(k => `${k}=«${resumen(c[k], 24)}»`).join(', ') : 'los campos que faltan quedan en blanco');
    const antes = await paciente('96400001');
    await responderConsentimiento(page, 'No');
    const r = await guardar(page);
    const d = await paciente('96400001');
    const POR_OMISION = ['sexo', 'seguro_salud', 'dx_confirmado', 'enfermedad_cardiovascular', 'estatina', 'aspirina_aas', 'meses_medicacion', 'establecimiento_adscripcion', 'nivel_riesgo_cv', 'alto_riesgo_cv', 'medicacion_hasta'];
    const nuevos = POR_OMISION.filter(k => (antes[k] === undefined || antes[k] === null || antes[k] === '') && d[k] !== undefined && d[k] !== null && d[k] !== '');
    chk('P3-03.c guardar sin tocar al incompleto NO escribe sexo, seguro, dx, ECV, estatina, AAS, meses, riesgo ni «medicación hasta»', nuevos.length === 0, nuevos.length ? 'escribió: ' + nuevos.map(k => `${k}=«${resumen(d[k], 26)}»`).join(', ') : 'ninguno de los 11 campos quedó escrito');
    const enviados = r.body ? POR_OMISION.filter(k => k in r.body) : [];
    chk('P3-03.d el cuerpo enviado no lleva esos campos ni cadenas vacías', r.body && enviados.length === 0 && vacios(r.body).length === 0, `claves por omisión enviadas: ${enviados.join(', ') || '(ninguna)'} · vacíos: ${r.body ? vacios(r.body).join(', ') || '(ninguno)' : 'sin cuerpo'}`);

    await abrirModal(page, '96400005');
    c = await leer(page);
    chk('P3-03.e infarto previo (I25.2) sin el campo guardado: «Enfermedad cardiovascular» queda en blanco, no «No»', c.ecv === '', `ECV=«${c.ecv}»`);
    const a5 = await paciente('96400005');
    await responderConsentimiento(page, 'No');
    await guardar(page);
    const d5 = await paciente('96400005');
    chk('P3-03.f guardar sin tocar no escribe «No» como enfermedad cardiovascular ni riesgo «Bajo»', (d5.enfermedad_cardiovascular || '') === (a5.enfermedad_cardiovascular || '') && !/^Bajo/.test(d5.nivel_riesgo_cv || ''), `ECV=«${d5.enfermedad_cardiovascular || ''}» nivel de riesgo=«${d5.nivel_riesgo_cv || ''}»`);
  });

  await prueba('P3-03 · paciente NUEVO con lo mínimo: el cuerpo enviado solo tiene campos con valor', async () => {
    await nuevo(page, '96600003');
    const r = await guardar(page);
    const POR_OMISION = ['sexo', 'seguro_salud', 'dx_confirmado', 'enfermedad_cardiovascular', 'estatina', 'aspirina_aas', 'meses_medicacion', 'establecimiento_control', 'establecimiento_adscripcion', 'sector', 'nivel_riesgo_cv', 'alto_riesgo_cv', 'medicacion_hasta'];
    const enviados = r.body ? POR_OMISION.filter(k => k in r.body) : [];
    chk('P3-03.g no se envía ningún valor por omisión', r.body && enviados.length === 0, `enviados: ${enviados.join(', ') || '(ninguno)'}`);
    chk('P3-03.h no se envían cadenas vacías ni nulos', r.body && vacios(r.body).length === 0, `vacíos: ${r.body ? vacios(r.body).join(', ') || '(ninguno)' : 'sin cuerpo'}`);
    const d = await paciente('96600003');
    if (d) info(`lo que el SERVIDOR completa por su cuenta en un paciente nuevo sin esos datos: puerta_entrada_id=«${d.puerta_entrada_id}» sector_sanitario=«${d.sector_sanitario}» sexo=«${d.sexo === undefined ? '(sin dato)' : d.sexo}» seguro=«${d.seguro_salud === undefined ? '(sin dato)' : d.seguro_salud}» (el servidor NO exige ninguno de los campos que el formulario deja en blanco)`);
    chk('P3-03.i el paciente nuevo quedó guardado como «Activo», sin observaciones', !!d && d.estado_paciente === 'Activo' && (d.observations || []).length === 0, d ? `estado=«${d.estado_paciente}» controles=${(d.observations || []).length}` : 'no se guardó: ' + resumen(r.msg, 120));
  });

  // ------------------------------------------------------------------------------------------------------------------------------
  await prueba('P3-04 / K3-01 · el estado de control que se guarda sale de las mediciones y de la meta del paciente', async () => {
    const R = (med, campos) => page.evaluate(([a, b]) => window.ReglasClinicas.estadoControl(a, window.ReglasClinicas.perfilClinico(b)), [med, campos]);
    const DM = 'E11.9 – Diabetes mellitus tipo 2', HTA = 'I10 – Hipertensión esencial';

    // a) solo HbA1c 11 %
    await nuevo(page, '96000021', { dm: DM, hba1c: 11 });
    let c = await leer(page);
    let r = await guardar(page);
    let d = await paciente('96000021');
    const obs = d && d.observations && d.observations[0];
    chk('P3-04.a diabético con HbA1c 11 % y sin presión: se guarda «No Controlado»', !!obs && obs.estado_control === 'No Controlado', `guardado=«${obs && obs.estado_control}» · esperado por ReglasClinicas=«${await R({ hba1c: 11 }, { cie10_dm: DM })}»`);
    chk('P3-04.b la pantalla dice lo mismo que lo guardado', !!obs && !!c.liveEstado && c.liveEstado.includes('No Controlado'), `pantalla=«${c.liveEstado}»`);
    chk('P3-04.c la raíz del paciente tampoco queda «Controlado»', !!d && d.estado_control !== 'Controlado', `estado_control raíz=«${d && d.estado_control}»`);

    // b) sin ninguna medición
    await nuevo(page, '96000024', { dm: DM });
    c = await leer(page);
    r = await guardar(page);
    d = await paciente('96000024');
    chk('P3-04.d sin ninguna medición no se guarda observación ni etiqueta «Controlado»', !!d && (d.observations || []).length === 0 && d.estado_control !== 'Controlado', d ? `controles=${(d.observations || []).length} estado_control raíz=«${d.estado_control || ''}»` : 'no se guardó: ' + resumen(r.msg, 120));
    chk('P3-04.e la pantalla no muestra «Controlado» sin mediciones', !!c.liveEstado && !/^.*:\s*Controlado\b/.test(c.liveEstado), `pantalla=«${c.liveEstado}»`);

    // c) DM + HTA con 135/85 y HbA1c 6,5: meta 130/80 → fuera de meta
    await nuevo(page, '96000022', { dm: DM, hta: HTA, pas: 135, pad: 85, hba1c: 6.5 });
    c = await leer(page);
    r = await guardar(page);
    d = await paciente('96000022');
    const meta = await page.evaluate(() => window.ReglasClinicas.metaPA({ dm: true }).texto);
    chk('P3-04.f DM + HTA con 135/85: se guarda «No Controlado» (meta de diabético 130/80)', !!d && d.observations && d.observations[0] && d.observations[0].estado_control === 'No Controlado', `guardado=«${d && d.observations && d.observations[0] && d.observations[0].estado_control}» · esperado=«${await R({ pas: 135, pad: 85, hba1c: 6.5 }, { cie10_dm: DM, cie10_hta: HTA })}»`);
    chk('P3-04.g la pantalla usa la misma meta (ReglasClinicas.metaPA) y dice «fuera de meta»', (c.liveMeta || '').includes(meta) && /FUERA/.test(c.livePaBadge || ''), `meta en pantalla=«${c.liveMeta}» · esperada=«${meta}» · PA=«${c.livePaBadge}»`);

    // d) controlado de verdad
    await nuevo(page, '96000023', { dm: DM, hta: HTA, pas: 120, pad: 70, hba1c: 6.0 });
    c = await leer(page);
    r = await guardar(page);
    d = await paciente('96000023');
    chk('P3-04.h DM + HTA con 120/70 y HbA1c 6,0: se guarda «Controlado»', !!d && d.observations && d.observations[0] && d.observations[0].estado_control === 'Controlado' && /Controlado/.test(c.liveEstado || '') && !/No Controlado/.test(c.liveEstado || ''), `guardado=«${d && d.observations && d.observations[0] && d.observations[0].estado_control}» · pantalla=«${c.liveEstado}»`);
  });

  // ------------------------------------------------------------------------------------------------------------------------------
  await prueba('P3-05 · lista desactualizada: otro usuario creó al paciente después del inicio de sesión', async () => {
    const real = await page.evaluate(() => !!(window.app && typeof window.app.recargarPacientes === 'function'));
    if (real) info('window.app.recargarPacientes existe (la implementó main.js): se prueba la implementación real.');
    else {
      info('window.app.recargarPacientes NO existe todavía en main.js (agente C): se prueba el contrato del modal con un SUSTITUTO declarado (recarga /api/cronicos y llama setPatients).');
      await page.evaluate(() => {
        window.app.recargarPacientes = async function () {
          const r = await window.app.session.authFetch('/api/cronicos'); const l = await r.json();
          window.app.setPatients(Array.isArray(l) ? l : (l.data || []));
        };
      });
    }
    const colega = fila('96400006', 'DNI', 'PACIENTE INVENTADO CREADO POR UN COLEGA', {
      sexo: 'Masculino', seguro_salud: 'EsSalud', sector: 'Puerto Huarmey', sector_sanitario: 'Puerto Huarmey', telefono: '943000006',
      establecimiento_adscripcion: 'P. S. Puerto Huarmey (00001742, I-2)', establecimiento_control: 'P. S. Puerto Huarmey (00001742, I-2)',
      estatina: 'Sí', aspirina_aas: 'Sí', meses_medicacion: '3', dx_confirmado: 'En estudio', enfermedad_cardiovascular: 'Sí (infarto, angina, ACV, arteriopatía periférica)',
      tratamiento_dm: 'Metformina 850 mg c/12h', riesgo_cv_porcentaje: '22', consentimiento: 'No',
      conditions: [{ cie10_cod: 'I10', diagnostico: 'Hipertensión Arterial' }, { cie10_cod: 'E11', diagnostico: 'Diabetes Mellitus Tipo 2' }]
    });
    const crea = await api('POST', '/api/padron/importar-lote', A, { patients: [colega] });
    const antes = await paciente('96400006');
    chk('P3-05.0 (preparación) el colega creó el paciente por otra vía', crea.status === 200 && !!antes, `código ${crea.status}`);
    await abrirModal(page, '96400006');
    const c = await leer(page);
    chk('P3-05.a el formulario encuentra al paciente creado por otro (recarga la lista antes de decir «Nuevo»)', /Encontrado/.test(c.alerta), `pantalla=«${resumen(c.alerta, 70)}»`);
    chk('P3-05.b se precargan sus datos guardados (sexo, seguro, estatina, AAS, meses, ECV)', c.sexo === 'Masculino' && c.seguro === 'EsSalud' && c.estatina === 'Sí' && c.aas === 'Sí' && c.meses === '3' && /^Sí/.test(c.ecv), `sexo=«${c.sexo}» seguro=«${c.seguro}» estatina=«${c.estatina}» AAS=«${c.aas}» meses=«${c.meses}» ECV=«${resumen(c.ecv, 14)}»`);
    await responderConsentimiento(page, 'No');
    await guardar(page);
    const d = await paciente('96400006');
    const claves = ['sexo', 'seguro_salud', 'estatina', 'aspirina_aas', 'meses_medicacion', 'enfermedad_cardiovascular', 'establecimiento_control', 'establecimiento_adscripcion', 'dx_confirmado', 'telefono'];
    const cambiadas = claves.filter(k => JSON.stringify(antes[k]) !== JSON.stringify(d[k]));
    chk('P3-05.c guardar NO sobrescribe lo que había registrado el colega', cambiadas.length === 0, cambiadas.length ? 'se sobrescribió: ' + cambiadas.map(k => `${k}: «${resumen(antes[k], 22)}»→«${resumen(d[k], 22)}»`).join(' · ') : 'los 10 campos siguen igual');

    // si la recarga falla, se sigue como antes («Paciente Nuevo») sin romper nada
    await page.evaluate(() => { window.app.recargarPacientes = async function () { throw new Error('sin red'); }; });
    page.errores.length = 0;
    await abrirModal(page, '96999998');
    const c2 = await leer(page);
    chk('P3-05.d si recargarPacientes falla, el documento inexistente sigue saliendo «Paciente Nuevo» sin errores', /Nuevo/.test(c2.alerta) && page.errores.length === 0, `pantalla=«${resumen(c2.alerta, 50)}» errores de página=${page.errores.length}`);
  });

  // ------------------------------------------------------------------------------------------------------------------------------
  await prueba('P3-07 · el sexo guardado como M/F se reconoce y la TFGe se calcula con el sexo correcto', async () => {
    const edadDe = nac => page.evaluate(n => window.PadronCalculadora.calcularEdad(n), nac);
    const tfge = (cr, edad, sx) => page.evaluate(([a, b, s]) => window.PadronCalculadora.calcularTfge(a, b, s).tfge, [cr, edad, sx]);
    await abrirModal(page, '10000002');
    let c = await leer(page);
    const pac = await paciente('10000002');
    chk('P3-07.a «F» guardado → el selector muestra «Femenino»', c.sexo === 'Femenino', `guardado=«${pac.sexo}» selector=«${c.sexo}»`);
    await page.fill('#reg-creatinina', '1.0'); await sleep(300);
    c = await leer(page);
    const edad = await edadDe(pac.fecha_nacimiento);
    const mujer = await tfge(1.0, edad, 'Femenino'), hombre = await tfge(1.0, edad, 'Masculino');
    chk('P3-07.b la TFGe mostrada es la de una mujer (no la de un hombre)', mujer !== hombre && new RegExp('^' + mujer + '\\b').test(c.liveTfge || ''), `mostrada=«${c.liveTfge}» · mujer=${mujer} · hombre=${hombre} (edad ${edad})`);
    await abrirModal(page, '10000001');
    c = await leer(page);
    chk('P3-07.c «M» guardado → el selector muestra «Masculino»', c.sexo === 'Masculino', `selector=«${c.sexo}»`);
    // sin sexo no se supone hombre
    await abrirModal(page, '96600004');
    await page.fill('#reg-fecha-nacimiento', '1960-05-10'); await page.fill('#reg-creatinina', '1.0'); await sleep(300);
    c = await leer(page);
    chk('P3-07.e paciente nuevo sin sexo: la TFGe no se calcula suponiendo hombre', !/^\d+\s*ml/.test(c.liveTfge || ''), `TFGe en pantalla=«${c.liveTfge}»`);
  });

  await prueba('T3-05 · el respaldo del geocodificador no pone al paciente en el hospital con «matched»', async () => {
    await nuevo(page, '96600005', { direccion: 'Jr. Direccion Sin Coincidencia 999' });
    await page.evaluate(() => { window.__geoReal = window.AncashGeocoder; window.AncashGeocoder = undefined; });
    const r = await guardar(page);
    await page.evaluate(() => { window.AncashGeocoder = window.__geoReal; });
    const d = await paciente('96600005');
    const enHospital = x => x && (Math.abs(x.latitud - (-10.0478)) < 0.0005 && Math.abs(x.longitud - (-78.1548)) < 0.0005);
    chk('T3-05.a sin geocodificador, no se envían las coordenadas del hospital', r.body && !enHospital({ latitud: r.body.latitud, longitud: r.body.longitud }), `latitud enviada=${r.body && r.body.latitud} longitud=${r.body && r.body.longitud}`);
    chk('T3-05.b el paciente queda «sin ubicar» (sin coordenadas) en el servidor', !!d && (d.latitud === undefined || d.latitud === null) && (d.longitud === undefined || d.longitud === null), d ? `latitud=${d.latitud} longitud=${d.longitud}` : 'no se guardó: ' + resumen(r.msg, 100));
    chk('T3-05.c el aviso al guardar no dice «georreferenciada» y avisa que quedó sin ubicar', /ubicar/i.test(r.msg || '') && !/georreferenciad/i.test(r.msg || ''), `mensaje=«${resumen(r.msg, 150)}»`);
    // con el geocodificador y una dirección sin coincidencia ocurre lo mismo
    await nuevo(page, '96600006', { direccion: 'Jr. Direccion Sin Coincidencia 998' });
    const r2 = await guardar(page);
    const d2 = await paciente('96600006');
    chk('T3-05.d con el geocodificador real y una dirección que no ubica: sin coordenadas y con aviso', !!d2 && (d2.latitud === undefined || d2.latitud === null) && /ubicar/i.test(r2.msg || ''), d2 ? `latitud=${d2.latitud} · mensaje=«${resumen(r2.msg, 110)}»` : 'no se guardó');
  });

  // ------------------------------------------------------------------------------------------------------------------------------
  await prueba('P3-08 / K3-04 / T3-04 · próxima cita: precarga, propuesta por intervalo, aviso y duplicados', async () => {
    const h30 = await hoyLima(page, 30), h90 = await hoyLima(page, 90), h45 = await hoyLima(page, 45), h60 = await hoyLima(page, 60), h20 = await hoyLima(page, 20);
    // (a) cita futura ya guardada
    await abrirModal(page, '10000001');
    let c = await leer(page);
    chk('P3-08.a la cita futura guardada (2026-11-25) se precarga', c.prox === '2026-11-25', `próxima cita=«${c.prox}»`);
    const antes = await paciente('10000001');
    await responderConsentimiento(page, 'No');
    await guardar(page);
    let d = await paciente('10000001');
    chk('P3-08.b guardar sin cambiar la fecha NO agrega otra cita', (d.appointments || []).length === (antes.appointments || []).length, `citas ${(antes.appointments || []).map(a => a.fecha_cita)} → ${(d.appointments || []).map(a => a.fecha_cita)}`);

    // (d) fecha distinta → una cita nueva
    await abrirModal(page, '10000001');
    await responderConsentimiento(page, 'No');
    await page.fill('#reg-proxima-cita', '2026-12-02'); await sleep(200);
    await guardar(page);
    d = await paciente('10000001');
    chk('P3-08.c una fecha distinta sí agrega UNA cita nueva (2026-12-02)', (d.appointments || []).length === (antes.appointments || []).length + 1 && (d.appointments || []).some(a => a.fecha_cita === '2026-12-02'), `citas ${(d.appointments || []).map(a => a.fecha_cita)}`);

    // (b) sin cita: se propone con la fecha de Lima y el intervalo (96400007: sin controles ni citas)
    await abrirModal(page, '96400007');
    c = await leer(page);
    chk('P3-08.d paciente sin cita: se propone hoy+30 con la fecha de Lima (T3-04)', c.prox === h30, `propuesta=«${c.prox}» · hoy+30 (Lima)=«${h30}»`);
    chk('P3-08.e la propuesta se explica en un texto visible', /propuesta|30 días/i.test(c.pistaCita || ''), `texto=«${c.pistaCita}»`);

    // estable + en meta hoy → 90 días; luego fuera de meta → 30; luego editada a mano → no se recalcula
    await abrirModal(page, '96500001');
    await page.fill('#reg-pas-hoy', '120'); await page.fill('#reg-pad-hoy', '70'); await sleep(350);
    c = await leer(page);
    chk('P3-08.f controlado y estable (3 controles en meta + hoy en meta): se propone hoy+90', c.prox === h90, `propuesta=«${c.prox}» · hoy+90=«${h90}» · panel=«${c.liveEstado}»`);
    await page.fill('#reg-pas-hoy', '150'); await page.fill('#reg-pad-hoy', '95'); await sleep(350);
    c = await leer(page);
    chk('P3-08.g si hoy NO está en meta, la propuesta se recalcula a hoy+30 (la persona no tocó la fecha)', c.prox === h30, `propuesta=«${c.prox}» · hoy+30=«${h30}»`);
    await page.fill('#reg-proxima-cita', h60); await sleep(300);
    c = await leer(page);
    chk('P3-08.h con la cita en hoy+60 y no controlado, aparece el aviso «La cita queda a 60 días; el máximo … es 30»', /La cita queda a 60 días; el máximo para este paciente es 30/.test(c.liveAviso || ''), `aviso=«${c.liveAviso}»`);
    await page.fill('#reg-proxima-cita', h20); await sleep(300);
    c = await leer(page);
    chk('P3-08.i con la cita en hoy+20 no hay aviso', (c.liveAviso || '') === '', `aviso=«${c.liveAviso}»`);
    await page.fill('#reg-proxima-cita', h45); await sleep(200);
    await page.fill('#reg-pas-hoy', '120'); await page.fill('#reg-pad-hoy', '70'); await sleep(350);
    c = await leer(page);
    chk('P3-08.j después de editar la fecha a mano, la propuesta ya no la pisa', c.prox === h45, `fecha=«${c.prox}» (editada: hoy+45=«${h45}»)`);

    // propuesta de un paciente nuevo: 30 días con la fecha de Lima
    await abrirModal(page, '96600007');
    c = await leer(page);
    chk('P3-08.k paciente nuevo: propone hoy+30 con la fecha de Lima, no la de UTC', c.prox === h30, `propuesta=«${c.prox}» · hoy+30 (Lima)=«${h30}» · UTC sería «${await page.evaluate(() => { const x = new Date(); x.setDate(x.getDate() + 30); return x.toISOString().split('T')[0]; })}»`);
  });

  await prueba('T3-04 · fecha y mes de la atención con la fecha de Lima (reloj en el borde del mes: 23:30 del 30-nov en Lima = 04:30 UTC del 1-dic)', async () => {
    // Se inicia sesión con el reloj normal (el token del servidor vale 8 horas) y luego el reloj salta al borde del mes
    const ctx2 = await browser.newContext(Object.assign({ viewport: { width: 1366, height: 900 } }, m.opciones));
    await ctx2.clock.setFixedTime(new Date(FIJO));
    const pg = await ctx2.newPage(); pg.setDefaultTimeout(10000); pg.on('dialog', x => x.accept().catch(() => { }));
    await pg.goto(C.BASE + '/'); await pg.waitForSelector('#login-overlay.active');
    await pg.fill('#login-username', 'admin'); await pg.fill('#login-password', SECRETOS.ADMIN_PASSWORD); await pg.click('#login-submit');
    await pg.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active')); await sleep(1300);
    await ctx2.clock.setFixedTime(new Date('2026-12-01T04:30:00Z'));
    await pg.evaluate(() => window.RegistroClinicoModal.open()); await sleep(250);
    const c = await leer(pg);
    const lima = await pg.evaluate(() => window.FechaLima.hoy());
    chk('T3-04.a la fecha de la atención es la de Lima (2026-11-30)', c.fechaAt === lima && lima === '2026-11-30', `fecha=«${c.fechaAt}» (Lima=«${lima}»)`);
    chk('T3-04.b el «mes a registrar» es el de la fecha de Lima (nov), no el del reloj del navegador', c.mes === 'nov', `mes=«${c.mes}»`);
    await ctx2.close();
  });

  if (m.lima) {
    await prueba('T3-01 (panel en vivo, navegador en hora de Lima; depende de padronCalculadora.js del agente R1) · la cita de HOY no sale vencida', async () => {
      await abrirModal(page);
      const res = {};
      for (const [k, n] of [['hoy', 0], ['mas8', 8], ['ayer', -1]]) {
        await page.fill('#reg-proxima-cita', await hoyLima(page, n)); await sleep(300);
        const c = await leer(page); res[k] = `«${c.liveEstadoCita}» ${c.liveSem}`;
      }
      chk('T3-01.a cita HOY → «Cita hoy» y amarillo', /Cita hoy/.test(res.hoy) && /AMARILLO/i.test(res.hoy), res.hoy);
      chk('T3-01.b cita a +8 días → verde', /VERDE/i.test(res.mas8), res.mas8);
      chk('T3-01.c cita de AYER → «Vencida hace 1 día» y rojo', /hace 1 d/.test(res.ayer) && /ROJO/i.test(res.ayer), res.ayer);
    });
  }

  // ------------------------------------------------------------------------------------------------------------------------------
  await prueba('P3-10 · el sector y el establecimiento guardados no se pisan si la persona no los cambió', async () => {
    const sec = await abrir(browser, 'f3.coord.sec', SECRETOS.CLAVE_USUARIOS, m.opciones);
    const tk = await C.loginUsuario('f3.coord.sec');
    const visible = async () => ((await api('GET', '/api/cronicos', tk)).json || []).some(x => String(x.dni) === '10000001');
    const antesVisible = await visible();
    const a = await paciente('10000001');
    await abrirModal(sec.page, '10000001');
    await responderConsentimiento(sec.page, 'No');
    const r = await guardar(sec.page);
    const d = await paciente('10000001');
    chk('P3-10.a coordinador del «Sector 62»: guardar sin tocar conserva sector_sanitario («Sector 62»)', a.sector_sanitario === 'Sector 62' && d.sector_sanitario === 'Sector 62', `sector_sanitario ${a.sector_sanitario} → ${d.sector_sanitario}`);
    chk('P3-10.b el paciente sigue a la vista del coordinador con sector', antesVisible && (await visible()), `visible antes=${antesVisible} después=${await visible()} · mensaje=«${resumen(r.msg, 70)}»`);
    chk('P3-10.c el sexo guardado como «M» no se reescribe al guardar sin tocar', a.sexo === d.sexo, `sexo ${a.sexo} → ${d.sexo}`);
    chk('P3-10.d el establecimiento de control y la puerta de entrada no cambian', a.puerta_entrada_id === d.puerta_entrada_id && a.establecimiento_control === d.establecimiento_control, `puerta ${a.puerta_entrada_id}→${d.puerta_entrada_id} · control «${resumen(d.establecimiento_control, 34)}»`);
    await sec.ctx.close();

    // si la persona sí cambia el sector, el cambio se guarda
    await abrirModal(page, '96310006');
    await responderConsentimiento(page, 'No');
    await page.selectOption('#reg-sector', 'Puerto Huarmey');
    await guardar(page);
    const d2 = await paciente('96310006');
    chk('P3-10.e si la persona cambia el sector en el formulario, el cambio sí se guarda', d2.sector_sanitario === 'Puerto Huarmey' || d2.sector === 'Puerto Huarmey', `sector=«${d2.sector}» sector_sanitario=«${d2.sector_sanitario}»`);

    // paciente nuevo con el sector en blanco: el sector sale del geocodificador (si ubica la dirección)
    await nuevo(page, '96600008', { direccion: 'Jr. Bolognesi 250 Huarmey' });
    const geo = await page.evaluate(() => window.AncashGeocoder.geocode('Jr. Bolognesi 250 Huarmey'));
    const r3 = await guardar(page);
    chk('P3-10.f paciente nuevo sin sector elegido: el sector sale del geocodificador y no de un valor por omisión', r3.body && (geo.matched ? r3.body.sector_sanitario === geo.sector : !('sector_sanitario' in r3.body)) && !('sector' in r3.body), `geocodificador: matched=${geo.matched} sector=«${geo.sector}» · enviado sector_sanitario=«${r3.body && r3.body.sector_sanitario}» sector=«${r3.body && r3.body.sector}»`);
  });

  await prueba('P3-14 / P3-11 · selector de establecimientos con TODO el catálogo y sin «Falta EESS» falso', async () => {
    const total = await page.evaluate(() => window.EstablecimientosHuarmey.getAllHuarmey().length);
    await abrirModal(page);
    let c = await leer(page);
    chk(`P3-14.a el selector de «EESS que lo controla» ofrece los ${total} establecimientos del catálogo`, c.nEessCtrl === total, `opciones con código=${c.nEessCtrl} (catálogo=${total})`);
    chk('P3-14.b el selector de «EESS de adscripción» también', c.nEessAds === total, `opciones con código=${c.nEessAds}`);
    await abrirModal(page, '96500002');
    c = await leer(page);
    chk('P3-14.c un paciente de Culebras (00001743) muestra ese establecimiento en ambos selectores', /00001743/.test(c.ctrl || '') && /00001743/.test(c.ads || ''), `control=«${resumen(c.ctrl, 36)}» adscripción=«${resumen(c.ads, 36)}»`);
    await responderConsentimiento(page, 'No');
    await guardar(page);
    const d = await paciente('96500002');
    chk('P3-14.d guardar sin tocar no dispara «Falta EESS» ni cambia el establecimiento', !/Falta EESS/.test(d.alerta_del_dato || '') && /00001743/.test(d.establecimiento_control || '') && d.puerta_entrada_id === '00001743', `alerta=«${d.alerta_del_dato}» puerta=${d.puerta_entrada_id}`);
    // P3-11: dato, no código
    const pn = await abrir(browser, 'f3.coord.pn', SECRETOS.CLAVE_USUARIOS, m.opciones);
    await abrirModal(pn.page);
    const cp = await leer(pn.page);
    info(`P3-11 BLOQUEADO por dato: el coordinador de PACIFICO NORTE ve ${cp.nEessCtrl} establecimientos en el selector, todos de la red Pacífico Sur (el catálogo del cliente solo trae esa red). No se resuelve con código: falta el catálogo de las otras redes.`);
    await pn.ctx.close();
  });

  await prueba('Lo que la persona SÍ cambia se guarda (sexo, establecimiento, estado) y las validaciones de la presión', async () => {
    // sexo y establecimiento de un paciente existente
    await abrirModal(page, '96310007');
    await responderConsentimiento(page, 'No');
    await page.selectOption('#reg-sexo', 'Femenino');
    await page.selectOption('#reg-eess-control', { label: 'P. S. Culebras (I-2)' }, { timeout: 1500 }).catch(() => info('el selector «EESS que lo controla» no ofrece Culebras (I-2)'));
    await guardar(page);
    let d = await paciente('96310007');
    chk('P3-07.f si la persona cambia el sexo, el cambio se guarda («Femenino»)', d.sexo === 'Femenino', `sexo=«${d.sexo}»`);
    chk('P3-10.g si la persona cambia el establecimiento de control, el cambio se guarda (Culebras 00001743)', d.puerta_entrada_id === '00001743' && /00001743/.test(d.establecimiento_control || ''), `puerta=${d.puerta_entrada_id} control=«${resumen(d.establecimiento_control, 40)}»`);

    // marcar «Fallecido»: no se programa cita; volver a «Activo» (corregir un error) también se guarda
    await abrirModal(page, '10000018');
    await responderConsentimiento(page, 'No');
    const a18 = await paciente('10000018');
    await page.selectOption('#reg-estado-paciente', 'Fallecido'); await sleep(300);
    let c = await leer(page);
    chk('P3-02.g al marcar «Fallecido» la próxima cita se vacía y se deshabilita', c.prox === '' && c.proxDisabled, `cita=«${c.prox}» deshabilitada=${c.proxDisabled}`);
    await guardar(page);
    d = await paciente('10000018');
    chk('P3-02.h guardado como «Fallecido»: bandera, negro y sin cita nueva', d.estado_paciente === 'Fallecido' && d.fallecido === true && d.semaforo === 'black' && (d.appointments || []).length === (a18.appointments || []).length, `estado=«${d.estado_paciente}» fallecido=${d.fallecido} semáforo=${d.semaforo} citas ${(a18.appointments || []).length}→${(d.appointments || []).length}`);
    await abrirModal(page, '10000018');
    c = await leer(page);
    chk('P3-02.i al reabrirlo se ve «Fallecido»', c.estadoP === 'Fallecido', `estado=«${c.estadoP}»`);
    await responderConsentimiento(page, 'No');
    await page.selectOption('#reg-estado-paciente', 'Activo'); await sleep(300);
    c = await leer(page);
    chk('P3-02.j al volver a «Activo» la cita se propone de nuevo', c.prox !== '' && !c.proxDisabled, `cita=«${c.prox}»`);
    await guardar(page);
    d = await paciente('10000018');
    chk('P3-02.k corregido a «Activo»: la bandera se limpia (fallecido=false) y deja de estar en negro', d.estado_paciente === 'Activo' && d.fallecido === false && d.semaforo !== 'black', `estado=«${d.estado_paciente}» fallecido=${d.fallecido} semáforo=${d.semaforo}`);

    // presión incompleta: no se guarda
    await abrirModal(page, '10000011');
    await responderConsentimiento(page, 'No');
    await page.fill('#reg-pas-hoy', '130');
    const n0 = ((await paciente('10000011')).observations || []).length;
    const r = await guardar(page);
    const n1 = ((await paciente('10000011')).observations || []).length;
    chk('P3-01.m solo la sistólica (sin diastólica): no se guarda y se avisa', /sistólica y la diastólica/.test(r.msg || '') && r.body === null && n0 === n1, `mensaje=«${resumen(r.msg, 90)}» observaciones ${n0}→${n1}`);

    // carné de extranjería ya registrado
    await abrirModal(page, '009600031', true);
    c = await leer(page);
    chk('DOC.a carné de extranjería registrado: se encuentra y el tipo es «Carné de extranjería»', /Encontrado/.test(c.alerta) && c.tipoDoc === 'Carné de extranjería', `tipo=«${c.tipoDoc}» pantalla=«${resumen(c.alerta, 40)}»`);
    await responderConsentimiento(page, 'No');
    const r2 = await guardar(page);
    chk('DOC.b se guarda sin tocar (documento no DNI)', /guardada con éxito/.test(r2.msg || ''), `mensaje=«${resumen(r2.msg, 90)}»`);
  });

  await prueba('Servidor · ¿exige algún campo que el formulario ahora deja en blanco? (coordinador solo de La Victoria crea un paciente nuevo sin elegir establecimiento)', async () => {
    const lv = await abrir(browser, 'f3.coord.lv', SECRETOS.CLAVE_USUARIOS, m.opciones);
    await nuevo(lv.page, '96600009');
    const r = await guardar(lv.page);
    info(`respuesta del servidor/formulario: «${resumen(r.msg, 220)}»`);
    chk('S.a el mensaje del servidor llega a la persona y le indica qué elegir (EESS que lo controla)', /establecimiento/i.test(r.msg || '') && /EESS que lo controla/.test(r.msg || ''), `mensaje=«${resumen(r.msg, 200)}»`);
    await nuevo(lv.page, '96600010');
    const lvOpcion = await lv.page.evaluate(() => Array.from(document.getElementById('reg-eess-control').options).find(o => /00001744/.test(o.value)));
    await lv.page.evaluate(() => { const s = document.getElementById('reg-eess-control'); const o = Array.from(s.options).find(x => /00001744/.test(x.value)); if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); } });
    const r2 = await guardar(lv.page);
    const d = await paciente('96600010');
    chk('S.b eligiendo «C. S. La Victoria» el mismo coordinador sí lo registra', !!d && /00001744/.test(d.puerta_entrada_id || ''), d ? `puerta=${d.puerta_entrada_id}` : `no se guardó: ${resumen(r2.msg, 120)} (opción La Victoria disponible: ${!!lvOpcion})`);
    await lv.ctx.close();
  });

  await prueba('C3-02 · reiniciar(): cierra el modal, vacía el formulario y deja currentPatient = null', async () => {
    await abrirModal(page, '10000001');
    const antes = await page.evaluate(() => ({ activo: document.getElementById('modal-registro-clinico').classList.contains('active'), pac: !!window.RegistroClinicoModal.currentPatient }));
    const existe = await page.evaluate(() => typeof window.RegistroClinicoModal.reiniciar === 'function');
    chk('C3-02.a el objeto del modal expone reiniciar()', existe, existe ? 'sí' : 'no existe');
    if (existe) {
      await page.evaluate(() => window.RegistroClinicoModal.reiniciar());
      const despues = await page.evaluate(() => ({
        activo: document.getElementById('modal-registro-clinico').classList.contains('active'),
        pac: window.RegistroClinicoModal.currentPatient,
        dni: document.getElementById('reg-input-dni').value, nombres: document.getElementById('reg-apellidos-nombres').value,
        dir: document.getElementById('reg-direccion').value, alerta: document.getElementById('reg-dni-status-alert').textContent.trim()
      }));
      chk('C3-02.b tras reiniciar(): el modal está cerrado, currentPatient es null y el formulario está vacío', antes.activo && antes.pac && !despues.activo && despues.pac === null && despues.dni === '' && despues.nombres === '' && despues.dir === '' && despues.alerta === '', JSON.stringify(despues));
      const sinInicializar = await page.evaluate(() => { try { const k = Object.getPrototypeOf(window.RegistroClinicoModal).constructor; const x = new k(); x.reiniciar(); return 'sin error'; } catch (e) { return 'error: ' + e.message; } });
      chk('C3-02.c reiniciar() sobre un modal que nunca se abrió no falla', sinInicializar === 'sin error', sinInicializar);
    }
  });

  await prueba('Etiqueta · «Estadio ERC» pasa a «Categoría de TFGe»', async () => {
    await abrirModal(page);
    const c = await leer(page);
    chk('ETQ.a el panel en vivo dice «Categoría de TFGe»', /^Categoría de TFGe/.test(c.liveErc || ''), `texto=«${c.liveErc}»`);
  });

  await ctx.close();
}
