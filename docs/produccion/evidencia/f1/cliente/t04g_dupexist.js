// Importar una fila cuyo DNI ya existe en el padron del servidor (datos simulados): ¿actualiza o duplica? ¿avisa?
const L = require('./lib');
const XLSX = require('/home/user/cronicos-huarmey/client/libs/xlsx.full.min.js');
const exp = require('/home/user/cronicos-huarmey/client/js/data/padronExportV4.js');
const fs = require('fs');
(async () => {
  const adm = await L.apiLogin(L.ADMIN);
  const lista = await (await fetch(L.BASE + '/api/cronicos', { headers: { Authorization: 'Bearer ' + adm.token } })).json();
  const ex = lista[4];
  const H = 'Hospital de Apoyo Huarmey (00001741, II-1)';
  const row = { tipo_documento: 'DNI', nro_documento: ex.dni, apellidos_nombres: 'PRUEBA REEMPLAZO SIMULADO', sexo: 'Femenino', fecha_nacimiento: '1960-05-10', seguro_salud: 'SIS', sector: 'Sector I – Centro', direccion: 'Jr. Bolognesi 123', establecimiento_adscripcion: H, establecimiento_control: H, cie10_hta: 'I10.X – Hipertensión esencial (primaria)', pas_oct: 120, pad_oct: 80, fecha_ultimo_control: '2026-10-20', proxima_cita: '2026-11-25', estado_paciente: 'Activo', consentimiento: 'Sí, firmado' };
  fs.writeFileSync(L.W + '/invented_padron5.xlsx', XLSX.write(exp.construirLibro(XLSX, [row]), { type: 'buffer', bookType: 'xlsx' }));
  const idOriginal = ex.id;
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active');
  await L.uiLogin(page, L.ADMIN); await page.waitForFunction(() => window.app.patients.length > 0); await L.sleep(500);
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#rail-tab-excel')]);
  await fc.setFiles(L.W + '/invented_padron5.xlsx');
  await page.waitForSelector('#modal-padron-grid.active #padron-grid-tbody tr');
  const out = { aviso_en_grid: await page.evaluate(() => document.getElementById('padron-status-msg').textContent.trim().slice(0, 120)), fileInfo: await page.textContent('#padron-file-info') };
  out.fileInfo = out.fileInfo.replace(/"[^"]*"/, '"hoja"').slice(0, 140);
  await page.click('#padron-btn-cargar');
  await page.waitForFunction(() => !document.getElementById('modal-padron-grid').classList.contains('active'), null, { timeout: 15000 }); await L.sleep(900);
  out.toast = await page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent.trim().slice(0, 130)).slice(-1));
  out.memoria = await page.evaluate(dni => ({ total: window.app.patients.length, conEseDni: window.app.patients.filter(p => p.dni === dni).length }), ex.dni);
  const after = await (await fetch(L.BASE + '/api/cronicos', { headers: { Authorization: 'Bearer ' + adm.token } })).json();
  out.servidor = { total: after.length, conEseDni: after.filter(p => p.dni === ex.dni).length, ids: after.filter(p => p.dni === ex.dni).map(p => p.id === idOriginal ? 'id-original' : 'id-nuevo(' + p.id.replace(/\d{8}/, '########') + ')') };
  // tras recargar la pagina
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.app.patients.length > 0); await L.sleep(500);
  out.trasRecargar = await page.evaluate(dni => ({ total: window.app.patients.length, conEseDni: window.app.patients.filter(p => p.dni === dni).length }), ex.dni);
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
