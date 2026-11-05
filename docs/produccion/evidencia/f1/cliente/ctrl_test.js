const L = require('./lib');
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  await page.goto(L.BASE + '/', { waitUntil: 'load' }); await L.sleep(2500);
  const n = () => page.evaluate(async () => { const ks = await caches.keys(); let t = 0; for (const k of ks) t += (await (await caches.open(k)).keys()).length; return t; });
  console.log('t0', await n());
  for (let i = 1; i <= 3; i++) { await page.reload({ waitUntil: 'load' }); await L.sleep(2000); console.log('recarga', i, await n()); }
  await ctx.setOffline(true);
  const r = await page.goto(L.BASE + '/', { waitUntil: 'load' }).catch(e => ({ status: () => 'err ' + e.message.slice(0, 40) }));
  await L.sleep(1500);
  console.log('offline: status', r.status(), 'app', await page.evaluate(() => typeof window.app).catch(() => '?'), 'entradas', await n().catch(() => '?'));
  await browser.close();
})();
