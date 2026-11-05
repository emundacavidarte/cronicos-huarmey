const L = require('./lib');
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active');
  await L.uiLogin(page, L.DIRE); await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active')); await L.sleep(1200);
  const out = {};
  out.navMovil = await page.evaluate(() => [...document.querySelectorAll('.mobile-nav-item')].filter(b => b.offsetParent !== null).map(b => b.innerText.trim()));
  out.railAntes = await page.evaluate(() => getComputedStyle(document.getElementById('app-nav-rail')).display + ' ' + Math.round(document.getElementById('app-nav-rail').getBoundingClientRect().width));
  // la hamburguesa del encabezado esta visible en pantalla?
  const hb = await page.evaluate(() => { const r = document.getElementById('btn-toggle-rail').getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), vis: r.left >= 0 && r.right <= innerWidth }; });
  out.hamburguesa = hb;
  await page.click('#btn-toggle-rail').catch(e => out.hbErr = e.message.slice(0, 60)); await L.sleep(500);
  out.railTrasHamburguesa = await page.evaluate(() => { const r = document.getElementById('app-nav-rail'); const b = r.getBoundingClientRect(); const t = document.getElementById('rail-tab-dashboard').getBoundingClientRect(); return { display: getComputedStyle(r).display, left: Math.round(b.left), width: Math.round(b.width), dashBtn: { l: Math.round(t.left), w: Math.round(t.width), h: Math.round(t.height) }, bodyClass: document.body.className.slice(0, 80) }; });
  await page.screenshot({ path: L.W + '/shot_09c_director_movil.png' });
  await page.click('#rail-tab-dashboard', { timeout: 3000 }).then(() => out.clickDash = 'ok').catch(e => out.clickDash = 'no clickeable: ' + e.message.split('\n')[0].slice(0, 80));
  await L.sleep(800);
  out.vistaDash = await page.evaluate(() => getComputedStyle(document.getElementById('view-dashboard')).display);
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
