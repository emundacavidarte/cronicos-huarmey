/**
 * server.js
 * Servidor HL7 FHIR R4 y de Monitoreo Territorial
 * Hospital de Apoyo Huarmey (II-1) — Red Pacífico Sur
 * Un solo proceso Node con los datos en memoria y store.json. Capacidad medida (Fase 1): con ≈550 pacientes atiende
 * de sobra el uso previsto (máximo 5 usuarios a la vez, decisión de Edward); NO escala a miles de usuarios simultáneos.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');

// T-03a / S-01 / S-16: con NODE_ENV=production no se arranca con secretos ausentes, débiles o de ejemplo.
// Se revisa ANTES de cargar la base y se informa en una sola línea (sin traza de Node).
let db;
let apiRoutes;
let authRoutes;
let auth;
let cuerpoJson;
try {
  require('./auth/config').checkConfig();
  auth = require('./auth/auth');
  db = require('./db/database');
  apiRoutes = require('./routes/apiRoutes');
  authRoutes = require('./routes/authRoutes');
  ({ cuerpoJson } = require('./utils/cuerpoJson'));
} catch (err) {
  console.error(`[CONFIG] No se puede arrancar: ${err.message}`);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
// Consultas simples (querystring): sin objetos anidados en req.query
app.set('query parser', 'simple');

// Configuración de Proxy Inverso (Nginx, Caddy, Cloudflare o Render) para resolución verídica de IP en Rate Limiting.
// Solo debe activarse si el puerto NO es accesible directamente: con TRUST_PROXY y acceso directo, X-Forwarded-For se falsea.
if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// 1. Cabeceras de Seguridad HTTP (Fase 2: OWASP / Ley N° 29733)
// CSP (F2-17): solo el propio sitio para scripts, conexiones y marcos; imágenes solo de los mapas base que usa Leaflet.
// script-src SIN 'unsafe-inline': el cliente ya no tiene scripts ni manejadores en línea (client/js/ui/acciones.js),
// así que un HTML inyectado no ejecuta código aunque llegue a la página. style-src mantiene 'unsafe-inline' (estilos).
const MAPAS_BASE = [
  'https://mt0.google.com', 'https://mt1.google.com', 'https://mt2.google.com', 'https://mt3.google.com',
  'https://*.basemaps.cartocdn.com', 'https://*.tile.openstreetmap.fr', 'https://server.arcgisonline.com'
];
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${MAPAS_BASE.join(' ')}`,
  "connect-src 'self'",
  "font-src 'self' data:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  // El filtro XSS antiguo de los navegadores se desactiva (OWASP): puede introducir fallas y la CSP lo reemplaza
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader('Content-Security-Policy', CSP);
  next();
});

// 2. CORS (S-07): cerrado por defecto. La interfaz se sirve desde el mismo origen y no lo necesita.
// Solo si CORS_ORIGINS lista orígenes (separados por coma) se autorizan esos, y ningún otro.
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
if (allowedOrigins.length) {
  app.use(['/api', '/fhir'], cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'If-None-Match'],
    maxAge: 600
  }));
}

// 3. Límite de peticiones en memoria (S-02, S-04, L-01, F2-14). Cubre /api Y /fhir.
//    - Con un token válido el cupo es POR USUARIO (un hospital detrás de un NAT ya no comparte un solo cupo).
//    - Sin token, por IP. El inicio de sesión tiene un cupo propio por IP (ya no comparte el de escritura).
//    - El mapa tiene tope: IP o usuarios inventados no hacen crecer la memoria sin fin.
const rateBuckets = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const MAX_READ_REQ_PER_MIN = 600;
const MAX_WRITE_REQ_PER_MIN = 120;
const MAX_LOGIN_REQ_PER_MIN = 30;
const MAX_RATE_BUCKETS = 20000;

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets.entries()) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}, RATE_WINDOW_MS).unref();

function clientIp(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || 'desconocida';
}

function rateKeyFor(req) {
  if (req.method === 'POST' && req.baseUrl === '/api' && req.path === '/auth/login') {
    return { key: `ip:${clientIp(req)}:L`, limit: MAX_LOGIN_REQ_PER_MIN };
  }
  const isWrite = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
  const header = req.headers.authorization;
  const match = typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header) : null;
  const payload = match ? auth.verifyToken(match[1]) : null;
  const who = payload ? `u:${payload.sub}` : `ip:${clientIp(req)}`;
  return { key: `${who}:${isWrite ? 'W' : 'R'}`, limit: isWrite ? MAX_WRITE_REQ_PER_MIN : MAX_READ_REQ_PER_MIN };
}

app.use(['/api', '/fhir'], (req, res, next) => {
  const { key, limit } = rateKeyFor(req);
  const now = Date.now();

  let bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.delete(key);
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(key, bucket);
    if (rateBuckets.size > MAX_RATE_BUCKETS) {
      for (const [k, b] of rateBuckets) if (now > b.resetAt) rateBuckets.delete(k);
      for (const k of rateBuckets.keys()) {
        if (rateBuckets.size <= MAX_RATE_BUCKETS * 0.9) break;
        if (k !== key) rateBuckets.delete(k);
      }
    }
  }
  bucket.count++;

  if (bucket.count > limit) {
    const segundos = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(segundos));
    return res.status(429).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'throttled',
        diagnostics: `Límite de peticiones por minuto excedido. Intente nuevamente en ${segundos} segundos.`
      }]
    });
  }
  next();
});

// 4. Compresión HTTP Gzip de las respuestas JSON mayores a 2 KB
app.use((req, res, next) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (!acceptEncoding.includes('gzip')) {
    return next();
  }

  const origJson = res.json.bind(res);
  res.json = function (body) {
    const jsonStr = JSON.stringify(body);
    // Comprimir respuestas JSON mayores a 2 KB
    if (Buffer.byteLength(jsonStr, 'utf8') < 2048) {
      return origJson(body);
    }
    zlib.gzip(Buffer.from(jsonStr, 'utf8'), { level: zlib.constants.Z_BEST_SPEED }, (err, compressed) => {
      if (err) return origJson(body);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Length', compressed.length);
      res.end(compressed);
    });
  };
  next();
});

// 5. Servir Frontend Estático Responsivo con Caché ETag Inteligente
const clientPath = path.join(__dirname, '../client');
function cacheControlEstatico(filePath) {
  if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
    // HTML y Service Worker siempre validan versión fresca
    return 'no-cache, must-revalidate';
  }
  if (filePath.includes(`${path.sep}libs${path.sep}`) || filePath.includes(`${path.sep}data${path.sep}georis${path.sep}`)) {
    // Librerías y capas GeoRIS pesadas se cachean con revalidación ETag rápida
    return 'public, max-age=86400, must-revalidate';
  }
  return 'no-cache';
}

// S-08: los estáticos de texto (js, css, html, json, svg) salen comprimidos con gzip si el navegador lo acepta.
// Se comprimen una vez por versión del archivo (tamaño + fecha) y se guardan en memoria (≈1,7 MB para todo el cliente).
const TIPOS_COMPRIMIBLES = /\.(js|css|html|json|svg|webmanifest)$/i;
const gzipEstaticos = new Map();
app.use((req, res, next) => {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || !/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return next();
  let rel;
  try { rel = decodeURIComponent(req.path); } catch (e) { return next(); }
  if (rel.includes('\0')) return next();
  const archivo = path.join(clientPath, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!archivo.startsWith(clientPath + path.sep) || !TIPOS_COMPRIMIBLES.test(archivo)) return next();
  fs.stat(archivo, (err, st) => {
    if (err || !st.isFile() || st.size < 1024) return next();
    const version = `${st.size}-${st.mtimeMs}`;
    const etag = `W/"gz-${version}"`;
    const enviar = comprimido => {
      res.setHeader('Content-Type', express.static.mime.lookup(archivo) + (/\.(js|css|html|json|svg)$/i.test(archivo) ? '; charset=utf-8' : ''));
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', cacheControlEstatico(archivo));
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
      res.setHeader('Content-Length', comprimido.length);
      if (req.method === 'HEAD') return res.end();
      res.end(comprimido);
    };
    const guardado = gzipEstaticos.get(archivo);
    if (guardado && guardado.version === version) return enviar(guardado.datos);
    fs.readFile(archivo, (e2, contenido) => {
      if (e2) return next();
      zlib.gzip(contenido, { level: 9 }, (e3, datos) => {
        if (e3) return next();
        gzipEstaticos.set(archivo, { version, datos });
        enviar(datos);
      });
    });
  });
});

app.use(express.static(clientPath, {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => res.setHeader('Cache-Control', cacheControlEstatico(filePath))
}));

// 6. Rutas de API y Estándar HL7 FHIR R4
// Las respuestas de /api y /fhir traen datos personales o de salud: nunca se guardan en cachés (F2-06).
app.use(['/api', '/fhir'], (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
// T-03a: el inicio de sesión (/api/auth/login) es lo único público; todo lo demás exige token (401 sin él).
// F2-07: el cuerpo se lee DESPUÉS de comprobar la sesión (sin token, un cuerpo grande ya no se analiza).
app.use('/api', authRoutes.publicRouter);
app.use(['/api', '/fhir'], auth.authenticate);
app.use(['/api', '/fhir'], cuerpoJson('10mb'));
app.use('/api', authRoutes.privateRouter);
app.use('/api', apiRoutes.router);
app.use('/fhir', apiRoutes.fhirRouter);
// Cualquier otra ruta de /api o /fhir (con cualquier método): 404 en JSON, sin repetir la consulta
app.use(['/api', '/fhir'], (req, res) => {
  res.status(404).json({
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: 'not-found', diagnostics: `Ruta no encontrada: ${req.method} ${req.baseUrl}${req.path}` }]
  });
});

// 7. Health Check para Balanceadores de Carga y Monitoreo de Concurrencia
app.get('/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ONLINE',
    system: 'Motor de Inteligencia Territorial de Crónicos - Hospital II-1 Huarmey',
    fhir_version: 'R4 (4.0.1)',
    concurrency_ready: true,
    memory_rss_mb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
    uptime_seconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// 8. Lo que no existe responde 404 (la interfaz es de una sola página sin rutas propias)
app.get('*', (req, res) => {
  res.status(404).type('text/plain; charset=utf-8').send('No encontrado');
});

// 9. Manejador global de errores (S-13, F2-10): nunca devuelve textos internos.
//    4xx del lector del cuerpo: mensaje propio; 5xx: texto genérico con una referencia que también va al registro.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  let status = Number(err && (err.status || err.statusCode)) || 500;
  if (status < 400 || status > 599) status = 500;
  let diagnostics;
  if (status === 413 || (err && err.type === 'entity.too.large')) {
    diagnostics = 'El tamaño del contenido excede el límite permitido.';
  } else if (err && err.type === 'entity.parse.failed') {
    diagnostics = 'El cuerpo de la solicitud no es un JSON válido.';
  } else if (status === 415) {
    diagnostics = 'Tipo de contenido no admitido: envíe application/json.';
  } else if (status < 500) {
    diagnostics = 'Solicitud inválida.';
  } else {
    const ref = crypto.randomBytes(4).toString('hex');
    // Al registro solo va el tipo y el mensaje del error (nunca el cuerpo de la solicitud)
    console.error(`[ERROR ${ref}] ${req.method} ${req.baseUrl}${req.path}: ${err && err.name}: ${err && err.message}`);
    diagnostics = `Error interno procesando la solicitud (referencia ${ref}).`;
  }
  res.status(status).json({
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: status === 413 ? 'too-costly' : (status < 500 ? 'invalid' : 'exception'), diagnostics }]
  });
});

function startListening() {
  const server = app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(` MOTOR TERRITORIAL DE CRÓNICOS - HOSPITAL DE APOYO HUARMEY II-1 `);
    console.log(` Interoperabilidad Nativa HL7 FHIR (R4) & GeoRIS MINSA           `);
    console.log(` Prototipo: un proceso, datos en memoria y store.json            `);
    console.log(` Servidor activo en: http://localhost:${PORT}                   `);
    console.log(` Endpoints FHIR:     http://localhost:${PORT}/fhir/Bundle        `);
    console.log(`================================================================`);
  });

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

// T-03a: antes de abrir el puerto debe existir al menos un administrador (si falla, el servidor no arranca)
auth.bootstrapAdmin()
  .then(result => {
    if (result.created) {
      console.log(`[AUTH] Administrador inicial creado: usuario "${result.username}".`);
      if (result.generatedPassword) {
        console.log(`[AUTH] Clave temporal (se muestra UNA sola vez, cámbiela al ingresar): ${result.generatedPassword}`);
      }
    } else if (result.reset) {
      console.log(`[AUTH] Clave del administrador "${result.username}" restablecida. Quite ADMIN_RESET del entorno.`);
    } else if (result.resetYaAplicado) {
      console.log(`[AUTH] ADMIN_RESET=true sigue en el entorno, pero esa clave ya se aplicó: no se restableció de nuevo. Quite ADMIN_RESET del entorno.`);
    }
    startListening();
  })
  .catch(err => {
    console.error(`[AUTH] No se puede arrancar: ${err.message}`);
    process.exit(1);
  });

// Apagado Limpio y Durabilidad de Datos (SIGINT / SIGTERM)
function gracefulShutdown(signal) {
  console.log(`\n[SHUTDOWN] Señal ${signal} recibida. Vaciando base de datos a disco de forma síncrona...`);
  try {
    db.flushSync();
    console.log('[SHUTDOWN] Base de datos persistida atómicamente.');
  } catch (err) {
    console.error('[SHUTDOWN] Error durante el vaciado a disco:', err.message);
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
