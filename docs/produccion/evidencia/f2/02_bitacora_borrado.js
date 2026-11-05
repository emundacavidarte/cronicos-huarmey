// Evidencia Fase 2 — un actor SIN sesión vacía la bitácora de auditoría con inicios de sesión fallidos.
// Uso: ADMIN_PASSWORD=<clave> BASE=http://127.0.0.1:3240 DATA_DIR=<carpeta del servidor> node 02_bitacora_borrado.js [intentos=5100] [ruta=/fhir/auth/login]
const fs = require('fs'); const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:3240';
const N = parseInt(process.argv[2] || '5100', 10); const RUTA = process.argv[3] || '/fhir/auth/login';
const post = (p, body, token) => fetch(BASE + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: JSON.stringify(body) });
const leer = () => JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'store.json'), 'utf8')).audit_logs;
(async () => {
  const A = (await (await post('/api/auth/login', { username: 'admin', password: process.env.ADMIN_PASSWORD })).json()).token;
  const marca = 'f2.marca.' + Date.now().toString(36);
  console.log('marca: crear usuario', marca, '→', (await post('/api/users', { username: marca, nombre: 'Marca F2', role: 'DIRECTOR', red: '156', password: 'Marca-F2-' + Date.now() }, A)).status);
  await new Promise(r => setTimeout(r, 600));
  const tiene = l => l.some(x => x.evento === 'USUARIO_CREADO' && x.payload_json.includes(marca));
  console.log('antes: entradas', leer().length, '| ¿la marca está en la bitácora?', tiene(leer()));
  const t0 = Date.now(); const cuenta = {}; let i = 0;
  await Promise.all(Array.from({ length: 16 }, async () => {
    while (i < N) { const k = i++; const r = await post(RUTA, { username: 'atacante' + k, password: 'x' }); cuenta[r.status] = (cuenta[r.status] || 0) + 1; }
  }));
  await new Promise(r => setTimeout(r, 800));
  const l = leer();
  console.log(`${N} logins fallidos SIN sesión por ${RUTA} en ${((Date.now() - t0) / 1000).toFixed(1)} s → ${JSON.stringify(cuenta)}`);
  console.log('después: entradas', l.length, '| LOGIN_FALLIDO', l.filter(x => x.evento === 'LOGIN_FALLIDO').length, '| ¿la marca sigue en la bitácora?', tiene(l));
})().catch(e => { console.error(e); process.exit(1); });
