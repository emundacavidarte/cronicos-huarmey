// Evidencia Fase 3 — el Registro Clínico real en Chromium: qué «estado de control» y qué próxima cita guarda, y qué fecha
// le dice el aviso de WhatsApp al paciente. Servidor real, datos inventados (DNI 96…).
// Uso: ADMIN_PASSWORD=<clave> BASE=http://127.0.0.1:3263 node C3_registro_clinico_navegador.js
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3263';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = x => JSON.stringify(x);
const log = (...a) => console.log(...a);

async function api(method, url, token, body) {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, json: j };
}

async function sesion(browser, opciones = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, ...opciones });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  page.dialogos = [];
  page.on('dialog', d => { page.dialogos.push(d.message()); d.accept(); });
  await page.goto(BASE + '/');
  await page.waitForSelector('#login-overlay.active');
  await page.fill('#login-username', 'admin');
  await page.fill('#login-password', process.env.ADMIN_PASSWORD);
  await page.click('#login-submit');
  await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active'));
  await sleep(1200);
  return { ctx, page };
}

// Llena el formulario real y guarda. `v` = valores por id corto.
async function registrar(page, doc, v) {
  await page.click('#rail-btn-nuevo');
  await page.waitForSelector('#reg-input-dni', { state: 'visible' });
  const proximaPorDefecto = await page.inputValue('#reg-proxima-cita');
  await page.fill('#reg-input-dni', doc);
  await page.fill('#reg-apellidos-nombres', 'PACIENTE INVENTADO ' + doc);
  await page.fill('#reg-fecha-nacimiento', '1960-05-10');
  await page.fill('#reg-direccion', 'Jr. Bolognesi 250 Huarmey');
  await page.selectOption('#reg-consentimiento', v.consentimiento || 'No');
  if (v.telefono) await page.fill('#reg-telefono', v.telefono);
  if (v.dm) await page.fill('#reg-cie10-dm', v.dm);
  if (v.hta) await page.fill('#reg-cie10-hta', v.hta);
  if (v.pas) await page.fill('#reg-pas-hoy', String(v.pas));
  if (v.pad) await page.fill('#reg-pad-hoy', String(v.pad));
  if (v.hba1c) await page.fill('#reg-hba1c', String(v.hba1c));
  await sleep(400);
  const vivo = {
    paEnMeta: (await page.textContent('#live-pa-meta-badge')).trim(), hba1cEnMeta: (await page.textContent('#live-hba1c-meta')).trim(),
    controladoEstable: (await page.textContent('#live-controlado-estable')).trim(), metaPresion: (await page.textContent('#live-meta-presion')).trim()
  };
  const proximaAntes = await page.inputValue('#reg-proxima-cita');
  page.dialogos.length = 0;
  await page.click('#reg-btn-guardar');
  await page.waitForFunction(() => !document.getElementById('reg-btn-guardar') || !document.getElementById('reg-btn-guardar').disabled, null, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  return { proximaPorDefecto, proximaAntes, vivo, dialogos: [...page.dialogos] };
}

(async () => {
  const browser = await chromium.launch();
  const T = (await api('POST', '/api/auth/login', null, { username: 'admin', password: process.env.ADMIN_PASSWORD })).json.token;
  const guardado = async doc => (await api('GET', '/api/cronicos', T)).json.find(p => p.dni === doc);
  const { page } = await sesion(browser);
  const hoyLima = await page.evaluate(() => window.FechaLima.hoy());
  const mas30 = await page.evaluate(() => window.FechaLima.hoy(30));
  log(`hoy (Lima) = ${hoyLima}; hoy+30 = ${mas30}`);

  // Caso 1: diabético, SOLO HbA1c 11 %, sin presión arterial
  let r = await registrar(page, '96000021', { dm: 'E11.9 – Diabetes mellitus tipo 2', hba1c: 11 });
  let g = await guardado('96000021');
  log('\n[Caso 1] DM2 con HbA1c 11 % y SIN presión arterial');
  log('  pantalla (en vivo):', J(r.vivo));
  log('  diálogos:', J(r.dialogos));
  log('  guardado  → observations[0].estado_control =', g && g.observations && g.observations[0] && g.observations[0].estado_control, '· estado_control =', g && g.estado_control, '· frecuencia_hearts =', g && g.frecuencia_hearts);
  const geoProps = dni => api('GET', '/api/patients/geo', T).then(r => (r.json.features.map(f => f.properties).find(x => x.dni === dni)) || null);
  const g1 = await geoProps('96000021');
  log('  /api/patients/geo → frecuencia_hearts =', g1 && g1.frecuencia_hearts, '· estado_control =', g1 && g1.estado_control, '(guía §2: no controlado = 30 días)');
  log('  próxima cita que propone el formulario =', r.proximaPorDefecto, '(hoy+30 =', mas30 + ')', '· guardada en appointments[0] =', g && g.appointments && g.appointments[0] && g.appointments[0].fecha_cita);

  // Caso 2: diabético e hipertenso, PA 135/85 y HbA1c 6,5 %
  r = await registrar(page, '96000022', { dm: 'E11.9 – Diabetes mellitus tipo 2', hta: 'I10 – Hipertensión esencial', pas: 135, pad: 85, hba1c: 6.5 });
  g = await guardado('96000022');
  log('\n[Caso 2] DM2 + HTA con PA 135/85 y HbA1c 6,5 %');
  log('  pantalla (en vivo):', J(r.vivo));
  log('  guardado  → observations[0].estado_control =', g && g.observations && g.observations[0] && g.observations[0].estado_control);

  // Caso 3: controlado de verdad (PA 120/70, HbA1c 6,0): ¿cuándo propone el formulario la próxima cita?
  r = await registrar(page, '96000023', { dm: 'E11.9 – Diabetes mellitus tipo 2', hta: 'I10 – Hipertensión esencial', pas: 120, pad: 70, hba1c: 6.0, consentimiento: 'Sí, firmado', telefono: '987654321' });
  g = await guardado('96000023');
  log('\n[Caso 3] DM2 + HTA controlado (120/70, HbA1c 6,0) y con consentimiento de WhatsApp');
  log('  pantalla (en vivo):', J(r.vivo));
  log('  guardado  → estado_control =', g && g.observations && g.observations[0] && g.observations[0].estado_control, '· próxima cita guardada =', g && g.appointments && g.appointments[0] && g.appointments[0].fecha_cita, '(propuesta por defecto =', r.proximaPorDefecto + ')');
  log('  días entre hoy y la próxima cita propuesta =', Math.round((new Date(r.proximaAntes) - new Date(hoyLima)) / 86400000), '(guía §2: controlado → 90 días)');

  // WhatsApp: ¿qué fecha le dice al paciente?
  const enlace = await page.evaluate(() => {
    let capturado = null; const abrir = window.open; window.open = u => { capturado = u; return null; };
    window.app.enviarWhatsApp('96000023'); window.open = abrir; return capturado;
  });
  if (enlace) {
    const texto = decodeURIComponent(enlace.split('text=')[1]);
    const fecha = (texto.match(/fecha \*([^*]+)\*/) || [])[1];
    log('\n[WhatsApp] aviso para el paciente 96000023 → fecha que dice el mensaje =', fecha, '· su próxima cita real =', g.appointments[0].fecha_cita, '· hoy+3 (Lima) =', await page.evaluate(() => window.FechaLima.hoy(3)));
  } else log('\n[WhatsApp] no se generó enlace (diálogos: ' + J(page.dialogos) + ')');

  await browser.close();
})().catch(e => { console.error('ERROR', e); process.exit(1); });
