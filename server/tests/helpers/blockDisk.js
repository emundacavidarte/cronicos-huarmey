/**
 * blockDisk.js
 * Archivo de precarga (node --require) para arrancar el servidor real en pruebas HTTP.
 * Bloquea cualquier lectura/escritura de store.json y de client/js/data:
 * la base arranca vacia y todo queda solo en memoria.
 */

const fs = require('fs');
const fsp = fs.promises;

function isBlocked(p) {
  const s = String(p).replace(/\\/g, '/');
  return s.includes('store.json') || s.includes('padron_inicial') || s.includes('client/js/data');
}

const originalExistsSync = fs.existsSync;
const originalReadFileSync = fs.readFileSync;
const originalWriteFileSync = fs.writeFileSync;
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
