/**
 * memoryDb.js
 * Helper de pruebas: carga server/db/database.js totalmente en memoria.
 * Bloquea cualquier lectura/escritura de store.json y de client/js/data para que
 * las pruebas jamás lean ni modifiquen datos reales.
 */

const fs = require('fs');
const fsp = fs.promises;

function isBlocked(p) {
  const s = String(p).replace(/\\/g, '/');
  return s.includes('store.json') || s.includes('padron_inicial') || s.includes('client/js/data');
}

const originalExistsSync = fs.existsSync;
const originalWriteFileSync = fs.writeFileSync;
const originalReadFileSync = fs.readFileSync;
const originalWriteFile = fsp.writeFile;
const originalRename = fsp.rename;

fs.existsSync = (p, ...rest) => (isBlocked(p) ? false : originalExistsSync.call(fs, p, ...rest));
fs.readFileSync = (p, ...rest) => {
  if (isBlocked(p)) throw new Error('Lectura bloqueada en pruebas: ' + p);
  return originalReadFileSync.call(fs, p, ...rest);
};
fs.writeFileSync = (p, ...rest) => (isBlocked(p) ? undefined : originalWriteFileSync.call(fs, p, ...rest));
fsp.writeFile = async (p, ...rest) => (isBlocked(p) ? undefined : originalWriteFile.call(fsp, p, ...rest));
fsp.rename = async (from, to, ...rest) => (isBlocked(to) || isBlocked(from) ? undefined : originalRename.call(fsp, from, to, ...rest));

const db = require('../../db/database');

/** Vacía la base en memoria para que cada caso de prueba parta de cero. */
function resetDb() {
  db.data.patients = [];
  db.data.conditions = [];
  db.data.appointments = [];
  db.data.observations = [];
  db.data.medications = [];
  db.data.users = [];
  db.data.audit_logs = [];
  db.rebuildIndexes();
}

/** Cancela el guardado diferido pendiente (no se escribe nada a disco). */
function closeDb() {
  if (db._saveTimer) {
    clearTimeout(db._saveTimer);
    db._saveTimer = null;
  }
}

module.exports = { db, resetDb, closeDb };
