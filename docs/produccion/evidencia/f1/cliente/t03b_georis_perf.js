// Prueba 3 (parte B): costo de las capas GeoRIS: tareas largas al cargar, cambio de RIS, zoom, catastro
const L = require('./lib');
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  await ctx.addInitScript(() => { window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }))).observe({ entryTypes: ['longtask'] }); } catch (e) {} });
  const page = await ctx.newPage();
  await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.waitForSelector('#login-overlay.active');
  const out = {};
  out.longTasksCarga = await page.evaluate(() => ({ n: window.__lt.length, max: Math.max(0, ...window.__lt.map(x => x.d)), total: window.__lt.reduce((a, x) => a + x.d, 0), lista: window.__lt.slice(0, 6) }));
  out.bundles = await page.evaluate(() => ({ georisBundle: !!(window.GeorisTerritory && window.GeorisTerritory.bundle), ris: window.GeorisTerritory && window.GeorisTerritory.bundle && window.GeorisTerritory.bundle.ris.features.length, zonas: window.GeorisTerritory && window.GeorisTerritory.bundle.zonas && window.GeorisTerritory.bundle.zonas.features.length, sectores: window.GeorisTerritory && window.GeorisTerritory.bundle.sectores && window.GeorisTerritory.bundle.sectores.features.length }));
  await L.uiLogin(page, L.ADMIN); await page.waitForFunction(() => window.app.patients.length > 0); await L.sleep(1000);
  const timed = (label, fn) => page.evaluate(async ({ fnStr }) => { window.__lt.length = 0; const t0 = performance.now(); await eval('(' + fnStr + ')')(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const dt = Math.round(performance.now() - t0); await new Promise(r => setTimeout(r, 600)); return { ms: dt, longTasks: window.__lt.length, maxLong: Math.max(0, ...window.__lt.map(x => x.d)) }; }, { fnStr: fn.toString() });
  out.seleccionarTodasRIS = await timed('ris all', async () => { window.app.selectRis('ALL'); });
  out.seleccionarRIS156 = await timed('ris 156', async () => { window.app.selectRis('156'); });
  out.zoom17 = await timed('zoom', async () => { window.app.mapManager.map.setView([-10.0678, -78.1533], 17, { animate: false }); });
  out.zoom12 = await timed('zoom12', async () => { window.app.mapManager.map.setView([-10.0478, -78.1548], 12, { animate: false }); });
  out.capasEnMapa = await page.evaluate(() => { const m = window.app.mapManager.layers; return Object.keys(m).map(k => k + ':' + (m[k] && m[k].getLayers ? m[k].getLayers().length : '?')).join(' '); });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
