// Recorrido 3: responsive en 9 tamaños de pantalla.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, 'shots', 'responsive');
fs.mkdirSync(OUT, { recursive: true });
const PASS = 'Prueba2026*Huarmey';

const VPS = [
  { name: '360x740_android', vp: { width: 360, height: 740 }, mobile: true },
  { name: '390x844_iphone', device: 'iPhone 13' },
  { name: '412x915_pixel', device: 'Pixel 7' },
  { name: '844x390_movil_horizontal', vp: { width: 844, height: 390 }, mobile: true },
  { name: '768x1024_tablet', vp: { width: 768, height: 1024 }, mobile: true },
  { name: '1024x768_tablet_horiz', vp: { width: 1024, height: 768 }, mobile: true },
  { name: '1280x720_laptop', vp: { width: 1280, height: 720 } },
  { name: '1366x768_laptop', vp: { width: 1366, height: 768 } },
  { name: '1920x1080_escritorio', vp: { width: 1920, height: 1080 } }
];

// Métricas de una pantalla: desborde horizontal, elementos fuera del viewport, solapes en la cabecera, botones pequeños
const MEDIR = () => {
  const W = window.innerWidth, H = window.innerHeight;
  const visible = el => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const enScroll = el => { let p = el.parentElement; while (p && p !== document.body) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; p = p.parentElement; } return false; };
  const nombre = el => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + (el.innerText ? ' «' + el.innerText.trim().replace(/\s+/g, ' ').slice(0, 30) + '»' : '');
  const fuera = [];
  document.querySelectorAll('body *').forEach(el => {
    if (!visible(el)) return;
    if (el.closest('.leaflet-pane, .leaflet-control-container, svg')) return;
    const r = el.getBoundingClientRect();
    if ((r.right > W + 2 || r.left < -2) && !enScroll(el)) {
      // solo el elemento más externo que se sale
      const padreFuera = el.parentElement && (() => { const pr = el.parentElement.getBoundingClientRect(); return pr.right > W + 2 || pr.left < -2; })();
      if (!padreFuera) fuera.push(`${nombre(el)} [${Math.round(r.left)}→${Math.round(r.right)}]`);
    }
  });
  // solapes entre elementos interactivos visibles de la cabecera y del HUD
  const inter = [...document.querySelectorAll('header button, header input, header select, header .user-chip, header a, header [id="user-chip"], .georis-header *[class*="brand"], .hud-kpi-dock .kpi-card')].filter(visible);
  const sol = [];
  for (let i = 0; i < inter.length; i++) for (let j = i + 1; j < inter.length; j++) {
    const a = inter[i], b = inter[j];
    if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 4 && oy > 4) sol.push(`${nombre(a)} ⟂ ${nombre(b)}`);
  }
  // botones táctiles pequeños (< 32 px) visibles
  const peq = [...document.querySelectorAll('button, a[href], select, input:not([type=hidden]), [role=button]')].filter(visible).filter(el => { const r = el.getBoundingClientRect(); return r.top < H && r.bottom > 0 && r.left < W && r.right > 0 && (r.height < 32 || r.width < 32); }).map(el => { const r = el.getBoundingClientRect(); return `${nombre(el)} ${Math.round(r.width)}x${Math.round(r.height)}`; });
  return { W, H, scrollW: document.documentElement.scrollWidth, scrollWBody: document.body.scrollWidth, fuera: fuera.slice(0, 15), solapes: [...new Set(sol)].slice(0, 15), pequenos: peq.slice(0, 25), nPequenos: peq.length };
};

// ¿El elemento cabe dentro del viewport y su botón de cerrar es visible?
const CABE = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return { existe: false };
  const box = el.querySelector('.reg-modal-box, .modal-content, .modal-box, .padron-modal-box, .usuarios-box, .login-card, [class*="modal-box"], [class*="modal-content"], [class*="-card"]') || el;
  const r = box.getBoundingClientRect();
  const W = window.innerWidth, H = window.innerHeight;
  const btnCerrar = el.querySelector('.btn-close-accessible, [id$="cerrar"], [aria-label*="errar"]');
  let cerrar = null;
  if (btnCerrar) { const b = btnCerrar.getBoundingClientRect(); cerrar = b.width > 0 && b.top >= 0 && b.bottom <= H && b.left >= 0 && b.right <= W; }
  return { existe: true, caja: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`, cabeAncho: r.left >= -1 && r.right <= W + 1, cabeAlto: r.top >= -1 && r.bottom <= H + 1, cerrarVisible: cerrar, scrollInterno: box.scrollHeight > box.clientHeight + 2 || [...box.querySelectorAll('*')].some(c => { const s = getComputedStyle(c); return /(auto|scroll)/.test(s.overflowY) && c.scrollHeight > c.clientHeight + 2; }) };
};

(async () => {
  const browser = await chromium.launch();
  const resumen = {};
  for (const cfg of VPS) {
    const opts = cfg.device ? Object.assign({}, devices[cfg.device]) : { viewport: cfg.vp, isMobile: !!cfg.mobile, hasTouch: !!cfg.mobile, deviceScaleFactor: 1 };
    if (cfg.device) opts.deviceScaleFactor = 1;
    const ctx = await browser.newContext(Object.assign(opts, { locale: 'es-PE', timezoneId: 'America/Lima', acceptDownloads: true }));
    await ctx.route(/arcgisonline|google\.com\/vt|cartocdn|openstreetmap/, r => r.abort());
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
    page.on('dialog', d => d.accept());
    const R = { };
    const shot = async n => page.screenshot({ path: path.join(OUT, `${cfg.name}__${n}.png`) });
    const sleep = ms => page.waitForTimeout(ms);
    try {
      await page.goto(BASE + '/');
      await page.waitForSelector('#login-overlay.active', { timeout: 15000 });
      await sleep(500);
      R.login = Object.assign(await page.evaluate(MEDIR), { caja: await page.evaluate(CABE, '#login-overlay') });
      await shot('01_login');
      await page.fill('#login-username', 'admin');
      await page.fill('#login-password', PASS);
      await page.click('#login-submit');
      await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active'), null, { timeout: 15000 });
      await sleep(2500);
      R.mapa = await page.evaluate(MEDIR);
      R.mapa.navMovil = await page.evaluate(() => { const n = document.querySelector('.mobile-nav-bar'); return n ? getComputedStyle(n).display : 'no existe'; });
      R.mapa.rail = await page.evaluate(() => { const n = document.getElementById('app-nav-rail'); return n ? getComputedStyle(n).display : 'no existe'; });
      R.mapa.kpisVisibles = await page.evaluate(() => [...document.querySelectorAll('.kpi-card')].map(c => { const r = c.getBoundingClientRect(); return `${c.id.replace('card-kpi-', '')}:${r.left >= 0 && r.right <= innerWidth ? 'ok' : 'cortado(' + Math.round(r.left) + '→' + Math.round(r.right) + ')'}`; }).join(' '));
      R.mapa.cabecera = await page.evaluate(() => { const h = document.querySelector('header'); if (!h) return null; const r = h.getBoundingClientRect(); const items = [...h.querySelectorAll('button, input, select, #user-chip')].filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map(e => (e.id || e.tagName) + ':' + Math.round(e.getBoundingClientRect().left) + '-' + Math.round(e.getBoundingClientRect().right)); return { alto: Math.round(r.height), items }; });
      R.mapa.controlesMapa = await page.evaluate(() => { const c = document.querySelector('.georis-map-controls, [class*="map-ctrl"], .georis-ctrl-btn'); if (!c) return null; const r = (c.closest('div') || c).getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.right)},${Math.round(r.bottom)} (vp ${innerWidth}x${innerHeight})`; });
      await shot('02_mapa');

      // Panel derecho (padrón)
      await page.evaluate(() => window.app.toggleHeartsPanel(true));
      await sleep(700);
      R.panelPadron = await page.evaluate(() => { const p = document.getElementById('hearts-panel'); const r = p.getBoundingClientRect(); const cerrar = p.querySelector('.panel-close-btn').getBoundingClientRect(); return { caja: `${Math.round(r.left)}→${Math.round(r.right)} x ${Math.round(r.top)}→${Math.round(r.bottom)}`, cabe: r.left >= -1 && r.right <= innerWidth + 1, cerrarVisible: cerrar.width > 0 && cerrar.right <= innerWidth && cerrar.top >= 0 && cerrar.bottom <= innerHeight, tapaNavInferior: (() => { const n = document.querySelector('.mobile-nav-bar'); if (!n || getComputedStyle(n).display === 'none') return false; const nr = n.getBoundingClientRect(); return r.bottom > nr.top + 2 && getComputedStyle(p).zIndex > getComputedStyle(n).zIndex; })() }; });
      Object.assign(R.panelPadron, await page.evaluate(MEDIR));
      await shot('03_panel_padron');
      await page.evaluate(() => window.app.toggleHeartsPanel(false));
      await sleep(400);

      // Panel izquierdo (capas)
      await page.evaluate(() => window.app.toggleLeftSidebar(true));
      await sleep(700);
      R.panelCapas = await page.evaluate(() => { const p = document.getElementById('left-sidebar'); const r = p.getBoundingClientRect(); return { caja: `${Math.round(r.left)}→${Math.round(r.right)} x ${Math.round(r.top)}→${Math.round(r.bottom)}`, cabe: r.left >= -1 && r.right <= innerWidth + 1 }; });
      await shot('04_panel_capas');
      await page.evaluate(() => window.app.toggleLeftSidebar(false));
      await sleep(400);

      // Ficha clínica
      const pid = await page.evaluate(() => window.app.patients[0].id);
      await page.evaluate(id => window.app.openPatientDetail(id), pid);
      await sleep(900);
      R.ficha = Object.assign(await page.evaluate(CABE, '#modal-patient-detail'), await page.evaluate(MEDIR));
      R.ficha.columnas = await page.evaluate(() => { const g = document.querySelector('#modal-patient-detail [class*="grid"]'); return g ? getComputedStyle(g).gridTemplateColumns : null; });
      R.ficha.botonesPie = await page.evaluate(() => [...document.querySelectorAll('#modal-patient-detail button')].filter(b => b.innerText.trim()).map(b => { const r = b.getBoundingClientRect(); return `${b.innerText.trim().slice(0, 18)}:${r.right <= innerWidth && r.left >= 0 && r.bottom <= innerHeight ? 'ok' : 'fuera'}`; }).join(' | '));
      await shot('05_ficha');
      await page.evaluate(() => { const m = document.getElementById('modal-patient-detail'); if (m) m.classList.remove('active'); });
      await sleep(300);

      // Registro clínico
      await page.evaluate(() => window.app.abrirRegistroClinico());
      await sleep(900);
      R.registro = Object.assign(await page.evaluate(CABE, '#modal-registro-clinico'), await page.evaluate(MEDIR));
      R.registro.guardar = await page.evaluate(() => { const b = document.getElementById('reg-btn-guardar'); const r = b.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} visibleSinScroll=${r.top >= 0 && r.bottom <= innerHeight}`; });
      await shot('06_registro');
      await page.evaluate(() => document.getElementById('reg-btn-cerrar').click());
      await sleep(400);

      // Cuadrícula Excel
      const xlsx = fs.readdirSync(path.join(__dirname, 'shots')).find(f => /^export_.*\.xlsx$/.test(f));
      await page.setInputFiles('#hosix-file-input', path.join(__dirname, 'shots', xlsx));
      await sleep(3000);
      R.grid = Object.assign(await page.evaluate(CABE, '#modal-padron-grid'), await page.evaluate(MEDIR));
      R.grid.botonCargar = await page.evaluate(() => { const b = document.getElementById('padron-btn-cargar'); if (!b) return null; const r = b.getBoundingClientRect(); return `visible=${r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth}`; });
      await shot('07_grid_excel');
      await page.evaluate(() => { const b = document.getElementById('padron-btn-cerrar') || document.getElementById('padron-btn-cancelar'); if (b) b.click(); });
      await sleep(500);

      // Tablero
      await page.evaluate(() => window.app.switchView('dashboard'));
      await sleep(2000);
      R.tablero = await page.evaluate(MEDIR);
      R.tablero.tablas = await page.evaluate(() => [...document.querySelectorAll('#view-dashboard table')].map(t => { const r = t.getBoundingClientRect(); const p = t.parentElement; return `${t.id || 'tabla'}: ancho ${Math.round(r.width)} / contenedor ${p.clientWidth} scrollX=${/(auto|scroll)/.test(getComputedStyle(p).overflowX)}`; }));
      R.tablero.alturaTotal = await page.evaluate(() => { const v = document.getElementById('view-dashboard'); return v.scrollHeight + ' (scrollable=' + /(auto|scroll)/.test(getComputedStyle(v).overflowY) + ')'; });
      await shot('08_tablero');
      await page.evaluate(() => { const v = document.getElementById('view-dashboard'); v.scrollTop = v.scrollHeight; window.scrollTo(0, document.body.scrollHeight); });
      await sleep(400);
      await shot('08b_tablero_abajo');
      await page.evaluate(() => window.app.switchView('mapa'));
      await sleep(600);

      // Usuarios
      await page.evaluate(() => document.getElementById('btn-usuarios').click());
      await sleep(900);
      R.usuarios = Object.assign(await page.evaluate(CABE, '#modal-usuarios'), await page.evaluate(MEDIR));
      await shot('09_usuarios');
      await page.evaluate(() => document.getElementById('usuarios-cerrar').click());
      await sleep(300);

      // Pre-cita
      await page.evaluate(id => window.app.abrirModalPreCita(id), pid);
      await sleep(600);
      R.precita = await page.evaluate(CABE, '#modal-precita');
      await shot('10_precita');
      await page.evaluate(() => document.getElementById('modal-precita').classList.remove('active'));

      // Menú lateral en móvil
      if (cfg.mobile || cfg.device) {
        await page.evaluate(() => window.app.toggleNavRail(true));
        await sleep(500);
        R.menuRail = await page.evaluate(() => { const n = document.getElementById('app-nav-rail'); const r = n.getBoundingClientRect(); return { display: getComputedStyle(n).display, caja: `${Math.round(r.left)}→${Math.round(r.right)}` }; });
        await shot('11_menu');
        await page.evaluate(() => window.app.toggleNavRail(false));
      }
    } catch (e) {
      R.error = e.message.slice(0, 400);
      await shot('ERROR');
    }
    R.erroresPagina = [...new Set(errs)];
    resumen[cfg.name] = R;
    console.log('== ' + cfg.name + (R.error ? '  ERROR: ' + R.error : ''));
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'responsive.json'), JSON.stringify(resumen, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
