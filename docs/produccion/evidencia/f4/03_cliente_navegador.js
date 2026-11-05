// Evidencia Fase 4 — correcciones del cliente verificadas en Chromium con el servidor real. Datos inventados y la
// semilla de 20 pacientes simulados. Uso: ADMIN_PASSWORD=<clave> BASE=http://127.0.0.1:3251 node 03_cliente_navegador.js
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const RAIZ = path.resolve(__dirname, '../../../..');
const BASE = process.env.BASE || 'http://127.0.0.1:3251';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = [];
const anota = (n, ok, d = '') => res.push(`${ok ? 'OK   ' : 'FALLA'} ${n}${d ? ' — ' + d : ''}`);

const XLSX = require(path.join(RAIZ, 'client/libs/xlsx.full.min.js'));
const exp = require(path.join(RAIZ, 'client/js/data/padronExportV4.js'));
const H = 'Hospital de Apoyo Huarmey (00001741, II-1)';
const fila = (doc, nombre, extra) => Object.assign({
  tipo_documento: 'DNI', nro_documento: doc, apellidos_nombres: nombre, sexo: 'Femenino', fecha_nacimiento: '1960-05-10',
  seguro_salud: 'SIS', sector: 'Sector I – Centro', direccion: 'Jr. Bolognesi 250 Huarmey', establecimiento_adscripcion: H, establecimiento_control: H,
  cie10_hta: 'I10.X – Hipertensión esencial (primaria)', pas_oct: 150, pad_oct: 95, fecha_ultimo_control: '2026-10-20', proxima_cita: '2026-11-25',
  estado_paciente: 'Activo', consentimiento: 'No'
}, extra || {});
const libro = filas => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'f4-')), 'padron_inventado.xlsx');
  fs.writeFileSync(f, XLSX.write(exp.construirLibro(XLSX, filas), { type: 'buffer', bookType: 'xlsx' }));
  return f;
};

async function api(method, url, token, body) {
  const h = {};
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* */ }
  return { status: r.status, json: j };
}

async function abrir(browser, usuario, clave, viewport, opciones = {}) {
  const ctx = opciones.ctx || await browser.newContext({ viewport: viewport || { width: 1366, height: 800 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  page.dialogos = [];
  page.on('dialog', d => { page.dialogos.push(d.message()); (page.rechazarDialogo ? d.dismiss() : d.accept()); });
  page.peticiones = [];
  page.on('request', r => { if (r.url().includes('/api/')) page.peticiones.push(r.method() + ' ' + new URL(r.url()).pathname); });
  if (opciones.reloj) await page.clock.install();
  await page.goto(BASE + '/');
  await page.waitForSelector('#login-overlay.active');
  await page.fill('#login-username', usuario);
  await page.fill('#login-password', clave);
  await page.click('#login-submit');
  await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active'));
  await sleep(1200);
  return { ctx, page };
}

(async () => {
  const A = (await api('POST', '/api/auth/login', null, { username: 'admin', password: process.env.ADMIN_PASSWORD })).json.token;
  const clave = 'Clave-de-prueba-F4-1';
  await api('POST', '/api/users', A, { username: 'f4.dir.ps', nombre: 'Directora de prueba', correo: 'f4.dir.ps@prueba.example', role: 'DIRECTOR', red: '156', password: clave });
  await api('POST', '/api/users', A, { username: 'f4.dir.pn', nombre: "O'Brien & <i>Co</i>", correo: 'f4.dir.pn@prueba.example', role: 'DIRECTOR', red: '157', password: clave });
  const browser = await chromium.launch();

  // C-14 vista inicial, C-08 aviso de DNI existente, C-07 aviso sin ubicación, documento obligatorio
  const { page } = await abrir(browser, 'admin', process.env.ADMIN_PASSWORD);
  const visibles = await page.evaluate(() => {
    const b = window.app.mapManager.map.getBounds();
    return window.app.patients.filter(p => p.latitud != null && b.contains([p.latitud, p.longitud])).length + ' de ' + window.app.patients.filter(p => p.latitud != null).length;
  });
  anota('C-14 la vista inicial muestra a todos los pacientes ubicados', /^(\d+) de \1$/.test(visibles), visibles);

  const subir = async (archivo, rechazar) => {
    page.rechazarDialogo = !!rechazar;
    const antes = page.peticiones.length;
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#rail-tab-excel')]);
    await fc.setFiles(archivo);
    await page.waitForSelector('#modal-padron-grid.active #padron-grid-tbody tr');
    await page.click('#padron-btn-cargar');
    await sleep(2500);
    page.rechazarDialogo = false;
    return page.peticiones.slice(antes).filter(p => p.includes('importar-lote')).length;
  };
  const dialogosAntes = page.dialogos.length;
  const envios = await subir(libro([fila('10000002', 'PACIENTE INVENTADO EXISTENTE'), fila('96500001', 'PACIENTE INVENTADO NUEVO')]), true);
  const aviso = page.dialogos.slice(dialogosAntes).find(m => m.includes('ya están en el padrón')) || '';
  anota('C-08 avisa antes de actualizar un DNI que ya está en el padrón; si se cancela no se envía nada', aviso.includes('10000002') && envios === 0, `envíos: ${envios}`);
  await page.evaluate(() => { const m = document.getElementById('modal-padron-grid'); if (m) m.classList.remove('active'); if (window.PadronGridModal) window.PadronGridModal.patients = []; });

  const toastsAntes = await page.evaluate(() => document.querySelectorAll('#toast-container .toast').length);
  await subir(libro([fila('96500002', 'PACIENTE INVENTADO SIN UBICAR', { direccion: 'Zzqx 999 lugar inexistente' })]), false);
  const avisos = await page.evaluate(n => [...document.querySelectorAll('#toast-container .toast')].slice(0).map(t => t.textContent.trim()).slice(-4), toastsAntes);
  anota('C-07 avisa cuántos pacientes no se pudieron ubicar en el mapa', avisos.some(t => t.includes('no se pudieron ubicar')), avisos.find(t => t.includes('ubicar')) || JSON.stringify(avisos));
  // Documento obligatorio (decisión de Edward): la cuadrícula marca la fila y no deja cargarla
  await page.evaluate(() => { if (window.PadronGridModal) window.PadronGridModal.patients = []; });
  const antesSinDoc = page.peticiones.length;
  const [fcSin] = await Promise.all([page.waitForEvent('filechooser'), page.click('#rail-tab-excel')]);
  await fcSin.setFiles(libro([fila('', 'PACIENTE INVENTADO SIN DOCUMENTO', { tipo_documento: 'Sin documento' })]));
  await page.waitForSelector('#modal-padron-grid.active #padron-grid-tbody tr');
  const errorDoc = await page.evaluate(() => {
    const r = window.PadronGridModal.validationResult;
    const e = r && r.rowResults && r.rowResults[0] ? r.rowResults[0].errors : {};
    return e.nro_documento || '';
  });
  const botonDeshabilitado = await page.$eval('#padron-btn-cargar', b => b.disabled);
  if (!botonDeshabilitado) await page.click('#padron-btn-cargar');
  await sleep(1200);
  const enviados = page.peticiones.slice(antesSinDoc).filter(p => p.includes('importar-lote')).length;
  const enServidor = (await api('GET', '/api/cronicos', A)).json.some(p => p.apellidos_nombres === 'PACIENTE INVENTADO SIN DOCUMENTO');
  anota('documento obligatorio: una fila «Sin documento» queda observada y no se carga', /obligatorio/.test(errorDoc) && enviados === 0 && !enServidor,
    `${errorDoc.slice(0, 60)}… · botón Cargar ${botonDeshabilitado ? 'deshabilitado' : 'habilitado'} · envíos ${enviados}`);
  await page.evaluate(() => { const m = document.getElementById('modal-padron-grid'); if (m) m.classList.remove('active'); if (window.PadronGridModal) window.PadronGridModal.patients = []; });

  // C-04: al salir, el tablero queda sin cifras
  await page.evaluate(() => window.app.switchView('dashboard'));
  await sleep(1200);
  const totalAdmin = await page.textContent('#dash-val-total');
  await page.click('#btn-logout');
  await sleep(500);
  const trasSalir = await page.evaluate(() => ['dash-val-total', 'dash-count-green', 'dash-val-control'].map(id => document.getElementById(id).textContent.trim()).join(' ') + ' | filas IPRESS: ' + document.querySelectorAll('#dash-ipress-tbody tr').length);
  anota('C-04 tras «Salir» el tablero no conserva cifras del usuario anterior', trasSalir.startsWith('— — —') && trasSalir.endsWith(': 0'), `ADMIN veía ${totalAdmin}; después: ${trasSalir}`);

  // C-03, C-12, C-13: DIRECTOR
  await page.fill('#login-username', 'f4.dir.ps');
  await page.fill('#login-password', clave);
  await page.click('#login-submit');
  await sleep(1500);
  await page.evaluate(() => window.app.switchView('dashboard'));
  await sleep(1500);
  const tablero = await page.evaluate(() => ({
    total: document.getElementById('dash-val-total').textContent.trim(),
    verde: document.getElementById('dash-count-green').textContent.trim(),
    patologias: document.getElementById('dash-pathology-list').textContent.trim().slice(0, 60),
    exportOculto: [...document.querySelectorAll('[data-accion="exportarPadronExcel"]')].every(b => b.classList.contains('perm-hidden'))
  }));
  const resumen = (await api('GET', '/api/alerts/summary', (await api('POST', '/api/auth/login', null, { username: 'f4.dir.ps', password: clave })).json.token)).json;
  anota('C-03 el tablero del DIRECTOR muestra los totales de su red (no ceros)', tablero.total === String(resumen.total_pacientes) && tablero.total !== '0', `total ${tablero.total} (servidor ${resumen.total_pacientes}), verdes ${tablero.verde}`);
  anota('C-03 lo que necesita datos nominales dice «no disponible», no 0', tablero.patologias.startsWith('Su rol ve solo'), tablero.patologias);
  anota('C-13 el DIRECTOR no ve «Exportar Padrón Excel»', tablero.exportOculto);
  await page.click('#btn-logout');
  await sleep(400);
  await page.fill('#login-username', 'f4.dir.pn');
  await page.fill('#login-password', clave);
  await page.click('#login-submit');
  await sleep(1200);
  const bienvenida = await page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent).find(t => t.includes('Bienvenido')) || '');
  anota('C-12 el aviso de bienvenida muestra el nombre tal cual (sin &amp; ni &#39;)', bienvenida.includes("O'Brien & <i>Co</i>"), bienvenida.trim().slice(0, 60));

  // C-14: sesión vencida al recargar
  await page.evaluate(() => { const k = 'maxime_cronicos_sesion_v1'; const s = JSON.parse(sessionStorage.getItem(k)); s.expires_at = new Date(Date.now() - 60000).toISOString(); sessionStorage.setItem(k, JSON.stringify(s)); });
  await page.reload();
  await page.waitForSelector('#login-overlay.active');
  anota('C-14 al recargar con la sesión vencida, el acceso lo dice', (await page.textContent('#login-error')).includes('venció'), await page.textContent('#login-error'));

  // C-02: sin conexión, la página abre desde la caché y lo dice (sin datos de pacientes en el equipo)
  const off = await abrir(browser, 'admin', process.env.ADMIN_PASSWORD);
  await off.page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  await off.page.reload(); await sleep(1500);
  const cache1 = await off.page.evaluate(async () => { let n = 0; for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).length; return n; });
  await off.page.reload(); await sleep(1500);
  const cache2 = await off.page.evaluate(async () => { let n = 0; for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).length; return n; });
  await off.ctx.setOffline(true);
  let estado = 0;
  try { estado = (await off.page.reload({ waitUntil: 'domcontentloaded' })).status(); } catch (e) { estado = 'error: ' + e.message.split('\n')[0]; }
  await sleep(1500);
  const msgOff = await off.page.evaluate(() => document.getElementById('login-error') ? document.getElementById('login-error').textContent : '(sin pantalla de acceso)');
  const apiEnCache = await off.page.evaluate(async () => { let n = 0; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (r.url.includes('/api/')) n++; return n; });
  anota('C-02 la caché del service worker ya no se borra en cada recarga', cache1 > 0 && cache2 >= cache1, `${cache1} → ${cache2} entradas`);
  anota('C-02 sin conexión la página abre desde la caché y avisa', estado === 200 && msgOff.includes('Sin conexión'), `HTTP ${estado} · «${msgOff.trim().slice(0, 70)}»`);
  anota('C-02 no quedan respuestas de /api (datos de pacientes) en la caché', apiEnCache === 0, `${apiEnCache} entradas de /api`);
  await off.ctx.setOffline(false);

  // C-10: móvil de 390 px
  const movil = await abrir(browser, 'admin', process.env.ADMIN_PASSWORD, { width: 390, height: 844 });
  const geom = await movil.page.evaluate(() => {
    const r = id => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), der: Math.round(b.right), vis: b.width > 0 && b.height > 0 }; };
    return { header: document.querySelector('.georis-header').scrollWidth, buscador: r('search-input'), salir: r('btn-logout'), ancho: window.innerWidth };
  });
  anota('C-10 el encabezado cabe en 390 px', geom.header <= geom.ancho, `ancho del encabezado ${geom.header}`);
  anota('C-10 el buscador está visible y dentro de la pantalla', geom.buscador && geom.buscador.vis && geom.buscador.x >= 0 && geom.buscador.der <= geom.ancho, JSON.stringify(geom.buscador));
  anota('C-10 «Cerrar sesión» está dentro de la pantalla', geom.salir && geom.salir.vis && geom.salir.der <= geom.ancho, JSON.stringify(geom.salir));
  await movil.page.click('[data-accion="navMovil"][data-arg="pacientes"]'); await sleep(600);
  const panel = await movil.page.evaluate(() => { const b = document.getElementById('hearts-panel').getBoundingClientRect(); return { x: Math.round(b.x), der: Math.round(b.right) }; });
  anota('C-10 el panel de pacientes queda dentro de la pantalla', panel.x >= 0 && panel.der <= 390, JSON.stringify(panel));
  const viewport = await movil.page.getAttribute('meta[name="viewport"]', 'content');
  anota('C-14 se permite ampliar con los dedos (sin user-scalable=no)', !/user-scalable=no|maximum-scale/.test(viewport), viewport);

  // Cierre por inactividad (30 minutos), con el reloj simulado
  const inac = await abrir(browser, 'admin', process.env.ADMIN_PASSWORD, null, { reloj: true });
  await inac.page.clock.runFor(31 * 60 * 1000);
  await sleep(500);
  const msgInac = await inac.page.evaluate(() => document.getElementById('login-overlay').classList.contains('active') ? document.getElementById('login-error').textContent : '(sesión abierta)');
  anota('la sesión se cierra tras 30 minutos sin uso', msgInac.includes('inactividad'), msgInac.trim().slice(0, 70));

  console.log(res.join('\n'));
  console.log(`\n${res.filter(r => r.startsWith('OK')).length} correctas, ${res.filter(r => r.startsWith('FALLA')).length} con falla`);
  await browser.close();
})().catch(e => { console.error('ERROR', e.message.split('\n')[0]); console.log(res.join('\n')); process.exit(1); });
