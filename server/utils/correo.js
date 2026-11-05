/**
 * correo.js
 * Envío de correos (recuperación de contraseña) por un proveedor con API HTTPS, sin dependencias nuevas.
 *
 *   MAIL_PROVIDER = resend | brevo | consola      (consola: solo fuera de producción; imprime el correo en el registro)
 *   MAIL_API_KEY  = clave del proveedor
 *   MAIL_FROM     = remitente, por ejemplo «Crónicos Huarmey <no-responder@su-dominio.pe>» (dominio verificado en el proveedor)
 *   MAIL_API_URL  = (opcional) otra dirección de la API; se usa en las pruebas
 *
 * Sin proveedor configurado, la recuperación por correo queda desactivada (el ADMIN restablece la clave).
 */

const PROVEEDORES = ['resend', 'brevo', 'consola'];
const URL_POR_DEFECTO = {
  resend: 'https://api.resend.com/emails',
  brevo: 'https://api.brevo.com/v3/smtp/email'
};

function config(env = process.env) {
  const proveedor = (env.MAIL_PROVIDER || '').trim().toLowerCase();
  return {
    proveedor,
    clave: (env.MAIL_API_KEY || '').trim(),
    remitente: (env.MAIL_FROM || '').trim(),
    url: (env.MAIL_API_URL || '').trim() || URL_POR_DEFECTO[proveedor] || '',
    produccion: env.NODE_ENV === 'production'
  };
}

/** Errores de configuración (para no arrancar en producción con un proveedor mal puesto). Lista vacía si está bien. */
function problemasDeConfig(env = process.env) {
  const c = config(env);
  if (!c.proveedor) return [];
  const p = [];
  if (!PROVEEDORES.includes(c.proveedor)) p.push(`MAIL_PROVIDER debe ser uno de: ${PROVEEDORES.join(', ')}.`);
  if (c.proveedor === 'consola' && c.produccion) p.push('MAIL_PROVIDER=consola no se permite en producción (el código quedaría en el registro).');
  if (c.proveedor === 'resend' || c.proveedor === 'brevo') {
    if (!c.clave) p.push('MAIL_API_KEY es obligatoria con MAIL_PROVIDER.');
    if (!parseRemitente(c.remitente)) p.push('MAIL_FROM debe ser un correo, por ejemplo «Crónicos Huarmey <no-responder@su-dominio.pe>».');
  }
  return p;
}

function configurado(env = process.env) {
  const c = config(env);
  return !!c.proveedor && problemasDeConfig(env).length === 0;
}

function parseRemitente(texto) {
  const m = /^\s*(?:"?([^"<]*)"?\s*)?<([^<>\s@]+@[^<>\s@]+)>\s*$/.exec(texto || '') || /^\s*()([^<>\s@]+@[^<>\s@]+)\s*$/.exec(texto || '');
  return m ? { nombre: (m[1] || '').trim(), correo: m[2] } : null;
}

/** Envía un correo de texto (y HTML simple). Devuelve una promesa; lanza un error si el proveedor responde con falla. */
async function enviar({ para, asunto, texto, html }, env = process.env) {
  const c = config(env);
  if (!configurado(env)) throw new Error('El envío de correos no está configurado.');
  if (c.proveedor === 'consola') {
    console.log(`[CORREO de prueba, solo desarrollo] Para: ${para} · Asunto: ${asunto}\n${texto}`);
    return;
  }
  const rem = parseRemitente(c.remitente);
  let headers;
  let cuerpo;
  if (c.proveedor === 'resend') {
    headers = { Authorization: `Bearer ${c.clave}`, 'Content-Type': 'application/json' };
    cuerpo = { from: c.remitente, to: [para], subject: asunto, text: texto, html };
  } else {
    headers = { 'api-key': c.clave, 'Content-Type': 'application/json', Accept: 'application/json' };
    cuerpo = { sender: { email: rem.correo, name: rem.nombre || undefined }, to: [{ email: para }], subject: asunto, textContent: texto, htmlContent: html };
  }
  const res = await fetch(c.url, { method: 'POST', headers, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`El proveedor de correo respondió ${res.status}.`);
}

module.exports = { config, configurado, problemasDeConfig, enviar, parseRemitente };
