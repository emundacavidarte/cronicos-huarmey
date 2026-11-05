/**
 * authRoutes.js
 * T-03a: inicio de sesión (público) y gestión de usuarios (solo ADMIN).
 *   publicRouter  -> POST /auth/login                                   (sin token)
 *   privateRouter -> GET /auth/me, GET /auth/redes                      (cualquier usuario con sesión)
 *                    GET /users, POST /users, PATCH /users/:username    (solo ADMIN)
 */

const express = require('express');
const db = require('../db/database');
const auth = require('../auth/auth');
const { RIS, normalizeRed } = require('../auth/redes');
const { cuerpoJson } = require('../utils/cuerpoJson');

const publicRouter = express.Router();
const privateRouter = express.Router();

// --- Freno a los intentos fallidos de inicio de sesión (por IP + usuario) ---
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const failedLogins = new Map();
const LOGIN_MAX_CLAVES = 20000; // tope del mapa: nombres de usuario inventados no hacen crecer la memoria sin fin

setInterval(() => {
  const now = Date.now();
  for (const [key, b] of failedLogins.entries()) {
    if (now > b.resetAt) failedLogins.delete(key);
  }
}, LOGIN_WINDOW_MS).unref();

function loginKey(req, username) {
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
  return `${ip}|${String(username || '').slice(0, 64).toLowerCase()}`;
}

function isLocked(key) {
  const b = failedLogins.get(key);
  return !!b && Date.now() <= b.resetAt && b.count >= LOGIN_MAX_FAILS;
}

function registerFail(key) {
  const now = Date.now();
  let b = failedLogins.get(key);
  if (!b || now > b.resetAt) b = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  b.count++;
  failedLogins.set(key, b);
  if (failedLogins.size > LOGIN_MAX_CLAVES) {
    for (const [k, v] of failedLogins) if (now > v.resetAt) failedLogins.delete(k);
    for (const k of failedLogins.keys()) {
      if (failedLogins.size <= LOGIN_MAX_CLAVES * 0.9) break;
      failedLogins.delete(k); // Map conserva el orden de inserción: se descartan los más antiguos
    }
  }
}

function bad(res, status, code, diagnostics) {
  return res.status(status).json(auth.outcome(code, diagnostics));
}

// El login es lo único que se lee sin sesión: cuerpo de hasta 10 KB (F2-07)
publicRouter.post('/auth/login', cuerpoJson('10kb'), async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { username, password } = body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return bad(res, 400, 'invalid', 'username y password son obligatorios.');
    }

    const key = loginKey(req, username);
    if (isLocked(key)) {
      return bad(res, 429, 'throttled', 'Demasiados intentos fallidos. Intente nuevamente en unos minutos.');
    }

    const meta = { actor: auth.normalizeUsername(username) || 'USUARIO_INVALIDO', ip: req.ip || '127.0.0.1' };
    const result = await auth.login(username, password);
    if (!result) {
      registerFail(key);
      db.addAuditLog('AUTH', 'LOGIN_FALLIDO', { username: meta.actor }, meta);
      return bad(res, 401, 'login', 'Usuario o clave incorrectos.');
    }

    failedLogins.delete(key);
    db.addAuditLog('AUTH', 'LOGIN_OK', { username: result.user.username, role: result.user.role }, meta);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error en login:', err.message);
    bad(res, 500, 'exception', 'No se pudo iniciar sesión.');
  }
});

privateRouter.get('/auth/me', (req, res) => {
  res.json({ success: true, user: req.user });
});

privateRouter.post('/auth/logout', (req, res) => {
  try {
    const user = req.user;
    if (user && user.username) {
      db.updateUser(user.username, { token_valid_after: Date.now() });
      db.addAuditLog('AUTH', 'LOGOUT', { username: user.username }, req.auditContext);
    }
    res.json({ success: true, message: 'Sesión cerrada correctamente.' });
  } catch (err) {
    bad(res, 500, 'exception', 'No se pudo procesar el cierre de sesión.');
  }
});

privateRouter.get('/auth/redes', (req, res) => {
  res.json({ success: true, data: RIS });
});

privateRouter.get('/users', auth.requireScope(['ADMIN']), (req, res) => {
  const data = db.listUsers().map(auth.publicUser);
  res.json({ success: true, count: data.length, data });
});

privateRouter.post('/users', auth.requireScope(['ADMIN']), async (req, res) => {
  try {
    const checked = auth.validateNewUser(req.body);
    if (checked.error) return bad(res, 400, 'invalid', checked.error);
    const v = checked.value;
    if (db.getUserByUsername(v.username)) return bad(res, 409, 'duplicate', `El usuario ${v.username} ya existe.`);

    const created = db.createUser({
      username: v.username,
      nombre: v.nombre,
      role: v.role,
      red: v.red,
      establecimiento_id: v.establecimiento_id,
      sector_sanitario: v.sector_sanitario,
      password_hash: await auth.hashPassword(v.password),
      activo: true,
      creado: new Date().toISOString()
    });
    db.addAuditLog('AUTH', 'USUARIO_CREADO', { username: created.username, role: created.role, red: created.red, establecimiento_id: created.establecimiento_id || null }, req.auditContext);
    res.status(201).json({ success: true, user: auth.publicUser(created) });
  } catch (err) {
    console.error('Error creando usuario:', err.message);
    bad(res, 500, 'exception', 'No se pudo crear el usuario.');
  }
});

privateRouter.patch('/users/:username', auth.requireScope(['ADMIN']), async (req, res) => {
  try {
    const target = db.getUserByUsername(req.params.username);
    if (!target) return bad(res, 404, 'not-found', 'Usuario no encontrado.');

    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const changes = {};

    if (b.nombre !== undefined) {
      const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : '';
      if (!nombre || nombre.length > 120) return bad(res, 400, 'invalid', 'nombre inválido (1 a 120 caracteres).');
      changes.nombre = nombre;
    }

    const newRole = b.role !== undefined ? b.role : target.role;
    if (!auth.ROLES.includes(newRole)) return bad(res, 400, 'invalid', `role inválido: debe ser uno de ${auth.ROLES.join(', ')}.`);
    if (b.role !== undefined) changes.role = newRole;

    if (newRole === 'ADMIN') {
      changes.red = null;
    } else if (b.red !== undefined || b.role !== undefined) {
      const red = normalizeRed(b.red !== undefined ? b.red : target.red);
      if (!red) return bad(res, 400, 'invalid', 'red es obligatoria para COORDINADOR y DIRECTOR y debe ser una de las 7 RIS de Áncash.');
      changes.red = red;
    }

    // Ámbito por establecimiento y sector (A9): ADMIN no lo tiene; para los demás se revisa contra la red resultante
    if (newRole === 'ADMIN') {
      changes.establecimiento_id = null;
      changes.sector_sanitario = null;
    } else if (b.establecimiento_id !== undefined || b.sector_sanitario !== undefined || changes.red !== undefined) {
      const redFinal = changes.red !== undefined ? changes.red : normalizeRed(target.red);
      const amb = auth.validateAmbito({
        establecimiento_id: b.establecimiento_id !== undefined ? b.establecimiento_id : target.establecimiento_id,
        sector_sanitario: b.sector_sanitario !== undefined ? b.sector_sanitario : target.sector_sanitario
      }, redFinal);
      if (amb.error) return bad(res, 400, 'invalid', amb.error);
      changes.establecimiento_id = amb.establecimiento_id;
      changes.sector_sanitario = amb.sector_sanitario;
    }

    if (b.activo !== undefined) {
      if (typeof b.activo !== 'boolean') return bad(res, 400, 'invalid', 'activo debe ser true o false.');
      changes.activo = b.activo;
    }

    if (b.password !== undefined) {
      const passwordError = auth.validatePassword(b.password);
      if (passwordError) return bad(res, 400, 'invalid', passwordError);
      changes.password_hash = await auth.hashPassword(b.password);
    }

    // Siempre debe quedar al menos un ADMIN activo
    const seguiraAdminActivo = newRole === 'ADMIN' && (changes.activo !== undefined ? changes.activo : target.activo !== false);
    if (target.role === 'ADMIN' && target.activo !== false && !seguiraAdminActivo) {
      const otros = db.listUsers().filter(u => u !== target && u.role === 'ADMIN' && u.activo !== false);
      if (otros.length === 0) return bad(res, 409, 'conflict', 'Debe quedar al menos un administrador activo.');
    }

    // Cambiar clave, rol, red o desactivar cierra las sesiones ya emitidas de ese usuario
    if (changes.password_hash || changes.role || changes.red !== undefined || changes.establecimiento_id !== undefined || changes.sector_sanitario !== undefined || changes.activo === false) {
      changes.token_valid_after = Date.now();
    }

    const updated = db.updateUser(target.username, changes);
    const campos = Object.keys(changes).filter(k => k !== 'password_hash' && k !== 'token_valid_after');
    if (changes.password_hash) campos.push('password');
    db.addAuditLog('AUTH', 'USUARIO_MODIFICADO', { username: target.username, campos }, req.auditContext);
    res.json({ success: true, user: auth.publicUser(updated) });
  } catch (err) {
    console.error('Error modificando usuario:', err.message);
    bad(res, 500, 'exception', 'No se pudo modificar el usuario.');
  }
});

module.exports = { publicRouter, privateRouter };
