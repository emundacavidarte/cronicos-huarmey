// Prueba 9: vista movil 390x844. DSF=1 para auditar (SHOTS=0) ; DSF=2 solo para las capturas (SHOTS=1)
const L = require('./lib');
const SHOTS = process.env.SHOTS === '1';
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage(); const bag = {}; L.instrument(page, bag);
  page.on('dialog', d => d.accept());
  const out = {};
  const audit = (label) => page.evaluate((label) => {
    const W = window.innerWidth;
    const de = document.documentElement;
    const vis = e => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05 && r.width > 0 && r.height > 0; };
    const inertRoot = document.querySelector('.app-container') && document.querySelector('.app-container').hasAttribute('inert');
    const res = { label, scrollW: de.scrollWidth, bodyScrollW: document.body.scrollWidth, innerW: W, hOverflow: de.scrollWidth > W + 1 };
    const out = [], cov = [], small = [];
    document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]').forEach(e => {
      if (!vis(e)) return;
      if (e.closest('[inert]')) return;
      const r = e.getBoundingClientRect();
      const name = ((e.getAttribute('aria-label') || e.title || e.innerText || e.id || e.className || '') + '').trim().replace(/\s+/g, ' ').slice(0, 28);
      // fuera de pantalla a la derecha/izquierda (ignora elementos dentro de contenedores con scroll propio)
      let sc = e.parentElement, inScroll = false;
      while (sc && sc !== document.body) { const o = getComputedStyle(sc); if (/(auto|scroll)/.test(o.overflowX) && sc.scrollWidth > sc.clientWidth) { inScroll = true; break; } sc = sc.parentElement; }
      if (!inScroll && (r.right > W + 1 || r.left < -1)) out.push(name + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
      // tapado por otro elemento
      if (r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0) {
        const cx = Math.min(Math.max(r.left + r.width / 2, 0), W - 1), cy = r.top + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        if (top && top !== e && !e.contains(top) && !top.contains(e)) cov.push(name + ' <- ' + (top.id || top.className.toString().slice(0, 30) || top.tagName));
      }
      if (Math.min(r.width, r.height) < 32 && vis(e)) small.push(name + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    });
    res.fueraDePantalla = out.slice(0, 8); res.tapados = cov.slice(0, 10); res.objetivosPequenos = small.length; res.objetivosPequenosEj = small.slice(0, 5);
    return res;
  }, label);
  const shot = async n => { if (SHOTS) await page.screenshot({ path: L.W + '/shot_09_' + n + '.png' }); };
  await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active'); await L.sleep(500);
  out.s1_login = await audit('login'); await shot('login');
  await L.uiLogin(page, L.ADMIN); await page.waitForFunction(() => window.app.patients.length > 0); await L.sleep(1500);
  out.s2_mapa = await audit('mapa'); await shot('mapa');
  out.railVisible = await page.evaluate(() => { const r = document.getElementById('app-nav-rail'); if (!r) return 'no existe'; const cs = getComputedStyle(r); const b = r.getBoundingClientRect(); return cs.display + ' ' + Math.round(b.width) + 'x' + Math.round(b.height) + ' left=' + Math.round(b.left); });
  out.hamburguesa = await page.evaluate(() => { const b = document.getElementById('btn-toggle-rail'); const cs = getComputedStyle(b); return cs.display; });
  out.mobileNavTexts = await page.evaluate(() => [...document.querySelectorAll('.mobile-nav-item')].filter(b => b.offsetParent !== null).map(b => b.innerText.trim()));
  out.mobileNavRect = await page.evaluate(() => { const n = document.querySelector('.mobile-nav-bar'); const r = n.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), display: getComputedStyle(n).display }; });
  // pin + popup en movil
  await page.evaluate(() => window.app.centrarPaciente(window.app.patients[2].dni)); await L.sleep(1200);
  await page.evaluate(() => { let n = 0; window.app.mapManager.layers.pacientes.eachLayer(l => { if (n++ === 2) l.openPopup(); }); }); await L.sleep(800);
  out.s3_popup = await audit('popup'); await shot('popup');
  out.popupBox = await page.evaluate(() => { const p = document.querySelector('.leaflet-popup-content-wrapper'); if (!p) return null; const r = p.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: innerWidth, vh: innerHeight }; });
  await page.evaluate(() => window.app.mapManager.map.closePopup());
  // panel Pacientes (barra movil)
  await page.click('.mobile-nav-item:has-text("Pacientes")'); await L.sleep(800);
  out.s4_panelPacientes = await audit('panel pacientes'); await shot('panel');
  // ficha
  await page.evaluate(() => window.app.openPatientDetail(window.app.patients[1].id)); await L.sleep(700);
  out.s5_ficha = await audit('ficha'); await shot('ficha');
  out.fichaScroll = await page.evaluate(() => { const m = document.querySelector('#modal-patient-detail .modal-box, #modal-patient-detail > div'); const r = m.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), vh: innerHeight, top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
  await page.keyboard.press('Escape'); await L.sleep(300);
  // pre-cita
  await page.evaluate(() => window.app.abrirModalPreCita(window.app.patients[1].id)); await L.sleep(400);
  out.s6_precita = await audit('precita'); await page.evaluate(() => document.getElementById('modal-precita').classList.remove('active'));
  // capas
  await page.click('.mobile-nav-item:has-text("Capas")'); await L.sleep(800);
  out.s7_capas = await audit('capas'); await shot('capas');
  await page.click('.mobile-nav-item:has-text("Mapa")'); await L.sleep(500);
  // ingesta + grid
  await page.click('.mobile-nav-item:has-text("Ingesta")'); await L.sleep(600);
  out.s8_ingesta = await audit('ingesta');
  await page.setInputFiles('#hosix-file-input', L.W + '/invented_padron3.xlsx'); await page.waitForSelector('#modal-padron-grid.active #padron-grid-tbody tr', { timeout: 15000 }); await L.sleep(500);
  out.s9_grid = await audit('grid padron'); await shot('grid');
  out.gridBox = await page.evaluate(() => { const b = document.querySelector('.padron-modal-box').getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), vw: innerWidth, vh: innerHeight }; });
  await page.click('#padron-btn-cancelar'); await L.sleep(300);
  // registro clinico
  await page.evaluate(() => window.RegistroClinicoModal.open()); await L.sleep(700);
  out.s10_registro = await audit('registro clinico'); await shot('registro');
  await page.click('#reg-btn-cerrar'); await L.sleep(300);
  // usuarios (admin)
  await page.click('#btn-usuarios-mobile').catch(() => {}); await L.sleep(900);
  out.s11_usuarios = await audit('usuarios');
  await page.click('#usuarios-cerrar').catch(() => {}); await L.sleep(300);
  // dashboard: ¿se puede llegar en movil?
  const rail = await page.evaluate(() => { const b = document.getElementById('rail-tab-dashboard'); return b ? { display: getComputedStyle(b).display, vis: b.offsetParent !== null } : null; });
  out.dashboardAlcanzableEnMovil = rail;
  await page.evaluate(() => window.app.switchView('dashboard')); await L.sleep(1200);
  out.s12_dashboard = await audit('dashboard'); await shot('dashboard');
  out.consoleErr = bag.console.filter(c => c.type === 'error' && !/google|ERR_TUNNEL/.test(c.text + c.loc)).map(c => c.text.slice(0, 100));
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
