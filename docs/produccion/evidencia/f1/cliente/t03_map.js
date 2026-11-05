// Prueba 3: mapa (pines, popup, filtros, buscador, capas GeoRIS: tiempos)
const L = require('./lib');
function summ(a){const m={};a.forEach(x=>m[x]=(m[x]||0)+1);return m;}
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage();
  const bag = {};
  L.instrument(page, bag);
  const out = {};
  await page.goto(L.BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('#login-overlay.active');
  await L.uiLogin(page, L.ADMIN);
  await page.waitForFunction(() => window.app.patients.length > 0);
  await L.sleep(1500);
  out.patientPins = await page.evaluate(() => document.querySelectorAll('.pin-patient-container').length);
  out.allMarkerIcons = await page.evaluate(() => document.querySelectorAll('.leaflet-marker-icon').length);
  out.markerClassesBreakdown = await page.evaluate(() => { const m = {}; document.querySelectorAll('.leaflet-marker-icon').forEach(e => { const c = e.className.replace(/leaflet-\S+/g,'').trim(); m[c] = (m[c]||0)+1; }); return m; });
  out.mapCenterZoom = await page.evaluate(() => { const m = window.app.mapManager.map; const c = m.getCenter(); return { lat: +c.lat.toFixed(4), lng: +c.lng.toFixed(4), z: m.getZoom() }; });
  // cuantos pines de paciente estan dentro de la vista actual?
  out.pinsInView = await page.evaluate(() => { const m = window.app.mapManager.map; const b = m.getBounds(); return window.app.patients.filter(p => b.contains([p.latitud, p.longitud])).length; });
  out.patientsWithoutCoords = await page.evaluate(() => window.app.patients.filter(p => p.latitud == null || p.longitud == null).length);
  // click en un pin
  const pin = page.locator('.pin-patient-container').first();
  await pin.scrollIntoViewIfNeeded().catch(()=>{});
  await pin.click({ force: true });
  await page.waitForSelector('.leaflet-popup .georis-popup', { timeout: 5000 }).catch(() => {});
  out.popupOpen = await page.isVisible('.leaflet-popup .georis-popup');
  out.popupTextLen = out.popupOpen ? (await page.textContent('.leaflet-popup .georis-popup')).length : 0;
  await page.screenshot({ path: L.W + '/shot_03_popup.png' });
  // click Ficha HEARTS desde popup
  if (out.popupOpen) {
    await page.click('.leaflet-popup [data-patient-action="detail"]');
    await L.sleep(700);
    out.fichaDesdePopup = await page.isVisible('#modal-patient-detail');
    await page.screenshot({ path: L.W + '/shot_03_ficha.png' });
    // cerrar ficha
    await page.keyboard.press('Escape');
    await L.sleep(300);
    out.fichaCerradaConEsc = !(await page.isVisible('#modal-patient-detail').catch(()=>false));
    if (!out.fichaCerradaConEsc) { const c = page.locator('#modal-patient-detail .btn-close-accessible, #modal-patient-detail [aria-label*="errar"]').first(); if (await c.count()) await c.click(); }
  }
  // Filtros
  async function count() { return await page.evaluate(() => ({ cards: document.querySelectorAll('#patient-list .patient-card').length, pins: document.querySelectorAll('.pin-patient-container').length, label: document.getElementById('filter-active-label').textContent })); }
  // abrir panel padron
  await page.click('#rail-tab-padron');
  await L.sleep(500);
  out.base = await count();
  const dist = await page.evaluate(() => { const m = {}; window.app.patients.forEach(p => { const k = (p.diagnosticos||[]).join('+') + '|' + p.semaforo + (p.fallecido?'|F':''); m[k]=(m[k]||0)+1; }); return m; });
  out.distribucion = dist;
  const exp = await page.evaluate(() => ({
    hta: window.app.patients.filter(p => (p.diagnosticos||[]).some(d => d.startsWith('I1'))).length,
    dm: window.app.patients.filter(p => (p.diagnosticos||[]).some(d => d.startsWith('E1'))).length,
    green: window.app.patients.filter(p => p.semaforo === 'green').length,
    yellow: window.app.patients.filter(p => p.semaforo === 'yellow').length,
    red: window.app.patients.filter(p => p.semaforo === 'red').length,
    purple: window.app.patients.filter(p => p.semaforo === 'purple' || p.fuente === 'HOSIX').length
  }));
  out.esperadoPorDatos = exp;
  out.filtros = {};
  for (const [sel, name] of [['[data-filter-diag="I10"]', 'HTA'], ['[data-filter-diag="E11"]', 'DM2'], ['[data-filter-diag="ALL"]', 'Todos'], ['[data-filter-semaforo="green"]', 'verde'], ['[data-filter-semaforo="yellow"]', 'amarillo'], ['[data-filter-semaforo="red"]', 'rojo'], ['[data-filter-semaforo="purple"]', 'morado']]) {
    await page.click(sel);
    await L.sleep(250);
    out.filtros[name] = await count();
  }
  // Click otra vez en semaforo purple (toggle?) y en Todos
  await page.click('[data-filter-diag="ALL"]');
  await L.sleep(250);
  out.tras_todos_con_semaforo_activo = await count();
  out.chipsActivos = await page.evaluate(() => [...document.querySelectorAll('.filter-chip.active')].map(e => e.textContent.trim()));
  // KPI click
  await page.click('#card-kpi-red');
  await L.sleep(300);
  out.kpiRojo = await count();
  await page.click('#card-kpi-total');
  await L.sleep(300);
  out.kpiTotal = await count();
  // Buscador
  const nombres = await page.evaluate(() => window.app.patients.map(p => p.apellidos_nombres));
  const dnis = await page.evaluate(() => window.app.patients.map(p => p.dni));
  await page.fill('#search-input', dnis[3]);
  await L.sleep(500);
  out.busquedaPorDni = await count();
  await page.fill('#search-input', nombres[5].split(' ')[0].toLowerCase());
  await L.sleep(500);
  out.busquedaPorApellido = await count();
  out.busquedaApellidoEsperado = nombres.filter(n => n.toLowerCase().includes(nombres[5].split(' ')[0].toLowerCase())).length;
  await page.fill('#search-input', 'zzzzzzz');
  await L.sleep(500);
  out.busquedaSinResultado = await count();
  await page.fill('#search-input', '');
  await L.sleep(300);
  await page.press('#search-input', 'Enter');
  // Enter con DNI
  await page.fill('#search-input', dnis[2]);
  await page.press('#search-input', 'Enter');
  await L.sleep(800);
  out.enterBusqueda = { toast: await page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent.trim())), centro: await page.evaluate(() => { const m = window.app.mapManager.map; const c = m.getCenter(); return { z: m.getZoom() }; }) };
  await page.fill('#search-input', '');
  await page.screenshot({ path: L.W + '/shot_03_filtros.png' });

  // Capas GeoRIS: tiempos y bytes
  const geo = bag.responses.filter(r => /georis|Bundle\.js/.test(r.url) && L.isOwn(r.url));
  out.georisRequests = geo.map(r => ({ url: r.url.replace(L.BASE, ''), status: r.status, len: r.len, enc: r.enc, t: r.t }));
  out.georisBundleTiming = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => /georis|Bundle/.test(e.name)).map(e => ({ n: e.name.split('/').pop().split('?')[0], start: Math.round(e.startTime), dur: Math.round(e.duration), transfer: e.transferSize, decoded: e.decodedBodySize })));
  out.scriptEntries = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => e.initiatorType === 'script' && e.name.includes('localhost')).map(e => e.name.split('/').pop().split('?')[0] + ':' + Math.round(e.duration)).join(' '));
  // Activar capas: abrir sidebar y marcar checkboxes
  await page.click('#rail-btn-capas');
  await L.sleep(500);
  const checks = await page.$$eval('#left-sidebar input[type=checkbox]', els => els.map(e => ({ id: e.id, checked: e.checked, label: (e.closest('label') || {}).textContent ? e.closest('label').textContent.trim().slice(0, 50) : '' })));
  out.checkboxesCapas = checks;
  const tCapas = Date.now();
  const before = await page.evaluate(() => document.querySelectorAll('.leaflet-overlay-pane path').length);
  for (const c of checks) { if (!c.checked && c.id) { await page.evaluate(id => document.getElementById(id).click(), c.id); await L.sleep(300); } }
  await L.sleep(1500);
  out.pathsAntes = before;
  out.pathsDespues = await page.evaluate(() => document.querySelectorAll('.leaflet-overlay-pane path').length);
  out.msActivarCapas = Date.now() - tCapas;
  // zoom out a RIS y cambiar a otra RIS
  const tRis = Date.now();
  await page.selectOption('#select-ris', 'ALL').catch(e => out.selectRisErr = e.message.slice(0, 100));
  await L.sleep(1200);
  out.msSelectRisAll = Date.now() - tRis;
  out.pathsRisAll = await page.evaluate(() => document.querySelectorAll('.leaflet-overlay-pane path').length);
  await page.screenshot({ path: L.W + '/shot_03_capas.png' });
  out.pageErrors = bag.pageErrors;
  out.consoleErr = summ(bag.console.filter(c => c.type === 'error' || c.type==='warning').map(c => c.text.replace(/https?:\/\/\S+/, '') + ' @' + L.host(c.loc || '').replace(/mt\d/, 'mtN')));
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
