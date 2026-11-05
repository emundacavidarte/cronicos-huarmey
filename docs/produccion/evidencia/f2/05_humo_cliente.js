// Evidencia Fase 2 — humo del cliente REAL contra el servidor corregido (Chromium de Playwright). Datos 100 % inventados.
// Verifica que las correcciones del servidor no rompen la interfaz: login, carga del padrón, importación por la
// cuadrícula Excel, guardado desde Registro Clínico, sin violaciones de la CSP nueva; y que el diagnóstico con HTML
// (C-01) ya no se ejecuta en la ficha del paciente.
// Uso: ADMIN_PASSWORD=<clave> BASE=http://127.0.0.1:3244 node 05_humo_cliente.js   (servidor con srv.sh, semilla de 20)
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const RAIZ = path.resolve(__dirname, '../../../..');
const BASE = process.env.BASE || 'http://127.0.0.1:3244';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Excel v4 inventado (exportador del propio repositorio), fuera del repositorio
const XLSX = require(path.join(RAIZ, 'client/libs/xlsx.full.min.js'));
const exp = require(path.join(RAIZ, 'client/js/data/padronExportV4.js'));
const H = 'Hospital de Apoyo Huarmey (00001741, II-1)';
const fila = (dni, nombre) => ({
  tipo_documento: 'DNI', nro_documento: dni, apellidos_nombres: nombre, sexo: 'Femenino', fecha_nacimiento: '1960-05-10',
  seguro_salud: 'SIS', sector: 'Sector I – Centro', direccion: 'Jr. Prueba 123', establecimiento_adscripcion: H, establecimiento_control: H,
  cie10_hta: 'I10.X – Hipertensión esencial (primaria)', pas_oct: 150, pad_oct: 95, fecha_ultimo_control: '2026-10-20', proxima_cita: '2026-11-25',
  estado_paciente: 'Activo', consentimiento: 'Sí, firmado'
});
const xlsxPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'f2-humo-')), 'padron_inventado_f2.xlsx');
fs.writeFileSync(xlsxPath, XLSX.write(exp.construirLibro(XLSX, [fila('96000001', 'PRUEBA HUMO UNO'), fila('96000002', 'PRUEBA HUMO DOS'), fila('96000003', 'PRUEBA HUMO TRES')]), { type: 'buffer', bookType: 'xlsx' }));

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 800 } })).newPage();
  page.setDefaultTimeout(15000);
  const csp = []; const errores = []; const api = [];
  page.on('console', m => { const t = m.text(); if (/Content Security Policy/i.test(t)) csp.push(t.slice(0, 200)); else if (m.type() === 'error' && !/mt\d\.google|cartocdn|arcgisonline|openstreetmap|ERR_TUNNEL|ERR_CONNECTION|Failed to load resource/.test(t)) errores.push(t.slice(0, 200)); });
  page.on('pageerror', e => errores.push('pageerror: ' + String(e.message).slice(0, 200)));
  page.on('response', r => { if (r.url().includes('/api/') && r.request().method() !== 'GET') api.push(`${r.request().method()} ${new URL(r.url()).pathname} → ${r.status()}`); });
  page.on('dialog', d => d.accept());

  await page.goto(BASE + '/');
  await page.waitForSelector('#login-overlay.active');
  await page.fill('#login-username', 'admin');
  await page.fill('#login-password', process.env.ADMIN_PASSWORD);
  await page.click('#login-submit');
  await page.waitForFunction(() => window.app && window.app.patients.length >= 20, null, { timeout: 20000 });
  await sleep(800);
  console.log('1) login ADMIN y padrón cargado:', await page.evaluate(() => window.app.patients.length), 'pacientes');

  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#rail-tab-excel')]);
  await fc.setFiles(xlsxPath);
  await page.waitForSelector('#modal-padron-grid.active #padron-grid-tbody tr');
  await page.click('#padron-btn-cargar');
  await page.waitForFunction(() => !document.getElementById('modal-padron-grid').classList.contains('active'), null, { timeout: 20000 });
  await sleep(1000);
  const avisos = await page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent.trim().slice(0, 90)));
  const token = await page.evaluate(() => window.app.session.getToken());
  const lista = await (await fetch(BASE + '/api/cronicos', { headers: { Authorization: 'Bearer ' + token } })).json();
  const importado = lista.find(p => p.dni === '96000001');
  console.log('2) importación por la cuadrícula Excel:', lista.length, 'pacientes en el servidor | avisos:', JSON.stringify(avisos),
    '| ultima_modificacion_por:', importado && importado.ultima_modificacion_por, '| diagnósticos:', JSON.stringify(importado && importado.diagnosticos));

  await page.evaluate(() => window.RegistroClinicoModal.open('96000001'));
  await sleep(1200);
  // Precarga por DNI (requisito de Edward): el formulario debe encontrar al paciente ya guardado
  const precarga = await page.evaluate(() => {
    const a = document.querySelector('.reg-dni-status-alert');
    return (a ? a.textContent.replace(/\s+/g, ' ').trim().slice(0, 70) : '(sin aviso)') + ' | nombre: ' + document.getElementById('reg-apellidos-nombres').value;
  });
  console.log('3) Registro Clínico, precarga por DNI 96000001:', precarga);
  // Si el paciente aún no tiene consentimiento registrado, el formulario lo pide antes de guardar
  if (await page.isVisible('#reg-consentimiento')) await page.selectOption('#reg-consentimiento', 'No');
  // El estado se toma del evento de respuesta (leer el cuerpo con resp.text() se bloquea mientras la alerta de éxito está abierta)
  const antes = api.length;
  await page.click('#reg-btn-guardar');
  for (let i = 0; i < 30 && !api.slice(antes).some(a => a.includes('importar-lote')); i++) await sleep(300);
  console.log('   Registro Clínico → Guardar:', api.slice(antes).find(a => a.includes('importar-lote')) || 'sin respuesta');
  await sleep(800);

  // C-01: diagnóstico con HTML puesto directamente en memoria (el servidor ya no lo acepta), ficha y tooltip
  await page.evaluate(() => {
    const p = window.app.patients.find(x => x.dni === '10000004');
    p.conditions = [{ cie10_cod: '<img src=x onerror="window.__xss_cod=1">', diagnostico: '<img src=x onerror="window.__xss_txt=1">' }];
    p.diagnosticos = ['<img src=x onerror="window.__xss_dx=1">'];
    window.app.setPatients(window.app.patients);
  });
  await sleep(800);
  await page.evaluate(() => { const p = window.app.patients.find(x => x.dni === '10000004'); window.app.openPatientDetail(p.id); });
  await sleep(800);
  const ficha = await page.evaluate(() => [...document.querySelectorAll('#modal-patient-detail .badge-diag')].map(b => b.textContent).join(' | '));
  const xss = await page.evaluate(() => Object.keys(window).filter(k => k.startsWith('__xss')));
  console.log('4) C-01 ficha, texto de las etiquetas:', ficha.slice(0, 160));
  // El tooltip del mapa se arma al crear el pin y no se rehace con el dato inyectado en memoria: su corrección
  // (mapManager.js, línea del «Diag:») queda verificada solo por lectura.
  console.log('   C-01 banderas __xss ejecutadas:', xss.length ? xss.join(',') : 'ninguna');
  console.log('5) escrituras a la API:', JSON.stringify(api));
  console.log('6) violaciones de la CSP:', csp.length ? JSON.stringify(csp) : 'ninguna', '| errores de página:', errores.length ? JSON.stringify(errores) : 'ninguno');
  await browser.close();
})().catch(e => { console.error('ERROR', e); process.exit(1); });
