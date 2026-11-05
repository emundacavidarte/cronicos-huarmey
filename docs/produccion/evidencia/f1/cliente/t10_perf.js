// Prueba 10: Lighthouse-lite: transferencia, peticiones, tiempos (con y sin cache, con red 3G emulada)
const L = require('./lib');
async function medir(label, { throttle, warm, ctxOpts } = {}) {
  const browser = await L.launch();
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'allow' }, ctxOpts || {}));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  const rec = { reqs: new Map(), done: 0, bytes: 0, byType: {}, own: 0, ext: 0, extFail: 0 };
  cdp.on('Network.requestWillBeSent', e => { rec.reqs.set(e.requestId, { url: e.request.url, type: e.type }); });
  cdp.on('Network.loadingFinished', e => { const r = rec.reqs.get(e.requestId); if (!r) return; const own = r.url.startsWith(L.BASE); if (own) { rec.bytes += e.encodedDataLength; rec.byType[r.type] = (rec.byType[r.type] || 0) + e.encodedDataLength; rec.done++; } });
  const consoleErr = []; page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|google\.com/.test(m.text() + (m.location().url || ''))) consoleErr.push(m.text().slice(0, 100)); });
  const pageErr = []; page.on('pageerror', e => pageErr.push(e.message.slice(0, 100)));
  async function carga() {
    rec.reqs.clear(); rec.bytes = 0; rec.byType = {}; rec.done = 0;
    const t0 = Date.now();
    await page.goto(L.BASE + '/', { waitUntil: 'load', timeout: 180000 });
    const tLoad = Date.now() - t0;
    await page.waitForSelector('#login-overlay.active', { timeout: 180000 });
    const tLogin = Date.now() - t0;
    await L.sleep(1200);
    const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const p = performance.getEntriesByType('paint').map(x => x.name + '=' + Math.round(x.startTime)).join(' '); const res = performance.getEntriesByType('resource').filter(r => r.name.startsWith(location.origin)); return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), paint: p, resCount: res.length, transfer: res.reduce((a, r) => a + r.transferSize, 0), decoded: res.reduce((a, r) => a + r.decodedBodySize, 0) }; });
    return { tLoad, tLogin, nav, reqsPropias: [...rec.reqs.values()].filter(r => r.url.startsWith(L.BASE)).length, bytesCDP: rec.bytes, porTipo: Object.fromEntries(Object.entries(rec.byType).map(([k, v]) => [k, Math.round(v / 1024) + 'KB'])) };
  }
  if (throttle) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: throttle.lat, downloadThroughput: throttle.down / 8, uploadThroughput: throttle.up / 8 });
  if (throttle && throttle.cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle.cpu });
  const r = { label };
  r.primeraCarga = await carga();
  if (warm) { await L.sleep(1500); r.segundaCarga_conCache = await carga(); }
  consoleErr.length && (r.consoleErrors = consoleErr.slice(0, 5)); pageErr.length && (r.pageErrors = pageErr);
  await browser.close();
  return r;
}
(async () => {
  const out = [];
  out.push(await medir('sin throttling, cache fria y luego recarga', { warm: true }));
  out.push(await medir('Fast 3G (1.6 Mbps, 150 ms) + CPU x4, cache fria', { throttle: { down: 1.6e6, up: 0.75e6, lat: 150, cpu: 4 } }));
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error('ERR', e); process.exit(1); });
