const L = require('./lib');
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active');
  await L.uiLogin(page, L.ADMIN);
  await page.waitForFunction(() => window.app.patients.length > 0); await L.sleep(500);
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#rail-tab-excel')]);
  await fc.setFiles(L.W + '/invented_padron3.xlsx');
  await page.waitForSelector('#modal-padron-grid.active #padron-grid-tbody tr');
  const out = { score: await page.textContent('#padron-score-badge') };
  await page.click('#padron-btn-cargar');
  await page.waitForFunction(() => !document.getElementById('modal-padron-grid').classList.contains('active'), null, { timeout: 15000 });
  await L.sleep(700);
  out.toasts = await page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent.trim().slice(0, 120)));
  out.pacientes = await page.evaluate(() => window.app.patients.filter(p => /^700000(2)/.test(p.dni)).map(p => ({ dni: p.dni, nac: p.fecha_nacimiento, edad: p.edad, lat: p.latitud })));
  out.pinsPorPaciente = await page.evaluate(() => document.querySelectorAll('.pin-patient-container').length + ' pines / ' + window.app.patients.length + ' pacientes');
  // ficha mostrada
  await page.evaluate(() => { const p = window.app.patients.find(x => x.dni === '70000021'); window.app.openPatientDetail(p.id); });
  await L.sleep(500);
  out.fichaEdad = await page.evaluate(() => { const m = document.getElementById('modal-patient-detail'); const t = m ? m.innerText : ''; const r = /(\d+)\s*años/.exec(t); return r ? r[0] : t.slice(0, 80); });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
