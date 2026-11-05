// Con la copia corregida (solo en mi carpeta) para ver QUE hace la app sin red cuando el cache SI sobrevive.
const L = require('./lib');
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  await page.goto(L.BASE + '/', { waitUntil: 'load' }); await L.sleep(2500);
  await page.reload({ waitUntil: 'load' }); await L.sleep(1500);
  // sesion previa simulada (sessionStorage) como si ya hubiera iniciado sesion
  await page.evaluate(k => sessionStorage.setItem(k, JSON.stringify({ token: 'tok.simulado', expires_at: new Date(Date.now() + 3600e3).toISOString(), user: { username: 'admin', nombre: 'X', role: 'ADMIN', red: null } })), L.KEY);
  await ctx.setOffline(true);
  await page.goto(L.BASE + '/', { waitUntil: 'load' }); await L.sleep(2000);
  console.log('offline con sesion previa:', JSON.stringify(await page.evaluate(() => ({ app: typeof window.app, overlay: document.getElementById('login-overlay').classList.contains('active'), msg: document.getElementById('login-error').textContent, tokenKept: !!sessionStorage.getItem('maxime_cronicos_sesion_v1') }))));
  await page.fill('#login-username', 'admin'); await page.fill('#login-password', 'cualquiera-123'); await page.click('#login-submit'); await L.sleep(1200);
  console.log('intento de login offline:', await page.textContent('#login-error'));
  await page.screenshot({ path: L.W + '/shot_06_offline_cachefix.png' });
  await browser.close();
})();
