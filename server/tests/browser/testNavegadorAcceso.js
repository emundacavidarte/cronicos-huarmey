/**
 * testNavegadorAcceso.js
 * T-03b en un NAVEGADOR REAL (Edge o Chrome sin ventana, controlado por el protocolo CDP; sin paquetes nuevos).
 * Arranca el servidor real en el puerto 3104 con el disco bloqueado (blockDisk) y usuarios/pacientes INVENTADOS.
 * No forma parte de `npm test` (necesita un navegador instalado). Ejecutar: node server/tests/browser/testNavegadorAcceso.js
 * Opcional: SHOTS_DIR=<carpeta> guarda capturas de pantalla (sin datos reales).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { startServer } = require('../helpers/realServer');

const PORT = 3104;
const CDP_PORT = 9334;
const ADMIN_PASS = 'clave-admin-navegador-1';
const DNI_SYSTEM = 'urn:oid:2.16.840.1.113883.4.904';
const KEY = 'maxime_cronicos_sesion_v1';
const SHOTS = process.env.SHOTS_DIR || '';

// Ruta propia con NAVEGADOR=<ruta al ejecutable>; si no, se busca Edge o Chrome en Windows, Linux y Mac
const NAVEGADORES = [
  process.env.NAVEGADOR || '',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
].filter(Boolean);

let passed = 0;
let failed = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  OK    ' + name);
  } catch (e) {
    failed++;
    console.log('  FALLA ' + name + '\n        ' + e.message);
  }
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pend = new Map();
    const events = [];
    const api = {
      events,
      send: (method, params) => new Promise((ok, ko) => {
        const i = ++id;
        pend.set(i, { ok, ko });
        ws.send(JSON.stringify({ id: i, method, params: params || {} }));
      }),
      close: () => ws.close()
    };
    ws.onopen = () => resolve(api);
    ws.onerror = () => reject(new Error('No se pudo abrir el WebSocket del navegador'));
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && pend.has(d.id)) {
        const p = pend.get(d.id);
        pend.delete(d.id);
        if (d.error) p.ko(new Error(d.error.message)); else p.ok(d.result);
      } else if (d.method) {
        events.push(d);
      }
    };
  });
}

async function lanzarNavegador(userDir) {
  const exe = NAVEGADORES.find(p => fs.existsSync(p));
  if (!exe) throw new Error('No se encontró Edge ni Chrome. Indique la ruta con la variable NAVEGADOR.');
  // En Linux, como administrador (root), Chrome exige --no-sandbox
  const extra = (process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0) ? ['--no-sandbox'] : [];
  const child = spawn(exe, [
    ...extra, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + userDir, '--window-size=1280,800', 'about:blank'
  ], { stdio: 'ignore' });
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

function bundleFor(dni, orgCode) {
  const patient = {
    resourceType: 'Patient', id: 'pac-00001741-' + dni,
    identifier: [{ system: DNI_SYSTEM, value: dni }],
    name: [{ text: 'Paciente Inventado ' + dni }], gender: 'female'
  };
  if (orgCode) patient.managingOrganization = { reference: 'Organization/' + orgCode };
  return { resourceType: 'Bundle', type: 'transaction', entry: [{ resource: patient }] };
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

function crearPagina(cdp, base) {
  const ev = async expr => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('Error en la página: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expr, que, ms) => {
    const limite = Date.now() + (ms || 8000);
    let ultimo;
    while (Date.now() < limite) {
      try { ultimo = await ev(expr); } catch (e) { ultimo = false; }
      if (ultimo) return ultimo;
      await sleep(120);
    }
    throw new Error('Tiempo agotado esperando: ' + que);
  };
  const goto = async () => {
    await cdp.send('Page.navigate', { url: base + '/' });
    await waitFor('document.readyState === "complete" && !!window.app && !!window.app.authUi && !!window.app.session', 'que cargue la aplicación', 20000);
    await sleep(400);
  };
  const shot = async nombre => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, nombre + '.png'), Buffer.from(r.data, 'base64'));
  };
  const texto = id => ev(`(document.getElementById(${JSON.stringify(id)}) || {}).textContent || ''`);
  // Oculto = marcado como perm-hidden (él o un contenedor) o sin ninguna caja visible en pantalla
  const oculto = id => ev(`(function(){ var e = document.getElementById(${JSON.stringify(id)}); return !e || e.classList.contains('perm-hidden') || !!e.closest('.perm-hidden') || e.getClientRects().length === 0; })()`);
  const loginOverlayActivo = () => ev(`(function(){ var e = document.getElementById('login-overlay'); return !!e && e.classList.contains('active') && getComputedStyle(e).display !== 'none'; })()`);
  const pedidosA = parte => ev(`performance.getEntriesByType('resource').filter(function(r){ return r.name.indexOf(${JSON.stringify(parte)}) >= 0; }).length`);

  const ingresar = async (usuario, clave) => {
    await waitFor(`(function(){ var e = document.getElementById('login-overlay'); return e && e.classList.contains('active'); })()`, 'la pantalla de acceso');
    await ev(`(function(){
      document.getElementById('login-username').value = ${JSON.stringify(usuario)};
      document.getElementById('login-password').value = ${JSON.stringify(clave)};
      document.getElementById('login-form').requestSubmit();
    })()`);
  };

  return { ev, waitFor, goto, shot, texto, oculto, loginOverlayActivo, pedidosA, ingresar };
}

async function main() {
  let srv; let nav; let cdp; let userDir;
  const salir = async codigo => {
    try { if (cdp) cdp.close(); } catch (e) { /* ya cerrado */ }
    try { if (nav) nav.child.kill(); } catch (e) { /* ya cerrado */ }
    if (srv) await srv.stop();
    await sleep(500);
    try { if (userDir) fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* el navegador aún libera archivos */ }
    process.exit(codigo);
  };

  try {
    srv = await startServer({
      port: PORT,
      env: { ADMIN_USER: 'admin', ADMIN_PASSWORD: ADMIN_PASS, ADMIN_RESET: '', NODE_ENV: 'test', AUTH_SECRET: 'secreto-navegador-de-prueba-con-mas-de-32-caracteres' }
    });
  } catch (e) {
    console.log('  FALLA no arrancó el servidor: ' + e.message);
    process.exit(1);
  }
  const base = srv.base;

  // Datos inventados: 2 pacientes de Pacífico Sur (00001744), 1 de red desconocida y 3 usuarios
  const admin = (await api(base, 'POST', '/api/auth/login', null, { username: 'admin', password: ADMIN_PASS })).json.token;
  await api(base, 'POST', '/fhir/Bundle', admin, bundleFor('94100001', '00001744'));
  await api(base, 'POST', '/fhir/Bundle', admin, bundleFor('94100002', '00001744'));
  await api(base, 'POST', '/fhir/Bundle', admin, bundleFor('94100003', '99999999'));
  const nuevo = (u, role, red) => api(base, 'POST', '/api/users', admin, { username: u, nombre: 'PERSONA ' + u.toUpperCase(), role, red, password: 'clave-de-' + u + '-123' });
  await nuevo('coord.ps', 'COORDINADOR', 'PACIFICO SUR');
  await nuevo('coord.cs', 'COORDINADOR', 'CONCHUCOS SUR');
  await nuevo('dir.ps', 'DIRECTOR', 'PACIFICO SUR');

  try {
    userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cronicos-nav-'));
    nav = await lanzarNavegador(userDir);
    cdp = await connect(nav.wsUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  } catch (e) {
    console.log('  FALLA no se pudo abrir el navegador: ' + e.message);
    await salir(1);
  }

  const P = crearPagina(cdp, base);
  const KPI_TOTAL = `parseInt(document.getElementById('kpi-total').textContent, 10)`;
  const SESION = `sessionStorage.getItem(${JSON.stringify(KEY)})`;

  console.log('Navegador real: acceso');

  await step('sin sesión: pantalla de acceso, aplicación inactiva y NINGÚN dato de pacientes pedido', async () => {
    await P.goto();
    assert.strictEqual(await P.loginOverlayActivo(), true);
    await sleep(800);
    assert.strictEqual(await P.pedidosA('/api/cronicos'), 0, 'no debe llamar a /api/cronicos sin sesión');
    assert.strictEqual(await P.pedidosA('/api/alerts/summary'), 0);
    assert.strictEqual(await P.ev(`window.app.patients.length`), 0);
    assert.strictEqual(await P.ev(`document.querySelector('.app-container').hasAttribute('inert')`), true);
    await P.shot('01_acceso');
  });

  await step('clave incorrecta: mensaje de error, sin sesión y el campo de clave queda vacío', async () => {
    await P.ingresar('coord.ps', 'clave-equivocada-123');
    await P.waitFor(`document.getElementById('login-error').textContent.length > 0`, 'el mensaje de error');
    assert.ok(/incorrectos/i.test(await P.texto('login-error')));
    assert.strictEqual(await P.loginOverlayActivo(), true);
    assert.strictEqual(await P.ev(`document.getElementById('login-password').value`), '');
    assert.strictEqual(await P.ev(SESION), null);
    await P.shot('02_clave_incorrecta');
  });

  console.log('Navegador real: COORDINADOR de Pacífico Sur');

  await step('COORDINADOR: entra y ve SOLO los 2 pacientes de su red (no el de red desconocida)', async () => {
    await P.ingresar('coord.ps', 'clave-de-coord.ps-123');
    await P.waitFor(`!document.getElementById('login-overlay').classList.contains('active') && ${KPI_TOTAL} > 0`, 'los datos del coordinador');
    assert.strictEqual(await P.ev(KPI_TOTAL), 2);
    assert.strictEqual(await P.ev(`window.app.patients.length`), 2);
    assert.strictEqual(await P.ev(`document.querySelector('.app-container').hasAttribute('inert')`), false);
    assert.ok(/Coordinador/.test(await P.texto('user-chip-role')) && /PACIFICO SUR/.test(await P.texto('user-chip-role')));
    await P.shot('03_coordinador');
  });

  await step('COORDINADOR: ve la ingesta y exportar pre-citas, pero NO el botón Usuarios', async () => {
    assert.strictEqual(await P.oculto('tab-btn-ingesta'), false);
    assert.strictEqual(await P.oculto('btn-export-precitas'), false);
    // El padrón se abre desde la barra lateral (el antiguo botón de la cabecera está oculto por diseño)
    assert.strictEqual(await P.oculto('rail-tab-padron'), false);
    assert.strictEqual(await P.oculto('btn-usuarios'), true);
    assert.strictEqual(await P.oculto('btn-usuarios-mobile'), true);
  });

  await step('COORDINADOR: la pre-cita de un paciente de su red se guarda en el servidor (con token)', async () => {
    const toast = await P.ev(`(async function(){
      window.app.selectedPatientForPreCita = window.app.patients[0];
      await window.app.confirmarPreCita();
      return document.getElementById('toast-container').textContent;
    })()`);
    assert.ok(/Pre-cita registrada/.test(toast) && !/solo en esta sesión/.test(toast), toast);
  });

  await step('recargar la página con la sesión guardada: no pide acceso y recarga los datos', async () => {
    await P.goto();
    await P.waitFor(`${KPI_TOTAL} === 2`, 'los datos tras recargar');
    assert.strictEqual(await P.loginOverlayActivo(), false);
    assert.strictEqual(await P.ev(`JSON.parse(${SESION}).user.username`), 'coord.ps');
    assert.ok(!(await P.ev(SESION)).includes('clave-de-coord'), 'la clave no debe guardarse');
  });

  console.log('Navegador real: salir y cambiar de usuario');

  await step('SALIR: borra sesión, pacientes, KPI, lista y avisos (el de pre-cita nombra a un paciente)', async () => {
    assert.ok((await P.texto('toast-container')).length > 0, 'antes de salir debe haber avisos en pantalla');
    await P.ev(`document.getElementById('btn-logout').click()`);
    assert.strictEqual((await P.texto('toast-container')).replace(/Sesión cerrada\.?/g, '').trim(), '', 'no debe quedar ningún aviso de la sesión anterior');
    await P.waitFor(`document.getElementById('login-overlay').classList.contains('active')`, 'la pantalla de acceso');
    assert.strictEqual(await P.ev(SESION), null);
    assert.strictEqual(await P.ev(`window.app.patients.length`), 0);
    assert.strictEqual(await P.ev(KPI_TOTAL), 0);
    assert.strictEqual(await P.ev(`document.getElementById('patient-list').children.length`), 0);
    assert.strictEqual(await P.ev(`window.app.mapManager.layers.pacientes.getLayers().length`), 0);
  });

  await step('otro COORDINADOR (Conchucos Sur) entra: 0 pacientes y nada de la sesión anterior', async () => {
    await P.ingresar('coord.cs', 'clave-de-coord.cs-123');
    await P.waitFor(`!document.getElementById('login-overlay').classList.contains('active')`, 'el ingreso');
    await sleep(900);
    assert.strictEqual(await P.ev(`window.app.patients.length`), 0);
    assert.strictEqual(await P.ev(KPI_TOTAL), 0);
    assert.strictEqual(await P.ev(`window.AlertsManager.precitas.length`), 0, 'las pre-citas de la sesión anterior deben borrarse');
    assert.ok(/CONCHUCOS SUR/.test(await P.texto('user-chip-role')));
    await P.ev(`document.getElementById('btn-logout').click()`);
    await P.waitFor(`document.getElementById('login-overlay').classList.contains('active')`, 'la pantalla de acceso');
  });

  console.log('Navegador real: DIRECTOR');

  await step('DIRECTOR: solo totales de su red; sin padrón, sin lista, sin ingesta y sin llamar a /api/cronicos', async () => {
    await P.goto();
    await P.ingresar('dir.ps', 'clave-de-dir.ps-123');
    await P.waitFor(`!document.getElementById('login-overlay').classList.contains('active') && ${KPI_TOTAL} > 0`, 'el resumen del director');
    assert.strictEqual(await P.ev(KPI_TOTAL), 2);
    assert.strictEqual(await P.ev(`window.app.patients.length`), 0, 'el director no debe tener pacientes individuales en memoria');
    assert.strictEqual(await P.pedidosA('/api/cronicos'), 0);
    for (const id of ['hearts-panel', 'btn-toggle-hearts', 'search-input', 'right-drawer-handle', 'tab-btn-ingesta', 'btn-export-precitas', 'btn-usuarios']) {
      assert.strictEqual(await P.oculto(id), true, 'para el Director debe estar oculto: ' + id);
    }
    assert.ok(/Director/.test(await P.texto('user-chip-role')));
    await P.shot('04_director');
  });

  await step('DIRECTOR: aunque fuerce las acciones desde la consola, la interfaz las rechaza y el servidor da 403', async () => {
    const r = await P.ev(`(async function(){
      window.app.handleFileUpload(new Blob(['x'], { type: 'text/csv' }));
      var t = document.getElementById('toast-container').textContent;
      var res = await window.app.session.authFetch('/api/cronicos');
      return { toast: t, estado: res.status, sesion: window.app.session.isLoggedIn() };
    })()`);
    assert.ok(/no permite subir/.test(r.toast), r.toast);
    assert.strictEqual(r.estado, 403);
    assert.strictEqual(r.sesion, true, 'un 403 no debe cerrar la sesión');
    await P.ev(`document.getElementById('btn-logout').click()`);
    await P.waitFor(`document.getElementById('login-overlay').classList.contains('active')`, 'la pantalla de acceso');
  });

  console.log('Navegador real: ADMINISTRADOR y sesión vencida');

  await step('ADMIN: ve todas las redes (3 pacientes) y el botón Usuarios', async () => {
    await P.ingresar('admin', ADMIN_PASS);
    await P.waitFor(`!document.getElementById('login-overlay').classList.contains('active') && ${KPI_TOTAL} > 0`, 'los datos del admin');
    assert.strictEqual(await P.ev(KPI_TOTAL), 3);
    assert.strictEqual(await P.oculto('btn-usuarios'), false);
  });

  await step('MÓVIL (390x800): el ADMIN ve Usuarios y Salir en la barra inferior, y el título del encabezado no se corta en pantalla mediana', async () => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 800, deviceScaleFactor: 1, mobile: true });
    await sleep(500);
    assert.strictEqual(await P.oculto('btn-logout-mobile'), false);
    assert.strictEqual(await P.oculto('btn-usuarios-mobile'), false);
    await P.shot('07_movil_admin');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(500);
    const desborda = await P.ev(`(function(){ var h = document.querySelector('.georis-header'); var t = document.querySelector('.georis-main-title'); return t.getBoundingClientRect().top < h.getBoundingClientRect().top - 1 || t.getBoundingClientRect().bottom > h.getBoundingClientRect().bottom + 1; })()`);
    assert.strictEqual(desborda, false, 'el título se sale del encabezado');
    await P.shot('08_encabezado_1280');
    await cdp.send('Emulation.clearDeviceMetricsOverride');
  });

  await step('ADMIN: abre Usuarios, ve las 7 redes y registra un Director que luego puede ingresar', async () => {
    await P.ev(`document.getElementById('btn-usuarios').click()`);
    await P.waitFor(`document.querySelectorAll('#nuevo-usuario-red option').length === 8 && document.querySelectorAll('.usuario-fila').length >= 4`, 'la lista de usuarios y redes');
    await P.shot('05_usuarios');
    await P.ev(`(function(){
      document.getElementById('nuevo-usuario-login').value = 'dir.nuevo';
      document.getElementById('nuevo-usuario-nombre').value = 'DIRECTOR NUEVO';
      document.getElementById('nuevo-usuario-rol').value = 'DIRECTOR';
      document.getElementById('nuevo-usuario-red').value = 'HUAYLAS NORTE';
      document.getElementById('nuevo-usuario-clave').value = 'clave-nueva-123';
      document.getElementById('form-nuevo-usuario').requestSubmit();
    })()`);
    await P.waitFor(`document.getElementById('usuarios-msg').classList.contains('ok')`, 'la confirmación del registro');
    const login = await api(base, 'POST', '/api/auth/login', null, { username: 'dir.nuevo', password: 'clave-nueva-123' });
    assert.strictEqual(login.status, 200);
    assert.strictEqual(login.json.user.red, 'HUAYLAS NORTE');
  });

  await step('ADMIN: sin elegir red para un Director, la interfaz lo impide y no crea el usuario', async () => {
    await P.ev(`(function(){
      document.getElementById('nuevo-usuario-login').value = 'sin.red';
      document.getElementById('nuevo-usuario-nombre').value = 'SIN RED';
      document.getElementById('nuevo-usuario-rol').value = 'COORDINADOR';
      document.getElementById('nuevo-usuario-red').value = '';
      document.getElementById('nuevo-usuario-clave').value = 'clave-sin-red-123';
      document.getElementById('form-nuevo-usuario').requestSubmit();
    })()`);
    await P.waitFor(`document.getElementById('usuarios-msg').classList.contains('error')`, 'el aviso de red obligatoria');
    assert.strictEqual((await api(base, 'POST', '/api/auth/login', null, { username: 'sin.red', password: 'clave-sin-red-123' })).status, 401);
    await P.ev(`document.getElementById('usuarios-cerrar').click()`);
  });

  await step('sesión vencida (el servidor rechaza el token): vuelve el acceso y se borran los datos', async () => {
    // Cambiar la clave del usuario cierra sus sesiones ya emitidas: el servidor responderá 401 al token del navegador
    const cambio = await api(base, 'PATCH', '/api/users/admin', admin, { password: 'clave-admin-cambiada-1' });
    assert.strictEqual(cambio.status, 200);
    await P.ev(`window.app.session.authFetch('/api/cronicos').catch(function(){})`);
    await P.waitFor(`document.getElementById('login-overlay').classList.contains('active')`, 'la pantalla de acceso tras el 401');
    assert.ok(/venci/i.test(await P.texto('login-error')), await P.texto('login-error'));
    assert.strictEqual(await P.ev(SESION), null);
    assert.strictEqual(await P.ev(`window.app.patients.length`), 0);
    assert.strictEqual(await P.ev(KPI_TOTAL), 0);
    await P.shot('06_sesion_vencida');
  });

  console.log('\nResultado: ' + passed + ' correctas, ' + failed + ' con falla');
  await salir(failed ? 1 : 0);
}

main().catch(e => {
  console.log('ERROR INESPERADO ' + e.stack);
  process.exit(1);
});
