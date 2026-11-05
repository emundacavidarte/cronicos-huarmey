// XSS: (1) coordinador importa carga con HTML en cie10_erc y nombre con entidades; (2) ADMIN abre y se mide el robo de token; (3) tooltip real.
const L = require('./lib');
const flags = page => page.evaluate(() => Object.keys(window).filter(k => k.startsWith('__xss')).sort().map(k => k + '=' + String(window[k]).slice(0, 12)));
(async () => {
  const browser = await L.launch();
  const out = {};
  // ---- Coordinador importa
  const c1 = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const p1 = await c1.newPage();
  p1.on('dialog', d => d.accept());
  await p1.goto(L.BASE + '/'); await p1.waitForSelector('#login-overlay.active');
  await L.uiLogin(p1, L.COORD);
  await p1.waitForFunction(() => window.app.patients.length > 0); await L.sleep(500);
  out.coord_ve = await p1.evaluate(() => window.app.patients.length);
  const [fc] = await Promise.all([p1.waitForEvent('filechooser'), p1.click('#rail-tab-excel')]);
  await fc.setFiles(L.W + '/invented_padron2.xlsx');
  await p1.waitForSelector('#modal-padron-grid.active #padron-grid-tbody tr');
  out.coord_grid = await p1.evaluate(() => document.getElementById('padron-score-badge').textContent);
  await p1.click('#padron-btn-cargar');
  await p1.waitForFunction(() => !document.getElementById('modal-padron-grid').classList.contains('active'), null, { timeout: 15000 });
  await L.sleep(800);
  out.coord_toast = await p1.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent.trim().slice(0, 100)));
  // el coordinador, al abrir su propia ficha, ¿dispara?
  await p1.evaluate(() => { const p = window.app.patients.find(x => x.dni === '70000012'); window.app.openPatientDetail(p.id); });
  await L.sleep(500);
  out.coord_flags_tras_ficha = await flags(p1);
  await c1.close();

  // ---- Admin (otra sesion) solo mira
  const c2 = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const p2 = await c2.newPage();
  const bag = {}; L.instrument(p2, bag);
  await p2.goto(L.BASE + '/'); await p2.waitForSelector('#login-overlay.active');
  await L.uiLogin(p2, L.ADMIN);
  await p2.waitForFunction(() => window.app.patients.length > 0); await L.sleep(800);
  out.admin_ve = await p2.evaluate(() => window.app.patients.length);
  out.admin_flags_al_cargar = await flags(p2);
  await p2.click('#rail-tab-padron'); await L.sleep(400);
  out.admin_flags_lista = await flags(p2);
  // tooltips programaticos de los dos nuevos
  out.layerInfo = await p2.evaluate(() => { let n = 0, t = 0, err = []; window.app.mapManager.layers.pacientes.eachLayer(l => { n++; try { l.openTooltip(); t++; } catch (e) { err.push(e.message.slice(0, 60)); } }); return { layers: n, tooltipsOpened: t, errs: err.slice(0, 2) }; });
  await L.sleep(300);
  out.admin_flags_tooltips = await flags(p2);
  // hover real sobre el pin del paciente 70000012 (tooltip por mouseover real)
  await p2.evaluate(() => { window.app.mapManager.layers.pacientes.eachLayer(l => l.closeTooltip()); });
  await p2.evaluate(() => window.app.centrarPaciente('70000012'));
  await L.sleep(1200);
  // buscar el pin mas cercano al centro de la pantalla
  const box = await p2.evaluate(() => { const m = document.getElementById('map').getBoundingClientRect(); return { cx: m.x + m.width / 2, cy: m.y + m.height / 2 }; });
  const pinBox = await p2.evaluate(({ cx, cy }) => { const pins = [...document.querySelectorAll('.pin-patient-container')].map(e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, d: Math.hypot(r.x + r.width / 2 - cx, r.y + r.height / 2 - cy) }; }).sort((a, b) => a.d - b.d); return pins[0]; }, box);
  await p2.mouse.move(pinBox.x, pinBox.y); await L.sleep(600);
  out.hover_tooltipVisible = await p2.evaluate(() => !!document.querySelector('.leaflet-tooltip'));
  out.hover_tooltipText = await p2.evaluate(() => (document.querySelector('.leaflet-tooltip') || { textContent: '' }).textContent.slice(0, 90));
  out.admin_flags_hover = await flags(p2);
  // ficha del paciente 70000012 abierta por ADMIN
  await p2.evaluate(() => { const p = window.app.patients.find(x => x.dni === '70000012'); window.app.openPatientDetail(p.id); });
  await L.sleep(600);
  out.admin_flags_ficha = await flags(p2);
  await p2.screenshot({ path: L.W + '/shot_04_xss_admin.png' });
  // nombre con entidades en lista/popup/ficha/precita
  const nm = await p2.evaluate(() => window.app.patients.find(x => x.dni === '70000011').id);
  await p2.evaluate(id => { window.app.openPatientDetail(id); }, nm); await L.sleep(500);
  await p2.evaluate(() => { const m = document.getElementById('modal-patient-detail'); if (m) m.remove(); });
  await p2.evaluate(id => { window.app.abrirModalPreCita(id); window.app.confirmarPreCita(); }, nm); await L.sleep(800);
  await p2.evaluate(() => { window.app.mapManager.layers.pacientes.eachLayer(l => { try { l.openPopup(); } catch (e) {} }); });
  await L.sleep(300);
  out.admin_flags_nombre = await flags(p2);
  out.nombreEnLista = await p2.evaluate(() => { const c = [...document.querySelectorAll('#patient-list .patient-name')].find(e => /IMG/i.test(e.textContent)); return c ? c.textContent.slice(0, 60) : null; });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
