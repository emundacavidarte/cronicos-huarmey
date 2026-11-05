// Pruebas 1 y 2: carga inicial sin sesion; clave mala; clave buena ADMIN; conteo de pacientes.
const L = require('./lib');
function summ(a){const m={};a.forEach(x=>m[x]=(m[x]||0)+1);return m;}
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const bag = {};
  L.instrument(page, bag);
  const out = {};
  const t0 = Date.now();
  await page.goto(L.BASE + '/', { waitUntil: 'load' });
  out.t_load_ms = Date.now() - t0;
  await page.waitForSelector('#login-overlay.active', { timeout: 10000 });
  out.t_login_overlay_ms = Date.now() - t0;
  await L.sleep(1500);
  out.perf = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null };
  });
  out.cronicosAntesLogin = bag.requests.filter(r => /\/api\/(cronicos|patients|alerts|fhir)|\/fhir\//.test(r.url)).map(r => r.method + ' ' + r.url);
  out.apiAntesLogin = bag.requests.filter(r => /\/api\//.test(r.url)).map(r => r.method + ' ' + r.url);
  out.overlayVisible = await page.isVisible('#login-overlay');
  out.appInert = await page.evaluate(() => document.querySelector('.app-container').hasAttribute('inert'));
  out.consoleBeforeLogin = summ(bag.console.filter(c => c.type === 'error' || c.type === 'warning').map(c => c.type + ': ' + c.text.replace(/https?:\/\/\S+/,'') + ' @' + L.host(c.loc || '')));
  out.pageErrors = bag.pageErrors;
  out.respNo2xx = bag.responses.filter(r => L.isOwn(r.url) && (r.status >= 400)).map(r => r.status + ' ' + r.url);
  out.failedReqByHost = summ(bag.failed.map(f => L.host(f.url) + ' ' + f.err).map(x=>x.replace(/mt\d/,'mtN')));
  out.externalHosts = [...new Set(bag.requests.filter(r => !L.isOwn(r.url)).map(r => L.host(r.url)))];
  // Que hay en el DOM del mapa/lista antes de login (contenido de pacientes?)
  out.listaAntes = await page.evaluate(() => document.getElementById('patient-list').children.length);
  out.kpiAntes = await page.evaluate(() => document.getElementById('kpi-total').textContent);
  out.filterLabelAntes = await page.evaluate(() => document.getElementById('filter-active-label').textContent);
  out.subtitleAntes = await page.evaluate(() => document.getElementById('patient-count-subtitle').textContent);
  await page.screenshot({ path: L.W + '/shot_01_login.png' });

  // Clave mala
  const tBad = Date.now();
  await L.uiLogin(page, { username: 'admin', password: 'clave-incorrecta-xx' });
  await page.waitForFunction(() => document.getElementById('login-error').textContent.length > 0, null, { timeout: 8000 });
  out.badLogin = { ms: Date.now() - tBad, msg: await page.textContent('#login-error'), overlayStillVisible: await page.isVisible('#login-overlay') };
  out.sessionStorageAfterBad = await page.evaluate(k => sessionStorage.getItem(k), L.KEY);
  // Campos vacios
  await page.fill('#login-username', '');
  await page.fill('#login-password', '');
  await page.click('#login-submit');
  out.emptyMsg = await page.textContent('#login-error');

  // Clave buena
  const reqIdx = bag.requests.length;
  const tGood = Date.now();
  await L.uiLogin(page, L.ADMIN);
  await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active'), null, { timeout: 10000 });
  out.t_login_ok_ms = Date.now() - tGood;
  await page.waitForFunction(() => document.getElementById('kpi-total').textContent !== '0', null, { timeout: 15000 }).catch(() => {});
  out.t_kpi_ms = Date.now() - tGood;
  await L.sleep(1500);
  out.kpis = await page.evaluate(() => ['kpi-total', 'kpi-green', 'kpi-yellow', 'kpi-red', 'kpi-purple'].map(i => i + '=' + document.getElementById(i).textContent).join(' '));
  out.listaCards = await page.evaluate(() => document.querySelectorAll('#patient-list .patient-card').length);
  out.subtitle = await page.textContent('#patient-count-subtitle');
  out.filterLabel = await page.textContent('#filter-active-label');
  out.appPatients = await page.evaluate(() => window.app.patients.length);
  // Pines
  out.pins = await page.evaluate(() => {
    const m = window.app.mapManager;
    const layer = m.layers && m.layers.pacientes;
    let n = 0;
    if (layer && layer.eachLayer) layer.eachLayer(() => n++);
    return { layerCount: n, markersDom: document.querySelectorAll('.leaflet-marker-icon').length, canvas: !!document.querySelector('.leaflet-overlay-pane canvas, canvas.leaflet-zoom-animated') };
  });
  // API directa comparar
  const adm = await L.apiLogin(L.ADMIN);
  const api = await (await fetch(L.BASE + '/api/cronicos', { headers: { Authorization: 'Bearer ' + adm.token } })).json();
  out.apiCount = api.length;
  const ids = new Set(api.map(p => p.id));
  const appIds = await page.evaluate(() => window.app.patients.map(p => p.id));
  out.idsMatch = appIds.length === api.length && appIds.every(i => ids.has(i));
  out.afterLoginApiCalls = bag.requests.slice(reqIdx).filter(r => /\/api\//.test(r.url)).map(r => r.method + ' ' + r.url.replace(L.BASE, ''));
  out.sessionKeys = await page.evaluate(() => ({ ss: Object.keys(sessionStorage), ls: Object.keys(localStorage) }));
  await page.screenshot({ path: L.W + '/shot_02_admin_map.png' });
  out.consoleAll = summ(bag.console.filter(c => c.type === 'error' || c.type === 'warning').map(c => c.type + ': ' + c.text.replace(/https?:\/\/\S+/,'') + ' @' + L.host(c.loc || '').replace(/mt\d/,'mtN')));
  out.pageErrorsAll = bag.pageErrors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
