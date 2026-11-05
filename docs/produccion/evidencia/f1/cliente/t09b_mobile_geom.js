const L = require('./lib');
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active');
  await L.uiLogin(page, L.ADMIN); await page.waitForFunction(() => window.app.patients.length > 0); await L.sleep(1000);
  const out = {};
  out.header = await page.evaluate(() => { const h = document.querySelector('header, .google-top-bar, .georis-header, .top-bar') || document.getElementById('search-input').closest('header') ; const s = document.getElementById('search-input'); const wrap = s.closest('.georis-search-wrapper, .search-container, .georis-search-box') || s.parentElement; const sb = s.getBoundingClientRect(); let a = s, chain = []; while (a && a !== document.body) { const cs = getComputedStyle(a); chain.push(a.tagName + '.' + (a.className || '').toString().split(' ')[0] + ' ox=' + cs.overflowX + ' w=' + Math.round(a.getBoundingClientRect().width) + ' sw=' + a.scrollWidth); a = a.parentElement; } return { searchRect: { l: Math.round(sb.left), r: Math.round(sb.right), w: Math.round(sb.width) }, vis: getComputedStyle(s).display, chain: chain.slice(0, 6), innerW: innerWidth }; });
  // se puede enfocar y escribir? ¿se ve en pantalla?
  out.buscadorVisibleEnPantalla = await page.evaluate(() => { const r = document.getElementById('search-input').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.width > 40; });
  out.hearts = await page.evaluate(async () => { window.app.toggleHeartsPanel(true); await new Promise(r => setTimeout(r, 700)); const p = document.getElementById('hearts-panel'); const r = p.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), vw: innerWidth }; });
  await page.screenshot({ path: L.W + '/shot_09b_panel_dsf1.png' });
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error('ERR', e); process.exit(1); });
