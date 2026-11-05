// Prueba 8: roles. UI (visibilidad), API directa (403), y datos residuales entre usuarios en la misma pestana
const L = require('./lib');
const U = {
  admin: L.ADMIN, coord156: L.COORD, dir156: L.DIRE,
  coord157: { username: 'coord157', password: process.env.CLAVE_PRUEBA }, dir157: { username: 'direct157', password: process.env.CLAVE_PRUEBA },
  apos: { username: 'coordapos', password: process.env.CLAVE_PRUEBA }
};
(async () => {
  const browser = await L.launch();
  const out = { ui: {}, api: {} };
  const probe = page => page.evaluate(() => {
    const vis = id => { const e = document.getElementById(id); if (!e) return 'no existe'; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return (cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0) ? 'visible' : 'oculto'; };
    return {
      chip: (document.getElementById('user-chip-role') || {}).textContent,
      buscador: vis('search-input'), railPadron: vis('rail-tab-padron'), railExcel: vis('rail-tab-excel'), railNuevo: vis('rail-btn-nuevo'), btnUsuarios: vis('btn-usuarios'), panelPadron: vis('hearts-panel'), handlePadron: vis('right-drawer-handle'), exportar: vis('btn-export-padron'), kpiTotal: vis('card-kpi-total'),
      kpis: ['kpi-total', 'kpi-green', 'kpi-yellow', 'kpi-red', 'kpi-purple'].map(i => document.getElementById(i).textContent).join('/'),
      cards: document.querySelectorAll('#patient-list .patient-card').length, pins: document.querySelectorAll('.pin-patient-container').length,
      dash: { total: document.getElementById('dash-val-total').textContent, ipressRows: document.querySelectorAll('#dash-ipress-tbody tr').length, indRows: document.querySelectorAll('#ind-convenio-tbody tr').length, estRows: document.querySelectorAll('#ind-est-tbody tr').length },
      toasts: [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent.trim().slice(0, 90)),
      estabsEnMapa: document.querySelectorAll('.leaflet-marker-icon').length
    };
  });
  async function sesion(name, doLogout) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
    const page = await ctx.newPage(); const bag = {}; L.instrument(page, bag);
    await page.goto(L.BASE + '/'); await page.waitForSelector('#login-overlay.active');
    await L.uiLogin(page, U[name]);
    await page.waitForFunction(() => !document.getElementById('login-overlay').classList.contains('active'), null, { timeout: 8000 });
    await L.sleep(1500);
    return { ctx, page, bag };
  }
  for (const name of ['admin', 'coord156', 'dir156', 'coord157', 'dir157', 'apos']) {
    const { ctx, page, bag } = await sesion(name);
    out.ui[name] = await probe(page);
    out.ui[name].apiCalls = [...new Set(bag.requests.filter(r => /\/api\//.test(r.url)).map(r => r.method + ' ' + r.url.replace(L.BASE, '').split('?')[0]))];
    out.ui[name].status403 = bag.responses.filter(r => r.status === 403).map(r => r.url.replace(L.BASE, ''));
    if (name === 'dir156') {
      await page.screenshot({ path: L.W + '/shot_08_director.png' });
      await page.click('#rail-tab-dashboard'); await L.sleep(1500);
      out.ui[name].dashTrasAbrir = await page.evaluate(() => ({ total: document.getElementById('dash-val-total').textContent, control: document.getElementById('dash-val-control').textContent, ipress: document.querySelectorAll('#dash-ipress-tbody tr').length, ind: document.querySelectorAll('#ind-convenio-tbody tr').length, est: document.querySelectorAll('#ind-est-tbody tr').length, estText: (document.getElementById('ind-est-tbody').innerText || '').slice(0, 160) }));
      await page.screenshot({ path: L.W + '/shot_08_director_dash.png' });
      // atajos: abrir ficha por consola/DOM
      out.ui[name].puedeAbrirPanelConTecla = await page.evaluate(() => { window.app.toggleHeartsPanel(true); const p = document.getElementById('hearts-panel'); const cs = getComputedStyle(p); return { display: cs.display, collapsed: p.classList.contains('collapsed'), permHidden: p.classList.contains('perm-hidden') }; });
    }
    if (name === 'coord157') await page.screenshot({ path: L.W + '/shot_08_coord157.png' });
    await ctx.close();
  }
  // API directa: DIRECTOR (156) y COORDINADOR de otra red
  const tk = async u => (await L.apiLogin(u)).token;
  const get = async (tok, p, method, body) => { const r = await fetch(L.BASE + p, { method: method || 'GET', headers: Object.assign({ Authorization: 'Bearer ' + tok }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined }); let t = ''; try { t = await r.text(); } catch (e) {} return { s: r.status, len: t.length, body: t }; };
  const td = await tk(U.dir156), tc157 = await tk(U.coord157), ta = await tk(L.ADMIN);
  const first = (await (await fetch(L.BASE + '/api/cronicos', { headers: { Authorization: 'Bearer ' + ta } })).json())[0];
  const paths = ['/api/cronicos', '/api/patients', '/api/patients/geo', '/fhir/Bundle', '/api/Bundle', '/fhir/Patient/' + first.id, '/api/patients/' + first.id + '/eventos', '/api/establishments', '/api/alerts/summary', '/api/indicadores/convenio', '/api/users', '/api/security/audit-logs'];
  for (const p of paths) { const r = await get(td, p); out.api['DIRECTOR ' + p] = r.s; }
  const wr = await get(td, '/api/appointments/pre-cita', 'POST', { patient_id: first.id }); out.api['DIRECTOR POST pre-cita'] = wr.s;
  const wr2 = await get(td, '/api/padron/importar-lote', 'POST', { patients: [{ id: 'x', dni: '1' }] }); out.api['DIRECTOR POST importar-lote'] = wr2.s;
  // que devuelve el director en los endpoints permitidos (solo claves)
  const keysOf = (t) => { try { const j = JSON.parse(t); const k = o => Array.isArray(o) ? 'array[' + o.length + ']' : (o && typeof o === 'object' ? Object.keys(o).slice(0, 14).join(',') : typeof o); return k(j); } catch (e) { return 'no-json'; } };
  out.api.directorAlertsKeys = keysOf((await get(td, '/api/alerts/summary')).body);
  const ind = await get(td, '/api/indicadores/convenio');
  out.api.directorIndicadoresKeys = keysOf(ind.body);
  // ¿contiene DNIs o nombres de pacientes? (solo conteo de coincidencias)
  const adm = await (await fetch(L.BASE + '/api/cronicos', { headers: { Authorization: 'Bearer ' + ta } })).json();
  const dnis = adm.map(p => p.dni), nombres = adm.map(p => p.apellidos_nombres);
  const al = (await get(td, '/api/alerts/summary')).body;
  out.api.directorRespuestasConDniONombre = { alerts: dnis.filter(d => al.includes(d)).length + nombres.filter(n => al.includes(n)).length, indicadores: dnis.filter(d => ind.body.includes(d)).length + nombres.filter(n => ind.body.includes(n)).length };
  // coordinador de OTRA red
  for (const p of ['/api/cronicos', '/api/patients', '/fhir/Patient/' + first.id, '/api/patients/' + first.id + '/eventos', '/api/alerts/summary']) { const r = await get(tc157, p); out.api['COORD157 ' + p] = r.s + (r.s === 200 ? ' len ' + r.len : ''); }
  const wr3 = await get(tc157, '/api/appointments/pre-cita', 'POST', { patient_id: first.id }); out.api['COORD157 POST pre-cita (paciente ajeno)'] = wr3.s;
  // sin token
  out.api['sin token /api/cronicos'] = (await fetch(L.BASE + '/api/cronicos')).status;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
