/**
 * config.js
 * Revisión de la configuración de producción (S-01, S-16). No carga la base de datos: server.js la ejecuta
 * ANTES de abrir store.json, y si falla el servidor termina con un mensaje de una línea.
 */

// Valores que estuvieron publicados en .env.example (siguen en el historial de Git): en producción no se aceptan
const SECRETOS_PUBLICADOS = ['clave-secreta-produccion-minimo-32-caracteres-huarmey-2026'];
const CLAVES_PUBLICADAS = ['Huarmey2026*Seguro'];
const MARCADOR_EJEMPLO = /CAMBIAR/i;

/**
 * Con NODE_ENV=production no se arranca con secretos débiles o de ejemplo:
 * AUTH_SECRET de al menos 32 caracteres, con al menos 10 caracteres distintos, que no sea el publicado
 * en .env.example ni un marcador «CAMBIAR…»; ADMIN_PASSWORD (si está) tampoco puede ser la publicada ni un marcador.
 */
function checkConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const secret = env.AUTH_SECRET || '';
  if (secret.length < 32) {
    throw new Error('AUTH_SECRET es obligatorio en producción y debe tener al menos 32 caracteres.');
  }
  if (SECRETOS_PUBLICADOS.includes(secret) || MARCADOR_EJEMPLO.test(secret)) {
    throw new Error('AUTH_SECRET es el valor de ejemplo del repositorio: genere uno aleatorio (por ejemplo, openssl rand -hex 32).');
  }
  if (new Set(secret).size < 10) {
    throw new Error('AUTH_SECRET es demasiado repetitivo: genere uno aleatorio (por ejemplo, openssl rand -hex 32).');
  }
  const adminPassword = env.ADMIN_PASSWORD || '';
  if (adminPassword && (CLAVES_PUBLICADAS.includes(adminPassword) || MARCADOR_EJEMPLO.test(adminPassword))) {
    throw new Error('ADMIN_PASSWORD es el valor de ejemplo del repositorio: use una clave propia.');
  }
}

module.exports = { checkConfig };
