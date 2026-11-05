// Pruebas 6 (limpieza al salir) y 7 (sesion): recarga, salir, token vencido, 401 a mitad de sesion, reloj
const L = require('./lib');
const flagsOut = {};
(async () => {
  const browser = await L.launch();
  const out = {};
  const mk = async (opts) => { const ctx = await browser.newContext(Object.assign({ viewport: { width: 1366, height: 800 } }, opts || {})); const page = await ctx.newPage(); const bag = {}; L.instrument(page, bag); return { ctx, page, bag }; };
  const scan = page => page.evaluate(async () => { const dn = window.app ? window.app.patients.map(p => p.dni) : []; const r = { ss: Object.keys(sessionStorage), ls: Object.keys(localStorage), memPatients: window.app ? window.app.patients.length : null, cards: document.querySelectorAll('#patient-list .patient-card').length, pins: document.querySelectorAll('.pin-patient-container').length, kpi: document.getElementById('kpi-total').textContent, toasts: document.querySelectorAll('#toast-container .toast').length, overlay: document.getElementById('login-overlay').classList.contains('active'), msg: document.getElementById('login-error').textContent, fichaEnDom: !!document.getElementById('modal-patient-detail'), popup: !!document.querySelector('.leaflet-popup'), tooltipDom: !!document.querySelector('.leaflet-tooltip'), dashPacientes: document.getElementById('dash-val-total') ? document.getElementById('dash-val-total').textContent : null, ipressRows: document.querySelectorAll('#dash-ipress-tbody tr').length, indRows: document.querySelectorAll('#ind-convenio-tbody tr').length }; return r; });
  // (a) recarga conserva sesion
  let { ctx, page, bag } = await mk();
  await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active');
  await L.uiLogin(page, L.ADMIN);
  await page.waitForFunction(() => window.app.patients.length > 0); await L.sleep(500);
  const tokenAntes = await page.evaluate(k => JSON.parse(sessionStorage.getItem(k)).token, L.KEY);
  const n0 = bag.requests.length;
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.patients.length > 0, null, { timeout: 15000 }).catch(() => {});
  out.a_recarga = { patients: await page.evaluate(() => window.app.patients.length), overlay: await page.isVisible('#login-overlay'), apiCalls: bag.requests.slice(n0).filter(r => /\/api\//.test(r.url)).map(r => r.method + ' ' + r.url.replace(L.BASE, '')) };
  // (b) abrir ficha + popup + panel, luego Salir
  await page.evaluate(() => { const p = window.app.patients[0]; window.app.openPatientDetail(p.id); }); await L.sleep(300);
  await page.evaluate(() => { window.app.mapManager.layers.pacientes.eachLayer(l => { try { l.openPopup(); } catch (e) {} }); });
  await page.keyboard.press('Escape'); await L.sleep(200);
  await page.click('#rail-tab-dashboard').catch(() => {}); await L.sleep(1200);
  out.b_antesSalir = await scan(page);
  await page.click('#btn-logout'); await L.sleep(800);
  out.b_trasSalir = await scan(page);
  // token viejo: ¿sigue valido en el servidor tras Salir?
  const st = await (await fetch(L.BASE + '/api/auth/me', { headers: { Authorization: 'Bearer ' + tokenAntes } })).status;
  const st2 = await (await fetch(L.BASE + '/api/cronicos', { headers: { Authorization: 'Bearer ' + tokenAntes } })).status;
  out.b_tokenViejoTrasSalir = { me: st, cronicos: st2 };
  // boton Atras / reload tras salir
  await page.reload({ waitUntil: 'load' }); await L.sleep(500);
  out.b_recargaTrasSalir = { overlay: await page.isVisible('#login-overlay'), patients: await page.evaluate(() => window.app.patients.length) };
  await ctx.close();

  // (c) token vencido por fecha, y token manipulado
  ({ ctx, page, bag } = await mk());
  await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active');
  await L.uiLogin(page, L.ADMIN); await page.waitForFunction(() => window.app.patients.length > 0);
  await page.evaluate(k => { const s = JSON.parse(sessionStorage.getItem(k)); s.expires_at = new Date(Date.now() - 1000).toISOString(); sessionStorage.setItem(k, JSON.stringify(s)); }, L.KEY);
  await page.reload({ waitUntil: 'load' }); await L.sleep(800);
  out.c_vencidoPorFecha = await page.evaluate(() => ({ overlay: document.getElementById('login-overlay').classList.contains('active'), msg: document.getElementById('login-error').textContent, ss: Object.keys(sessionStorage), cards: document.querySelectorAll('#patient-list .patient-card').length, app_pacientes: window.app.patients.length }));
  await L.uiLogin(page, L.ADMIN); await page.waitForFunction(() => window.app.patients.length > 0);
  await page.evaluate(k => { const s = JSON.parse(sessionStorage.getItem(k)); s.token = s.token.slice(0, -4) + 'AAAA'; sessionStorage.setItem(k, JSON.stringify(s)); }, L.KEY);
  const n1 = bag.requests.length;
  await page.reload({ waitUntil: 'load' }); await L.sleep(1000);
  out.c_tokenManipulado = await page.evaluate(() => ({ overlay: document.getElementById('login-overlay').classList.contains('active'), msg: document.getElementById('login-error').textContent, ss: Object.keys(sessionStorage), app_pacientes: window.app.patients.length }));
  out.c_tokenManipulado.apiCalls = bag.requests.slice(n1).filter(r => /\/api\//.test(r.url)).map(r => r.method + ' ' + r.url.replace(L.BASE, ''));
  // sessionStorage con basura
  await page.evaluate(k => sessionStorage.setItem(k, '{no es json'), L.KEY);
  await page.reload({ waitUntil: 'load' }); await L.sleep(600);
  out.c_basura = await page.evaluate(() => ({ overlay: document.getElementById('login-overlay').classList.contains('active'), msg: document.getElementById('login-error').textContent, ss: Object.keys(sessionStorage) }));
  await ctx.close();

  // (d) 401 a mitad de sesion: el admin cambia la clave del coordinador
  ({ ctx, page, bag } = await mk());
  await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active');
  await L.uiLogin(page, L.COORD); await page.waitForFunction(() => window.app.patients.length > 0); await L.sleep(500);
  await page.evaluate(() => { const p = window.app.patients[0]; window.app.openPatientDetail(p.id); }); await L.sleep(300);
  const adm = await L.apiLogin(L.ADMIN);
  const pr = await fetch(L.BASE + '/api/users/coord1', { method: 'PATCH', headers: { Authorization: 'Bearer ' + adm.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: L.COORD.password }) });
  out.d_patchStatus = pr.status;
  // accion de usuario que llama a la API: cambiar de vista al tablero (indicadores)
  await page.evaluate(() => document.getElementById('modal-patient-detail') && document.getElementById('modal-patient-detail').classList.remove('active'));
  await page.click('#rail-tab-dashboard').catch(() => {}); await L.sleep(1500);
  out.d_tras401 = await scan(page);
  out.d_apiRespuestas = bag.responses.filter(r => /\/api\//.test(r.url) && r.status >= 400).map(r => r.status + ' ' + r.url.replace(L.BASE, ''));
  await ctx.close();

  // (e) pestana inactiva > 8 h (reloj simulado)
  ({ ctx, page, bag } = await mk());
  await page.clock.install({ time: new Date() });
  await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active');
  await L.uiLogin(page, L.ADMIN); await page.waitForFunction(() => window.app.patients.length > 0);
  out.e_antes = await scan(page);
  await page.clock.fastForward('08:05:00'); await L.sleep(800);
  out.e_tras8h = await scan(page);
  await ctx.close();
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
