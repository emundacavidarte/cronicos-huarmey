const L = require('./lib');
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active');
  await L.uiLogin(page, L.ADMIN); await page.waitForFunction(() => window.app.patients.length > 0); await L.sleep(500);
  await page.click('#btn-usuarios'); await L.sleep(1200);
  const out = await page.evaluate(() => { const l = document.getElementById('usuarios-lista'); const it = [...l.querySelectorAll('*')].find(e => /Brien/.test(e.textContent) && e.children.length === 0); return { filas: l.children.length, italicoInyectado: !!l.querySelector('i'), textoFila: it ? it.textContent.slice(0, 50) : null, htmlFila: it ? it.innerHTML.slice(0, 80) : null }; });
  console.log(JSON.stringify(out));
  await browser.close();
})();
