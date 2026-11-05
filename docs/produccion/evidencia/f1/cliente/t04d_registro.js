// Prueba 4 (parte C): Registro clinico (calculos en vivo), edad, geocodificacion
const L = require('./lib');
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const bag = {}; L.instrument(page, bag);
  page.on('dialog', async d => { (bag.dialogs = bag.dialogs || []).push(d.message().slice(0, 120)); await d.accept(); });
  await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active');
  await L.uiLogin(page, L.ADMIN);
  await page.waitForFunction(() => window.app.patients.length > 0); await L.sleep(500);
  const out = {};
  // geocodificador
  out.geocode = await page.evaluate(() => { const g = window.AncashGeocoder || window.ancashGeocoder; const f = a => { const r = g.geocode(a); return { matched: r.matched, lat: r.lat, lng: r.lng, precision: r.precision_geo || r.precision }; }; return { bolognesi: f('Jr. Bolognesi 123'), prueba: f('Jr. Prueba 123'), vacio: f(''), huarmey: f('Huarmey') }; });
  await page.click('#rail-btn-nuevo'); await L.sleep(600);
  await page.screenshot({ path: L.W + '/shot_04_registro.png' });
  const set = async (id, v) => { await page.fill('#' + id, String(v)); await page.dispatchEvent('#' + id, 'input'); await page.dispatchEvent('#' + id, 'change'); };
  await set('reg-peso', 70); await set('reg-talla', 1.6);
  await set('reg-creatinina', 1.0);
  await page.selectOption('#reg-sexo', 'Femenino').catch(() => {});
  await set('reg-fecha-nacimiento', '1966-12-25'); // edad real al 2026-11-05: 59
  await L.sleep(400);
  out.live = await page.evaluate(() => ({ imc: document.getElementById('live-imc').textContent.trim().slice(0, 80), tfge: document.getElementById('live-tfge').textContent.trim().slice(0, 100) }));
  out.liveAll = await page.evaluate(() => [...document.querySelectorAll('#modal-registro-clinico [id^="live-"]')].map(e => e.id + '=' + e.textContent.trim().slice(0, 60)));
  // PA absurda
  await set('reg-pas-hoy', 300); await set('reg-pad-hoy', 20);
  out.paAbsurda = await page.evaluate(() => ({ pas: document.getElementById('reg-pas-hoy').value, pad: document.getElementById('reg-pad-hoy').value, min: document.getElementById('reg-pas-hoy').min, max: document.getElementById('reg-pas-hoy').max }));
  // buscar DNI inexistente / invalido
  await page.fill('#reg-input-dni', '123'); await page.click('#reg-btn-buscar-dni'); await L.sleep(300);
  out.dniCorto = await page.evaluate(() => document.getElementById('reg-dni-status-alert').textContent.trim().slice(0, 100));
  await page.fill('#reg-input-dni', '10000003'); await page.click('#reg-btn-buscar-dni'); await L.sleep(500);
  out.dniExistente = await page.evaluate(() => ({ alert: document.getElementById('reg-dni-status-alert').textContent.trim().slice(0, 100), nombreCargado: document.getElementById('reg-apellidos-nombres').value.length > 0, badge: document.getElementById('reg-patient-badge').textContent }));
  await page.screenshot({ path: L.W + '/shot_04_registro2.png' });
  out.dialogs = bag.dialogs; out.pageErrors = bag.pageErrors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
