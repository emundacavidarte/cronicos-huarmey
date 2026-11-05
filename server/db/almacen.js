/**
 * almacen.js
 * Formato en disco de store.json (Fase 4): texto JSON compacto o, si se define STORE_KEY, cifrado con AES-256-GCM.
 *
 *   Sin STORE_KEY  → store.json es el JSON de los datos (como antes, pero siempre compacto: S-14).
 *   Con STORE_KEY  → store.json es {"formato":"cronicos-cifrado-v1","alg":"aes-256-gcm","iv","tag","datos"} (base64).
 *
 * STORE_KEY: 32 bytes aleatorios en hexadecimal (64 caracteres) o en base64 (openssl rand -hex 32).
 * Es OPCIONAL: quien la active debe custodiarla fuera del servidor. Si se pierde, el padrón cifrado NO se puede leer.
 * Un archivo sin cifrar se lee igual y se cifra en el siguiente guardado (migración sin pasos manuales).
 */

const crypto = require('crypto');

const FORMATO = 'cronicos-cifrado-v1';

/** Clave de STORE_KEY o null si no está definida. Lanza un error claro si el valor no sirve. */
function claveDesdeEntorno(env = process.env) {
  const v = (env.STORE_KEY || '').trim();
  if (!v) return null;
  let clave = null;
  if (/^[0-9a-fA-F]{64}$/.test(v)) clave = Buffer.from(v, 'hex');
  else if (/^[A-Za-z0-9+/]{43}=?$/.test(v)) clave = Buffer.from(v, 'base64');
  if (!clave || clave.length !== 32) {
    throw new Error('STORE_KEY debe tener 32 bytes aleatorios en hexadecimal (64 caracteres) o en base64; genérela con openssl rand -hex 32.');
  }
  return clave;
}

function serializar(datos, clave) {
  const texto = JSON.stringify(datos);
  if (!clave) return texto;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave, iv);
  const cifrado = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return JSON.stringify({ formato: FORMATO, alg: 'aes-256-gcm', iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), datos: cifrado.toString('base64') });
}

function esCifrado(obj) {
  return !!obj && typeof obj === 'object' && obj.formato === FORMATO;
}

/** Convierte el texto de store.json en los datos. Lanza un error si está cifrado y no hay clave o la clave no corresponde. */
function deserializar(texto, clave) {
  const obj = JSON.parse(texto);
  if (!esCifrado(obj)) return obj;
  if (!clave) {
    const e = new Error('store.json está cifrado y STORE_KEY no está definida: sin la clave no se pueden leer los datos.');
    e.code = 'SIN_CLAVE';
    throw e;
  }
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', clave, Buffer.from(obj.iv, 'base64'));
    d.setAuthTag(Buffer.from(obj.tag, 'base64'));
    const plano = Buffer.concat([d.update(Buffer.from(obj.datos, 'base64')), d.final()]).toString('utf8');
    return JSON.parse(plano);
  } catch (err) {
    const e = new Error('STORE_KEY no corresponde a store.json (o el archivo fue alterado): no se pudo descifrar.');
    e.code = 'CLAVE_INCORRECTA';
    throw e;
  }
}

module.exports = { FORMATO, claveDesdeEntorno, serializar, deserializar, esCifrado };
