/**
 * auth.js
 * Autenticación real (T-03a): claves con scrypt, token firmado con HMAC-SHA256 (solo el módulo crypto, sin paquetes),
 * administrador inicial y middlewares authenticate / requireScope.
 * El rol y la red SIEMPRE salen del usuario guardado en el servidor; nunca de un encabezado ni del contenido del token.
 */

const crypto = require('crypto');
const { promisify } = require('util');
const db = require('../db/database');
const { normalizeRed, sameRed } = require('./redes');

const scryptAsync = promisify(crypto.scrypt);

const ROLES = ['ADMIN', 'COORDINADOR', 'DIRECTOR'];
const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;
const USERNAME_REGEX = /^[a-z0-9._-]{3,32}$/;
const USERNAMES_RESERVADOS = ['__proto__', 'constructor', 'prototype'];

// --- Configuración del secreto de firma ---
let devSecret = null;

function getSecret() {
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv) return fromEnv;
  // Solo fuera de producción: secreto aleatorio por proceso (los tokens dejan de valer al reiniciar)
  if (!devSecret) devSecret = crypto.randomBytes(32).toString('hex');
  return devSecret;
}

/** Revisión de la configuración de producción (S-01): vive en config.js para poder correrla antes de cargar la base. */
const { checkConfig } = require('./config');

// --- Claves ---
function validatePassword(password) {
  if (typeof password !== 'string') return 'La clave debe ser un texto.';
  if (password.length < PASSWORD_MIN) return `La clave debe tener al menos ${PASSWORD_MIN} caracteres.`;
  if (password.length > PASSWORD_MAX) return `La clave no puede superar ${PASSWORD_MAX} caracteres.`;
  return null;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(String(password), salt, SCRYPT_KEYLEN, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string' || password.length > 1024) return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const n = parseInt(parts[1], 10);
  if (!Number.isInteger(n) || n < 1024 || n > 65536 || (n & (n - 1)) !== 0) return false;
  const salt = Buffer.from(parts[2], 'hex');
  const expected = Buffer.from(parts[3], 'hex');
  if (salt.length === 0 || expected.length !== SCRYPT_KEYLEN) return false;
  const actual = await scryptAsync(password, salt, SCRYPT_KEYLEN, { N: n });
  return crypto.timingSafeEqual(actual, expected);
}

let dummyHash = null;
/** Gasta el mismo tiempo que una verificación real cuando el usuario no existe (evita revelar qué usuarios existen). */
async function burnPasswordTime(password) {
  if (!dummyHash) dummyHash = await hashPassword(crypto.randomBytes(8).toString('hex'));
  await verifyPassword(typeof password === 'string' ? password : '', dummyHash);
}

// --- Token HMAC (formato: base64url(payload).base64url(firma)); iat y exp en milisegundos ---
function hmac(body) {
  return crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
}

function signToken(username, nowMs = Date.now()) {
  const payload = { sub: String(username), iat: nowMs, exp: nowMs + TOKEN_TTL_SECONDS * 1000 };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return { token: `${body}.${hmac(body)}`, expires_at: new Date(payload.exp).toISOString() };
}

function verifyToken(token, nowMs = Date.now()) {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const given = Buffer.from(signature);
  const expected = Buffer.from(hmac(body));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
  if (!payload || typeof payload.sub !== 'string' || !Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) return null;
  if (nowMs >= payload.exp) return null;
  return payload;
}

// --- Usuarios ---
function normalizeUsername(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().toLowerCase();
  return USERNAME_REGEX.test(name) && !USERNAMES_RESERVADOS.includes(name) ? name : null;
}

/** Datos del usuario que se pueden mostrar o enviar al cliente (nunca el hash de la clave). */
function publicUser(u) {
  if (!u) return null;
  return {
    username: u.username,
    nombre: u.nombre || u.username,
    role: u.role,
    red: u.role === 'ADMIN' ? null : normalizeRed(u.red),
    establecimiento_id: u.role === 'ADMIN' ? null : (u.establecimiento_id || null),
    sector_sanitario: u.role === 'ADMIN' ? null : (u.sector_sanitario || null),
    activo: u.activo !== false,
    creado: u.creado || null
  };
}

/**
 * Ámbito más fino que la red (A9): establecimiento y sector opcionales. Si el usuario tiene establecimiento,
 * solo ve y escribe pacientes de ese establecimiento. Devuelve { error } o { establecimiento_id, sector_sanitario }.
 */
function validateAmbito(b, red) {
  const vacio = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  let establecimiento_id = null;
  if (!vacio(b.establecimiento_id)) {
    const code = typeof b.establecimiento_id === 'string' ? b.establecimiento_id.trim() : '';
    if (!/^\d{8}$/.test(code)) return { error: 'establecimiento_id debe ser un código RENIPRESS de 8 dígitos.' };
    const est = db.getEstablishmentById(code);
    if (!est) return { error: 'establecimiento_id no es un establecimiento del catálogo.' };
    if (!sameRed(red, est.red_salud)) return { error: 'El establecimiento indicado no pertenece a la red del usuario.' };
    establecimiento_id = code;
  }
  let sector_sanitario = null;
  if (!vacio(b.sector_sanitario)) {
    const sector = typeof b.sector_sanitario === 'string' ? b.sector_sanitario.trim() : '';
    if (!sector || sector.length > 80) return { error: 'sector_sanitario debe ser un texto de hasta 80 caracteres.' };
    sector_sanitario = sector;
  }
  return { establecimiento_id, sector_sanitario };
}

/**
 * Valida los datos para registrar un usuario (hecho por un ADMIN).
 * COORDINADOR y DIRECTOR deben tener una de las 7 RIS; ADMIN no tiene red (ve todas).
 * Devuelve { error } o { value } (sin hash: la ruta lo calcula).
 */
function validateNewUser(body) {
  const b = body && typeof body === 'object' ? body : {};
  const username = normalizeUsername(b.username);
  if (!username) return { error: 'username inválido: use de 3 a 32 caracteres entre letras minúsculas, números, punto, guion y guion bajo.' };
  const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : '';
  if (nombre.length < 1 || nombre.length > 120) return { error: 'nombre es obligatorio (máximo 120 caracteres).' };
  if (!ROLES.includes(b.role)) return { error: `role inválido: debe ser uno de ${ROLES.join(', ')}.` };

  let red = null;
  if (b.role !== 'ADMIN') {
    red = normalizeRed(b.red);
    if (!red) return { error: 'red es obligatoria para COORDINADOR y DIRECTOR y debe ser una de las 7 RIS de Áncash.' };
  }
  let establecimiento_id = null;
  let sector_sanitario = null;
  if (b.role !== 'ADMIN') {
    const amb = validateAmbito(b, red);
    if (amb.error) return { error: amb.error };
    ({ establecimiento_id, sector_sanitario } = amb);
  }
  const passwordError = validatePassword(b.password);
  if (passwordError) return { error: passwordError };
  return { value: { username, nombre, role: b.role, red, establecimiento_id, sector_sanitario, password: b.password } };
}

/** Huella de una orden de ADMIN_RESET (usuario + clave del entorno), firmada con el secreto: no guarda la clave. */
function resetMarker(username, password) {
  return crypto.createHmac('sha256', getSecret()).update(`admin-reset|${username}|${password}`).digest('hex');
}

/**
 * ADMIN_RESET=true restablece la clave de ADMIN_USER con ADMIN_PASSWORD UNA sola vez por cada clave del entorno (F2-19):
 * si la variable queda olvidada, los reinicios siguientes no revierten la clave que el ADMIN cambió ni cierran sus sesiones.
 * Poner una ADMIN_PASSWORD distinta vuelve a aplicar el restablecimiento.
 */
async function resetAdmin() {
  const username = normalizeUsername(process.env.ADMIN_USER || 'admin');
  if (!username) throw new Error('ADMIN_USER inválido para ADMIN_RESET.');
  const passwordError = validatePassword(process.env.ADMIN_PASSWORD);
  if (passwordError) throw new Error(`ADMIN_RESET requiere una ADMIN_PASSWORD válida: ${passwordError}`);

  const existing = db.getUserByUsername(username);
  if (existing && existing.role !== 'ADMIN') {
    throw new Error(`ADMIN_RESET: "${username}" existe con el rol ${existing.role}. Use otro nombre en ADMIN_USER.`);
  }
  const marker = resetMarker(username, process.env.ADMIN_PASSWORD);
  if (existing && existing.admin_reset_marker === marker) {
    return { created: false, reset: false, resetYaAplicado: true, username };
  }
  const hash = await hashPassword(process.env.ADMIN_PASSWORD);
  if (existing) {
    db.updateUser(username, { password_hash: hash, activo: true, token_valid_after: Date.now(), admin_reset_marker: marker });
    return { created: false, reset: true, username };
  }
  db.createUser({
    username, nombre: 'ADMINISTRADOR', role: 'ADMIN', red: null,
    password_hash: hash, activo: true, creado: new Date().toISOString(), admin_reset_marker: marker
  });
  return { created: true, reset: true, username };
}

/**
 * Crea el administrador inicial si no existe ninguno activo.
 * ADMIN_USER (por defecto "admin") y ADMIN_PASSWORD. Sin ADMIN_PASSWORD: en producción no se arranca;
 * fuera de producción se genera una clave aleatoria que se devuelve UNA sola vez en generatedPassword.
 */
async function bootstrapAdmin() {
  // Recuperación: ADMIN_RESET=true + ADMIN_PASSWORD restablece la clave de ADMIN_USER (o lo crea si no existe)
  if (process.env.ADMIN_RESET === 'true') return resetAdmin();

  if (db.listUsers().some(u => u.role === 'ADMIN' && u.activo !== false)) {
    return { created: false };
  }

  const username = normalizeUsername(process.env.ADMIN_USER || 'admin');
  if (!username) throw new Error('ADMIN_USER inválido: use de 3 a 32 caracteres entre minúsculas, números, punto, guion y guion bajo.');
  if (db.getUserByUsername(username)) {
    throw new Error(`ADMIN_USER "${username}" ya existe con otro rol o está desactivado. Use otro nombre en ADMIN_USER.`);
  }

  let password = process.env.ADMIN_PASSWORD;
  let generatedPassword;
  if (password) {
    const passwordError = validatePassword(password);
    if (passwordError) throw new Error(`ADMIN_PASSWORD no es válida: ${passwordError}`);
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_PASSWORD es obligatoria en producción para crear el administrador inicial.');
  } else {
    password = crypto.randomBytes(12).toString('base64url');
    generatedPassword = password;
  }

  db.createUser({
    username,
    nombre: 'ADMINISTRADOR',
    role: 'ADMIN',
    red: null,
    password_hash: await hashPassword(password),
    activo: true,
    creado: new Date().toISOString()
  });
  const result = { created: true, username };
  if (generatedPassword) result.generatedPassword = generatedPassword;
  return result;
}

/** Verifica usuario y clave; devuelve { token, token_type, expires_at, user } o null si no coinciden. */
async function login(username, password) {
  const name = normalizeUsername(username);
  const user = name ? db.getUserByUsername(name) : null;
  if (!user || user.activo === false) {
    await burnPasswordTime(password);
    return null;
  }
  if (!(await verifyPassword(password, user.password_hash))) return null;
  const signed = signToken(user.username);
  return { token: signed.token, token_type: 'Bearer', expires_at: signed.expires_at, user: publicUser(user) };
}

// --- Middlewares ---
function outcome(code, diagnostics) {
  return { resourceType: 'OperationOutcome', issue: [{ severity: 'error', code, diagnostics }] };
}

function unauthorized(res, diagnostics) {
  res.setHeader('WWW-Authenticate', 'Bearer realm="cronicos-huarmey"');
  return res.status(401).json(outcome('login', diagnostics));
}

const MSG_SIN_SESION = 'Se requiere iniciar sesión (Authorization: Bearer <token>).';
const MSG_SESION_INVALIDA = 'Sesión inválida o vencida. Inicie sesión nuevamente.';

/** Exige Authorization: Bearer <token>. El rol y la red salen del usuario guardado, no del token ni de encabezados. */
function authenticate(req, res, next) {
  const header = req.headers && req.headers.authorization;
  const match = typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header) : null;
  if (!match) return unauthorized(res, MSG_SIN_SESION);

  const payload = verifyToken(match[1]);
  if (!payload) return unauthorized(res, MSG_SESION_INVALIDA);

  const user = db.getUserByUsername(payload.sub);
  if (!user || user.activo === false || !ROLES.includes(user.role)) {
    return unauthorized(res, MSG_SESION_INVALIDA);
  }
  // Cambiar la clave o desactivar al usuario invalida los tokens emitidos antes
  if (payload.iat <= (user.token_valid_after || 0)) return unauthorized(res, MSG_SESION_INVALIDA);

  req.user = publicUser(user);
  req.auditContext = {
    actor: req.user.username,
    role: req.user.role,
    ip: req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1'
  };
  next();
}

/** Debe ir después de authenticate. 401 si no hay usuario; 403 si su rol no está permitido. */
function requireScope(allowedRoles = ROLES) {
  return (req, res, next) => {
    if (!req.user) return unauthorized(res, MSG_SIN_SESION);
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json(outcome('forbidden', `Acceso denegado. El rol '${req.user.role}' no cuenta con privilegios para este recurso.`));
    }
    next();
  };
}

module.exports = {
  ROLES,
  TOKEN_TTL_SECONDS,
  checkConfig,
  validatePassword,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  normalizeUsername,
  publicUser,
  validateAmbito,
  validateNewUser,
  bootstrapAdmin,
  login,
  authenticate,
  requireScope,
  outcome
};
