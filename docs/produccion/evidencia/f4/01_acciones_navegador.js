// Evidencia Fase 4 — con la CSP estricta (script-src 'self', sin 'unsafe-inline') cada tipo de acción de la interfaz
// sigue funcionando. Pulsa los botones reales en Chromium y comprueba el efecto. Datos: semilla de 20 pacientes simulados.
// Uso: ADMIN_PASSWORD=<clave> BASE=http://127.0.0.1:3250 node 01_acciones_navegador.js   (servidor con srv.sh, sin DATA_DIR)
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3250';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const resultados = [];
const anota = (nombre, ok, detalle = '') => resultados.push(`${ok ? 'OK   ' : 'FALLA'} ${nombre}${detalle ? ' — ' + detalle : ''}`);

async function entrar(browser, viewport) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.problemas = [];
  page.peticiones = [];
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) page.problemas.push('CSP: ' + m.text().slice(0, 160)); });
  page.on('pageerror', e => page.problemas.push('pageerror: ' + String(e.message).slice(0, 160)));
  page.on('request', r => { if (r.url().includes('/api/')) page.peticiones.push(r.method() + ' ' + new URL(r.url()).pathname); });
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '/');
  await page.waitForSelector('#login-overlay.active');
  await page.fill('#login-username', 'admin');
  await page.fill('#login-password', process.env.ADMIN_PASSWORD);
  await page.click('#login-submit');
  await page.waitForFunction(() => window.app && window.app.patients.length >= 20, null, { timeout: 20000 });
  await sleep(800);
  return page;
}

const huella = page => page.evaluate(() => {
  const vis = [...document.querySelectorAll('[id]')].map(e => e.id + ':' + e.className + ':' + (e.offsetParent !== null)).join('|');
  let h = 0; for (let i = 0; i < vis.length; i++) h = (h * 31 + vis.charCodeAt(i)) | 0;
  const mm = window.app.mapManager; let capas = 0;
  if (mm && mm.map) mm.map.eachLayer(() => capas++);
  return { h, zoom: mm && mm.map ? mm.map.getZoom() : null, capas };
});
const activo = (page, id) => page.evaluate(i => { const e = document.getElementById(i); return !!e && e.classList.contains('active'); }, id);

async function cambia(page, nombre, accion) {
  const a = await huella(page);
  await accion();
  await sleep(500);
  const b = await huella(page);
  anota(nombre, a.h !== b.h || a.zoom !== b.zoom || a.capas !== b.capas);
}

(async () => {
  const browser = await chromium.launch();
  const page = await entrar(browser, { width: 1366, height: 800 });
  const csp = (await page.request.get(BASE + '/')).headers()['content-security-policy'];
  anota('la CSP no permite scripts en línea', /script-src 'self';/.test(csp), csp.match(/script-src[^;]*/)[0]);

  await cambia(page, 'toggleNavRail (☰)', () => page.click('[data-accion="toggleNavRail"]'));
  await cambia(page, 'switchView dashboard', () => page.click('[data-accion="switchView"][data-arg="dashboard"]'));
  const antesInd = page.peticiones.length;
  await page.click('[data-accion="loadIndicadoresConvenio"]').catch(() => {});
  await sleep(800);
  anota('loadIndicadoresConvenio pide /api/indicadores/convenio', page.peticiones.slice(antesInd).some(p => p.includes('/indicadores/convenio')));
  await page.click('[data-accion="renderDashboard"]').catch(e => anota('renderDashboard', false, e.message.slice(0, 80)));
  await cambia(page, 'switchView mapa', () => page.click('[data-accion="switchView"][data-arg="mapa"]'));
  await cambia(page, 'toggleHeartsPanel', () => page.click('[data-accion="toggleHeartsPanel"] >> visible=true'));
  await cambia(page, 'switchHeartsTab ingesta', () => page.click('[data-accion="switchHeartsTab"][data-arg="ingesta"] >> visible=true'));
  await cambia(page, 'switchHeartsTab pacientes', () => page.click('[data-accion="switchHeartsTab"][data-arg="pacientes"] >> visible=true'));

  const z0 = (await huella(page)).zoom;
  await page.click('[data-accion="mapaAcercar"]'); await sleep(600);
  const z1 = (await huella(page)).zoom;
  await page.click('[data-accion="mapaAlejar"]'); await sleep(600);
  const z2 = (await huella(page)).zoom;
  anota('mapaAcercar y mapaAlejar', z1 === z0 + 1 && z2 === z0, `${z0} → ${z1} → ${z2}`);

  await cambia(page, 'toggleLeftSidebar (capas)', () => page.click('[data-accion="toggleLeftSidebar"] >> visible=true'));
  const c0 = (await huella(page)).capas;
  await page.click('[data-cambio="capa"][data-capa="pacientes"]'); await sleep(500);
  const c1 = (await huella(page)).capas;
  await page.click('[data-cambio="capa"][data-capa="pacientes"]'); await sleep(500);
  const c2 = (await huella(page)).capas;
  anota('capa pacientes (quitar y volver a poner)', c1 < c0 && c2 === c0, `${c0} → ${c1} → ${c2}`);
  const opcionesRis = await page.$$eval('[data-cambio="selectRis"] option', os => os.map(o => o.value).filter(Boolean));
  if (opcionesRis.length) await cambia(page, 'selectRis (cambio)', () => page.selectOption('[data-cambio="selectRis"]', opcionesRis[0]));
  const base = await page.$$eval('[data-cambio="setBaseMapGlobal"] option', os => os.map(o => o.value));
  if (base.length > 1) {
    const src = () => page.evaluate(() => { const i = document.querySelector('.leaflet-tile-pane img'); return i ? new URL(i.src).host : ''; });
    const h0 = await src();
    await page.selectOption('[data-cambio="setBaseMapGlobal"] >> visible=true', base.find(v => v !== base[0]) || base[1]).catch(() => {});
    await sleep(800);
    anota('setBaseMapGlobal cambia el mapa base', (await src()) !== h0, `${h0} → ${await src()}`);
  }
  await page.click('[data-accion="toggleLeftSidebar"][data-arg="false"] >> visible=true').catch(() => {});

  // Tarjeta y ficha del paciente
  await page.click('[data-accion="toggleHeartsPanel"] >> visible=true').catch(() => {});
  await sleep(400);
  if (!(await page.isVisible('.patient-card-header'))) await page.evaluate(() => window.app.toggleHeartsPanel(true));
  await page.click('.patient-card-header >> nth=0'); await sleep(500);
  anota('tarjeta → openPatientDetail abre la ficha', await activo(page, 'modal-patient-detail'));
  await page.click('#modal-patient-detail [data-accion="fichaPreCita"]'); await sleep(500);
  anota('ficha → pre-cita (cierra la ficha y abre la pre-cita)', !(await activo(page, 'modal-patient-detail')) && await activo(page, 'modal-precita'));
  await page.click('#modal-precita [data-accion="cerrarModal"] >> nth=0'); await sleep(300);
  anota('cerrarModal pre-cita', !(await activo(page, 'modal-precita')));
  await page.click('.patient-card-header >> nth=0'); await sleep(400);
  await page.click('#modal-patient-detail [data-accion="cerrarModal"]'); await sleep(300);
  anota('cerrarModal ficha (✕)', !(await activo(page, 'modal-patient-detail')));
  await page.click('.patient-card-header >> nth=0'); await sleep(400);
  await page.click('#modal-patient-detail [data-accion="fichaRegistrar"]'); await sleep(800);
  anota('ficha → Registrar Atención abre Registro Clínico con el DNI', await page.evaluate(() => {
    const m = document.querySelector('#modal-registro-clinico, .reg-modal-overlay.active, [id*="registro"].active');
    return !!document.querySelector('.reg-dni-status-alert') && document.querySelector('.reg-dni-status-alert').textContent.includes('Paciente Encontrado') && !!m;
  }));
  await page.click('#reg-btn-cerrar').catch(() => {});
  await sleep(300);
  const zf0 = (await huella(page)).zoom;
  await page.click('.patient-card-header >> nth=0'); await sleep(400);
  await page.click('#modal-patient-detail [data-accion="fichaUbicar"]'); await sleep(900);
  anota('ficha → Ubicar en Mapa (cierra y centra)', !(await activo(page, 'modal-patient-detail')) && (await huella(page)).zoom !== zf0, `zoom ${zf0} → ${(await huella(page)).zoom}`);
  await page.click('[data-accion="mapaInicio"]'); await sleep(600);
  await cambia(page, 'tarjeta → Ver (centrarPaciente)', () => page.click('.patient-card [data-accion="centrarPaciente"] >> nth=0'));

  // Exportar el padrón (botón del panel de pacientes) y abrir la carga Excel
  await page.evaluate(() => { window.app.switchView('mapa'); window.app.toggleHeartsPanel(true); window.app.switchHeartsTab('pacientes'); });
  await sleep(500);
  const [descarga] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('#btn-export-padron').catch(e => anota('clic en exportar', false, e.message.split('\n')[0]))]);
  anota('exportarPadronExcel descarga el .xlsx', !!descarga, descarga ? descarga.suggestedFilename() : 'sin descarga');
  const [selector] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), page.click('[data-accion="abrirModalPadronGrid"]').catch(() => null)]);
  anota('abrirModalPadronGrid pide el archivo Excel', !!selector);

  // Popup de Leaflet con una acción (Leaflet detiene la propagación del clic: el listener va en captura)
  const abierto = await page.evaluate(() => {
    let ok = false;
    window.app.mapManager.map.eachLayer(l => {
      const p = l.getPopup && l.getPopup();
      const c = p && p.getContent && p.getContent();
      if (!ok && typeof c === 'string' && c.includes('data-accion="trazarReferenciaHaciaHospital"')) {
        if (l.getLatLng) window.app.mapManager.map.setView(l.getLatLng(), 15, { animate: false });
        l.openPopup(); ok = true;
      }
    });
    return ok;
  });
  if (abierto) {
    await sleep(500);
    await cambia(page, 'popup de Leaflet → trazarReferenciaHaciaHospital', () => page.click('.leaflet-popup [data-accion="trazarReferenciaHaciaHospital"]', { timeout: 5000 }).catch(e => anota('clic en el popup', false, e.message.split('\n')[0])));
    if (await page.isVisible('#reference-inspector-card [data-accion="quitarElemento"]')) {
      await page.click('#reference-inspector-card [data-accion="quitarElemento"] >> nth=0'); await sleep(300);
      anota('quitarElemento cierra el inspector de referencia', !(await page.$('#reference-inspector-card')));
    }
  } else anota('popup de Leaflet con acción', false, 'no se encontró una capa con ese popup');

  // Consentimiento (PUT al servidor) y usuarios
  await page.evaluate(() => window.app.abrirModalConsentimiento(window.app.patients.find(p => !p.consentimiento) || window.app.patients[0]));
  await sleep(300);
  const antesC = page.peticiones.length;
  await page.click('[data-accion="registrarConsentimiento"][data-arg="No"]'); await sleep(800);
  anota('registrarConsentimiento envía el PUT', page.peticiones.slice(antesC).some(p => p.startsWith('PUT') && p.endsWith('/consentimiento')));
  if (await activo(page, 'modal-consentimiento')) await page.click('[data-accion="cerrarModalConsentimiento"] >> nth=0');
  await cambia(page, 'clicEn btn-usuarios (gestión de usuarios)', () => page.click('[data-accion="clicEn"][data-arg="btn-usuarios"] >> visible=true'));
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => document.querySelectorAll('.modal-overlay.active, .modal.active').forEach(m => m.classList.remove('active')));

  await cambia(page, 'irAlInicio (logo)', async () => { await page.click('[data-accion="switchView"][data-arg="dashboard"]'); await page.click('[data-accion="irAlInicio"]'); });

  // Móvil: barra inferior
  const movil = await entrar(browser, { width: 390, height: 844 });
  for (const destino of ['pacientes', 'ingesta', 'capas', 'mapa']) {
    await movil.click(`[data-accion="navMovil"][data-arg="${destino}"]`); await sleep(400);
    anota(`móvil: navMovil ${destino} marca su botón`, await movil.evaluate(d => document.querySelector(`[data-accion="navMovil"][data-arg="${d}"]`).classList.contains('active'), destino));
  }

  const problemas = page.problemas.concat(movil.problemas);
  anota('sin violaciones de la CSP ni errores de página', problemas.length === 0, problemas.slice(0, 3).join(' | '));
  console.log(resultados.join('\n'));
  console.log(`\n${resultados.filter(r => r.startsWith('OK')).length} correctas, ${resultados.filter(r => r.startsWith('FALLA')).length} con falla`);
  await browser.close();
})().catch(e => { console.error('ERROR', e.message); console.log(resultados.join('\n')); process.exit(1); });
