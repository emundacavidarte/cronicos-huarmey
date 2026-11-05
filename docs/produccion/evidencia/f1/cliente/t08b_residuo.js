// Datos residuales del tablero entre usuarios de la misma pestana + boton Exportar del Director
const L = require('./lib');
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage(); const bag = {}; L.instrument(page, bag);
  const out = {};
  await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active');
  await L.uiLogin(page, L.ADMIN); await page.waitForFunction(() => window.app.patients.length > 0); await L.sleep(800);
  await page.click('#rail-tab-dashboard'); await L.sleep(1500);
  const dash = () => page.evaluate(() => ({ total: document.getElementById('dash-val-total').textContent, desercion: document.getElementById('dash-val-desercion').textContent, proximos: document.getElementById('dash-val-proximos').textContent, control: document.getElementById('dash-val-control').textContent, hta: (document.querySelector('#dash-pathology-list') || { innerText: '' }).innerText.replace(/\s+/g, ' ').slice(0, 70), ipressFilas: document.querySelectorAll('#dash-ipress-tbody tr').length, indFilas: document.querySelectorAll('#ind-convenio-tbody tr').length, estFilas: document.querySelectorAll('#ind-est-tbody tr').length, vistaActiva: document.getElementById('view-dashboard').style.display, periodo: (document.getElementById('ind-periodo') || {}).textContent.slice(0, 50) }));
  out.admin_dash = await dash();
  await page.click('#btn-logout'); await L.sleep(600);
  out.tras_salir_dash = await dash();
  // otro usuario, de OTRA red sin pacientes (Director)
  await L.uiLogin(page, { username: 'direct157', password: process.env.CLAVE_PRUEBA });
  await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active')); await L.sleep(1200);
  out.dir157_vista_al_entrar = await page.evaluate(() => ({ mapaVisible: getComputedStyle(document.getElementById('view-map')).display, dashVisible: getComputedStyle(document.getElementById('view-dashboard')).display }));
  out.dir157_kpi_mapa = await page.evaluate(() => document.getElementById('kpi-total').textContent);
  out.dir157_dash_antes_de_abrir = await dash();
  await page.click('#rail-tab-dashboard'); await L.sleep(1500);
  out.dir157_dash = await dash();
  await page.screenshot({ path: L.W + '/shot_08_residuo_dir157.png' });
  // boton Exportar Padron Excel visible para el Director
  const exp = page.locator('#view-dashboard button:has-text("Exportar Padrón Excel")');
  out.dir157_botonExportarVisible = await exp.isVisible().catch(() => false);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 3000 }).catch(() => null), exp.click().catch(() => {})]);
  await L.sleep(600);
  out.dir157_exportar = { descarga: !!dl, toast: await page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent.trim().slice(0, 80))) };
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
