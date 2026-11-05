// Recorrido 1: acceso, mapa, KPIs, paneles, búsqueda, ficha, tablero.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const SHOTS = path.join(__dirname, 'shots');
const PASS = 'Prueba2026*Huarmey';
const results = [];
const consoleErrors = [];
const pageErrors = [];
const failedReq = [];
const httpErr = [];

function rec(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log((ok === true ? 'OK   ' : ok === false ? 'FALLA' : 'NOTA ') + ' ' + step + (detail ? ' — ' + detail : ''));
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: 'es-PE', timezoneId: 'America/Lima' });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
  page.on('pageerror', e => pageErrors.push(String(e.message || e).slice(0, 300)));
  page.on('requestfailed', r => failedReq.push(`${r.failure() && r.failure().errorText} ${r.url().slice(0, 140)}`));
  page.on('response', r => { if (r.status() >= 400) httpErr.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}`); });
  const shot = async n => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  const sleep = ms => page.waitForTimeout(ms);

  // 1. Carga inicial
  const t0 = Date.now();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  rec('1.1 Carga de la página', true, `${Date.now() - t0} ms hasta load`);
  await page.waitForSelector('#login-overlay.active', { timeout: 15000 });
  rec('1.2 Pantalla de acceso visible sin sesión', true);
  await shot('01_login');

  // 2. Clave incorrecta
  await page.fill('#login-username', 'admin');
  await page.fill('#login-password', 'clave-incorrecta-123');
  await page.click('#login-submit');
  await sleep(1500);
  const errTxt = (await page.textContent('#login-error')).trim();
  rec('2.1 Clave incorrecta muestra error', errTxt.length > 0, JSON.stringify(errTxt));
  await shot('02_login_error');

  // 2.2 mostrar/ocultar clave
  const typeBefore = await page.getAttribute('#login-password', 'type');
  await page.click('#login-ver-clave');
  const typeAfter = await page.getAttribute('#login-password', 'type');
  rec('2.2 Botón «ver clave»', typeBefore === 'password' && typeAfter === 'text', `${typeBefore} -> ${typeAfter}`);
  await page.click('#login-ver-clave');

  // 3. Acceso correcto
  await page.fill('#login-password', PASS);
  await page.click('#login-submit');
  await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active'), null, { timeout: 15000 });
  await page.waitForFunction(() => window.app && window.app.patients && window.app.patients.length > 0, null, { timeout: 15000 }).catch(() => {});
  await sleep(2500);
  const chip = (await page.textContent('#user-chip')).replace(/\s+/g, ' ').trim();
  rec('3.1 Acceso con admin', true, 'chip: ' + chip);
  const kpis = await page.evaluate(() => ['kpi-total', 'kpi-green', 'kpi-yellow', 'kpi-red', 'kpi-purple'].map(i => document.getElementById(i).textContent.trim()));
  const nPac = await page.evaluate(() => window.app.patients.length);
  rec('3.2 KPIs del HUD', true, `Total ${kpis[0]} · Meta ${kpis[1]} · Próximos ${kpis[2]} · Deserción ${kpis[3]} · HOSIX ${kpis[4]} (pacientes en memoria: ${nPac})`);
  const sumaKpi = kpis.slice(1).reduce((a, b) => a + Number(b), 0);
  rec('3.3 Suma de semáforos = total', sumaKpi === Number(kpis[0]), `suma ${sumaKpi} vs total ${kpis[0]}`);
  const mapInfo = await page.evaluate(() => {
    const m = window.app.mapManager.map;
    const c = m.getCenter();
    let markers = 0;
    const capa = window.app.mapManager.layers && window.app.mapManager.layers.pacientes;
    if (capa && capa.getLayers) markers = capa.getLayers().length;
    return { lat: c.lat.toFixed(5), lng: c.lng.toFixed(5), zoom: m.getZoom(), markers, basemap: document.getElementById('select-basemap').value };
  });
  rec('3.4 Mapa inicial', true, JSON.stringify(mapInfo));
  const sinCoords = await page.evaluate(() => window.app.patients.filter(p => !(p.latitud && p.longitud)).length);
  rec('3.5 Pacientes sin coordenadas', sinCoords === 0 ? true : null, String(sinCoords));
  const tiles = await page.evaluate(() => { const imgs = [...document.querySelectorAll('.leaflet-tile')]; return { total: imgs.length, cargados: imgs.filter(i => i.complete && i.naturalWidth > 0).length }; });
  rec('3.6 Mosaicos del mapa base', tiles.cargados > 0 ? true : null, `${tiles.cargados}/${tiles.total} cargados`);
  await shot('03_mapa_inicial');

  // 4. KPIs clicables
  for (const [id, nombre] of [['card-kpi-green', 'Meta'], ['card-kpi-yellow', 'Próximos'], ['card-kpi-red', 'Deserción'], ['card-kpi-purple', 'HOSIX'], ['card-kpi-total', 'Total']]) {
    await page.click('#' + id);
    await sleep(700);
    const st = await page.evaluate(() => ({
      panelAbierto: !document.getElementById('hearts-panel').classList.contains('collapsed'),
      sub: document.getElementById('patient-count-subtitle').textContent.trim(),
      cards: document.querySelectorAll('#patient-list .patient-card').length,
      filtro: JSON.stringify(window.app.currentFilter)
    }));
    rec(`4. Clic KPI ${nombre}`, st.panelAbierto, `${st.sub} · tarjetas ${st.cards} · filtro ${st.filtro}`);
    if (nombre === 'Deserción') await shot('04_kpi_desercion');
    // Volver a hacer clic para cerrar
    try { await page.click('#' + id, { timeout: 3000 }); }
    catch (e) {
      await shot('04_kpi_tapado_' + nombre);
      const tapa = await page.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); const hp = document.getElementById('hearts-panel').getBoundingClientRect(); return { kpi: [Math.round(r.left), Math.round(r.right)], panel: [Math.round(hp.left), Math.round(hp.right)], tapa: el ? (el.closest('[id]') || el).id : null }; }, id);
      rec(`4. Segundo clic KPI ${nombre}: la tarjeta está tapada`, false, JSON.stringify(tapa));
      await page.evaluate(() => window.app.toggleHeartsPanel(false));
    }
    await sleep(500);
    const cerrado = await page.evaluate(() => document.getElementById('hearts-panel').classList.contains('collapsed'));
    rec(`4. Segundo clic KPI ${nombre} cierra panel`, cerrado);
  }

  // 5. Panel derecho y filtros
  await page.click('#right-drawer-handle');
  await sleep(600);
  for (const sel of ['[data-filter-diag="I10"]', '[data-filter-diag="E11"]', '[data-filter-diag="ALL"]', '[data-filter-semaforo="green"]', '[data-filter-semaforo="red"]']) {
    await page.click(sel);
    await sleep(400);
    const sub = await page.textContent('#patient-count-subtitle');
    rec('5. Filtro ' + sel, true, sub.trim());
  }
  // limpiar filtro semáforo pulsando de nuevo
  await page.click('[data-filter-semaforo="red"]');
  await sleep(300);
  rec('5. Quitar filtro semáforo', true, (await page.textContent('#patient-count-subtitle')).trim());
  await shot('05_panel_padron');

  // 6. Búsqueda
  const primer = await page.evaluate(() => { const p = window.app.patients[0]; return { id: p.id, dni: p.dni, nombre: p.apellidos_nombres }; });
  await page.fill('#search-input', primer.dni);
  await sleep(900);
  const resDni = await page.textContent('#patient-count-subtitle');
  rec('6.1 Búsqueda por DNI', /^1 de/.test(resDni.trim()), resDni.trim());
  const ape = primer.nombre.split(/[ ,]+/)[0];
  await page.fill('#search-input', ape);
  await sleep(900);
  rec('6.2 Búsqueda por apellido', true, (await page.textContent('#patient-count-subtitle')).trim());
  const clearVisible = await page.isVisible('#btn-clear-search');
  if (clearVisible) await page.click('#btn-clear-search'); else await page.fill('#search-input', '');
  await sleep(600);
  rec('6.3 Limpiar búsqueda', clearVisible, (await page.textContent('#patient-count-subtitle')).trim());
  // búsqueda sin resultado
  await page.fill('#search-input', 'zzzzzz-no-existe');
  await sleep(900);
  rec('6.4 Búsqueda sin resultados', true, (await page.textContent('#patient-list')).trim().slice(0, 80));
  await page.fill('#search-input', '');
  await page.press('#search-input', 'Enter');
  await sleep(600);

  // 7. Ficha clínica
  await page.click('#patient-list .patient-card .btn-precita');
  await sleep(1200);
  const ficha = await page.evaluate(() => {
    const m = document.getElementById('modal-patient-detail');
    if (!m) return null;
    return { visible: getComputedStyle(m).display !== 'none' && m.classList.contains('active'), text: m.innerText.replace(/\s+/g, ' ').slice(0, 2000), botones: [...m.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean) };
  });
  rec('7.1 Abrir ficha clínica', !!ficha && ficha.visible, ficha ? 'botones: ' + ficha.botones.join(' | ') : 'no se creó el modal');
  if (ficha) {
    const campos = ['DNI', 'Historia Clínica', 'Edad', 'Sexo', 'Fecha de Nacimiento', 'Seguro', 'Teléfono', 'Dirección', 'Sector', 'IPRESS', 'Presión Arterial', 'Glucosa', 'HbA1c', 'Renal', 'Lipídico', 'Evolución Trimestral'];
    const faltan = campos.filter(c => !ficha.text.toLowerCase().includes(c.toLowerCase()));
    rec('7.2 Campos de la ficha (según LEEME)', faltan.length === 0, faltan.length ? 'no aparecen: ' + faltan.join(', ') : 'los 16 campos aparecen');
    const undef = (ficha.text.match(/undefined|NaN|null\b|\[object Object\]/g) || []);
    rec('7.3 Ficha sin «undefined/NaN/null»', undef.length === 0, undef.join(','));
  }
  await shot('07_ficha_clinica');
  fs.writeFileSync(path.join(SHOTS, 'ficha_texto.txt'), ficha ? ficha.text : '');
  // cerrar
  await page.keyboard.press('Escape');
  await sleep(400);
  let fichaAbierta = await page.evaluate(() => { const m = document.getElementById('modal-patient-detail'); return !!m && m.classList.contains('active'); });
  rec('7.4 Escape cierra la ficha', !fichaAbierta);
  if (fichaAbierta) {
    const cerrar = await page.$('#modal-patient-detail .btn-close-accessible, #modal-patient-detail [aria-label*="errar"]');
    if (cerrar) await cerrar.click();
    await sleep(400);
    fichaAbierta = await page.evaluate(() => { const m = document.getElementById('modal-patient-detail'); return !!m && m.classList.contains('active'); });
    rec('7.5 Botón ✕ cierra la ficha', !fichaAbierta);
  }

  // 8. Ubicar en mapa
  await page.click('#patient-list .patient-card .btn-ubicar');
  await sleep(1800);
  const z = await page.evaluate(() => window.app.mapManager.map.getZoom());
  rec('8.1 «Ver» centra el mapa en el paciente', z >= 15, 'zoom ' + z);
  await shot('08_ubicar_paciente');

  // 8.2 clic en marcador
  const popup = await page.evaluate(() => {
    const capa = window.app.mapManager.layers.pacientes;
    const ls = capa.getLayers();
    if (!ls.length) return 'sin marcadores';
    const l = ls[0];
    l.fire('click');
    const pop = document.querySelector('.leaflet-popup-content');
    return pop ? pop.innerText.replace(/\s+/g, ' ').slice(0, 200) : 'sin popup';
  });
  await sleep(600);
  rec('8.2 Clic en marcador', popup !== 'sin marcadores', popup);
  await shot('08b_marcador');

  // 9. Panel izquierdo capas y red
  await page.evaluate(() => window.app.toggleHeartsPanel(false));
  await page.click('#left-drawer-handle');
  await sleep(600);
  const opts = await page.evaluate(() => ({
    ris: [...document.querySelectorAll('#select-ris option')].map(o => o.value + '=' + o.textContent.trim()),
    basemap: [...document.querySelectorAll('#select-basemap-sidebar option, #select-basemap option')].map(o => o.value)
  }));
  rec('9.1 Selector RIS', opts.ris.length > 0, opts.ris.join(' | ').slice(0, 400));
  const risVals = await page.$$eval('#select-ris option', os => os.map(o => o.value).filter(Boolean));
  if (risVals.length) {
    await page.selectOption('#select-ris', risVals[0]);
    await sleep(800);
    const zonas = await page.$$eval('#select-zona option', os => os.map(o => o.value).filter(Boolean));
    rec('9.2 Zonas tras elegir RIS', zonas.length > 0, `${zonas.length} zonas`);
    if (zonas.length) {
      await page.selectOption('#select-zona', zonas[0]);
      await sleep(800);
      const puertas = await page.$$eval('#select-puerta option', os => os.map(o => o.value).filter(Boolean));
      rec('9.3 Puertas de entrada tras elegir zona', puertas.length > 0, `${puertas.length} puertas`);
      if (puertas.length) { await page.selectOption('#select-puerta', puertas[0]); await sleep(1000); }
    }
    const info = (await page.textContent('#zona-info-panel')).replace(/\s+/g, ' ').trim().slice(0, 300);
    rec('9.4 Panel de información de zona', info.length > 0, info);
  }
  const hosps = await page.$$eval('#select-hospital option', os => os.map(o => o.value).filter(Boolean));
  if (hosps.length) {
    await page.selectOption('#select-hospital', hosps[0]);
    await sleep(1200);
    rec('9.5 Selector hospital de referencia', true, `${hosps.length} opciones`);
  }
  await shot('09_capas_red');
  // mapas base
  const bmVals = await page.$$eval('#select-basemap option', os => os.map(o => o.value));
  for (const v of bmVals) {
    await page.selectOption('#select-basemap', v);
    await sleep(1500);
    const t = await page.evaluate(() => { const imgs = [...document.querySelectorAll('.leaflet-tile')]; return `${imgs.filter(i => i.complete && i.naturalWidth > 0).length}/${imgs.length}`; });
    rec('9.6 Mapa base ' + v, null, 'mosaicos cargados ' + t);
  }
  await page.selectOption('#select-basemap', bmVals[0]);
  await page.evaluate(() => window.app.toggleLeftSidebar(false));
  // controles del mapa
  await page.evaluate(() => window.app.mapManager.home());
  await sleep(800);
  const zh = await page.evaluate(() => window.app.mapManager.map.getZoom());
  await page.evaluate(() => window.app.mapManager.zoomIn());
  await sleep(500);
  const zi = await page.evaluate(() => window.app.mapManager.map.getZoom());
  rec('9.7 Botones 🏠 / +', zi === zh + 1, `home zoom ${zh}, tras + ${zi}`);

  // 10. Tablero
  await page.click('#rail-tab-dashboard');
  await sleep(2500);
  const dash = await page.evaluate(() => ({
    visible: getComputedStyle(document.getElementById('view-dashboard')).display !== 'none',
    total: document.getElementById('dash-val-total').textContent.trim(),
    control: document.getElementById('dash-val-control').textContent.trim(),
    desercion: document.getElementById('dash-val-desercion').textContent.trim(),
    proximos: document.getElementById('dash-val-proximos').textContent.trim(),
    counts: ['green', 'yellow', 'red', 'purple', 'black'].map(c => document.getElementById('dash-count-' + c).textContent.trim()),
    patologias: document.getElementById('dash-pathology-list').innerText.replace(/\s+/g, ' ').slice(0, 300),
    convenio: document.getElementById('ind-convenio-tbody').innerText.replace(/\s+/g, ' ').slice(0, 600),
    est: document.getElementById('ind-est-tbody').innerText.replace(/\s+/g, ' ').slice(0, 400),
    ipress: document.getElementById('dash-ipress-tbody').innerText.replace(/\s+/g, ' ').slice(0, 500),
    periodo: (document.getElementById('ind-periodo') || {}).innerText
  }));
  rec('10.1 Tablero visible', dash.visible, `total ${dash.total} · control ${dash.control} · deserción ${dash.desercion} · próximos ${dash.proximos} · barra ${dash.counts.join('/')}`);
  rec('10.2 Patologías', dash.patologias.length > 0, dash.patologias);
  rec('10.3 Indicadores del convenio', dash.convenio.length > 0, dash.convenio);
  rec('10.4 Indicadores por establecimiento', dash.est.length > 0, dash.est);
  rec('10.5 Tabla IPRESS', dash.ipress.length > 0, dash.ipress);
  rec('10.6 Periodo indicadores', null, dash.periodo);
  await shot('10_tablero');
  await page.screenshot({ path: path.join(SHOTS, '10b_tablero_full.png'), fullPage: true });
  const kpiVsDash = Number(dash.total) === Number(kpis[0]);
  rec('10.7 Total del tablero = total del HUD', kpiVsDash, `${dash.total} vs ${kpis[0]}`);
  fs.writeFileSync(path.join(SHOTS, 'dash.json'), JSON.stringify(dash, null, 2));

  // Exportar Excel desde tablero
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
    page.evaluate(() => window.app.exportarPadronExcel())
  ]);
  if (dl) {
    const f = path.join(SHOTS, 'export_' + dl.suggestedFilename());
    await dl.saveAs(f);
    rec('10.8 Exportar Excel', fs.statSync(f).size > 1000, dl.suggestedFilename() + ' ' + fs.statSync(f).size + ' bytes');
  } else rec('10.8 Exportar Excel', false, 'no hubo descarga');

  await page.click('#rail-tab-mapa');
  await sleep(800);

  fs.writeFileSync(path.join(SHOTS, 'recorrido1.json'), JSON.stringify({ results, consoleErrors, pageErrors, failedReq, httpErr }, null, 2));
  console.log('\n--- errores de consola ---\n' + consoleErrors.join('\n'));
  console.log('--- errores de página ---\n' + pageErrors.join('\n'));
  console.log('--- peticiones fallidas ---\n' + [...new Set(failedReq)].slice(0, 30).join('\n'));
  console.log('--- HTTP >= 400 ---\n' + [...new Set(httpErr)].slice(0, 30).join('\n'));
  await browser.close();
})().catch(e => { console.error('ERROR FATAL', e); process.exit(1); });
