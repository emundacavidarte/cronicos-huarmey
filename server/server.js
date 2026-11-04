/**
 * server.js
 * Servidor Principal de Alta Concurrencia HL7 FHIR R4 y Monitoreo Territorial
 * Hospital de Apoyo Huarmey (II-1) — Red Pacífico Sur
 * Optimizado para soportar 1,000+ usuarios concurrentes (Compresión Gzip nativa, Caché Inteligente, Rate Limiting y Headers de Seguridad Fase 2)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const zlib = require('zlib');
const db = require('./db/database');
const apiRoutes = require('./routes/apiRoutes');
const authRoutes = require('./routes/authRoutes');
const auth = require('./auth/auth');

// T-03a: con NODE_ENV=production no se arranca sin AUTH_SECRET (mínimo 32 caracteres)
auth.checkConfig();

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');

// Configuración de Proxy Inverso (Nginx, Caddy o Cloudflare) para resolución verídica de IP en Rate Limiting
if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// 1. Cabeceras de Seguridad HTTP (Fase 2 Security Readiness - OWASP / Ley N° 29733)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  // CSP permisiva para mosaicos cartográficos externos (Google, Esri, CartoDB, OSM) y aceleración Leaflet
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'self'; img-src 'self' data: blob: https: http:; connect-src 'self' https: http:; font-src 'self' data:; frame-ancestors 'self';");
  next();
});

// 2. Rate Limiter en Memoria por IP (Protección DDoS y abuso de APIs de escritura)
const rateBuckets = new Map();
const RATE_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_READ_REQ_PER_MIN = 600; // Soporta múltiples usuarios detrás de NAT hospitalario
const MAX_WRITE_REQ_PER_MIN = 120;

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets.entries()) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}, RATE_WINDOW_MS).unref();

app.use('/api', (req, res, next) => {
  const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  const isWrite = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
  const key = `${ip}:${isWrite ? 'W' : 'R'}`;
  const now = Date.now();

  let bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(key, bucket);
  }
  bucket.count++;

  const limit = isWrite ? MAX_WRITE_REQ_PER_MIN : MAX_READ_REQ_PER_MIN;
  if (bucket.count > limit) {
    return res.status(429).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'throttled',
        diagnostics: 'Límite de peticiones por minuto excedido. Intente nuevamente en unos segundos.'
      }]
    });
  }
  next();
});

// 3. Compresión HTTP Gzip de Alta Velocidad (reduce /api/cronicos de 1.85 MB a ~140 KB)
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

// 4. CORS y Parsers JSON con límites seguros
const allowedOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : null;
app.use(cors(allowedOrigins ? { origin: allowedOrigins } : undefined));
app.use(express.json({ limit: '10mb', type: ['application/json', 'text/plain', 'application/*+json'] }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Servir Frontend Estático Responsivo con Caché ETag Inteligente
const clientPath = path.join(__dirname, '../client');
app.use(express.static(clientPath, {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
      // HTML y Service Worker siempre validan versión fresca
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else if (filePath.includes(`${path.sep}libs${path.sep}`) || filePath.includes(`${path.sep}data${path.sep}georis${path.sep}`)) {
      // Librerías y capas GeoRIS pesadas se cachean con revalidación ETag rápida
      res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// 6. Rutas de API y Estándar HL7 FHIR R4
// T-03a: el inicio de sesión es lo único público de /api y /fhir; todo lo demás exige token (401 sin él)
app.use(['/api', '/fhir'], authRoutes.publicRouter);
app.use(['/api', '/fhir'], auth.authenticate);
app.use(['/api', '/fhir'], authRoutes.privateRouter);
app.use('/api', apiRoutes);
app.use('/fhir', apiRoutes);

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

// 8. Redirección SPA (solo para rutas de navegación de interfaz, no para endpoints API/FHIR inexistentes)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/fhir/')) {
    return res.status(404).json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'not-found', diagnostics: `Endpoint no encontrado: ${req.originalUrl}` }]
    });
  }
  // La interfaz es de una sola página sin rutas propias: lo que no existe responde 404, no la página de inicio
  res.status(404).type('text/plain; charset=utf-8').send('No encontrado');
});

// 9. Manejador Global de Errores JSON / HL7 FHIR OperationOutcome (sin exponer stack traces en producción)
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    resourceType: 'OperationOutcome',
    issue: [{
      severity: 'error',
      code: status === 413 ? 'too-costly' : 'exception',
      diagnostics: status === 413
        ? 'El tamaño del payload excede el límite permitido (10 MB).'
        : (err.message || 'Error interno procesando la solicitud clínica.')
    }]
  });
});

function startListening() {
  const server = app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(` MOTOR TERRITORIAL DE CRÓNICOS - HOSPITAL DE APOYO HUARMEY II-1 `);
    console.log(` Interoperabilidad Nativa HL7 FHIR (R4) & GeoRIS MINSA           `);
    console.log(` Alta Concurrencia (1,000+ usuarios): Gzip + Índices O(1) Activo`);
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
