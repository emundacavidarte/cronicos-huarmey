// Evidencia Fase 3 — ayudas de navegador compartidas por B2 y B3 (Chromium + Registro Clínico real). Sin claves ni tokens en la salida.
'use strict';
const C = require('./B0_comun');
const { resumen, sleep } = C;

async function abrir(browser, usuario, clave) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  page.dialogos = [];
  page.on('dialog', d => { page.dialogos.push(d.message()); d.accept().catch(() => { }); });
  page.peticiones = [];
  page.on('request', r => { if (r.url().includes('/api/')) page.peticiones.push(r.method() + ' ' + new URL(r.url()).pathname); });
  page.errores = [];
  page.on('pageerror', e => page.errores.push(String(e.message).slice(0, 120)));
  await page.goto(C.BASE + '/');
  await page.waitForSelector('#login-overlay.active');
  await page.fill('#login-username', usuario);
  await page.fill('#login-password', clave);
  await page.click('#login-submit');
  await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active'));
  await sleep(1300);
  return { ctx, page };
}

const leer = page => page.evaluate(() => {
  const g = id => { const e = document.getElementById(id); return e ? e.value : null; };
  const alerta = document.getElementById('reg-dni-status-alert');
  const cons = document.getElementById('reg-field-consentimiento');
  return {
    alerta: alerta && alerta.style.display !== 'none' ? alerta.textContent.replace(/\s+/g, ' ').trim() : '',
    badge: (document.getElementById('reg-patient-badge') || {}).textContent,
    tipo: g('reg-tipo-documento'), hc: g('reg-historia-clinica'), nombres: g('reg-apellidos-nombres'), sexo: g('reg-sexo'), nac: g('reg-fecha-nacimiento'),
    seguro: g('reg-seguro-salud'), tel: g('reg-telefono'), sector: g('reg-sector'), dir: g('reg-direccion'), ads: g('reg-eess-adscripcion'), ctrl: g('reg-eess-control'),
    hta: g('reg-cie10-hta'), dm: g('reg-cie10-dm'), dis: g('reg-cie10-dislipidemia'), erc: g('reg-cie10-erc'), dxc: g('reg-dx-confirmado'), ecv: g('reg-enfermedad-cv'),
    thta: g('reg-tratamiento-hta'), tdm: g('reg-tratamiento-dm'), estatina: g('reg-estatina'), aas: g('reg-aspirina'), meses: g('reg-meses-medicacion'),
    fechaAt: g('reg-fecha-atencion'), pas: g('reg-pas-hoy'), pad: g('reg-pad-hoy'), prox: g('reg-proxima-cita'), estadoP: g('reg-estado-paciente'),
    consent: g('reg-consentimiento'), consentVisible: cons ? getComputedStyle(cons).display !== 'none' : null,
    hba1c: g('reg-hba1c'), glucosa: g('reg-glucosa'), peso: g('reg-peso'), talla: g('reg-talla'), creat: g('reg-creatinina'), ldl: g('reg-colesterol-ldl'),
    tfge: (document.getElementById('live-tfge') || {}).textContent, estadioErc: (document.getElementById('live-estadio-erc') || {}).textContent
  };
});

/** Abre el modal, escribe el documento y busca (DNI: automático; CE o pasaporte: Enter). */
async function buscar(page, doc, usarEnter) {
  await page.evaluate(() => window.RegistroClinicoModal.open());
  await sleep(250);
  const antes = page.peticiones.length;
  await page.fill('#reg-input-dni', doc);
  if (usarEnter) await page.press('#reg-input-dni', 'Enter');
  await sleep(450);
  const campos = await leer(page);
  campos.api = page.peticiones.length - antes;
  return campos;
}

/** Completa lo mínimo de un paciente NUEVO (nombre, nacimiento, dirección, consentimiento) y los dos valores de presión. */
async function llenarNuevo(page, nombres, consent) {
  await page.fill('#reg-apellidos-nombres', nombres || 'PACIENTE INVENTADO PRUEBA UI');
  await page.fill('#reg-fecha-nacimiento', '1961-02-02');
  await page.fill('#reg-direccion', 'Jr. Prueba 300 Huarmey');
  await responderConsentimiento(page, consent);
  await page.fill('#reg-pas-hoy', '128');
  await page.fill('#reg-pad-hoy', '82');
}

/** Responde la única pregunta obligatoria que el formulario no precarga (consentimiento) si se pregunta. */
async function responderConsentimiento(page, consent) {
  if (await page.$eval('#reg-field-consentimiento', e => getComputedStyle(e).display !== 'none')) await page.selectOption('#reg-consentimiento', consent || 'No');
}

async function guardar(page) {
  const n0 = page.dialogos.length;
  await page.click('#reg-btn-guardar');
  for (let i = 0; i < 50 && page.dialogos.length === n0; i++) await sleep(150);
  await sleep(300);
  return page.dialogos.slice(n0).join(' | ');
}

module.exports = { abrir, leer, buscar, llenarNuevo, responderConsentimiento, guardar };
