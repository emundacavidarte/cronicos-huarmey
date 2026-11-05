const L = require('./lib');
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active'); await L.sleep(1500);
  const out = {};
  try { out.installabilityErrors = (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors; } catch (e) { out.installabilityErrors = 'no disponible: ' + e.message.slice(0, 60); }
  try { const m = await cdp.send('Page.getAppManifest'); out.manifestErrors = m.errors.map(e => e.message.slice(0, 120)); out.manifestUrl = m.url.replace(L.BASE, ''); } catch (e) { out.manifest = 'no disponible: ' + e.message.slice(0, 60); }
  out.themeColorMeta = await page.evaluate(() => (document.querySelector('meta[name=theme-color]') || {}).content || null);
  out.viewportMeta = await page.evaluate(() => (document.querySelector('meta[name=viewport]') || {}).content || null);
  out.lang = await page.evaluate(() => document.documentElement.lang);
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
