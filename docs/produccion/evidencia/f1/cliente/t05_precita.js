// Prueba 5: pre-cita con servidor arriba y con servidor detenido (el servidor propio se controla por PID, srv.sh)
const L = require('./lib');
const { execSync } = require('child_process');
const srv = a => execSync(L.W + '/srv.sh ' + a, { encoding: 'utf8' }).trim();
(async () => {
  const browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const bag = {}; L.instrument(page, bag);
  const out = {};
  await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active');
  await L.uiLogin(page, L.ADMIN);
  await page.waitForFunction(() => window.app.patients.length > 0); await L.sleep(600);
  const pats = await page.evaluate(() => window.app.patients.slice(0, 4).map(p => ({ id: p.id, dni: p.dni })));
  const adm = await L.apiLogin(L.ADMIN);
  const evs = async id => (await (await fetch(L.BASE + '/api/patients/' + id + '/eventos', { headers: { Authorization: 'Bearer ' + adm.token } })).json());
  const toasts = () => page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map(t => ({ cls: t.className, txt: t.textContent.trim().slice(0, 160) })));
  async function precita(p) {
    await page.evaluate(() => { document.getElementById('toast-container').innerHTML = ''; });
    await page.evaluate(id => window.app.openPatientDetail(id), p.id); await L.sleep(400);
    await page.click('#modal-patient-detail button:has-text("Pre-cita HOSIX")');
    await L.sleep(300);
    const reqs0 = bag.requests.length;
    await page.click('#modal-precita .btn-precita');
    await L.sleep(1800);
    return { toasts: await toasts(), req: bag.requests.slice(reqs0).filter(r => /pre-cita/.test(r.url)).map(r => r.method), failed: bag.failed.filter(f => /pre-cita/.test(f.url)).map(f => f.err), resp: bag.responses.filter(r => /pre-cita/.test(r.url)).map(r => r.status) };
  }
  // A) servidor arriba
  out.A_servidorArriba = await precita(pats[0]);
  const e0 = await evs(pats[0].id);
  out.A_eventosServidor = JSON.stringify(e0).slice(0, 300);
  out.A_precitasEnSesion = await page.evaluate(() => window.AlertsManager.precitas.length);
  // B) servidor detenido
  out.B_stop = srv('stop');
  out.B_servidorDetenido = await precita(pats[1]);
  out.B_precitasEnSesion = await page.evaluate(() => window.AlertsManager.precitas.length);
  out.B_toastClass = out.B_servidorDetenido.toasts.map(t => t.cls);
  // CSV de pre-citas (incluye la que no llego al servidor?)
  await page.click('#rail-tab-padron').catch(() => {}); await L.sleep(400);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.evaluate(() => document.getElementById('btn-export-precitas').click())]);
  if (dl) { const f = L.W + '/precitas.csv'; await dl.saveAs(f); const txt = L.fs.readFileSync(f, 'utf8'); out.B_csvLineas = txt.split('\n').length - 1; out.B_csvEstados = txt.split('\n').slice(1).map(l => l.split(',').pop()); }
  else out.B_csvDownload = 'sin descarga';
  // C) servidor detenido: que hace la app con otras acciones? recargar datos
  out.C_servidorDetenido_recargar = null;
  await page.screenshot({ path: L.W + '/shot_05_precita_offline.png' });
  // D) reiniciar y comprobar que la pre-cita B no existe en el servidor
  out.D_start = srv('start');
  const adm2 = await L.apiLogin(L.ADMIN);
  const e1 = await (await fetch(L.BASE + '/api/patients/' + pats[1].id + '/eventos', { headers: { Authorization: 'Bearer ' + adm2.token } })).json();
  out.D_eventosPacienteB = JSON.stringify(e1).slice(0, 300);
  const e2 = await (await fetch(L.BASE + '/api/patients/' + pats[0].id + '/eventos', { headers: { Authorization: 'Bearer ' + adm2.token } })).json();
  out.D_eventosPacienteA = JSON.stringify(e2).slice(0, 300);
  // E) con servidor arriba otra vez: la sesion sigue valida? (token HMAC con mismo secreto)
  out.E_sesionSigueValida = await page.evaluate(async () => { const r = await window.app.session.authFetch('/api/auth/me'); return r.status; });
  // F) paciente inexistente: la API acepta pre-cita para paciente inexistente?
  const r = await fetch(L.BASE + '/api/appointments/pre-cita', { method: 'POST', headers: { Authorization: 'Bearer ' + adm2.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ patient_id: 'no-existe-xyz', fecha_sugerida: '2026-11-20' }) });
  out.F_precitaPacienteInexistente = r.status + ' ' + (await r.text()).slice(0, 120);
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
