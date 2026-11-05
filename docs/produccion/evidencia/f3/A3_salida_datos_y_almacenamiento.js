// Evidencia Fase 3 (auditoría del cliente) — A3: datos de pacientes que salen del navegador hacia terceros y lo que
// queda guardado en el navegador. Semilla de 20 pacientes simulados y datos inventados (DNI 96…). No se imprime el cuerpo
// de ninguna petición con datos de pacientes ni claves/tokens (se reemplazan por ***).
// Uso: ADMIN_PASSWORD=<clave> BASE=http://127.0.0.1:3261 node A3_salida_datos_y_almacenamiento.js   (ver ../f4/srv.sh)
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const RAIZ = path.resolve(__dirname, '../../../..');
const BASE = process.env.BASE || 'http://127.0.0.1:3261';
const ORIGEN = new URL(BASE).host;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
const log = (s = '') => { out.push(s); console.log(s); };
const XLSX = require(path.join(RAIZ, 'client/libs/xlsx.full.min.js'));
const exp = require(path.join(RAIZ, 'client/js/data/padronExportV4.js'));
const H = 'Hospital de Apoyo Huarmey (00001741, II-1)';
const CLAVE = 'Clave-de-prueba-C3-1';
const normHost = h => h.replace(/^[a-d0-3]\./, '*.').replace(/^mt\d\./, 'mt*.');
const mask = s => String(s).replace(new RegExp(process.env.ADMIN_PASSWORD || 'x', 'g'), '***').replace(/eyJ[A-Za-z0-9._-]{20,}/g, '***').replace(/[A-Za-z0-9_-]{40,}/g, '***');

async function api(method, url, token, body) {
  const h = {};
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* */ }
  return { status: r.status, json: j, headers: r.headers };
}

// ---- Mosaicos: de la URL a (z, x, y) y a los límites geográficos de la tesela ----
function tileDe(u) {
  let m;
  if ((m = /\/vt\/lyrs=[a-z]&hl=\w+&x=(\d+)&y=(\d+)&z=(\d+)/.exec(u))) return { x: +m[1], y: +m[2], z: +m[3] };
  if ((m = /\/(?:light_all|dark_all)\/(\d+)\/(\d+)\/(\d+)/.exec(u))) return { z: +m[1], x: +m[2], y: +m[3] };
  if ((m = /\/hot\/(\d+)\/(\d+)\/(\d+)\.png/.exec(u))) return { z: +m[1], x: +m[2], y: +m[3] };
  if ((m = /\/tile\/(\d+)\/(\d+)\/(\d+)/.exec(u))) return { z: +m[1], y: +m[2], x: +m[3] };
  return null;
}
const lonDe = (x, z) => x / 2 ** z * 360 - 180;
const latDe = (y, z) => { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };
const ladoM = (lat, z) => Math.round(40075016.686 * Math.cos(lat * Math.PI / 180) / 2 ** z);
function contiene(t, lat, lon) { return lon >= lonDe(t.x, t.z) && lon < lonDe(t.x + 1, t.z) && lat <= latDe(t.y, t.z) && lat > latDe(t.y + 1, t.z); }

(async () => {
  const A = (await api('POST', '/api/auth/login', null, { username: 'admin', password: process.env.ADMIN_PASSWORD })).json.token;
  const sembrados = (await api('GET', '/api/cronicos', A)).json;
  log(`A3 — salida de datos y almacenamiento · ${sembrados.length} pacientes simulados cargados en el servidor de prueba`);
  // otro usuario (de otra red) para comprobar qué queda entre sesiones en un equipo compartido
  await api('POST', '/api/users', A, { username: 'c3.otra.red', nombre: 'Coordinador otra red', correo: 'c3.otra.red@prueba.example', role: 'COORDINADOR', red: '157', password: CLAVE });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  page.on('dialog', d => d.accept());

  // ---------- registro de red ----------
  let fase = 'inicio';
  const reg = [];       // {fase, host, path, tipo, ext, metodo, referer}
  const fallidas = new Map();
  const cabecerasApi = new Set();
  const consola = [];
  const alAbrir = r => {
    const u = new URL(r.url());
    reg.push({ fase, host: u.host, path: u.pathname, search: u.search, url: r.url(), tipo: r.resourceType(), ext: u.host !== ORIGEN, metodo: r.method(), referer: r.headers()['referer'] || '' });
  };
  ctx.on('request', alAbrir);
  ctx.on('requestfailed', r => { const h = normHost(new URL(r.url()).host); fallidas.set(h, (fallidas.get(h) || 0) + 1); });
  ctx.on('response', r => { const u = new URL(r.url()); if (u.host === ORIGEN && u.pathname.startsWith('/api/')) cabecerasApi.add(`${u.pathname.split('/').slice(0, 3).join('/')} → Cache-Control: ${r.headers()['cache-control'] || '(ninguno)'}`); });
  page.on('console', m => consola.push(`${m.type()}: ${m.text()}`));
  const popups = [];
  ctx.on('page', p => { if (p !== page) popups.push(p); });

  async function iniciarSesion(usuario, clave) {
    await page.goto(BASE + '/');
    await page.waitForSelector('#login-overlay.active');
    await page.fill('#login-username', usuario);
    await page.fill('#login-password', clave);
    await page.click('#login-submit');
    await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active'));
    await sleep(1500);
  }
  const resumenFase = (nombre) => {
    const r = reg.filter(x => x.fase === nombre);
    const ext = r.filter(x => x.ext);
    const porHost = {};
    for (const x of ext) porHost[normHost(x.host)] = (porHost[normHost(x.host)] || 0) + 1;
    const propios = r.filter(x => !x.ext && x.path.startsWith('/api/')).map(x => `${x.metodo} ${x.path.replace(/pac-[\w-]+/g, 'pac-…')}`);
    const unicos = [...new Set(propios)];
    log(`  [${nombre}] peticiones: ${r.length} (propias ${r.length - ext.length}, externas ${ext.length}); hosts externos: ${Object.entries(porHost).map(([h, n]) => `${h} ×${n}`).join(', ') || 'ninguno'}`);
    if (unicos.length) log(`      API propia: ${unicos.slice(0, 8).join(' · ')}${unicos.length > 8 ? ' …' : ''}`);
  };

  log('\n=== 1. Peticiones de red por actividad (solo host y ruta; sin cuerpos) ===');
  fase = 'login y carga inicial del mapa';
  await iniciarSesion('admin', process.env.ADMIN_PASSWORD);
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('maxime_cronicos_sesion_v1')).token);
  resumenFase('login y carga inicial del mapa');

  fase = 'mapa';
  await page.evaluate(() => { window.app.switchView('mapa'); window.app.resetFiltros(); });
  await sleep(3000);
  resumenFase('mapa');

  fase = 'buscar dirección';
  await page.fill('#search-input', 'Jr. Bolognesi 250');
  await page.press('#search-input', 'Enter');
  await sleep(2500);
  resumenFase('buscar dirección');
  const geoExt = reg.filter(x => x.fase === 'buscar dirección' && x.ext && !/google\.com|cartocdn|openstreetmap|arcgisonline/.test(x.host));
  log(`      geocodificador: sin red (ancashGeocoder.js usa un catálogo local); peticiones externas que no son mosaicos = ${geoExt.length}`);

  // centrar un paciente (zoom 16): qué mosaico se pide
  fase = 'centrar paciente';
  const conCoord = sembrados.filter(p => p.latitud != null);
  const objetivo = conCoord[3];
  await page.evaluate(id => window.app.centrarPaciente(id), objetivo.id);
  await sleep(3500);
  resumenFase('centrar paciente');
  const tiles = reg.filter(x => x.fase === 'centrar paciente' && x.ext).map(x => ({ x, t: tileDe(x.url) })).filter(o => o.t);
  const zmax = tiles.length ? Math.max(...tiles.map(o => o.t.z)) : null;
  const conDomicilio = tiles.filter(o => contiene(o.t, objetivo.latitud, objetivo.longitud));
  log(`      mosaicos pedidos: ${tiles.length}; zoom máximo ${zmax}; mosaicos que contienen el domicilio del paciente (ID ${String(objetivo.id).slice(-8)}): ${conDomicilio.length}`);
  if (conDomicilio.length) {
    const o = conDomicilio.reduce((a, b) => (a.t.z >= b.t.z ? a : b));
    log(`      el proveedor ${o.x.host.replace(/^[a-d0-3]\./, '*.').replace(/^mt\d\./, 'mt*.')} recibe z/x/y = ${o.t.z}/${o.t.x}/${o.t.y}: un cuadrado de ~${ladoM(objetivo.latitud, o.t.z)} m de lado que incluye el domicilio; Referer enviado: «${o.x.referer || '(ninguno)'}»`);
  }
  // acercamiento máximo (zoom 20) sobre el mismo paciente
  fase = 'zoom máximo';
  await page.evaluate(([la, lo]) => window.app.mapManager.map.setView([la, lo], 20, { animate: false }), [objetivo.latitud, objetivo.longitud]);
  await sleep(3500);
  const t20 = reg.filter(x => x.fase === 'zoom máximo' && x.ext).map(x => ({ x, t: tileDe(x.url) })).filter(o => o.t && contiene(o.t, objetivo.latitud, objetivo.longitud));
  const z20 = t20.length ? t20.reduce((a, b) => (a.t.z >= b.t.z ? a : b)) : null;
  log(`      zoom ${z20 ? z20.t.z : '?'}: mosaico que contiene el domicilio de ~${z20 ? ladoM(objetivo.latitud, z20.t.z) : '?'} m de lado → ${z20 ? z20.x.host.replace(/^[a-d0-3]\./, '*.').replace(/^mt\d\./, 'mt*.') : '(sin captura)'}`);
  resumenFase('zoom máximo');

  // los siete mapas base
  fase = 'mapas base';
  const nombres = await page.evaluate(() => Object.keys(window.app.mapManager.baseLayers));
  for (const n of nombres) { await page.evaluate(t => window.app.setBaseMapGlobal(t), n); await sleep(1200); }
  await page.evaluate(() => window.app.mapManager.home());
  await sleep(1500);
  resumenFase('mapas base');
  log(`      mapas base probados: ${nombres.length}`);

  // padrón: abrir la cuadrícula con un Excel inventado (sin cargar), cargarlo y exportar
  const fila = (doc, nombre, extra) => Object.assign({ tipo_documento: 'DNI', nro_documento: doc, apellidos_nombres: nombre, sexo: 'Femenino', fecha_nacimiento: '1960-05-10', seguro_salud: 'SIS',
    sector: 'Sector I – Centro', direccion: 'Jr. Bolognesi 250 Huarmey', establecimiento_adscripcion: H, establecimiento_control: H, cie10_hta: 'I10.X – Hipertensión esencial (primaria)',
    pas_oct: 150, pad_oct: 95, fecha_ultimo_control: '2026-10-20', proxima_cita: '2026-11-25', estado_paciente: 'Activo', consentimiento: 'No', telefono: '943111222' }, extra || {});
  const archivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'c3a3-')), 'padron_inventado.xlsx');
  fs.writeFileSync(archivo, XLSX.write(exp.construirLibro(XLSX, [fila('96700011', 'PACIENTE INVENTADO UNO'), fila('96700012', 'PACIENTE INVENTADO DOS')]), { type: 'buffer', bookType: 'xlsx' }));
  fase = 'padrón (abrir)';
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#rail-tab-excel')]);
  await fc.setFiles(archivo);
  await page.waitForSelector('#modal-padron-grid.active #padron-grid-tbody tr');
  await sleep(1200);
  resumenFase('padrón (abrir)');

  // se deja la cuadrícula abierta con filas: se usará para ver qué queda tras cerrar la sesión
  fase = 'padrón (cargar)';
  await page.click('#padron-btn-cargar');
  await sleep(3000);
  resumenFase('padrón (cargar)');

  fase = 'WhatsApp';
  const pTel = (await api('GET', '/api/cronicos', A)).json.find(p => p.telefono && p.latitud != null);
  await page.evaluate(() => { window.app.resetFiltros(); window.app.render(); });
  await page.evaluate(id => window.app.enviarWhatsApp(id), pTel.id);
  await sleep(600);
  const pideConsent = await page.evaluate(() => document.getElementById('modal-consentimiento').classList.contains('active'));
  if (pideConsent) {
    await page.evaluate(() => document.querySelector('[data-accion="registrarConsentimiento"][data-arg="Sí, firmado"]').click());
    await sleep(2500);
  }
  resumenFase('WhatsApp');
  const wa = reg.filter(x => x.fase === 'WhatsApp' && /wa\.me|whatsapp/.test(x.host));
  if (wa.length) {
    const u = new URL(wa[0].url);
    const texto = decodeURIComponent(u.searchParams.get('text') || '');
    const soloNum = u.pathname.replace(/\D/g, '');
    log(`      destino: ${u.protocol}//${u.host}/${soloNum.slice(0, 2)}${'*'.repeat(Math.max(0, soloNum.length - 2))}  (el número del paciente va en la ruta)`);
    log(`      mensaje enviado en la URL (${texto.length} caracteres): ${JSON.stringify(texto.replace(/\n/g, ' ⏎ ').slice(0, 260))}`);
    const nombreP = String(pTel.apellidos_nombres || '').split(' ')[0];
    log(`      ¿incluye nombre, DNI o diagnóstico? nombre: ${texto.includes(nombreP)} · DNI: ${texto.includes(pTel.dni)} · dirección: ${texto.includes((pTel.direccion || '#').slice(0, 6))} · diagnóstico/CIE-10: ${/I10|E11|hipert|diabet/i.test(texto)}`);
    log(`      lo recibe WhatsApp (Meta) apenas el usuario hace clic: número de teléfono del paciente + fecha de control + nombre del establecimiento`);
  } else log('      no se capturó la navegación a wa.me (la pestaña emergente no llegó a pedir la URL)');

  fase = 'tablero';
  await page.evaluate(() => window.app.switchView('dashboard'));
  await sleep(2500);
  resumenFase('tablero');

  fase = 'exportar';
  const [dx] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), page.evaluate(() => window.app.exportarPadronExcel())]);
  await sleep(500);
  resumenFase('exportar');
  log(`      la exportación es local (Blob): ${dx ? 'archivo ' + dx.suggestedFilename() : '(sin descarga)'}; peticiones propias de la fase: ${reg.filter(x => x.fase === 'exportar' && !x.ext).length}`);

  // ---------- Resumen de hosts externos ----------
  log('\n=== 2. Hosts externos contactados (toda la sesión) ===');
  const ext = reg.filter(x => x.ext);
  const hosts = {};
  for (const x of ext) {
    const h = x.host.replace(/^[a-d0-3]\./, '*.').replace(/^mt\d\./, 'mt*.');
    hosts[h] = hosts[h] || { n: 0, tipos: new Set(), fases: new Set(), refs: new Set(), ejemplo: '' };
    hosts[h].n++; hosts[h].tipos.add(x.tipo); hosts[h].fases.add(x.fase); hosts[h].refs.add(x.referer || '(ninguno)');
    if (!hosts[h].ejemplo) hosts[h].ejemplo = x.path.replace(/\d+/g, '#').slice(0, 60);
  }
  for (const [h, d] of Object.entries(hosts)) log(`  ${h.padEnd(34)} ${String(d.n).padStart(4)} peticiones · ${[...d.tipos].join('/')} · ruta tipo ${d.ejemplo} · Referer: ${[...d.refs].join(' | ')}`);
  log(`  Hosts propios: ${[...new Set(reg.filter(x => !x.ext).map(x => x.host))].join(', ')}`);
  log(`  Peticiones fallidas por host (el entorno de prueba sale por un proxy): ${JSON.stringify([...fallidas.entries()].map(([h, n]) => `${h}×${n}`))}`);
  log(`  Tipos de recurso externos: ${[...new Set(ext.map(x => x.tipo))].join(', ')} (ninguna fuente, script, hoja de estilos ni XHR/fetch externo: ${!ext.some(x => ['font', 'script', 'stylesheet', 'xhr', 'fetch'].includes(x.tipo))})`);
  // ¿alguna URL externa lleva datos de pacientes?
  const dni = new Set(), tel = new Set(), nom = new Set(), dir = new Set();
  const todos = (await api('GET', '/api/cronicos', A)).json;
  for (const p of todos) { dni.add(String(p.dni)); if (p.telefono) tel.add(String(p.telefono).replace(/\D/g, '')); (p.apellidos_nombres || '').split(/\s+/).filter(w => w.length > 4).forEach(w => nom.add(w.toLowerCase())); if (p.direccion) dir.add(encodeURIComponent(p.direccion).toLowerCase().slice(0, 12)); }
  const coincidencias = [];
  for (const x of ext) {
    const u = decodeURIComponent(x.url).toLowerCase();
    for (const d of dni) if (u.includes(d)) coincidencias.push(`${x.host}: DNI`);
    for (const t of tel) if (u.includes(t)) coincidencias.push(`${x.host}: teléfono`);
    for (const n of nom) if (u.includes(n)) coincidencias.push(`${x.host}: nombre`);
  }
  const sinWa = coincidencias.filter(c => !/wa\.me|whatsapp/.test(c));
  log(`  URLs externas (ruta + consulta) con DNI, teléfono o nombre de algún paciente, salvo wa.me: ${sinWa.length}`);
  log(`  Peticiones externas con método distinto de GET: ${ext.filter(x => x.metodo !== 'GET').length}; con cuerpo/cookies de la aplicación: no (solo GET de mosaicos/imagen y la navegación a wa.me)`);
  const coordsEnUrl = ext.filter(x => /lat|lng|lon/i.test(x.search) && !tileDe(x.url));
  log(`  URLs externas con parámetros lat/lng explícitos: ${coordsEnUrl.length}`);

  log('\n=== 3. Cache-Control de las respuestas de la API (¿se guardan en la caché HTTP del navegador?) ===');
  for (const c of [...cabecerasApi].sort()) log('  ' + c);

  log('\n=== 4. Consola del navegador ===');
  const clases = {};
  for (const l of consola) { const k = l.replace(/\d{8}/g, '########').slice(0, 110); clases[k] = (clases[k] || 0) + 1; }
  log(`  mensajes: ${consola.length}; distintos: ${Object.keys(clases).length}`);
  for (const [k, n] of Object.entries(clases)) log(`    ×${n} ${mask(k)}`);
  const conDatos = consola.filter(l => [...dni].some(d => l.includes(d)) || [...nom].some(w => l.toLowerCase().includes(w)));
  log(`  mensajes de consola que contienen DNI o nombres de pacientes: ${conDatos.length}`);

  // ---------- Almacenamiento ----------
  log('\n=== 5. Almacenamiento del navegador con la sesión del ADMIN abierta ===');
  const volcar = () => page.evaluate(async () => {
    const o = {};
    const resumir = (st) => Object.keys(st).map(k => {
      const v = st.getItem(k); let forma = '';
      try { const j = JSON.parse(v); forma = Object.keys(j).map(c => c + (typeof j[c] === 'object' && j[c] ? '{' + Object.keys(j[c]).join(',') + '}' : '')).join(', '); } catch (e) { forma = 'texto'; }
      return { clave: k, bytes: v.length, forma };
    });
    o.localStorage = resumir(localStorage);
    o.sessionStorage = resumir(sessionStorage);
    o.sessionRaw = sessionStorage.getItem('maxime_cronicos_sesion_v1');
    o.indexedDB = (indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : '(no soportado)');
    o.caches = {};
    for (const n of await caches.keys()) {
      const c = await caches.open(n); const rs = await c.keys();
      o.caches[n] = { entradas: rs.length, api: rs.filter(r => /\/api\/|\/fhir\//.test(r.url)).length, tipos: [...new Set(rs.map(r => new URL(r.url).pathname.split('.').pop()))].join(','), conCuerpoDePacientes: 0 };
      for (const r of rs) { const resp = await c.match(r); const t = resp && /json|text|javascript/.test(resp.headers.get('content-type') || '') ? await resp.clone().text() : ''; if (/"dni"|apellidos_nombres/.test(t) && !/\.js(\?|$)/.test(r.url)) o.caches[n].conCuerpoDePacientes++; }
    }
    o.cookie = document.cookie;
    o.sw = (await navigator.serviceWorker.getRegistrations()).map(r => r.scope + ' activo=' + !!r.active);
    o.windowName = window.name;
    o.historyState = JSON.stringify(history.state);
    return o;
  });
  const v1 = await volcar();
  const sesion = JSON.parse(v1.sessionRaw);
  log(`  localStorage: ${v1.localStorage.length ? JSON.stringify(v1.localStorage) : 'vacío'}`);
  log(`  sessionStorage: ${JSON.stringify(v1.sessionStorage)}`);
  log(`    contenido de maxime_cronicos_sesion_v1 (token reemplazado): ${JSON.stringify(Object.assign({}, sesion, { token: '***' }))}`);
  log(`    caducidad del token: ${Math.round((Date.parse(sesion.expires_at) - Date.now()) / 60000)} minutos desde ahora (${Math.round((Date.parse(sesion.expires_at) - Date.now()) / 3600000 * 10) / 10} h)`);
  log(`  IndexedDB: ${JSON.stringify(v1.indexedDB)}`);
  log(`  Cache Storage: ${JSON.stringify(v1.caches)}`);
  log(`  document.cookie: ${JSON.stringify(v1.cookie)}; cookies del contexto: ${JSON.stringify((await ctx.cookies()).map(c => c.name))}`);
  log(`  Service worker: ${JSON.stringify(v1.sw)}; window.name: ${JSON.stringify(v1.windowName)}; history.state: ${v1.historyState}`);
  const claves = JSON.stringify(v1).toLowerCase();
  const palabras = [...nom].filter(w => w !== 'paciente' && claves.includes(w));
  log(`  ¿Hay DNI, nombres o teléfonos de pacientes en storage/cachés? DNI: ${[...dni].filter(d => claves.includes(d)).length}; teléfonos: ${[...tel].filter(t => claves.includes(t)).length}; palabras de nombres que coinciden: ${JSON.stringify(palabras)} (coincidencias con texto de la propia sesión o de nombres de archivos, no con datos de pacientes)`);
  log(`  El token vive en sessionStorage (accesible por cualquier script del mismo origen; la CSP script-src 'self' impide ejecutar scripts inyectados); no hay cookie (no hay CSRF clásico) y no se guarda en localStorage.`);

  // en memoria, para saber qué ve JavaScript
  const mem = await page.evaluate(() => ({ pacientes: window.app.patients.length, padronFilas: window.PadronGridModal.patients.length, precitas: window.AlertsManager.precitas.length }));
  log(`  Memoria de la página: ${mem.pacientes} pacientes en window.app.patients; ${mem.padronFilas} filas en PadronGridModal.patients`);

  // ---------- Cerrar sesión ----------
  log('\n=== 6. Qué queda después de «Cerrar sesión» ===');
  // se deja abierta la cuadrícula del padrón con las filas del Excel y el formulario de registro con un paciente
  await page.evaluate(() => { window.PadronGridModal.patients = []; });
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.evaluate(() => document.getElementById('rail-tab-excel').click())]);
  const archivo2 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'c3a3-')), 'padron_inventado_2.xlsx');
  fs.writeFileSync(archivo2, XLSX.write(exp.construirLibro(XLSX, [fila('96700021', 'PACIENTE INVENTADO TRES', { telefono: '943555666', direccion: 'Jr. Bolognesi 300 Huarmey' }), fila('96700022', 'PACIENTE INVENTADO CUATRO')]), { type: 'buffer', bookType: 'xlsx' }));
  await fc2.setFiles(archivo2);
  await page.waitForSelector('#modal-padron-grid.active #padron-grid-tbody tr');
  await sleep(600);
  await page.evaluate(() => { window.RegistroClinicoModal.open(); });
  await page.evaluate(() => { const m = document.getElementById('modal-registro-clinico'); window.RegistroClinicoModal.open('10000001'); });
  await sleep(500);
  const antes = { token };
  await page.evaluate(() => document.getElementById('btn-logout').click());
  await sleep(1200);
  const tras = await page.evaluate(() => {
    const dniSemilla = /\b1000000\d\b|\b96700\d{3}\b/;
    const el = id => document.getElementById(id);
    const centro = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const visibleEnPantalla = id => { const e = el(id); if (!e) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.classList.contains('active'); };
    return {
      login: el('login-overlay').classList.contains('active'),
      session: sessionStorage.getItem('maxime_cronicos_sesion_v1'),
      pacientes: window.app.patients.length, patientMap: window.app.patientMap.size, precitas: window.AlertsManager.precitas.length,
      lista: el('patient-list').children.length, fichaDom: !!el('modal-patient-detail'), tarjeta: !!el('reference-inspector-card'),
      gridFilas: window.PadronGridModal.patients.length, gridActiva: visibleEnPantalla('modal-padron-grid'), gridDniEnDom: dniSemilla.test(el('padron-grid-tbody').textContent),
      gridNombresEnDom: /PACIENTE INVENTADO/.test(el('padron-grid-tbody').textContent),
      regActiva: visibleEnPantalla('modal-registro-clinico'), regTexto: ['reg-nombres', 'reg-dni', 'reg-direccion', 'reg-telefono'].map(i => el(i) ? el(i).value : null).filter(Boolean).length,
      regValores: [...document.querySelectorAll('#modal-registro-clinico input[type=text], #modal-registro-clinico input[type=tel]')].filter(i => i.value && /[A-Za-z]{4}|\d{8}/.test(i.value)).length,
      centroEs: centro ? (centro.id || centro.className || centro.tagName) : null,
      toasts: el('toast-container') ? el('toast-container').children.length : 0,
      kpiTotal: el('kpi-total').textContent, dashTotal: el('dash-val-total').textContent,
      marcadores: (() => { let n = 0; window.app.mapManager.layers.pacientes.eachLayer(() => n++); return n; })()
    };
  });
  const v2 = await volcar();
  const rev = await api('GET', '/api/cronicos', antes.token);
  log(`  Pantalla de acceso visible = ${tras.login}; sessionStorage de sesión = ${tras.session === null ? 'borrado' : 'PRESENTE'}; localStorage: ${v2.localStorage.length ? 'con datos' : 'vacío'}; IndexedDB: ${JSON.stringify(v2.indexedDB)}`);
  log(`  El token anterior después de salir: GET /api/cronicos → HTTP ${rev.status} (revocado en el servidor = ${rev.status === 401})`);
  log(`  Se borran de la memoria y la pantalla: pacientes=${tras.pacientes}, mapa de pacientes=${tras.patientMap}, pre-citas=${tras.precitas}, tarjetas de la lista=${tras.lista}, ficha en el DOM=${tras.fichaDom}, tarjeta de referencia=${tras.tarjeta}, marcadores en el mapa=${tras.marcadores}, KPI total=${JSON.stringify(tras.kpiTotal)}, tablero=${JSON.stringify(tras.dashTotal)}`);
  log(`  NO se borran: filas de la cuadrícula del padrón en memoria (PadronGridModal.patients) = ${tras.gridFilas}; filas con DNI/nombres de pacientes en el DOM de la cuadrícula = ${tras.gridDniEnDom || tras.gridNombresEnDom}; cuadrícula con clase «active» = ${tras.gridActiva}; formulario de registro clínico con clase active = ${tras.regActiva} y ${tras.regValores} campos de texto rellenos; elemento que recibe un clic en el centro de la pantalla = ${tras.centroEs}`);

  await page.screenshot({ path: path.join(__dirname, 'out_A3_tras_cerrar_sesion.png') });
  const intento = await page.evaluate(() => { const b = document.getElementById('login-submit').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return e ? (e.id || e.className || e.tagName) : null; });
  log(`  Elemento que recibe el clic sobre el botón «Ingresar» de la pantalla de acceso: ${intento} (la cuadrícula del padrón tiene z-index 99999 y la pantalla de acceso 3000)`);
  // Quien entre después en el mismo navegador (sin recargar), de otra red: primero cierra la cuadrícula con Esc
  await page.keyboard.press('Escape');
  await page.fill('#login-username', 'c3.otra.red');
  await page.fill('#login-password', CLAVE);
  await page.click('#login-submit');
  await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active'));
  await sleep(1500);
  const otro = await page.evaluate(async () => {
    window.app.abrirModalPadronGrid();
    await new Promise(r => setTimeout(r, 600));
    const g = document.getElementById('modal-padron-grid');
    return { abierta: g.classList.contains('active'), filas: g.querySelectorAll('#padron-grid-tbody tr').length, texto: g.querySelector('#padron-grid-tbody').textContent.replace(/\s+/g, ' ').match(/PACIENTE INVENTADO \w+/g) || [],
      usuario: document.getElementById('user-chip-name').textContent, rol: document.getElementById('user-chip-role').textContent, pacientesPropios: window.app.patients.length, archivo: document.getElementById('padron-file-info').textContent.slice(0, 90) };
  });
  log(`  Segundo usuario en el mismo navegador (${otro.usuario}, ${otro.rol}; ${otro.pacientesPropios} pacientes en su alcance): al abrir «Padrón» ve la cuadrícula del usuario anterior = ${otro.abierta && otro.filas > 0} (${otro.filas} filas: ${JSON.stringify(otro.texto)}; cabecera «${otro.archivo}»)`);
  await page.evaluate(() => document.getElementById('btn-logout').click());
  await sleep(800);

  // Cierre por inactividad con la cuadrícula abierta (reloj simulado)
  const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const p2 = await ctx2.newPage();
  p2.on('dialog', d => d.accept());
  await p2.clock.install();
  await p2.goto(BASE + '/');
  await p2.waitForSelector('#login-overlay.active');
  await p2.fill('#login-username', 'admin'); await p2.fill('#login-password', process.env.ADMIN_PASSWORD);
  await p2.click('#login-submit');
  await p2.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active'));
  await p2.waitForTimeout(1200);
  const [fc3] = await Promise.all([p2.waitForEvent('filechooser'), p2.evaluate(() => document.getElementById('rail-tab-excel').click())]);
  await fc3.setFiles(archivo2);
  await p2.waitForSelector('#modal-padron-grid.active #padron-grid-tbody tr');
  await p2.clock.runFor(31 * 60 * 1000);
  await p2.waitForTimeout(600);
  const inac = await p2.evaluate(() => {
    const centro = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const g = document.getElementById('modal-padron-grid');
    return { login: document.getElementById('login-overlay').classList.contains('active'), msg: document.getElementById('login-error').textContent.slice(0, 50), gridActiva: g.classList.contains('active'), gridFilas: g.querySelectorAll('#padron-grid-tbody tr').length,
      centro: centro ? (centro.id || centro.className || centro.tagName) : null, gridInerte: !!g.closest('[inert]'), appInerte: document.querySelector('.app-container').hasAttribute('inert') };
  });
  log(`  Cierre por inactividad con la cuadrícula del padrón abierta: pantalla de acceso = ${inac.login} («${inac.msg}»); la cuadrícula sigue con clase active = ${inac.gridActiva} y ${inac.gridFilas} filas en el DOM; elemento en el centro de la pantalla = ${inac.centro}; cuadrícula dentro de un contenedor inert = ${inac.gridInerte} (el .app-container inert = ${inac.appInerte})`);
  await ctx2.close();

  await ctx.close();
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'out_A3_salida_datos_y_almacenamiento.txt'), mask(out.join('\n')) + '\n');
})().catch(e => { console.error('ERROR', mask(e.stack.split('\n').slice(0, 5).join('\n'))); fs.writeFileSync(path.join(__dirname, 'out_A3_salida_datos_y_almacenamiento.txt'), mask(out.join('\n')) + '\nERROR ' + mask(e.message) + '\n'); process.exit(1); });
