// Evidencia Fase 3 (precarga por documento) — utilidades comunes. Solo datos inventados (documentos 96…, 0096…, PE96…, PA96…, ZZ96…)
// y la semilla de 20 pacientes simulados. Las claves llegan por el entorno (ADMIN_PASSWORD, AUTH_SECRET, CLAVE_USUARIOS); no se imprimen.
'use strict';
const crypto = require('crypto');
const BASE = process.env.BASE || 'http://127.0.0.1:3262';
const H = 'Hospital de Apoyo Huarmey (00001741, II-1)';
const LV = 'C. S. La Victoria (00001744, I-3)';

async function api(method, url, token, body, headers) {
  const h = Object.assign({}, headers || {});
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const t0 = process.hrtime.bigint();
  const r = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  let json = null; try { json = JSON.parse(text); } catch (e) { /* no es JSON */ }
  return { status: r.status, json, text, ms, www: r.headers.get('www-authenticate') };
}

// Usuarios de prueba (clave aleatoria por corrida). nombre de usuario -> perfil
const USUARIOS = {
  'f3.coord.ps':  { role: 'COORDINADOR', red: '156', nota: 'COORDINADOR, red PACIFICO SUR, sin establecimiento' },
  'f3.coord.lv':  { role: 'COORDINADOR', red: '156', establecimiento_id: '00001744', nota: 'COORDINADOR, PACIFICO SUR, solo C. S. La Victoria (00001744)' },
  'f3.coord.sec': { role: 'COORDINADOR', red: '156', sector_sanitario: 'Sector 62', nota: 'COORDINADOR, PACIFICO SUR, solo sector "Sector 62" (solo por API)' },
  'f3.coord.pn':  { role: 'COORDINADOR', red: '157', nota: 'COORDINADOR, red PACIFICO NORTE' },
  'f3.dir.ps':    { role: 'DIRECTOR',    red: '156', nota: 'DIRECTOR, PACIFICO SUR' },
  'f3.dir.pn':    { role: 'DIRECTOR',    red: '157', nota: 'DIRECTOR, PACIFICO NORTE' }
};

// Documentos de la prueba: clave -> { doc, tipo, red, nota }. NX* no existen.
const DOCS = {
  H1:   { doc: '10000001',  tipo: 'DNI', nota: 'semilla, PS, Hospital Huarmey, Sector 62' },
  LV1:  { doc: '10000002',  tipo: 'DNI', nota: 'semilla, PS, C. S. La Victoria, Sector 63' },
  LV2:  { doc: '96310005',  tipo: 'DNI', nota: 'inventado, PS, C. S. La Victoria' },
  PN1:  { doc: '96310001',  tipo: 'DNI', nota: 'inventado, red PACIFICO NORTE' },
  PNCE: { doc: '009600021', tipo: 'CE',  nota: 'carné de extranjería, PACIFICO NORTE' },
  PNPA: { doc: 'PE9600022', tipo: 'PAS', nota: 'pasaporte, PACIFICO NORTE' },
  PSCE: { doc: '009600031', tipo: 'CE',  nota: 'carné de extranjería, PS, Hospital' },
  PSPA: { doc: 'PA9600032', tipo: 'PAS', nota: 'pasaporte, PS, Hospital' },
  NX:   { doc: '96999999',  tipo: 'DNI', nota: 'NO existe' },
  NXCE: { doc: '009699999', tipo: 'CE',  nota: 'NO existe' },
  NXPA: { doc: 'ZZ9699999', tipo: 'PAS', nota: 'NO existe' }
};
const EXISTEN = ['H1', 'LV1', 'LV2', 'PN1', 'PNCE', 'PNPA', 'PSCE', 'PSPA'];
const INEXISTENTES = ['NX', 'NXCE', 'NXPA'];
// Lo que el código de scope.js debería dejar ver a cada usuario (lectura del código; la prueba lo contrasta)
const VISIBLES = {
  'admin':        ['H1', 'LV1', 'LV2', 'PN1', 'PNCE', 'PNPA', 'PSCE', 'PSPA'],
  'f3.coord.ps':  ['H1', 'LV1', 'LV2', 'PSCE', 'PSPA'],
  'f3.coord.lv':  ['LV1', 'LV2'],
  'f3.coord.sec': ['H1'],
  'f3.coord.pn':  ['PN1', 'PNCE', 'PNPA'],
  'f3.dir.ps':    [],
  'f3.dir.pn':    []
};

function fila(doc, tipo, nombre, extra) {
  return Object.assign({
    tipo_documento: tipo === 'CE' ? 'Carné de extranjería' : tipo === 'PAS' ? 'Pasaporte' : 'DNI',
    dni: doc, apellidos_nombres: nombre, sexo: 'Masculino', fecha_nacimiento: '1960-05-10', seguro_salud: 'EsSalud',
    sector: 'Sector I – Centro', sector_sanitario: 'Sector I – Centro', direccion: 'Jr. Bolognesi 250 Huarmey',
    establecimiento_adscripcion: H, establecimiento_control: H, consentimiento: 'No', estado_paciente: 'Activo',
    tratamiento_hta: 'Losartán 50 mg c/24h', meses_medicacion: '2', estatina: 'No', aspirina_aas: 'No indicado',
    conditions: [{ cie10_cod: 'I10', diagnostico: 'Hipertensión Arterial' }],
    observations: [{ fecha_registro: '2026-10-20', pa_sistolica: 150, pa_diastolica: 95, estado_control: 'No Controlado' }],
    appointments: [{ fecha_cita: '2026-11-25', estado: 'booked' }]
  }, extra || {});
}

/** Pacientes inventados que se siembran (como ADMIN) además de la semilla. */
function pacientesDePrueba() {
  const PN = { red_salud: 'PACIFICO NORTE', establecimiento_adscripcion: undefined, establecimiento_control: undefined, sector_sanitario: 'Sector Norte 1', sector: undefined };
  return [
    fila('96310001', 'DNI', 'PACIENTE INVENTADO NORTE UNO', PN),
    fila('009600021', 'CE', 'PACIENTE INVENTADO NORTE CARNE', PN),
    fila('PE9600022', 'PAS', 'PACIENTE INVENTADO NORTE PASAPORTE', PN),
    fila('009600031', 'CE', 'PACIENTE INVENTADO SUR CARNE', {}),
    fila('PA9600032', 'PAS', 'PACIENTE INVENTADO SUR PASAPORTE', {}),
    fila('96310006', 'DNI', 'PACIENTE INVENTADO SECTOR 62', { sector: 'Sector I – Centro', sector_sanitario: 'Sector 62' }),
    fila('96310007', 'DNI', 'PACIENTE INVENTADO REASIGNAR', {}),
    fila('96310005', 'DNI', 'PACIENTE INVENTADO LA VICTORIA DOS', { establecimiento_adscripcion: LV, establecimiento_control: LV, sector: 'Sector II – La Victoria', sector_sanitario: 'Sector II – La Victoria' }),
    // Datos incompletos: sin sexo, seguro, sector, teléfono, historia, diagnósticos, medicación, controles ni citas
    { dni: '96400001', apellidos_nombres: 'PACIENTE INVENTADO INCOMPLETO SUR', fecha_nacimiento: '1958-03-03', direccion: 'Jr. Prueba 100 Huarmey', establecimiento_control: H },
    { dni: '96400003', apellidos_nombres: 'PACIENTE INVENTADO INCOMPLETO NORTE', fecha_nacimiento: '1957-07-07', direccion: 'Jr. Prueba 200', red_salud: 'PACIFICO NORTE' },
    { dni: '96400007', apellidos_nombres: 'PACIENTE INVENTADO INCOMPLETO TRES', fecha_nacimiento: '1959-09-09', direccion: 'Jr. Prueba 400 Huarmey', establecimiento_control: H },
    fila('96400005', 'DNI', 'PACIENTE INVENTADO CON INFARTO PREVIO', {
      conditions: [{ cie10_cod: 'I10', diagnostico: 'Hipertensión Arterial' }, { cie10_cod: 'I25.2', diagnostico: 'Infarto antiguo de miocardio' }]
    }),
    fila('96400009', 'DNI', 'PACIENTE INVENTADO DIAGNOSTICO ANTIGUO', {
      fecha_captacion: '2019-03-01',
      conditions: [{ cie10_cod: 'I10', diagnostico: 'Hipertensión Arterial' }, { cie10_cod: 'E10', diagnostico: 'Diabetes mellitus tipo 1' }]
    }),
    // Dos controles en orden cronológico (el más antiguo primero), como llegan de un lote o de HOSIX
    fila('96400004', 'DNI', 'PACIENTE INVENTADO DOS CONTROLES', {
      observations: [
        { fecha_registro: '2026-06-01', pa_sistolica: 150, pa_diastolica: 95, estado_control: 'No Controlado' },
        { fecha_registro: '2026-10-01', pa_sistolica: 118, pa_diastolica: 74, estado_control: 'Controlado' }
      ]
    })
  ];
}

/** Crea usuarios y pacientes de prueba (idempotente). Devuelve el token del ADMIN. */
async function preparar() {
  const lg = await api('POST', '/api/auth/login', null, { username: 'admin', password: process.env.ADMIN_PASSWORD });
  if (lg.status !== 200) throw new Error('No se pudo iniciar sesión como ADMIN (código ' + lg.status + ').');
  const A = lg.json.token;
  for (const [username, p] of Object.entries(USUARIOS)) {
    const body = { username, nombre: 'Usuario de prueba ' + username, correo: username.replace(/\./g, '-') + '@prueba.example', role: p.role, red: p.red, password: process.env.CLAVE_USUARIOS };
    if (p.establecimiento_id) body.establecimiento_id = p.establecimiento_id;
    if (p.sector_sanitario) body.sector_sanitario = p.sector_sanitario;
    const r = await api('POST', '/api/users', A, body);
    if (r.status !== 201 && r.status !== 409) throw new Error('No se pudo crear ' + username + ' (código ' + r.status + ' ' + r.text.slice(0, 120) + ').');
  }
  const imp = await api('POST', '/api/padron/importar-lote', A, { patients: pacientesDePrueba() });
  if (imp.status !== 200) throw new Error('No se pudieron sembrar los pacientes de prueba (código ' + imp.status + ' ' + imp.text.slice(0, 200) + ').');
  return A;
}

async function loginUsuario(username) {
  const r = await api('POST', '/api/auth/login', null, { username, password: process.env.CLAVE_USUARIOS });
  if (r.status !== 200) throw new Error('login de ' + username + ' falló (' + r.status + ')');
  return r.json.token;
}

/** Token firmado con un secreto dado (formato del servidor: base64url(payload).base64url(HMAC-SHA256)). */
function firmarToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

const resumen = (t, n = 110) => String(t === undefined || t === null ? '' : t).replace(/\s+/g, ' ').slice(0, n);
const mediana = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { BASE, H, LV, api, USUARIOS, DOCS, EXISTEN, INEXISTENTES, VISIBLES, fila, pacientesDePrueba, preparar, loginUsuario, firmarToken, resumen, mediana, pct, sleep };
