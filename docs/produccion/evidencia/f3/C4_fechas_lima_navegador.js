// Evidencia Fase 3 — el panel «en vivo» del Registro Clínico con el navegador en hora de Lima (los usuarios reales).
// Cita programada HOY, a +8 días y AYER: ¿qué estado y qué días muestra el formulario?
// Uso: ADMIN_PASSWORD=<clave> BASE=http://127.0.0.1:3263 node C4_fechas_lima_navegador.js
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3263';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, timezoneId: 'America/Lima' });
  const page = await ctx.newPage(); page.setDefaultTimeout(10000);
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '/'); await page.waitForSelector('#login-overlay.active');
  await page.fill('#login-username', 'admin'); await page.fill('#login-password', process.env.ADMIN_PASSWORD);
  await page.click('#login-submit');
  await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active')); await sleep(1200);
  const tz = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone + ' · hoy (Lima) = ' + window.FechaLima.hoy() + ' · hora local ' + new Date().toTimeString().slice(0, 5));
  console.log('Navegador:', tz);
  await page.click('#rail-btn-nuevo'); await page.waitForSelector('#reg-proxima-cita', { state: 'visible' });
  for (const [etiqueta, off] of [['HOY', 0], ['a +8 días', 8], ['AYER', -1]]) {
    const f = await page.evaluate(n => window.FechaLima.hoy(n), off);
    await page.fill('#reg-proxima-cita', f); await sleep(300);
    const estado = (await page.textContent('#live-estado-cita')).trim();
    const atraso = (await page.textContent('#live-dias-atraso')).trim();
    const pill = (await page.textContent('#live-semaforo-pill')).trim();
    console.log(`Próxima cita ${etiqueta} (${f}) → estado «${estado}» · atraso «${atraso}» · semáforo «${pill}»`);
  }
  await browser.close();
})().catch(e => { console.error('ERROR', e); process.exit(1); });
