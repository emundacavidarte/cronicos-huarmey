// Evidencia Fase 1 — ver docs/produccion/F1_diagnostico.md. Datos 100% inventados. Uso: ADMIN_PASSWORD=<clave del servidor de prueba> BASE=http://localhost:3230 node 01_api_general.js
if(!process.env.ADMIN_PASSWORD){console.error('Defina ADMIN_PASSWORD (la del servidor de prueba) y, si hace falta, BASE=http://localhost:PUERTO');process.exit(2);}
// Diagnóstico Fase 1 — API. Solo conteos y nombres de campos; nunca datos de pacientes.
const BASE = process.env.BASE || 'http://localhost:3230';
const ADMIN = { username: 'admin', password: process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD };
const out = [];
const log = (id, ok, msg) => { out.push({ id, ok }); console.log(`${ok ? 'OK   ' : 'FALLA'} ${id} :: ${msg}`); };

async function call(method, path, { token, body, headers = {}, raw } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) { payload = raw ? body : JSON.stringify(body); if (!h['Content-Type']) h['Content-Type'] = 'application/json'; }
  const t0 = performance.now();
  const r = await fetch(BASE + path, { method, headers: h, body: payload });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, headers: r.headers, text, json, ms: Math.round(performance.now() - t0) };
}
const shape = (o) => Array.isArray(o) ? `array(${o.length})` : (o && typeof o === 'object' ? `{${Object.keys(o).slice(0, 12).join(',')}}` : typeof o);

(async () => {
  // ---------- 1. Sin token ----------
  const rutas = ['/api/cronicos', '/api/patients', '/api/patients/geo', '/api/alerts/summary', '/api/establishments', '/api/indicadores/convenio',
    '/api/security/audit-logs', '/api/users', '/fhir/Bundle', '/fhir/metadata', '/api/metadata', '/fhir/loinc-catalog'];
  for (const r of rutas) {
    const x = await call('GET', r);
    log(`sin-token GET ${r}`, x.status === 401, `status=${x.status}`);
  }
  const wr = await call('POST', '/fhir/Bundle', { body: { resourceType: 'Bundle', entry: [] } });
  log('sin-token POST /fhir/Bundle', wr.status === 401, `status=${wr.status}`);
  const h = await call('GET', '/health');
  log('/health público', h.status === 200, `status=${h.status}, campos=${shape(h.json)}`);

  // ---------- 2. Login ----------
  const bad = await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'mala-clave-123' } });
  log('login clave mala', bad.status === 401, `status=${bad.status}`);
  const bad2 = await call('POST', '/api/auth/login', { body: { username: 'no-existe', password: 'mala-clave-123' } });
  log('login usuario inexistente igual que clave mala', bad2.status === 401 && bad.text === bad2.text, `status=${bad2.status}, mismo cuerpo=${bad.text === bad2.text}`);
  const lg = await call('POST', '/api/auth/login', { body: ADMIN });
  log('login admin', lg.status === 200 && !!lg.json?.token, `status=${lg.status}, campos=${shape(lg.json)}, user=${shape(lg.json?.user)}, vence=${lg.json?.expires_at}`);
  const T = lg.json.token;
  const me = await call('GET', '/api/auth/me', { token: T });
  log('/api/auth/me', me.status === 200, `status=${me.status}, role=${me.json?.user?.role || me.json?.role}`);
  const tamper = await call('GET', '/api/cronicos', { token: T.slice(0, -2) + 'xx' });
  log('token alterado', tamper.status === 401, `status=${tamper.status}`);
  const garbage = await call('GET', '/api/cronicos', { token: 'no.es.un.token' });
  log('token basura', garbage.status === 401, `status=${garbage.status}`);

  // ---------- 3. Lecturas con ADMIN ----------
  const cr = await call('GET', '/api/cronicos', { token: T });
  const lista = Array.isArray(cr.json) ? cr.json : (cr.json?.data || cr.json?.patients || cr.json?.pacientes || []);
  log('GET /api/cronicos', cr.status === 200 && lista.length > 0, `status=${cr.status}, forma=${shape(cr.json)}, n=${lista.length}, ${cr.ms} ms, bytes=${cr.text.length}`);
  const p0 = lista[0] || {};
  console.log('      campos del paciente (nombres):', Object.keys(p0).join(','));
  const geo = await call('GET', '/api/patients/geo', { token: T });
  const gl = Array.isArray(geo.json) ? geo.json : (geo.json?.data || geo.json?.patients || []);
  log('GET /api/patients/geo', geo.status === 200, `status=${geo.status}, n=${gl.length}, ${geo.ms} ms`);
  const al = await call('GET', '/api/alerts/summary', { token: T });
  log('GET /api/alerts/summary', al.status === 200, `status=${al.status}, ${shape(al.json)}`);
  const ic = await call('GET', '/api/indicadores/convenio', { token: T });
  log('GET /api/indicadores/convenio', ic.status === 200, `status=${ic.status}, ${shape(ic.json)}`);
  const es = await call('GET', '/api/establishments', { token: T });
  log('GET /api/establishments', es.status === 200, `status=${es.status}, ${shape(es.json)}`);
  const al2 = await call('GET', '/api/security/audit-logs', { token: T });
  log('GET /api/security/audit-logs (ADMIN)', al2.status === 200, `status=${al2.status}, ${shape(al2.json)}`);
  const bu = await call('GET', '/fhir/Bundle', { token: T });
  log('GET /fhir/Bundle', bu.status === 200, `status=${bu.status}, resourceType=${bu.json?.resourceType}, entradas=${bu.json?.entry?.length}`);
  const md = await call('GET', '/fhir/metadata', { token: T });
  log('GET /fhir/metadata', md.status === 200, `status=${md.status}, resourceType=${md.json?.resourceType}`);
  if (p0.id) {
    const pb = await call('GET', `/fhir/Patient/${encodeURIComponent(p0.id)}`, { token: T });
    log('GET /fhir/Patient/:id', pb.status === 200, `status=${pb.status}, resourceType=${pb.json?.resourceType}`);
    const pn = await call('GET', `/fhir/Patient/NO-EXISTE-123`, { token: T });
    log('GET /fhir/Patient/inexistente → 404', pn.status === 404, `status=${pn.status}`);
  }

  // ---------- 4. Rutas duplicadas (T-04) ----------
  for (const r of ['/api/api/cronicos', '/fhir/fhir/Bundle', '/api/fhir/Bundle', '/fhir/api/cronicos']) {
    const x = await call('GET', r, { token: T });
    log(`ruta doble GET ${r} debería ser 404`, x.status === 404, `status=${x.status}`);
  }

  // ---------- 5. Usuarios y roles ----------
  const redes = await call('GET', '/api/auth/redes', { token: T });
  const listaRedes = redes.json?.redes || redes.json?.data || redes.json || [];
  log('GET /api/auth/redes', redes.status === 200, `n=${listaRedes.length}, forma=${shape(listaRedes[0])}`);
  const RED_PS = (listaRedes.find(r => /PACIFICO.?SUR/i.test(r.codigo || r.nombre || '')) || listaRedes[0] || {}).codigo;
  const RED_OTRA = (listaRedes.find(r => r.codigo !== RED_PS) || {}).codigo;
  console.log('      red usada para el coordinador:', RED_PS, '| otra red:', RED_OTRA);
  const pass = require('crypto').randomBytes(12).toString('base64url') + '-Aa1';
  const mk = async (u, role, red) => call('POST', '/api/users', { token: T, body: { username: u, nombre: `Diag ${u}`, role, red, password: pass } });
  const c1 = await mk('coord.ps', 'COORDINADOR', RED_PS); log('crear COORDINADOR (Pacífico Sur)', c1.status === 201 || c1.status === 200, `status=${c1.status}`);
  const c2 = await mk('coord.otra', 'COORDINADOR', RED_OTRA); log('crear COORDINADOR (otra red)', c2.status === 201 || c2.status === 200, `status=${c2.status}`);
  const d1 = await mk('dir.ps', 'DIRECTOR', RED_PS); log('crear DIRECTOR', d1.status === 201 || d1.status === 200, `status=${d1.status}`);
  const weak = await call('POST', '/api/users', { token: T, body: { username: 'debil', nombre: 'x', role: 'COORDINADOR', red: RED_PS, password: 'corta' } });
  log('crear usuario con clave corta → 400', weak.status === 400, `status=${weak.status}`);
  const inj = await call('POST', '/api/users', { token: T, body: { username: '__proto__', nombre: 'x', role: 'ADMIN', red: RED_PS, password: pass } });
  log('crear usuario "__proto__" → 400', inj.status === 400, `status=${inj.status}`);
  const login = async (u) => (await call('POST', '/api/auth/login', { body: { username: u, password: pass } })).json?.token;
  const TC = await login('coord.ps'), TO = await login('coord.otra'), TD = await login('dir.ps');
  log('logins de los 3 roles', !!(TC && TO && TD), `tokens=${[TC, TO, TD].map(x => !!x)}`);

  // Matriz de permisos
  const matriz = [
    ['GET', '/api/cronicos', { ADMIN: 200, COORD_PS: 200, COORD_OTRA: 200, DIRECTOR: 403 }],
    ['GET', '/api/patients/geo', { ADMIN: 200, COORD_PS: 200, COORD_OTRA: 200, DIRECTOR: 403 }],
    ['GET', '/api/alerts/summary', { ADMIN: 200, COORD_PS: 200, COORD_OTRA: 200, DIRECTOR: 200 }],
    ['GET', '/api/establishments', { ADMIN: 200, COORD_PS: 200, COORD_OTRA: 200, DIRECTOR: 200 }],
    ['GET', '/api/indicadores/convenio', { ADMIN: 200, COORD_PS: 200, COORD_OTRA: 200, DIRECTOR: 200 }],
    ['GET', '/api/security/audit-logs', { ADMIN: 200, COORD_PS: 403, COORD_OTRA: 403, DIRECTOR: 403 }],
    ['GET', '/api/users', { ADMIN: 200, COORD_PS: 403, COORD_OTRA: 403, DIRECTOR: 403 }],
    ['GET', '/fhir/Bundle', { ADMIN: 200, COORD_PS: 200, COORD_OTRA: 200, DIRECTOR: 403 }],
  ];
  const tok = { ADMIN: T, COORD_PS: TC, COORD_OTRA: TO, DIRECTOR: TD };
  for (const [m, r, esp] of matriz) {
    const got = {};
    for (const k of Object.keys(tok)) got[k] = (await call(m, r, { token: tok[k] })).status;
    const ok = Object.keys(esp).every(k => esp[k] === got[k]);
    log(`permisos ${m} ${r}`, ok, `obtenido=${JSON.stringify(got)}${ok ? '' : ' esperado=' + JSON.stringify(esp)}`);
  }
  // Alcance por red: cuántos pacientes ve cada uno
  const cuenta = async (t) => { const x = await call('GET', '/api/cronicos', { token: t }); const l = Array.isArray(x.json) ? x.json : (x.json?.data || x.json?.patients || x.json?.pacientes || []); return l.length; };
  console.log(`      pacientes visibles: ADMIN=${await cuenta(T)}, COORD Pacífico Sur=${await cuenta(TC)}, COORD otra red=${await cuenta(TO)}`);
  const alOtra = await call('GET', '/api/alerts/summary', { token: TO });
  console.log('      resumen de alertas COORD otra red:', JSON.stringify(alOtra.json).slice(0, 220));
  // Escritura de director
  const wD = await call('POST', '/fhir/Bundle', { token: TD, body: { resourceType: 'Bundle', type: 'transaction', entry: [] } });
  log('DIRECTOR no puede escribir (POST /fhir/Bundle)', wD.status === 403, `status=${wD.status}`);
  const wDP = await call('POST', '/api/appointments/pre-cita', { token: TD, body: { patient_id: 'x' } });
  log('DIRECTOR no puede pre-cita', wDP.status === 403, `status=${wDP.status}`);
  // Paciente de la otra red por id
  if (p0.id) {
    const x = await call('GET', `/fhir/Patient/${encodeURIComponent(p0.id)}`, { token: TO });
    log('COORD de otra red pidiendo paciente de Pacífico Sur → 404', x.status === 404, `status=${x.status}`);
  }

  // ---------- 6. POST /fhir/Bundle ----------
  const bundleOk = {
    resourceType: 'Bundle', type: 'transaction',
    entry: [{ resource: { resourceType: 'Patient', id: 'DIAG-F1-0001', identifier: [{ system: 'urn:oid:2.16.604.1.dni', value: '90000001' }],
      name: [{ family: 'PRUEBA INVENTADA', given: ['DIAG'] }], gender: 'male', birthDate: '1970-01-01' } }]
  };
  const bp = await call('POST', '/fhir/Bundle', { token: T, body: bundleOk });
  log('POST /fhir/Bundle válido', bp.status >= 200 && bp.status < 300, `status=${bp.status}, ${bp.text.slice(0, 160)}`);
  const bp2 = await call('POST', '/fhir/Bundle', { token: T, body: bundleOk });
  log('POST /fhir/Bundle idempotente (mismo lote 2 veces)', bp2.status >= 200 && bp2.status < 300, `status=${bp2.status}`);
  const n1 = await cuenta(T);
  console.log(`      pacientes tras 2 envíos del mismo lote: ${n1} (esperado 21 si es idempotente)`);
  const bi = await call('POST', '/fhir/Bundle', { token: T, body: '{"resourceType":"Bundle", ', raw: true });
  log('POST /fhir/Bundle JSON roto → 400', bi.status === 400, `status=${bi.status}, mensaje=${bi.text.slice(0, 200)}`);
  const bn = await call('POST', '/fhir/Bundle', { token: T, body: { resourceType: 'Patient' } });
  log('POST /fhir/Bundle con resourceType incorrecto → 400', bn.status === 400, `status=${bn.status}`);
  const mixto = { resourceType: 'Bundle', type: 'transaction', entry: [
    { resource: { resourceType: 'Patient', id: 'DIAG-F1-MIXTO-OK', identifier: [{ value: '90000002' }], name: [{ family: 'MIXTO', given: ['OK'] }], gender: 'female', birthDate: '1980-02-02' } },
    { resource: { resourceType: 'Patient', id: 'DIAG-F1-MIXTO-MAL', identifier: [{ value: 'no-es-dni' }], name: [], birthDate: 'no-es-fecha' } } ] };
  const nA = await cuenta(T);
  const bm = await call('POST', '/fhir/Bundle', { token: T, body: mixto });
  const nB = await cuenta(T);
  log('lote mixto (1 válido, 1 inválido): atómico', bm.status >= 400 ? nB === nA : true, `status=${bm.status}, pacientes antes=${nA} después=${nB}`);
  const pre = await call('POST', '/api/appointments/pre-cita', { token: T, body: { patient_id: 'NO-EXISTE-999', fecha: '2026-12-01' } });
  log('pre-cita a paciente inexistente → 404', pre.status === 404, `status=${pre.status}, ${pre.text.slice(0, 120)}`);

  // ---------- 7. Errores y estáticos ----------
  const e404 = await call('GET', '/js/data/sampleDataset.js');
  log('archivo inexistente → 404 (no HTML)', e404.status === 404, `status=${e404.status}, tipo=${e404.headers.get('content-type')}`);
  const eapi = await call('GET', '/api/no-existe', { token: T });
  log('/api/no-existe → 404 JSON', eapi.status === 404, `status=${eapi.status}`);
  for (const r of ['/server/db/store.json', '/db/store.json', '/../server/db/store.json', '/%2e%2e/server/db/store.json', '/..%2fserver%2fdb%2fstore.json', '/.env', '/server/server.js', '/package.json']) {
    const x = await call('GET', r);
    const leak = x.status === 200 && /patients|AUTH_SECRET|require\(/.test(x.text);
    log(`estático ${r} no filtra`, !leak, `status=${x.status}, tipo=${x.headers.get('content-type')}`);
  }
  const bigBody = JSON.stringify({ resourceType: 'Bundle', entry: [], pad: 'x'.repeat(11 * 1024 * 1024) });
  const big = await call('POST', '/fhir/Bundle', { token: T, body: bigBody, raw: true });
  log('payload de 11 MB → 413', big.status === 413, `status=${big.status}, ${big.text.slice(0, 120)}`);
  const ct = await call('POST', '/fhir/Bundle', { token: T, body: 'a=b', raw: true, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  log('POST con form-urlencoded no revienta (4xx)', ct.status >= 400 && ct.status < 500, `status=${ct.status}`);
  // CORS
  const co = await call('GET', '/health', { headers: { Origin: 'https://sitio-ajeno.example' } });
  console.log(`      CORS sin lista de orígenes: Access-Control-Allow-Origin=${co.headers.get('access-control-allow-origin')}`);
  const pf = await call('OPTIONS', '/api/cronicos', { headers: { Origin: 'https://sitio-ajeno.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
  console.log(`      Preflight desde origen ajeno: status=${pf.status}, allow-origin=${pf.headers.get('access-control-allow-origin')}, allow-headers=${pf.headers.get('access-control-allow-headers')}`);
  // Mensajes de error internos
  const pj = await call('POST', '/api/webhooks/hosix', { token: T, body: '{"a":', raw: true });
  console.log(`      cuerpo de error con JSON roto: ${pj.text.slice(0, 220)}`);

  // ---------- 8. Límite de peticiones: /api vs /fhir ----------
  const tally = async (prefix) => {
    const c = {};
    for (let i = 0; i < 135; i++) { const x = await call('POST', `${prefix}/webhooks/hosix`, { token: T, body: { DNI: '90000009' } }); c[x.status] = (c[x.status] || 0) + 1; }
    return c;
  };
  const viaFhir = await tally('/fhir');
  console.log('      135 POST /fhir/webhooks/hosix →', JSON.stringify(viaFhir));
  const viaApi = await tally('/api');
  console.log('      135 POST /api/webhooks/hosix  →', JSON.stringify(viaApi));
  log('el límite de escritura también aplica a /fhir', !!viaFhir[429], `códigos /fhir=${JSON.stringify(viaFhir)}`);

  const fails = out.filter(o => !o.ok);
  console.log(`\nRESUMEN: ${out.length - fails.length} OK, ${fails.length} FALLA`);
  fails.forEach(f => console.log('  FALLA:', f.id));
})().catch(e => { console.error('ERROR DEL SCRIPT', e); process.exit(2); });
