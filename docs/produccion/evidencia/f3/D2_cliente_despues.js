// Evidencia Fase 3 (correcciones del cliente, agente C) — D2: lo corregido, comprobado en Chromium contra el servidor real.
// Solo datos inventados (DNI 96…) y la semilla de 20 pacientes simulados. La clave sale del entorno; la salida la enmascara con ***.
// Uso: ADMIN_PASSWORD=<clave> BASE=http://127.0.0.1:3272 node D2_cliente_despues.js   (servidor: ../f4/srv.sh start)
//
// Qué comprueba (cada línea sale como OK o FALLA):
//  K3-03  el aviso de WhatsApp lleva la fecha de la PRÓXIMA CITA real; sin cita no hay enlace; un fallecido no recibe aviso.
//  K3-06 / K3-04  textos de la ficha: «Próximo control dentro del plazo», intervalo 30/90 de la regla y aviso «La cita queda a N días…».
//  C3-06 / T3-05  si el servidor rechaza el lote, las filas quedan en la cuadrícula y no entran a la memoria; sin geocodificador no se guarda.
//  C3-01  botones con data-accion armados a mano: ids fuera de la lista cerrada no actúan.
//  P3-05  recargarPacientes() trae a un paciente creado después del inicio de sesión sin mover la vista ni cerrar la sesión.
//  C3-05  los mosaicos del mapa se piden sin Referer.
//  HOSIX  el CSV con una fila sin documento avisa cuántas filas no se cargaron y por qué.
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const RAIZ = path.resolve(__dirname, '../../../..');
const BASE = process.env.BASE || 'http://127.0.0.1:3272';
const SUF = process.env.SALIDA_SUFIJO || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
const log = (s = '') => { out.push(s); console.log(s); };
const XLSX = require(path.join(RAIZ, 'client/libs/xlsx.full.min.js'));
const exp = require(path.join(RAIZ, 'client/js/data/padronExportV4.js'));
const H = 'Hospital de Apoyo Huarmey (00001741, II-1)';
let ok = 0; let falla = 0;
const check = (nombre, cond, detalle) => { if (cond) { ok++; log(`  OK    ${nombre}${detalle ? ' — ' + detalle : ''}`); } else { falla++; log(`  FALLA ${nombre}${detalle ? ' — ' + detalle : ''}`); } };

// ---- fechas de Lima (el navegador también corre en America/Lima) ----
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' });
const hoyLima = () => fmt.format(new Date());
const mas = n => { const [a, m, d] = hoyLima().split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n, 12)).toISOString().slice(0, 10); };
const dmy = iso => iso.split('-').reverse().join('/');

async function api(method, url, token, body) {
  const h = {};
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  for (let i = 0; i < 4; i++) {
    const r = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.status === 429) { await sleep(8000); continue; }
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* */ }
    return { status: r.status, json: j, text: t };
  }
  return { status: 429, json: null, text: '' };
}

function pac(dni, idx, extra) {
  return Object.assign({
    id: 'pac-00001741-' + dni, dni, apellidos_nombres: 'PACIENTE D2 ' + idx, historia_clinica: 'HC' + dni, sexo: 'F', fecha_nacimiento: '1960-05-10',
    telefono: '943000' + String(idx).padStart(3, '0'), direccion: 'Jr. Bolognesi 250 Huarmey', sector_sanitario: 'Sector 01 - Centro Urbano',
    establecimiento_adscripcion: H, establecimiento_control: H, latitud: -10.0478 + (idx % 10) * 0.0004, longitud: -78.1548 + Math.floor(idx / 10) * 0.0004,
    consentimiento: 'Sí, firmado', estado_paciente: 'Activo',
    observations: [{ fecha_registro: mas(-5), pa_sistolica: 150, pa_diastolica: 95, estado_control: 'No Controlado' }],
    appointments: [{ fecha_cita: mas(27), estado: 'booked' }], conditions: [{ cie10_cod: 'I10', diagnostico: 'Hipertensión Arterial' }], diagnosticos: ['I10']
  }, extra || {});
}

async function abrir(browser, usuario, clave, opciones = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, timezoneId: opciones.tz || 'America/Lima', acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  page.errores = [];
  page.on('pageerror', e => page.errores.push(e.message.split('\n')[0]));
  page.dialogos = [];
  page.on('dialog', d => { page.dialogos.push(d.message()); d.accept(); });
  await page.addInitScript(() => {
    window.__abiertos = [];
    window.open = (u) => { window.__abiertos.push(String(u)); return null; }; // WhatsApp no se abre de verdad: se anota el enlace
  });
  await page.goto(BASE + '/');
  await page.waitForSelector('#login-overlay.active');
  await page.fill('#login-username', usuario);
  await page.fill('#login-password', clave);
  await page.click('#login-submit');
  await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active'));
  await sleep(1500);
  return { ctx, page };
}

const avisos = page => page.evaluate(() => [...document.querySelectorAll('#toast-container > *')].map(t => t.textContent.trim().replace(/\s+/g, ' ')));
async function pulsarWhatsApp(page, id) {
  await page.evaluate(() => { document.getElementById('toast-container').innerHTML = ''; window.__abiertos.length = 0; window.app.resetFiltros(); window.app.visibleLimit = 5000; window.app.render(); });
  const hubo = await page.evaluate((i) => { const b = document.querySelector(`#patient-list [data-accion="enviarWhatsApp"][data-arg="${i}"]`); if (b) b.click(); return !!b; }, id);
  await sleep(400);
  return { hubo, abiertos: await page.evaluate(() => window.__abiertos.slice()), avisos: await avisos(page) };
}
const textoDelEnlace = u => { try { return decodeURIComponent((new URL(u)).searchParams.get('text') || ''); } catch (e) { return ''; } };

(async () => {
  const browser = await chromium.launch();
  const clave = process.env.ADMIN_PASSWORD;
  if (!clave) throw new Error('Defina ADMIN_PASSWORD');
  log(`D2 — correcciones del cliente (Fase 3, agente C). Hoy en Lima = ${hoyLima()}. Servidor: ${BASE}`);

  // ---- datos de prueba por la API ----
  const A = (await api('POST', '/api/auth/login', null, { username: 'admin', password: clave })).json.token;
  const lote = [
    pac('96900001', 1, { appointments: [{ fecha_cita: mas(27), estado: 'booked' }] }),
    pac('96900002', 2, { appointments: [{ fecha_cita: mas(-40), estado: 'fulfilled' }, { fecha_cita: mas(15), estado: 'booked' }, { fecha_cita: mas(45), estado: 'booked' }, { fecha_cita: mas(-3), estado: 'fulfilled' }] }),
    pac('96900003', 3, { appointments: [] }),
    pac('96900004', 4, { appointments: [{ fecha_cita: mas(-20), estado: 'fulfilled' }] }),
    pac('96900005', 5, { estado_paciente: 'Fallecido', appointments: [{ fecha_cita: mas(20), estado: 'booked' }] }),
    pac('96900006', 6, { appointments: [{ fecha_cita: mas(65), estado: 'booked' }], observations: [{ fecha_registro: mas(-5), pa_sistolica: 160, pa_diastolica: 100, estado_control: 'No Controlado' }] }),
    pac('96900007', 7, { appointments: [{ fecha_cita: mas(20), estado: 'booked' }], observations: [{ fecha_registro: mas(-5), pa_sistolica: 160, pa_diastolica: 100, estado_control: 'No Controlado' }] })
  ];
  const rl = await api('POST', '/api/padron/importar-lote', A, { patients: lote });
  log(`Alta de 7 pacientes de prueba por la API: HTTP ${rl.status}${rl.status !== 200 ? ' ' + rl.text.slice(0, 200) : ''}`);

  const { ctx, page } = await abrir(browser, 'admin', clave);
  const referers = [];
  page.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && /^https?:/.test(u)) referers.push({ url: u, host: new URL(u).host, referer: r.headers()['referer'] || null }); });
  await page.evaluate(() => { window.app.resetFiltros(); return window.app.loadInitialData(); });
  await sleep(1500);

  // =========================================================== K3-03
  log('\n=== K3-03 — aviso de WhatsApp: la fecha es la de la próxima cita real ===');
  let r = await pulsarWhatsApp(page, 'pac-00001741-96900001');
  let texto = r.abiertos.length ? textoDelEnlace(r.abiertos[0]) : '';
  check('cita real a +27 días: el aviso trae la fecha de la cita', r.hubo && r.abiertos.length === 1 && texto.includes(dmy(mas(27))), `cita ${dmy(mas(27))}; mensaje: «${texto.replace(/\n/g, ' ').slice(0, 130)}»`);
  check('la fecha del aviso NO es «hoy + 3 días»', !texto.includes(dmy(mas(3))) && !texto.includes(new Date(Date.now() + 3 * 864e5).toLocaleDateString('es-PE')), `hoy + 3 sería ${dmy(mas(3))}`);

  r = await pulsarWhatsApp(page, 'pac-00001741-96900002');
  texto = r.abiertos.length ? textoDelEnlace(r.abiertos[0]) : '';
  check('varias citas (-40, -3, +15, +45): se usa la mayor que no es pasada (+45)', r.abiertos.length === 1 && texto.includes(dmy(mas(45))), `esperada ${dmy(mas(45))}`);

  r = await pulsarWhatsApp(page, 'pac-00001741-96900003');
  check('sin ninguna cita: no se abre WhatsApp y el aviso pide generar la pre-cita', r.abiertos.length === 0 && r.avisos.some(a => /no tiene próxima cita programada: genere primero la pre-cita/i.test(a)), JSON.stringify(r.avisos));

  r = await pulsarWhatsApp(page, 'pac-00001741-96900004');
  check('solo una cita pasada: no se abre WhatsApp y se avisa', r.abiertos.length === 0 && r.avisos.some(a => /próxima cita programada/i.test(a)), JSON.stringify(r.avisos));

  r = await pulsarWhatsApp(page, 'pac-00001741-96900005');
  const fall = await page.evaluate(() => { const p = window.app.findPatient('96900005'); return { estado: p.estado_paciente, fallecido: p.fallecido }; });
  check('fallecido (estado «Fallecido»): no se abre WhatsApp y se avisa', r.abiertos.length === 0 && r.avisos.some(a => /fallecid/i.test(a)), `estado_paciente=${fall.estado}, fallecido=${fall.fallecido}; avisos ${JSON.stringify(r.avisos)}`);

  // =========================================================== K3-06 / K3-04
  log('\n=== K3-06 / K3-04 — ficha: textos e intervalo de control ===');
  const ficha = async id => page.evaluate(async (i) => { window.app.openPatientDetail(i); await new Promise(r => setTimeout(r, 400)); return document.getElementById('modal-patient-detail').textContent.replace(/\s+/g, ' '); }, id);
  let f1 = await ficha('pac-00001741-96900001');
  check('paciente en verde: «Próximo control dentro del plazo» y no «en meta terapéutica»', /Próximo control dentro del plazo/.test(f1) && !/en meta terap/i.test(f1));
  check('no controlado sin frecuencia guardada: «Cada 30 días» (regla de ReglasClinicas)', /Cada 30 días/.test(f1) && /control cada 30 días/.test(f1), (f1.match(/Periodicidad HEARTS[^A-Z]*/) || [''])[0].slice(0, 60));
  let f6 = await ficha('pac-00001741-96900006');
  check('cita a +65 días con último control hace 5: aviso «La cita queda a 70 días; el máximo para este paciente es 30»', /La cita queda a 70 días; el máximo para este paciente es 30/.test(f6), (f6.match(/La cita queda[^.]*\./) || ['(sin aviso)'])[0]);
  let f7 = await ficha('pac-00001741-96900007');
  check('cita a +20 días (dentro del intervalo): no hay aviso', !/La cita queda a/.test(f7));
  await page.evaluate(() => document.getElementById('modal-patient-detail').classList.remove('active'));

  // =========================================================== C3-01 ids cerrados
  log('\n=== C3-01 — botones con data-accion armados a mano: solo actúan los ids de la lista cerrada ===');
  const inyec = await page.evaluate(async () => {
    const tapa = document.createElement('div'); document.body.appendChild(tapa);
    const poner = (accion, arg) => { const b = document.createElement('button'); b.setAttribute('data-accion', accion); b.setAttribute('data-arg', arg); tapa.appendChild(b); return b; };
    poner('clicEn', 'btn-logout').click();
    poner('quitarElemento', 'login-overlay').click();
    poner('quitarElemento', 'map').click();
    poner('cerrarModal', 'login-overlay').click();
    await new Promise(r => setTimeout(r, 800));
    const res = { sesion: !!sessionStorage.getItem('maxime_cronicos_sesion_v1'), loginEnDom: !!document.getElementById('login-overlay'), mapaEnDom: !!document.getElementById('map'), loginVisible: document.getElementById('login-overlay').classList.contains('active') };
    window.app.openPatientDetail(window.app.patients[0].id);
    poner('cerrarModal', 'modal-patient-detail').click();
    res.fichaCerradaConIdDeLaLista = !document.getElementById('modal-patient-detail').classList.contains('active');
    tapa.remove();
    return res;
  });
  check('clicEn «btn-logout», quitarElemento «login-overlay»/«map» y cerrarModal «login-overlay» no hacen nada', inyec.sesion && inyec.loginEnDom && inyec.mapaEnDom && !inyec.loginVisible, JSON.stringify(inyec));
  check('control positivo: cerrarModal «modal-patient-detail» (id de la lista) sí cierra la ficha', inyec.fichaCerradaConIdDeLaLista);

  // =========================================================== P3-05
  log('\n=== P3-05 — recargarPacientes(): un paciente creado después del inicio de sesión ===');
  await api('POST', '/api/padron/importar-lote', A, { patients: [pac('96900008', 8)] });
  const antes = await page.evaluate(() => { const c = window.app.mapManager.map.getCenter(); return { n: window.app.patients.length, ya: !!window.app.findPatient('96900008'), lat: c.lat, lng: c.lng, z: window.app.mapManager.map.getZoom() }; });
  const rec = await page.evaluate(async () => { document.getElementById('toast-container').innerHTML = ''; const r = await window.app.recargarPacientes(); const c = window.app.mapManager.map.getCenter();
    return { r, n: window.app.patients.length, ya: !!window.app.findPatient('96900008'), lat: c.lat, lng: c.lng, z: window.app.mapManager.map.getZoom(), login: document.getElementById('login-overlay').classList.contains('active'),
      toasts: [...document.querySelectorAll('#toast-container > *')].map(t => t.textContent.trim()) }; });
  check('devuelve true, aparece el paciente nuevo y la sesión sigue abierta', rec.r === true && !antes.ya && rec.ya && !rec.login, `pacientes ${antes.n} → ${rec.n}`);
  check('la vista del mapa no se movió y no hubo avisos', antes.lat === rec.lat && antes.lng === rec.lng && antes.z === rec.z && rec.toasts.length === 0, `centro (${rec.lat.toFixed(4)}, ${rec.lng.toFixed(4)}) zoom ${rec.z}; avisos ${JSON.stringify(rec.toasts)}`);
  const sinRed = await page.evaluate(async () => { const orig = window.fetch; window.fetch = () => Promise.reject(new Error('sin red')); try { return await window.app.recargarPacientes(); } finally { window.fetch = orig; } });
  check('sin red devuelve false y deja la lista como estaba', sinRed === false && (await page.evaluate(() => window.app.patients.length)) === rec.n);

  // =========================================================== C3-06 / T3-05
  log('\n=== C3-06 / T3-05 — cuadrícula del padrón: lote rechazado y motores ausentes ===');
  const libro = filas => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'd2-')), 'padron_inventado.xlsx'); fs.writeFileSync(f, XLSX.write(exp.construirLibro(XLSX, filas), { type: 'buffer', bookType: 'xlsx' })); return f; };
  const fila = (doc, nombre, extra) => Object.assign({ tipo_documento: 'DNI', nro_documento: doc, apellidos_nombres: nombre, sexo: 'Femenino', fecha_nacimiento: '1960-05-10', seguro_salud: 'SIS', sector: 'Sector I – Centro',
    direccion: 'Jr. Bolognesi 250 Huarmey', establecimiento_adscripcion: H, establecimiento_control: H, cie10_hta: 'I10.X – Hipertensión esencial (primaria)', pas_oct: 150, pad_oct: 95,
    fecha_ultimo_control: mas(-5), proxima_cita: mas(25), estado_paciente: 'Activo', consentimiento: 'No' }, extra || {});
  const abrirGrilla = async archivo => {
    await page.evaluate(() => { window.PadronGridModal.reiniciar(); window.app.switchView('mapa'); });
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#rail-tab-excel')]);
    await fc.setFiles(archivo);
    await page.waitForSelector('#modal-padron-grid.active #padron-grid-tbody tr');
    await sleep(500);
  };
  const posts = [];
  page.on('request', q => { if (q.method() === 'POST' && /importar-lote/.test(q.url())) posts.push(q.url()); });

  // 1) el servidor rechaza el lote (nombre con < >)
  await abrirGrilla(libro([fila('96900011', 'PACIENTE D2 <IMG SRC=X>')]));
  await page.evaluate(() => { document.getElementById('toast-container').innerHTML = ''; });
  await page.click('#padron-btn-cargar');
  await sleep(2500);
  const rech = await page.evaluate(() => ({ enMemoria: !!window.app.findPatient('96900011'), abierta: document.getElementById('modal-padron-grid').classList.contains('active'),
    filas: document.querySelectorAll('#padron-grid-tbody tr').length, habilitado: !document.getElementById('padron-btn-cargar').disabled,
    estado: document.getElementById('padron-status-msg').textContent.trim(), toasts: [...document.querySelectorAll('#toast-container > *')].map(t => t.textContent.trim()) }));
  const enServidor = (await api('GET', '/api/cronicos', A)).json.some(x => x.dni === '96900011');
  check('el servidor rechazó el lote y no guardó nada', !enServidor);
  check('el paciente NO entró a la memoria de la aplicación', !rech.enMemoria);
  check('la cuadrícula sigue abierta con la fila por corregir y el botón «Cargar» disponible', rech.abierta && rech.filas === 1 && rech.habilitado, `filas ${rech.filas}`);
  check('el aviso muestra el motivo del servidor y no dice «cargados»', rech.toasts.some(t => /caracteres no permitidos/.test(t)) && !rech.toasts.some(t => /cargad|exitosa/i.test(t)), JSON.stringify(rech.toasts).slice(0, 220));
  check('el mensaje de la propia cuadrícula también lo dice', /No se guardó ningún paciente/.test(rech.estado) && /caracteres no permitidos/.test(rech.estado), rech.estado.slice(0, 140));

  // 2) corregida la fila, ahora sí guarda (control positivo)
  await page.evaluate(() => { const g = window.PadronGridModal; g.patients[0].apellidos_nombres = 'PACIENTE D2 CORREGIDO'; g.validateAndUpdate(); g.renderTableRows(); });
  await page.click('#padron-btn-cargar');
  await sleep(2500);
  const bien = await page.evaluate(() => ({ enMemoria: !!window.app.findPatient('96900011'), abierta: document.getElementById('modal-padron-grid').classList.contains('active') }));
  const enServ2 = (await api('GET', '/api/cronicos', A)).json.some(x => x.dni === '96900011');
  check('control positivo: corregida la fila, el servidor la guarda, entra a la memoria y la cuadrícula se cierra', enServ2 && bien.enMemoria && !bien.abierta);

  // 3) sin geocodificador: no se guarda nada
  await abrirGrilla(libro([fila('96900012', 'PACIENTE D2 SIN GEOCODIFICADOR')]));
  const postsAntes = posts.length;
  await page.evaluate(() => { document.getElementById('toast-container').innerHTML = ''; window.__geo = window.AncashGeocoder; window.AncashGeocoder = undefined; });
  await page.click('#padron-btn-cargar');
  await sleep(1200);
  const sinGeo = await page.evaluate(() => { const t = [...document.querySelectorAll('#toast-container > *')].map(x => x.textContent.trim()); window.AncashGeocoder = window.__geo; return { t, abierta: document.getElementById('modal-padron-grid').classList.contains('active'), enMemoria: !!window.app.findPatient('96900012') }; });
  check('sin geocodificador: mensaje «recargue la página», ninguna petición de guardado, nada en memoria', sinGeo.t.some(x => /geocodificador/i.test(x) && /recargue la página/i.test(x)) && posts.length === postsAntes && !sinGeo.enMemoria && sinGeo.abierta, JSON.stringify(sinGeo.t).slice(0, 160));
  // 4) sin motor clínico
  await page.evaluate(() => { document.getElementById('toast-container').innerHTML = ''; window.__hm = window.HeartsEngine; window.HeartsEngine = undefined; });
  await page.click('#padron-btn-cargar');
  await sleep(1200);
  const sinMotor = await page.evaluate(() => { const t = [...document.querySelectorAll('#toast-container > *')].map(x => x.textContent.trim()); window.HeartsEngine = window.__hm; return { t, enMemoria: !!window.app.findPatient('96900012') }; });
  check('sin motor clínico: mensaje «recargue la página», ninguna petición de guardado, nada en memoria', sinMotor.t.some(x => /motor clínico/i.test(x) && /recargue la página/i.test(x)) && posts.length === postsAntes && !sinMotor.enMemoria, JSON.stringify(sinMotor.t).slice(0, 160));
  await page.evaluate(() => window.PadronGridModal.reiniciar());

  // =========================================================== HOSIX
  log('\n=== HOSIX — CSV con una fila sin documento válido ===');
  const csv = ['DNI,NUM_HC,PACIENTE,TELEFONO,DIRECCION,CIE10_COD,PA_SISTOLICA,PA_DIASTOLICA,FEC_PROXIMA_CITA,ESTADO_CONTROL,DISTRITO',
    '96600001,HC1,PACIENTE HOSIX UNO,943000111,Jr. Bolognesi 250,I10,150,95,2026-12-01,No Controlado,Huarmey',
    ',HC2,PACIENTE HOSIX SIN DOCUMENTO,943000112,Jr. Bolognesi 250,I10,130,80,2026-12-01,Controlado,Huarmey'].join('\n');
  const rutaCsv = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'd2csv-')), 'hosix_inventado.csv');
  fs.writeFileSync(rutaCsv, csv);
  await page.evaluate(() => { document.getElementById('toast-container').innerHTML = ''; window.app.switchView('mapa'); });
  await page.setInputFiles('#hosix-file-input', rutaCsv);
  await sleep(1500);
  const hs = await page.evaluate(() => ({ t: [...document.querySelectorAll('#toast-container > *')].map(x => x.textContent.trim()), cargado: !!window.app.findPatient('96600001') }));
  const dice = hs.t.find(x => /no se cargaron|no se cargó/i.test(x));
  log(`  avisos: ${JSON.stringify(hs.t)}`);
  check('la fila con documento entra y el aviso dice cuántas filas no se cargaron y por qué', hs.cargado && !!dice && /1 fila no se cargó/.test(dice) && /documento/i.test(dice), dice ? dice.slice(0, 170) : '(el parser actual no entrega «observados»: sin aviso)');

  // =========================================================== C3-05
  log('\n=== C3-05 — mosaicos del mapa sin Referer ===');
  await page.evaluate(() => { window.app.switchView('mapa'); window.app.mapManager.map.setView([-10.0478, -78.1548], 16); });
  await sleep(2500);
  const hosts = [...new Set(referers.map(x => x.host.replace(/^[a-d0-3]\./, '*.').replace(/^mt\d\./, 'mt*.')))];
  const conReferer = referers.filter(x => x.referer);
  const cabecera = await page.evaluate(async () => (await fetch('/health')).headers.get('referrer-policy'));
  check('se pidieron mosaicos a terceros y el Referer solo lleva el ORIGEN (sin ruta ni datos de pacientes)',
    referers.length > 0 && referers.every(x => !x.referer || /^https?:\/\/[^/]+\/?$/.test(x.referer)),
    `${referers.length} peticiones a ${hosts.join(', ')}; Referer distintos: ${[...new Set(referers.map(x => x.referer || '(ninguno)'))].join(', ')}; Referrer-Policy: ${cabecera}`);

  const errores = page.errores;
  check('sin excepciones de página durante la sesión', errores.length === 0, JSON.stringify(errores));
  await ctx.close();
  await browser.close();
  log(`\nResultado D2: ${ok} correctas, ${falla} con falla`);
  fs.writeFileSync(path.join(__dirname, `out_D2_cliente_despues${SUF}.txt`), out.join('\n').replace(new RegExp(clave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '***') + '\n');
  process.exit(falla ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack.split('\n').slice(0, 4).join('\n')); try { fs.writeFileSync(path.join(__dirname, `out_D2_cliente_despues${SUF}.txt`), out.join('\n') + '\nERROR ' + e.message + '\n'); } catch (_) { /* */ } process.exit(1); });
