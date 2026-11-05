// Evidencia Fase 4 — instalabilidad de la PWA e íconos del manifiesto (Chromium). Uso: BASE=http://127.0.0.1:3254 node 05_pwa.js
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3254';
(async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext()).newPage();
  await page.goto(BASE + '/');
  await page.waitForTimeout(2500);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  const iconos = await page.evaluate(async () => {
    const m = await (await fetch('manifest.json')).json();
    return Promise.all(m.icons.map(async i => {
      const img = new Image(); img.src = i.src; await img.decode();
      return `${i.src} declarado ${i.sizes}, real ${img.naturalWidth}x${img.naturalHeight}`;
    }));
  });
  console.log('errores de instalabilidad:', JSON.stringify(installabilityErrors));
  iconos.forEach(t => console.log('ícono:', t));
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
