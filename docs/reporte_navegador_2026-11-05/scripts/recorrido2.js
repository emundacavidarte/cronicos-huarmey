// Recorrido 2: registro clínico, cuadrícula Excel, ingesta CSV, pre-cita, WhatsApp, usuarios y roles.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const SP = __dirname;
const SHOTS = path.join(SP, 'shots');
const PASS = 'Prueba2026*Huarmey';
const results = [];
const pageErrors = [];
const dialogs = [];
const httpErr = [];
function rec(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log((ok === true ? 'OK   ' : ok === false ? 'FALLA' : 'NOTA ') + ' ' + step + (detail ? ' — ' + String(detail).slice(0, 500) : ''));
}

async function nuevaPagina(browser, vp) {
  const ctx = await browser.newContext({ viewport: vp || { width: 1440, height: 900 }, acceptDownloads: true, locale: 'es-PE', timezoneId: 'America/Lima' });
  await ctx.route(/arcgisonline|google\.com\/vt|cartocdn|openstreetmap/, r => r.abort());
  await ctx.route(/wa\.me|whatsapp\.com/, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>wa</body></html>' }));
  const page = await ctx.newPage();
  page.on('pageerror', e => pageErrors.push(String(e.message || e).slice(0, 200)));
  page.on('response', r => { if (r.status() >= 400 && !/auth\/login/.test(r.url())) httpErr.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 120)}`); });
  page.on('dialog', async d => { dialogs.push(`[${d.type()}] ${d.message()}`.slice(0, 300)); await d.accept(); });
  return { ctx, page };
}
async function login(page, user, pass) {
  await page.goto(BASE + '/');
  await page.waitForSelector('#login-overlay.active', { timeout: 15000 });
  await page.fill('#login-username', user);
  await page.fill('#login-password', pass);
  await page.click('#login-submit');
  await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active'), null, { timeout: 15000 });
  await page.waitForTimeout(2500);
}
const kpis = page => page.evaluate(() => ['kpi-total', 'kpi-green', 'kpi-yellow', 'kpi-red', 'kpi-purple'].map(i => document.getElementById(i).textContent.trim()).join('/'));
const lastDialog = () => dialogs.length ? dialogs[dialogs.length - 1] : '(ninguno)';

(async () => {
  const browser = await chromium.launch();
  let { ctx, page } = await nuevaPagina(browser);
  const shot = async n => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  const sleep = ms => page.waitForTimeout(ms);
  await login(page, 'admin', PASS);
  const kpiAdmin = await kpis(page);
  rec('A. Acceso admin', true, 'KPIs ' + kpiAdmin);

  // ---- B. Registro clínico ----
  await page.click('#rail-btn-nuevo');
  await sleep(800);
  const regVisible = await page.evaluate(() => { const m = document.getElementById('modal-registro-clinico'); return !!m && getComputedStyle(m).display !== 'none' && (m.classList.contains('active') || m.classList.contains('open') || getComputedStyle(m).visibility !== 'hidden'); });
  rec('B1. Abrir Registro Clínico (botón +)', regVisible);
  await shot('B1_registro_vacio');
  // DNI existente
  const existente = await page.evaluate(() => window.app.patients[1].dni);
  await page.fill('#reg-input-dni', existente);
  await page.click('#reg-btn-buscar-dni');
  await sleep(1200);
  const pre = await page.evaluate(() => ({
    alerta: (document.getElementById('reg-dni-status-alert').innerText || '').replace(/\s+/g, ' ').trim(),
    nombre: document.getElementById('reg-apellidos-nombres').value,
    fnac: document.getElementById('reg-fecha-nacimiento').value,
    dir: document.getElementById('reg-direccion').value,
    tel: document.getElementById('reg-telefono').value,
    tto: document.getElementById('reg-tratamiento-hta').value,
    badge: document.getElementById('reg-patient-badge').innerText
  }));
  rec('B2. Buscar DNI existente precarga datos', !!(pre.nombre && pre.dir), `alerta="${pre.alerta.slice(0, 120)}" badge="${pre.badge}" nombre? ${!!pre.nombre} fnac? ${!!pre.fnac} dir? ${!!pre.dir} tel? ${!!pre.tel} tto HTA? ${!!pre.tto}`);
  await shot('B2_registro_dni_existente');
  // DNI inválido
  await page.click('#reg-btn-limpiar').catch(() => {});
  await sleep(400);
  await page.fill('#reg-input-dni', '12ab');
  await page.click('#reg-btn-buscar-dni');
  await sleep(800);
  rec('B3. DNI inválido', null, `alerta="${(await page.innerText('#reg-dni-status-alert').catch(() => '')).replace(/\s+/g, ' ').slice(0, 150)}" diálogo=${lastDialog()}`);
  // Nuevo paciente
  await page.click('#reg-btn-limpiar').catch(() => {});
  await sleep(400);
  await page.fill('#reg-input-dni', '70000099');
  await page.click('#reg-btn-buscar-dni');
  await sleep(900);
  rec('B4. DNI nuevo', null, `alerta="${(await page.innerText('#reg-dni-status-alert').catch(() => '')).replace(/\s+/g, ' ').slice(0, 150)}"`);
  // guardar vacío -> validación
  const nDlg = dialogs.length;
  await page.click('#reg-btn-guardar');
  await sleep(700);
  rec('B5. Guardar sin nombre valida', dialogs.length > nDlg, lastDialog());
  await page.fill('#reg-apellidos-nombres', 'PRUEBA NAVEGADOR SINTETICO UNO');
  await page.fill('#reg-fecha-nacimiento', '1960-05-10');
  await page.fill('#reg-direccion', 'Jr. Pativilca 300');
  await page.fill('#reg-telefono', '987000111');
  await page.fill('#reg-cie10-hta', 'I10 – Hipertensión esencial');
  await page.fill('#reg-pas-hoy', '150');
  await page.fill('#reg-pad-hoy', '95');
  await page.fill('#reg-peso', '80');
  await page.fill('#reg-talla', '1.65');
  await page.fill('#reg-proxima-cita', '2026-12-10').catch(async () => { await page.evaluate(() => { document.getElementById('reg-proxima-cita').value = '2026-12-10'; }); });
  await sleep(600);
  const calcTxt = await page.evaluate(() => { const c = document.querySelector('.reg-calc-panel, #reg-calc-panel, .reg-results, .reg-modal-body > div:last-child'); return c ? c.innerText.replace(/\s+/g, ' ').slice(0, 600) : ''; });
  rec('B6. Cálculos automáticos en vivo', calcTxt.length > 0, calcTxt);
  await shot('B6_registro_lleno');
  const n2 = dialogs.length;
  await page.click('#reg-btn-guardar');
  await sleep(1200);
  rec('B7. Guardar sin consentimiento valida', dialogs.length > n2, lastDialog());
  await page.selectOption('#reg-consentimiento', 'Sí, firmado');
  const n3 = dialogs.length;
  const antes = await page.evaluate(() => window.app.patients.length);
  await page.click('#reg-btn-guardar');
  await sleep(2500);
  const despues = await page.evaluate(() => window.app.patients.length);
  rec('B8. Guardar atención nueva', despues === antes + 1, `pacientes ${antes} -> ${despues}; diálogos: ${dialogs.slice(n3).join(' || ')}`);
  const nuevo = await page.evaluate(() => { const p = window.app.patients.find(x => x.dni === '70000099'); return p ? { sem: p.semaforo, lat: p.latitud, lng: p.longitud, prec: p.precision_geo, sector: p.sector_sanitario, ctrl: p.estado_control, pa: p.pa_sistolica + '/' + p.pa_diastolica } : null; });
  rec('B9. Paciente nuevo en memoria', !!nuevo, JSON.stringify(nuevo));
  const token = await page.evaluate(() => window.app.session.getToken());
  const srv = await page.evaluate(async t => { const r = await fetch('/api/cronicos', { headers: { Authorization: 'Bearer ' + t } }); const j = await r.json(); const a = Array.isArray(j) ? j : (j.patients || []); const p = a.find(x => x.dni === '70000099'); return { total: a.length, p: p ? { sem: p.semaforo, lat: p.latitud, pa: p.pa_sistolica + '/' + p.pa_diastolica, ctrl: p.estado_control, cita: p.proxima_cita || p.fecha_proxima_cita } : null }; }, token);
  rec('B10. Paciente nuevo persistido en el servidor', !!srv.p, JSON.stringify(srv));
  await shot('B10_tras_guardar');
  rec('B11. KPIs tras alta', null, await kpis(page));
  // cerrar si sigue abierto
  await page.evaluate(() => { const b = document.getElementById('reg-btn-cerrar'); const m = document.getElementById('modal-registro-clinico'); if (m && getComputedStyle(m).display !== 'none' && b) b.click(); });
  await sleep(500);

  // ---- C. Cuadrícula Excel: reimportar lo exportado ----
  const exportFile = fs.readdirSync(SHOTS).find(f => /^export_.*\.xlsx$/.test(f));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), page.click('#rail-tab-excel')]);
  rec('C1. «Subir Excel» abre el selector de archivos', !!chooser, chooser ? 'multiple=' + chooser.isMultiple() : '');
  if (chooser && exportFile) {
    await chooser.setFiles(path.join(SHOTS, exportFile));
    await sleep(3000);
    const g = await page.evaluate(() => ({
      all: (document.getElementById('padron-count-all') || {}).innerText,
      err: (document.getElementById('padron-count-errors') || {}).innerText,
      score: (document.getElementById('padron-score-badge') || {}).innerText,
      status: ((document.getElementById('padron-status-msg') || {}).innerText || '').replace(/\s+/g, ' '),
      info: ((document.getElementById('padron-file-info') || {}).innerText || '').replace(/\s+/g, ' '),
      filas: document.querySelectorAll('#padron-grid-tbody tr').length,
      cols: document.querySelectorAll('#padron-grid-thead th').length
    }));
    rec('C2. Cargar en cuadrícula el Excel exportado', g.filas > 0, JSON.stringify(g));
    await shot('C2_grid_cargada');
    const errPills = await page.evaluate(() => ((document.getElementById('padron-errors-panel') || {}).innerText || '').replace(/\s+/g, ' '));
    const tipos = {};
    (errPills.match(/\)\s[^:]+:[^➔]+➔/g) || []).forEach(t => { const k = t.replace(/^\)\s/, '').replace(/➔$/, '').trim(); tipos[k] = (tipos[k] || 0) + 1; });
    rec('C3. Observaciones de validación (por tipo)', null, JSON.stringify(tipos));
    const btnDis = await page.evaluate(() => { const b = document.getElementById('padron-btn-cargar'); return b.disabled ? b.innerText : ''; });
    if (btnDis) {
      rec('C3b. Reimportar el propio Excel exportado queda bloqueado', false, btnDis);
      // corregir consentimiento masivamente no existe: se prueba con una sola fila editada
    }
    const antesG = await page.evaluate(() => window.app.patients.length);
    const nd = dialogs.length;
    if (!btnDis) await page.click('#padron-btn-cargar');
    await sleep(3500);
    const despuesG = await page.evaluate(() => window.app.patients.length);
    rec('C4. Guardar padrón (sin duplicar)', despuesG === antesG, `pacientes ${antesG} -> ${despuesG}; status="${(await page.innerText('#padron-status-msg').catch(() => '')).replace(/\s+/g, ' ').slice(0, 200)}"; diálogos: ${dialogs.slice(nd).join(' || ').slice(0, 300)}`);
    await shot('C4_grid_guardado');
  } else rec('C2. Cargar en cuadrícula', false, 'no se encontró input de archivo en el modal o no hay export');
  await page.evaluate(() => { const b = document.getElementById('padron-btn-cerrar'); if (b && b.offsetParent) b.click(); });
  await sleep(600);

  // ---- D. Ingesta HOSIX CSV (pestaña Subir Excel del panel) ----
  const csv = 'NRO_DOCUMENTO,HISTORIA_CLINICA,APELLIDOS_NOMBRES,SEXO,EDAD,TELEFONO,DIRECCION,DISTRITO,CIE10_COD,DIAGNOSTICO,FEC_ULTIMA_ATENCION,FEC_PROXIMA_CITA,PA_SISTOLICA,PA_DIASTOLICA,HBA1C,ESTADO_CONTROL,COD_IPRESS_ORIGEN\n' +
    '70000098,HC-9998,PRUEBA CSV SINTETICO DOS,F,61,987000222,Av. Graciela 120,HUARMEY,I10,Hipertension esencial,2026-10-20,2026-11-30,132,84,,Controlado,00001741\n';
  fs.writeFileSync(path.join(SP, 'ingesta_prueba.csv'), csv);
  await page.evaluate(() => { window.app.toggleHeartsPanel(true); window.app.switchHeartsTab('ingesta'); });
  await sleep(600);
  await shot('D1_tab_ingesta');
  const antesD = await page.evaluate(() => window.app.patients.length);
  const nd2 = dialogs.length;
  await page.setInputFiles('#hosix-file-input', path.join(SP, 'ingesta_prueba.csv'));
  await sleep(3000);
  const despuesD = await page.evaluate(() => window.app.patients.length);
  const toastD = await page.evaluate(() => (document.getElementById('toast-container').innerText || '').replace(/\s+/g, ' ').slice(0, 400));
  const gridAbierta = await page.evaluate(() => { const m = document.querySelector('[id*="modal-padron"]'); return m ? getComputedStyle(m).display !== 'none' && m.classList.contains('active') : false; });
  rec('D2. Ingesta CSV HOSIX', null, `pacientes ${antesD} -> ${despuesD}; cuadrícula abierta=${gridAbierta}; toast="${toastD}"; diálogos: ${dialogs.slice(nd2).join(' || ').slice(0, 300)}`);
  await shot('D2_ingesta_csv');
  if (gridAbierta) {
    const g2 = await page.evaluate(() => ({ filas: document.querySelectorAll('#padron-grid-tbody tr').length, err: (document.getElementById('padron-count-errors') || {}).innerText, status: ((document.getElementById('padron-status-msg') || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 200) }));
    rec('D3. CSV abierto en cuadrícula', null, JSON.stringify(g2));
    await page.click('#padron-btn-cargar').catch(() => {});
    await sleep(3000);
    rec('D4. Guardar CSV', null, `pacientes ahora ${await page.evaluate(() => window.app.patients.length)}; diálogos: ${dialogs.slice(nd2).join(' || ').slice(0, 300)}`);
    await page.evaluate(() => { const b = document.getElementById('padron-btn-cerrar'); if (b && b.offsetParent) b.click(); });
  }
  await page.evaluate(() => window.app.switchHeartsTab('pacientes'));
  await sleep(500);

  // ---- E. Pre-cita ----
  const pid = await page.evaluate(() => window.app.patients.find(p => p.semaforo === 'red').id);
  await page.evaluate(id => window.app.openPatientDetail(id), pid);
  await sleep(800);
  await page.click('#modal-patient-detail button:has-text("Pre-cita")');
  await sleep(800);
  const preVis = await page.evaluate(() => document.getElementById('modal-precita').classList.contains('active'));
  const preInfo = await page.evaluate(() => ({ dni: document.getElementById('modal-precita-dni').innerText, diag: document.getElementById('modal-precita-diag').innerText, fecha: document.getElementById('modal-precita-fecha').value, cons: document.getElementById('modal-precita-consultorio').value, fichaAbierta: !!document.querySelector('#modal-patient-detail.active') }));
  rec('E1. Abrir modal de pre-cita', preVis, JSON.stringify(preInfo));
  await shot('E1_precita');
  const nd3 = dialogs.length;
  await page.click('#modal-precita button:has-text("Confirmar")');
  await sleep(1500);
  const toastE = await page.evaluate(() => (document.getElementById('toast-container').innerText || '').replace(/\s+/g, ' ').slice(-300));
  rec('E2b. KPIs tras pre-cita (sin recargar)', null, await kpis(page));
  rec('E2. Confirmar pre-cita', !(await page.evaluate(() => document.getElementById('modal-precita').classList.contains('active'))), `toast="${toastE}" diálogos=${dialogs.slice(nd3).join(' | ')}`);
  await page.evaluate(() => { const m = document.getElementById('modal-patient-detail'); if (m) m.classList.remove('active'); });
  await page.evaluate(() => window.app.toggleHeartsPanel(true));
  await sleep(500);
  const [dlPre] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('#btn-export-precitas')]);
  if (dlPre) { const f = path.join(SHOTS, 'precitas_' + dlPre.suggestedFilename()); await dlPre.saveAs(f); const c = fs.readFileSync(f, 'utf8'); rec('E3. Exportar CSV de pre-citas', c.split('\n').length > 1, `${dlPre.suggestedFilename()} · ${c.split('\n').filter(Boolean).length} líneas · cabecera: ${c.split('\n')[0].slice(0, 200)}`); }
  else rec('E3. Exportar CSV de pre-citas', false, 'sin descarga; toast=' + (await page.evaluate(() => document.getElementById('toast-container').innerText.slice(-200))));

  // ---- F. WhatsApp / consentimiento ----
  const conTel = await page.evaluate(() => { const p = window.app.patients.find(x => x.telefono && !x.consentimiento_whatsapp && x.dni !== '70000099'); return p ? p.id : window.app.patients.find(x => x.telefono).id; });
  const popupP = page.waitForEvent('popup', { timeout: 4000 }).catch(() => null);
  await page.evaluate(id => window.app.enviarWhatsApp(id), conTel);
  await sleep(1000);
  const consVis = await page.evaluate(() => document.getElementById('modal-consentimiento').classList.contains('active'));
  rec('F1. WhatsApp sin consentimiento pide consentimiento', consVis, consVis ? (await page.innerText('#modal-consentimiento')).replace(/\s+/g, ' ').slice(0, 250) : 'no apareció el modal');
  await shot('F1_consentimiento');
  if (consVis) {
    await page.click('#modal-consentimiento button:has-text("Registrar consentimiento")');
    await sleep(1500);
  }
  const pop = await popupP;
  rec('F2. Se abre WhatsApp (wa.me)', !!pop, pop ? pop.url().replace(/text=[^&]*/, 'text=…').slice(0, 120) : 'sin ventana emergente');
  if (pop) { const u = decodeURIComponent((pop.url().match(/text=([^&]*)/) || [])[1] || ''); rec('F3. Texto del mensaje', null, u.slice(0, 300)); await pop.close().catch(() => {}); }

  // ---- G. Usuarios ----
  await page.click('#btn-usuarios');
  await sleep(1000);
  await shot('G1_usuarios');
  const redes = await page.$$eval('#nuevo-usuario-red option', os => os.map(o => o.value + '=' + o.textContent.trim()));
  rec('G1. Modal de usuarios', redes.length > 0, 'redes: ' + redes.join(' | ').slice(0, 300));
  async function crearUsuario(login, nombre, rol, red, est) {
    await page.fill('#nuevo-usuario-login', login);
    await page.fill('#nuevo-usuario-nombre', nombre);
    await page.selectOption('#nuevo-usuario-rol', rol);
    await sleep(300);
    if (red) await page.selectOption('#nuevo-usuario-red', red).catch(e => rec('G. red', false, e.message));
    await sleep(300);
    if (est) {
      const ests = await page.$$eval('#nuevo-usuario-establecimiento option', os => os.map(o => o.value + '=' + o.textContent.trim()));
      rec(`G. Establecimientos para ${rol} red ${red}`, ests.length > 0, ests.join(' | ').slice(0, 300));
      const v = ests.map(s => s.split('=')[0]).find(x => x === est) || ests.map(s => s.split('=')[0]).filter(Boolean)[0];
      if (v) await page.selectOption('#nuevo-usuario-establecimiento', v);
    }
    await page.fill('#nuevo-usuario-clave', 'ClaveSegura2026*');
    await page.click('#nuevo-usuario-guardar');
    await sleep(1500);
    return (await page.innerText('#usuarios-msg')).replace(/\s+/g, ' ').trim();
  }
  const redVal = await page.$$eval('#nuevo-usuario-red option', os => (os.find(o => /156/.test(o.textContent)) || {}).value || '');
  rec('G2. Crear COORDINADOR', null, await crearUsuario('coord.prueba', 'Coordinador Prueba', 'COORDINADOR', redVal, '00001744'));
  rec('G3. Crear DIRECTOR', null, await crearUsuario('dir.prueba', 'Director Prueba', 'DIRECTOR', redVal, null));
  rec('G4. Usuario repetido', null, await crearUsuario('coord.prueba', 'Repetido', 'COORDINADOR', redVal, '00001744'));
  rec('G5. Clave débil', null, await (async () => { await page.fill('#nuevo-usuario-login', 'debil.prueba'); await page.fill('#nuevo-usuario-nombre', 'Debil'); await page.selectOption('#nuevo-usuario-rol', 'DIRECTOR'); if (redVal) await page.selectOption('#nuevo-usuario-red', redVal); await page.fill('#nuevo-usuario-clave', '123'); await page.click('#nuevo-usuario-guardar'); await sleep(1000); return (await page.innerText('#usuarios-msg')).replace(/\s+/g, ' ').trim() + ' / validity=' + await page.evaluate(() => document.getElementById('nuevo-usuario-clave').validationMessage); })());
  const lista = (await page.innerText('#usuarios-lista')).replace(/\s+/g, ' ').slice(0, 600);
  rec('G6. Lista de usuarios', /coord\.prueba/.test(lista) && /dir\.prueba/.test(lista), lista);
  await shot('G6_usuarios_lista');
  await page.click('#usuarios-cerrar');
  await sleep(400);

  // ---- H. Recarga y restauración de sesión ----
  await page.reload();
  await sleep(3500);
  rec('H0. Pacientes antes de recargar', null, String(await page.evaluate(() => window.app.patients.length)));
  const restaurada = await page.evaluate(() => !document.getElementById('login-overlay').classList.contains('active') && window.app.patients.length > 0);
  rec('H1. Recargar página conserva la sesión', restaurada, 'KPIs ' + await kpis(page) + ' · pacientes ' + await page.evaluate(() => window.app.patients.length) + ' · CSV 70000098 presente=' + await page.evaluate(() => !!window.app.patients.find(p => p.dni === '70000098')));
  // Salir
  await page.click('#btn-logout');
  await sleep(1200);
  const salida = await page.evaluate(() => ({ login: document.getElementById('login-overlay').classList.contains('active'), pac: window.app.patients.length, kpi: document.getElementById('kpi-total').textContent, lista: document.getElementById('patient-list').children.length, token: !!window.app.session.getToken() }));
  rec('H2. Cerrar sesión limpia datos', salida.login && salida.pac === 0 && !salida.token, JSON.stringify(salida));
  await ctx.close();

  // ---- I. DIRECTOR ----
  ({ ctx, page } = await nuevaPagina(browser));
  await login(page, 'dir.prueba', 'ClaveSegura2026*');
  const dirState = await page.evaluate(() => {
    const vis = id => { const e = document.getElementById(id); return !!e && !e.classList.contains('perm-hidden') && !e.closest('.perm-hidden') && e.getClientRects().length > 0; };
    return { chip: document.getElementById('user-chip').innerText.replace(/\s+/g, ' '), pacientes: window.app.patients.length, nuevo: vis('rail-btn-nuevo'), padron: vis('rail-tab-padron'), excel: vis('rail-tab-excel'), usuarios: vis('rail-btn-usuarios'), handleDer: vis('right-drawer-handle'), marcadores: window.app.mapManager.layers.pacientes.getLayers().length };
  });
  const kpiDir = await kpis(page);
  rec('I1. DIRECTOR: sin datos individuales ni edición', dirState.pacientes === 0 && !dirState.nuevo && !dirState.padron && !dirState.excel && !dirState.usuarios && dirState.marcadores === 0, JSON.stringify(dirState));
  rec('I2. DIRECTOR: KPIs agregados', null, `${kpiDir} (admin veía ${kpiAdmin})`);
  await page.screenshot({ path: path.join(SHOTS, 'I1_director_mapa.png') });
  // ¿KPI clic abre algo?
  await page.click('#card-kpi-red').catch(() => {});
  await sleep(600);
  rec('I3. DIRECTOR: clic en KPI', null, await page.evaluate(() => 'panel abierto=' + !document.getElementById('hearts-panel').classList.contains('collapsed') + ' visible=' + (document.getElementById('hearts-panel').getClientRects().length > 0)));
  await page.click('#rail-tab-dashboard');
  await sleep(2500);
  const dDir = await page.evaluate(() => ({ total: document.getElementById('dash-val-total').textContent.trim(), control: document.getElementById('dash-val-control').textContent.trim(), conv: document.getElementById('ind-convenio-tbody').innerText.replace(/\s+/g, ' ').slice(0, 200), ipress: document.getElementById('dash-ipress-tbody').innerText.replace(/\s+/g, ' ').slice(0, 200) }));
  rec('I4. DIRECTOR: tablero', null, JSON.stringify(dDir));
  await page.screenshot({ path: path.join(SHOTS, 'I4_director_tablero.png') });
  // acceso directo a la API con token de director
  const tDir = await page.evaluate(() => window.app.session.getToken());
  const apiDir = await page.evaluate(async t => { const h = { Authorization: 'Bearer ' + t }; const a = await fetch('/api/cronicos', { headers: h }); const b = await fetch('/api/alerts/summary', { headers: h }); const c = await fetch('/api/padron/importar-lote', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: '{"patients":[]}' }); return { cronicos: a.status, resumen: b.status, resumenBody: (await b.text()).slice(0, 300), escribir: c.status }; }, tDir);
  rec('I5. DIRECTOR: API /api/cronicos 403 y escritura 403', apiDir.cronicos === 403 && apiDir.escribir === 403, JSON.stringify(apiDir));
  await ctx.close();

  // ---- J. COORDINADOR ----
  ({ ctx, page } = await nuevaPagina(browser));
  await login(page, 'coord.prueba', 'ClaveSegura2026*');
  const coord = await page.evaluate(() => {
    const vis = id => { const e = document.getElementById(id); return !!e && !e.classList.contains('perm-hidden') && !e.closest('.perm-hidden') && e.getClientRects().length > 0; };
    return { chip: document.getElementById('user-chip').innerText.replace(/\s+/g, ' '), pacientes: window.app.patients.length, estab: [...new Set(window.app.patients.map(p => p.establecimiento_control || p.puerta_entrada))], nuevo: vis('rail-btn-nuevo'), excel: vis('rail-tab-excel'), usuarios: vis('rail-btn-usuarios') };
  });
  rec('J1. COORDINADOR (La Victoria): solo su establecimiento, puede escribir, no gestiona usuarios', coord.nuevo && !coord.usuarios, JSON.stringify(coord));
  rec('J2. COORDINADOR: KPIs', null, await kpis(page));
  await page.screenshot({ path: path.join(SHOTS, 'J1_coordinador.png') });
  await ctx.close();

  fs.writeFileSync(path.join(SHOTS, 'recorrido2.json'), JSON.stringify({ results, pageErrors, dialogs, httpErr }, null, 2));
  console.log('\n--- errores de página ---\n' + [...new Set(pageErrors)].join('\n'));
  console.log('--- HTTP >= 400 ---\n' + [...new Set(httpErr)].join('\n'));
  console.log('--- diálogos ---\n' + dialogs.join('\n'));
  await browser.close();
})().catch(e => { console.error('ERROR FATAL', e.message.slice(0, 1500)); fs.writeFileSync(path.join(SHOTS, 'recorrido2.json'), JSON.stringify({ results, pageErrors, dialogs, httpErr, fatal: e.message }, null, 2)); process.exit(1); });
