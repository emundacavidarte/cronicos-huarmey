/**
 * testNavegadorGeo.js
 * G-06 en un NAVEGADOR REAL (Edge o Chrome/Chromium sin ventana, por CDP; sin paquetes nuevos), con datos INVENTADOS:
 *  1. Registro web: al escribir la dirección aparece la vista previa y la tarjeta con mapa y marcador;
 *     arrastrar el marcador confirma la ubicación a mano.
 *  2. Mapa: contador «sin ubicar» y botón «Revisar ubicaciones».
 *  3. Panel «Revisar ubicaciones»: marcar en el mapa a un paciente sin ubicar y guardar → el servidor lo deja «exacta».
 * No forma parte de `npm test` (necesita un navegador). Ejecutar: node server/tests/browser/testNavegadorGeo.js
 * Opcional: SHOTS_DIR=<carpeta> guarda capturas de pantalla (solo datos inventados).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { startServer } = require('../helpers/realServer');

const PORT = 3112;
const CDP_PORT = 9336;
const ADMIN_PASS = 'clave-admin-navegador-geo-1';
const SHOTS = process.env.SHOTS_DIR || '';
const NAVEGADORES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'
];

let passed = 0;
let failed = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function step(name, fn) {
  try { await fn(); passed++; console.log('  OK    ' + name); }
  catch (e) { failed++; console.log('  FALLA ' + name + '\n        ' + e.message); }
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pend = new Map();
    ws.onopen = () => resolve({
      send: (method, params) => new Promise((ok, ko) => { const i = ++id; pend.set(i, { ok, ko }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); }),
      close: () => ws.close()
    });
    ws.onerror = () => reject(new Error('No se pudo abrir el WebSocket del navegador'));
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); if (d.error) p.ko(new Error(d.error.message)); else p.ok(d.result); }
    };
  });
}

async function lanzarNavegador(userDir) {
  const exe = NAVEGADORES.find(p => fs.existsSync(p));
  if (!exe) throw new Error('No se encontró Edge, Chrome ni Chromium.');
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + userDir, '--window-size=1366,900', 'about:blank'];
  if (process.platform !== 'win32') args.unshift('--no-sandbox');
  const child = spawn(exe, args, { stdio: 'ignore' });
  const limite = Date.now() + 20000;
  while (Date.now() < limite) {
    try {
      const lista = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json();
      const page = lista.find(t => t.type === 'page');
      if (page) return { child, wsUrl: page.webSocketDebuggerUrl };
    } catch (e) { /* aún no arranca */ }
    await sleep(300);
  }
  child.kill();
  throw new Error('El navegador no abrió el puerto de depuración a tiempo.');
}

async function api(base, method, url, token, body) {
  const h = {};
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch (e) { /* sin cuerpo */ }
  return { status: res.status, json };
}

async function main() {
  let srv; let nav; let cdp; let userDir;
  const salir = async codigo => {
    try { if (cdp) cdp.close(); } catch (e) { /* ya cerrado */ }
    try { if (nav) nav.child.kill(); } catch (e) { /* ya cerrado */ }
    if (srv) await srv.stop();
    await sleep(500);
    try { if (userDir) fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* el navegador libera archivos */ }
    process.exit(codigo);
  };

  try {
    srv = await startServer({ port: PORT, env: { ADMIN_USER: 'admin', ADMIN_PASSWORD: ADMIN_PASS, ADMIN_RESET: '', NODE_ENV: 'test', AUTH_SECRET: 'secreto-navegador-geo-de-prueba-con-mas-de-32-caracteres' } });
  } catch (e) {
    console.log('  FALLA no arrancó el servidor: ' + e.message);
    process.exit(1);
  }
  const base = srv.base;
  const admin = (await api(base, 'POST', '/api/auth/login', null, { username: 'admin', password: ADMIN_PASS })).json.token;
  // Paciente inventado cuya dirección no se reconoce: queda «sin ubicar»
  await api(base, 'POST', '/api/padron/importar-lote', admin, { patients: [
    { id: 'pac-nav-geo-1', dni: '95000001', apellidos_nombres: 'PACIENTE INVENTADO NAVEGADOR GEO', direccion: 'Pje Primavera s/n' }
  ] });

  try {
    userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cronicos-nav-geo-'));
    nav = await lanzarNavegador(userDir);
    cdp = await connect(nav.wsUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    // Sin internet en las pruebas: las teselas del mapa base no se piden (el mapa funciona igual)
    await cdp.send('Network.setBlockedURLs', { urls: ['*arcgisonline*', '*google.com/vt*', '*cartocdn*', '*openstreetmap*'] });
  } catch (e) {
    console.log('  FALLA no se pudo abrir el navegador: ' + e.message);
    return salir(1);
  }

  const ev = async expr => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('Error en la página: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expr, que, ms) => {
    const limite = Date.now() + (ms || 8000);
    while (Date.now() < limite) {
      let v; try { v = await ev(expr); } catch (e) { v = false; }
      if (v) return v;
      await sleep(150);
    }
    throw new Error('Tiempo agotado esperando: ' + que);
  };
  const shot = async nombre => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, nombre + '.png'), Buffer.from(r.data, 'base64'));
  };
  const mouse = async (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 });
  const rect = sel => ev(`(function(){ var e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
  const erroresPagina = [];
  // Captura de errores de JavaScript desde que carga cada documento (también los de setTimeout y promesas)
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__err = []; window.addEventListener('error', function(e){ window.__err.push(String(e.message)); }); window.addEventListener('unhandledrejection', function(e){ window.__err.push('promesa: ' + String(e.reason && e.reason.message || e.reason)); });" });

  await cdp.send('Page.navigate', { url: base + '/' });
  await waitFor('document.readyState === "complete" && !!window.app && !!window.app.authUi', 'que cargue la aplicación', 20000);
  await waitFor(`(function(){ var e = document.getElementById('login-overlay'); return e && e.classList.contains('active'); })()`, 'la pantalla de acceso');
  await ev(`(function(){ document.getElementById('login-username').value = 'admin'; document.getElementById('login-password').value = ${JSON.stringify(ADMIN_PASS)}; document.getElementById('login-form').requestSubmit(); })()`);
  await waitFor('window.app.patients && window.app.patients.length > 0', 'que cargue el padrón', 15000);

  await step('El mapa muestra el contador «sin ubicar» y el botón «Revisar ubicaciones»', async () => {
    const txt = await waitFor(`(document.querySelector('.geo-resumen-control') || {}).textContent`, 'el contador del mapa');
    assert.ok(/sin ubicar/.test(txt), txt);
    assert.ok(/[1-9]\d* sin ubicar/.test(txt), 'hay al menos 1 sin ubicar: ' + txt);
    assert.ok(await ev(`!!document.querySelector('.geo-resumen-control [data-accion="revisar-ubicaciones"]')`));
    await shot('01_mapa_contador');
  });

  await step('Registro web: al escribir «Jr. Bolognesi 330» aparece la vista previa (cuadra 3) y la tarjeta con el marcador', async () => {
    await ev('window.RegistroClinicoModal.open()');
    await waitFor(`document.getElementById('reg-direccion') && document.querySelector('.reg-modal-overlay.active')`, 'el formulario de registro');
    await ev(`(function(){
      var s = document.getElementById('reg-sector'); s.value = 'Sector I – Centro'; s.dispatchEvent(new Event('change', { bubbles: true }));
      var d = document.getElementById('reg-direccion'); d.value = 'Jr. Bolognesi 330'; d.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    const txt = await waitFor(`(function(){ var t = document.getElementById('reg-geo-preview').textContent; return /cuadra/.test(t) && t; })()`, 'la vista previa con la cuadra');
    assert.ok(/cuadra 3/.test(txt), txt);
    assert.strictEqual(await ev(`document.getElementById('reg-geo-card').hidden`), false);
    await waitFor(`!!document.querySelector('#reg-geo-mapa .leaflet-marker-icon')`, 'el marcador en el mapa');
    await ev(`document.getElementById('reg-geo-card').scrollIntoView({ block: 'center' })`);
    await sleep(400);
    await shot('02_registro_tarjeta');
  });

  await step('Arrastrar el marcador confirma la ubicación a mano (exacta) y cambia las coordenadas', async () => {
    const antes = await ev(`JSON.stringify(window.RegistroClinicoModal.picker.getValor())`);
    const m = await rect('#reg-geo-mapa .leaflet-marker-icon');
    assert.ok(m, 'marcador visible');
    await mouse('mouseMoved', m.x, m.y + 8);
    await mouse('mousePressed', m.x, m.y + 8);
    for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', m.x + i * 8, m.y + 8 + i * 4); await sleep(30); }
    await mouse('mouseReleased', m.x + 64, m.y + 40);
    const v = JSON.parse(await waitFor(`(function(){ var v = window.RegistroClinicoModal.picker.getValor(); return v && v.manual && JSON.stringify(v); })()`, 'la ubicación manual'));
    const a = JSON.parse(antes);
    assert.strictEqual(v.precision_geo, 'exacta');
    assert.strictEqual(v.geo_fuente, 'mapa_manual');
    assert.ok(v.lat !== a.lat || v.lng !== a.lng, 'las coordenadas cambiaron');
    const txt = await ev(`document.getElementById('reg-geo-preview').textContent`);
    assert.ok(/confirmada en el mapa/.test(txt), txt);
    await shot('03_registro_marcador_arrastrado');
  });

  await step('Guardar el registro directo envía la ubicación confirmada: el servidor la guarda «exacta» con quién la confirmó', async () => {
    const v = JSON.parse(await ev(`JSON.stringify(window.RegistroClinicoModal.picker.getValor())`));
    await ev(`(function(){
      window.alert = function () {};
      var set = function (id, val, evt) { var e = document.getElementById(id); e.value = val; e.dispatchEvent(new Event(evt || 'input', { bubbles: true })); };
      set('reg-input-dni', '95000002');
      set('reg-apellidos-nombres', 'PACIENTE INVENTADO REGISTRO GEO');
      set('reg-fecha-nacimiento', '1960-05-05', 'change');
      set('reg-consentimiento', 'No', 'change');
      document.getElementById('reg-btn-guardar').click();
    })()`);
    await waitFor(`!document.querySelector('.reg-modal-overlay.active')`, 'que el registro se guarde y cierre', 15000);
    const lista = (await api(base, 'GET', '/api/cronicos', admin)).json;
    const p = lista.find(x => x.dni === '95000002');
    assert.ok(p, 'el paciente se guardó');
    assert.strictEqual(p.precision_geo, 'exacta');
    assert.strictEqual(p.geo_fuente, 'mapa_manual');
    assert.strictEqual(p.geo_confirmado_por, 'admin');
    assert.strictEqual(p.latitud, v.lat);
    assert.strictEqual(p.longitud, v.lng);
  });

  await step('Carga del padrón Excel (solo dirección y sector): cada paciente se ubica solo y se abre «Revisar ubicaciones» con los pendientes', async () => {
    await ev(`(async function(){
      window.alert = function () {};
      var headers = ['N.º de documento (DNI)', 'Apellidos y nombres', 'Sexo', 'Sector sanitario', 'Fecha de nacimiento', 'Seguro de salud', 'Establecimiento de adscripción', 'Establecimiento de control', 'Estado del paciente', 'Dirección y referencia', 'Consentimiento del paciente'];
      var est = 'Hospital de Apoyo Huarmey (00001741, II-1)';
      var rows = [headers,
        ['96000001', 'PACIENTE EXCEL CUADRA', 'Femenino', 'Sector I – Centro', '1960-01-01', 'SIS', est, est, 'Activo', 'Jr. 28 de Julio 330', 'No'],
        ['96000002', 'PACIENTE EXCEL PUERTO', 'Masculino', 'Puerto Huarmey', '1961-01-01', 'SIS', est, est, 'Activo', 'Calle Grau 120', 'No'],
        ['96000003', 'PACIENTE EXCEL SECTOR', 'Femenino', 'Sector II – La Victoria', '1962-01-01', 'SIS', est, est, 'Activo', 'Mz B Lt 4', 'No'],
        ['96000004', 'PACIENTE EXCEL SIN UBICAR', 'Femenino', 'Otro distrito (se anota cuál en la dirección)', '1963-01-01', 'SIS', est, est, 'Activo', 'Calle Los Olivos 4', 'No']];
      var ws = XLSX.utils.aoa_to_sheet(rows); var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Padron');
      var buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      var file = new File([buf], 'padron_inventado.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      await window.PadronGridModal.openWithFile(file);
    })()`);
    await waitFor(`window.PadronGridModal.validationResult && window.PadronGridModal.validationResult.totalErrors === 0`, 'la validación sin errores del Excel', 10000);
    await ev(`window.PadronGridModal.commitUpload()`);
    await waitFor(`document.querySelector('#modal-revisar-ubicacion.active')`, 'que se abra «Revisar ubicaciones» tras la carga', 15000);
    const lista = (await api(base, 'GET', '/api/cronicos', admin)).json;
    const pr = dni => (lista.find(x => x.dni === dni) || {});
    assert.strictEqual(pr('96000001').precision_geo, 'cuadra');
    assert.strictEqual(pr('96000002').sector_georis, 'Sector 66', 'Calle Grau + sector Puerto Huarmey va a Puerto Huarmey');
    assert.strictEqual(pr('96000003').precision_geo, 'sector');
    assert.strictEqual(pr('96000004').precision_geo, 'sin_ubicacion');
    assert.strictEqual(pr('96000004').latitud, null, 'sin punto inventado');
    const toast = await ev(`(document.getElementById('toast-container') || {}).textContent`);
    assert.ok(/3 aproximada\(s\) por dirección, 1 sin ubicar/.test(toast), 'el resumen de la carga usa el sector: ' + toast.trim().slice(-160));
    const aprox = await ev(`document.querySelector('#modal-revisar-ubicacion [data-filtro="aproximados"]').textContent`);
    assert.ok(/Aproximados \([1-9]/.test(aprox), aprox);
    await shot('04a_excel_revisar');
    await ev(`document.querySelector('#modal-revisar-ubicacion [data-accion="cerrar"]').click()`);
  });

  await step('«Revisar ubicaciones»: marcar en el mapa al paciente sin ubicar y guardar lo deja «exacta» en el servidor', async () => {
    await ev(`document.querySelector('.geo-resumen-control [data-accion="revisar-ubicaciones"]').click()`);
    await ev(`document.querySelector('#modal-revisar-ubicacion [data-filtro="sin_ubicacion"]').click()`);
    await waitFor(`document.querySelector('#modal-revisar-ubicacion.active [data-id="pac-nav-geo-1"]')`, 'el paciente en la lista');
    await ev(`document.querySelector('#modal-revisar-ubicacion [data-id="pac-nav-geo-1"]').click()`);
    await waitFor(`!!document.querySelector('#modal-revisar-ubicacion .ubic-picker-map')`, 'el mapa del panel');
    await sleep(500);
    const mapa = await rect('#modal-revisar-ubicacion .ubic-picker-map');
    await mouse('mouseMoved', mapa.x + 20, mapa.y - 10);
    await mouse('mousePressed', mapa.x + 20, mapa.y - 10);
    await mouse('mouseReleased', mapa.x + 20, mapa.y - 10);
    await waitFor(`!document.querySelector('#modal-revisar-ubicacion [data-accion="guardar"]').disabled`, 'que se habilite «Guardar»');
    await shot('04_revisar_marcado');
    await ev(`document.querySelector('#modal-revisar-ubicacion [data-accion="guardar"]').click()`);
    await waitFor(`/Guardado/.test(document.querySelector('#modal-revisar-ubicacion .ubic-guardar-estado').textContent)`, 'la confirmación de guardado');
    const lista = (await api(base, 'GET', '/api/cronicos', admin)).json;
    const p = lista.find(x => x.id === 'pac-nav-geo-1');
    assert.strictEqual(p.precision_geo, 'exacta');
    assert.strictEqual(p.geo_fuente, 'mapa_manual');
    assert.strictEqual(p.geo_confirmado_por, 'admin');
    assert.ok(p.latitud < -10.0 && p.latitud > -10.1, 'dentro de Huarmey');
    await shot('05_revisar_guardado');
  });

  await step('La página no registró errores de JavaScript', async () => {
    const errs = await ev('window.__err || []');
    assert.deepStrictEqual(errs.concat(erroresPagina), []);
  });

  console.log('\nResultado Navegador geolocalización: ' + passed + ' correctas, ' + failed + ' con falla');
  return salir(failed === 0 ? 0 : 1);
}

main();
