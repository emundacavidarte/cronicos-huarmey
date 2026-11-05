// Prueba 6: sin conexion, service worker, almacenamiento (solo claves y conteos, no contenido)
const L = require('./lib');
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const bag = {}; L.instrument(page, bag);
  const L_isOwn = u => u.startsWith(L.BASE);
  const out = {}; globalThis.__out = out;
  await page.goto(L.BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('#login-overlay.active');
  out.swState = await page.evaluate(async () => { const reg = await navigator.serviceWorker.ready; return { scope: reg.scope.replace(location.origin, ''), active: !!reg.active, state: reg.active && reg.active.state }; });
  await L.sleep(1500);
  await L.uiLogin(page, L.ADMIN);
  await page.waitForFunction(() => window.app.patients.length > 0);
  await L.sleep(1200);
  await page.evaluate(() => { const p = window.app.patients[2]; window.app.openPatientDetail(p.id); }); await L.sleep(400);
  await page.evaluate(() => { const m = document.getElementById('modal-patient-detail'); if (m) m.classList.remove('active'); });
  const dnis = await page.evaluate(() => window.app.patients.map(p => p.dni));
  const scan = async (label) => page.evaluate(async ({ dnis }) => {
    const r = { cacheNames: [], cacheEntries: 0, cacheApiUrls: [], cacheWithPatientData: 0, idb: [], ls: {}, ss: {}, lsPatientHits: 0, ssPatientHits: 0 };
    for (const n of await caches.keys()) {
      const c = await caches.open(n); const reqs = await c.keys();
      r.cacheNames.push(n + ' (' + reqs.length + ')'); r.cacheEntries += reqs.length;
      for (const q of reqs) {
        const u = new URL(q.url);
        if (/\/api\/|\/fhir\//.test(u.pathname)) r.cacheApiUrls.push(u.pathname);
        // buscar DNI simulados dentro de respuestas de texto pequenas (<400KB) que no sean librerias
        if (!/georis|xlsx|leaflet/.test(u.pathname)) {
          try { const t = await (await c.match(q)).clone().text(); if (t.length < 400000 && dnis.some(d => t.includes(d))) r.cacheWithPatientData++; } catch (e) {}
        }
      }
    }
    try { const dbs = indexedDB.databases ? await indexedDB.databases() : []; r.idb = dbs.map(d => d.name + ' v' + d.version); } catch (e) { r.idb = ['err ' + e.message]; }
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const v = localStorage.getItem(k); r.ls[k] = v.length; if (dnis.some(d => v.includes(d))) r.lsPatientHits++; }
    for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); const v = sessionStorage.getItem(k); r.ss[k] = v.length; if (dnis.some(d => v.includes(d))) r.ssPatientHits++; }
    return r;
  }, { dnis });
  out.storageConSesion = await scan();
  // lista de cache vs ASSETS_TO_CACHE del sw: ¿cuantos del precache faltan?
  const swSrc = L.fs.readFileSync('/home/user/cronicos-huarmey/client/sw.js', 'utf8');
  const assets = [...swSrc.matchAll(/'(\.\/[^']*)'/g)].map(m => m[1]).filter(a => a !== './');
  out.assetsDeclarados = assets.length;
  const statuses = []; for (const a of assets) { const r = await fetch(L.BASE + '/' + a.slice(2)); statuses.push(r.status + ((r.headers.get('content-type') || '').includes('html') && !a.endsWith('.html') ? ' (HTML!)' : '')); }
  out.assetsNo200 = assets.filter((a, i) => !/^200$/.test(statuses[i])).map((a, i) => a);
  // offline con sesion
  await ctx.setOffline(true);
  const t0 = Date.now();
  const resp = await page.reload({ waitUntil: 'load' }).catch(e => ({ err: e.message }));
  out.offlineReload = { ms: Date.now() - t0, status: resp && resp.status ? resp.status() : String(resp && resp.err).slice(0, 80), fromSW: resp && resp.fromServiceWorker ? resp.fromServiceWorker() : null };
  await L.sleep(2500);
  out.offlineUI = await page.evaluate(() => ({ title: document.title, loginActive: document.getElementById('login-overlay').classList.contains('active'), loginMsg: document.getElementById('login-error').textContent, appInert: document.querySelector('.app-container').hasAttribute('inert'), appPresent: typeof window.app, patients: window.app ? window.app.patients.length : null, sessionTokenKept: !!sessionStorage.getItem('maxime_cronicos_sesion_v1') }));
  out.offlineConsole = bag.console.filter(c => c.type === 'error').slice(-6).map(c => c.text.slice(0, 100).replace(/https?:\/\/\S+/, ''));
  await page.screenshot({ path: L.W + '/shot_06_offline.png' });
  out.offlineCacheTras = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return (await c.keys()).length; });
  out.offlineResourceFails = bag.responses.filter(r => L_isOwn(r.url) && r.status >= 400).map(r => r.status + ' ' + r.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]);
  out.offlineStorage = await scan();
  // vuelve la red
  await ctx.setOffline(false);
  await page.reload({ waitUntil: 'load' }); await L.sleep(1200);
  // segunda visita online (la tipica): cuantas entradas quedan y que pasa sin red
  await page.reload({ waitUntil: 'load' }); await L.sleep(1500);
  out.cacheTras3Cargas = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); const u = (await c.keys()).map(r => new URL(r.url).pathname); return { n: u.length, hayIndex: u.includes('/index.html') || u.includes('/'), hayCss: u.some(x => x.endsWith('.css')), hayJs: u.filter(x => x.endsWith('.js')).length }; });
  await ctx.setOffline(true);
  const resp2 = await page.goto(L.BASE + '/', { waitUntil: 'load' }).catch(e => ({ err: e.message }));
  await L.sleep(1500);
  out.offlineTras3Cargas = { status: resp2 && resp2.status ? resp2.status() : String(resp2 && resp2.err).slice(0, 60), body: (await page.evaluate(() => document.body ? document.body.innerText.slice(0, 60) : 'sin body').catch(() => '?')), app: await page.evaluate(() => typeof window.app).catch(() => '?') };
  await page.screenshot({ path: L.W + '/shot_06_offline2.png' });
  await ctx.setOffline(false);
  await page.goto(L.BASE + '/', { waitUntil: 'load' }); await L.sleep(800);
  await page.waitForSelector('#login-overlay.active');
  await L.uiLogin(page, L.ADMIN);
  await page.waitForFunction(() => window.app && window.app.patients.length > 0); await L.sleep(500);
  // cerrar sesion
  await page.click('#btn-logout'); await L.sleep(600);
  out.trasSalir = await scan();
  out.trasSalirUI = await page.evaluate(() => ({ patientsMem: window.app.patients.length, cards: document.querySelectorAll('#patient-list .patient-card').length, pins: document.querySelectorAll('.pin-patient-container').length, kpi: document.getElementById('kpi-total').textContent, loginMsg: document.getElementById('login-error').textContent }));
  // memoria de la pagina: ¿algun objeto global con pacientes?
  out.trasSalirGlobals = await page.evaluate(() => { const hits = []; for (const k of Object.keys(window)) { try { const v = window[k]; if (Array.isArray(v) && v.length > 5 && v[0] && v[0].dni) hits.push(k + '[' + v.length + ']'); } catch (e) {} } return hits; });
  // boton Atras tras salir: ¿bfcache/estado?
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', String(e.message).slice(0,200)); console.log(JSON.stringify(globalThis.__out, null, 1)); process.exit(1); });
