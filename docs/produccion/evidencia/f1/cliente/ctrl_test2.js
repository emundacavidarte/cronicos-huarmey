const L = require('./lib');
(async () => {
  const browser = await L.launch();
  for (const v of ['a', 'b']) {
    const ctx = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await ctx.newPage();
    const base = L.BASE + '/' + v + '/';
    await page.goto(base, { waitUntil: 'load' }); await L.sleep(2500);
    const n = () => page.evaluate(async () => { const ks = await caches.keys(); let t = 0; for (const k of ks) t += (await (await caches.open(k)).keys()).length; return t; });
    const seq = [await n()];
    for (let i = 1; i <= 3; i++) { await page.reload({ waitUntil: 'load' }); await L.sleep(1500); seq.push(await n()); }
    console.log('SW control', v === 'a' ? '(logica de la app: put sin esperar)' : '(put con waitUntil)', 'entradas por carga:', seq.join(' -> '));
    await ctx.close();
  }
  await browser.close();
})();
