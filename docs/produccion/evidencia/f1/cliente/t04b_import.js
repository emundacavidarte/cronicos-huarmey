// Prueba 4 (parte B): importar Excel inventado por la UI (cuadricula), validacion en caliente, carga y XSS.
const L = require('./lib');
const flags = page => page.evaluate(() => Object.keys(window).filter(k => k.startsWith('__xss')).sort());
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage();
  const bag = {};
  L.instrument(page, bag);
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.type() + ': ' + d.message().slice(0, 120)); await d.accept(); });
  const out = {};
  await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active');
  await L.uiLogin(page, L.ADMIN);
  await page.waitForFunction(() => window.app.patients.length > 0); await L.sleep(800);
  out.patientsBefore = await page.evaluate(() => window.app.patients.length);

  // 1. abrir cuadricula subiendo archivo
  const t0 = Date.now();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#rail-tab-excel')]);
  await fc.setFiles(L.W + '/invented_padron.xlsx');
  await page.waitForSelector('#modal-padron-grid.active #padron-grid-tbody tr', { timeout: 15000 });
  out.t_open_grid_ms = Date.now() - t0;
  const state = () => page.evaluate(() => ({
    file: document.getElementById('padron-file-info').textContent.slice(0, 90),
    score: document.getElementById('padron-score-badge').textContent,
    all: document.getElementById('padron-count-all').textContent,
    errs: document.getElementById('padron-count-errors').textContent,
    rows: document.querySelectorAll('#padron-grid-tbody tr').length,
    cellsErr: document.querySelectorAll('#padron-grid-tbody td.cell-error').length,
    btn: document.getElementById('padron-btn-cargar').textContent.trim().slice(0, 70),
    btnDisabled: document.getElementById('padron-btn-cargar').disabled,
    pills: document.querySelectorAll('.padron-error-pill').length
  }));
  out.grid0 = await state();
  out.flagsAfterGridOpen = await flags(page);
  await page.screenshot({ path: L.W + '/shot_04_grid.png' });
  out.gridCols = await page.evaluate(() => document.querySelectorAll('#padron-grid-thead tr:nth-child(2) th').length);
  out.gridScrollWidth = await page.evaluate(() => { const w = document.getElementById('padron-grid-wrapper'); return { sw: w.scrollWidth, cw: w.clientWidth }; });

  // 2. validacion en caliente: poner texto invalido en una celda valida (fila 1 DNI) y Enter
  const cellSel = 'td[data-row-idx="1"][data-key="nro_documento"]';
  await page.click(cellSel);
  const input = page.locator(cellSel + ' input');
  await input.fill('abc');
  // tecleo no valida; se mide antes de Enter
  out.hot_beforeCommit = await state();
  await input.press('Enter');
  await L.sleep(200);
  out.hot_afterEnter = await state();
  out.hot_cellErrText = await page.getAttribute(cellSel, 'title');
  // celda numerica con valor fuera de rango
  const pasSel = 'td[data-row-idx="3"][data-key="pas_oct"]';
  await page.click(pasSel);
  await page.locator(pasSel + ' input').fill('9999');
  await page.locator(pasSel + ' input').press('Tab').catch(() => {});
  await L.sleep(200);
  out.hot_afterNumeric = await state();
  out.hot_numTitle = await page.getAttribute(pasSel, 'title');
  // input number deja escribir 9999? y si es 'e'?
  // Revertir ambas
  await page.click(cellSel); await page.locator(cellSel + ' input').fill('70000002'); await page.locator(cellSel + ' input').press('Enter'); await L.sleep(150);
  await page.click(pasSel); await page.locator(pasSel + ' input').fill('150'); await page.locator(pasSel + ' input').press('Enter'); await L.sleep(150);
  out.hot_reverted = await state();

  // 3. corregir errores reales: fila 5 DNI duplicado; fila 7 fecha nac; fila 8 PAS
  const fix = async (r, key, val) => {
    const sel = `td[data-row-idx="${r}"][data-key="${key}"]`;
    await page.click(sel, { force: true });
    const el = page.locator(sel + ' input, ' + sel + ' select').first();
    await el.fill(val);
    await el.press('Enter');
    await L.sleep(150);
  };
  await fix(4, 'nro_documento', '70000005');
  await fix(6, 'fecha_nacimiento', '1960-01-01');
  await fix(7, 'pas_oct', '150');
  out.grid_afterFix = await state();
  out.dialogsAfterGrid = dialogs.slice();

  // 4. cargar
  const reqIdx = bag.requests.length;
  await page.click('#padron-btn-cargar');
  await page.waitForFunction(() => !document.getElementById('modal-padron-grid').classList.contains('active'), null, { timeout: 20000 });
  await L.sleep(1200);
  out.toastsAfterCommit = await page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent.trim().slice(0, 140)));
  const lote = bag.requests.slice(reqIdx).filter(r => /importar-lote/.test(r.url));
  out.loteRequests = lote.map(r => r.method + ' ' + r.url.replace(L.BASE, ''));
  out.loteResponses = bag.responses.filter(r => /importar-lote/.test(r.url)).map(r => r.status);
  out.patientsAfter = await page.evaluate(() => window.app.patients.length);
  out.flagsAfterCommit = await flags(page);
  out.dialogsAll = dialogs.slice();

  // 5. render: lista y pines
  await page.click('#rail-tab-padron'); await L.sleep(500);
  out.cardsAfter = await page.evaluate(() => document.querySelectorAll('#patient-list .patient-card').length);
  out.flagsAfterList = await flags(page);
  // tooltips y popups programaticos
  const nuevos = await page.evaluate(() => window.app.patients.filter(p => /^7000000/.test(p.dni)).map(p => p.dni));
  out.nuevosDni = nuevos;
  const res = await page.evaluate(() => {
    const r = { tooltip: 0, popup: 0 };
    const capa = window.app.mapManager.layers.pacientes;
    capa.eachLayer(l => { try { l.openTooltip(); r.tooltip++; } catch (e) {} });
    return r;
  });
  await L.sleep(500);
  out.tooltips = res;
  out.flagsAfterTooltips = await flags(page);
  await page.evaluate(() => { window.app.mapManager.layers.pacientes.eachLayer(l => { try { l.closeTooltip(); } catch (e) {} }); });
  // popups
  await page.evaluate(async () => {
    const capa = window.app.mapManager.layers.pacientes;
    const ls = []; capa.eachLayer(l => ls.push(l));
    for (const l of ls) { try { l.openPopup(); } catch (e) {} await new Promise(r => setTimeout(r, 60)); }
  });
  out.flagsAfterPopups = await flags(page);
  await page.evaluate(() => window.app.mapManager.map.closePopup());
  // fichas
  for (const dni of nuevos) {
    await page.evaluate(d => window.app.openPatientDetail(d), dni);
    await L.sleep(500);
    await page.evaluate(() => { const m = document.getElementById('modal-patient-detail'); if (m) m.remove(); });
  }
  out.flagsAfterFichas = await flags(page);
  // avisos (toast) de pre-cita con el paciente de nombre XSS
  const xssPat = await page.evaluate(() => window.app.patients.find(p => p.dni === '70000001') && window.app.patients.find(p => p.dni === '70000001').id);
  out.xssPatientId = xssPat;
  await page.evaluate(id => window.app.abrirModalPreCita(id), xssPat);
  await L.sleep(300);
  out.precitaModalName = await page.evaluate(() => document.getElementById('modal-precita-paciente').innerHTML.slice(0, 120));
  await page.screenshot({ path: L.W + '/shot_04_precita_xss.png' });
  await page.evaluate(() => window.app.confirmarPreCita());
  await L.sleep(1000);
  out.flagsAfterPrecita = await flags(page);
  out.toastsPrecita = await page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map(t => t.innerHTML.slice(0, 200)));
  // buscar por nombre XSS
  await page.fill('#search-input', 'img src');
  await L.sleep(500);
  out.flagsAfterSearch = await flags(page);
  await page.evaluate(() => window.app.ejecutarBusqueda('<img src=x onerror=window.__xss=1>'));
  await L.sleep(400);
  out.flagsAfterEnterSearch = await flags(page);
  // WhatsApp consent modal con paciente XSS
  await page.evaluate(id => window.app.enviarWhatsApp(id), xssPat);
  await L.sleep(400);
  out.flagsAfterWhatsapp = await flags(page);
  out.consentModalHtml = await page.evaluate(() => document.getElementById('modal-consentimiento-paciente').innerHTML.slice(0, 100));
  out.flagsFinal = await flags(page);
  out.pageErrors = bag.pageErrors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
