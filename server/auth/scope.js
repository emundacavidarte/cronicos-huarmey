/**
 * scope.js
 * Alcance por red (T-03a). ADMIN ve y escribe en todas las redes. COORDINADOR y DIRECTOR solo en la suya.
 * La red de un paciente sale de su campo red_salud (si es una de las 7 RIS) o, si no, de la red de su
 * establecimiento (puerta_entrada_id). Un paciente sin red conocida solo lo ve ADMIN.
 * El cotejo de los datos reales con su red se hará después (decisión del usuario, 22/10/2026).
 */

const crypto = require('crypto');
const db = require('../db/database');
const { normalizeRed, sameRed } = require('./redes');

const DEFAULT_ESTABLISHMENT = '00001741';

function normalizarSector(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-').replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isAdmin(user) {
  return !!user && user.role === 'ADMIN';
}

/** Red canónica del paciente o null si no se puede determinar. */
function patientRed(p) {
  if (!p) return null;
  const explicit = normalizeRed(p.red_salud);
  if (explicit) return explicit;
  const code = p.puerta_entrada_id || p.es_puerta_entrada_id || DEFAULT_ESTABLISHMENT;
  const est = db.getEstablishmentById(code);
  return est ? normalizeRed(est.red_salud) : null;
}

function canSeePatient(user, patient) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if (!sameRed(user.red, patientRed(patient))) return false;

  // Ámbito granular por establecimiento/IPRESS si el usuario lo tiene asignado
  if (user.establecimiento_id || user.ipress_id) {
    const userEst = String(user.establecimiento_id || user.ipress_id).trim();
    const pEst = String(patient.puerta_entrada_id || patient.es_puerta_entrada_id || '').trim();
    if (pEst && userEst !== pEst) return false;
  }

  // Ámbito granular por sector sanitario si el usuario lo tiene asignado. Comparación EXACTA (sin tildes,
  // mayúsculas ni diferencias de guion o espacios): "Sector 6" ya no ve "Sector 62" ni "Sector I" ve "Sector II" (F2-12).
  // Un paciente sin sector sigue visible para que se le pueda asignar uno.
  if (user.sector_sanitario || user.sector) {
    const userSec = normalizarSector(user.sector_sanitario || user.sector);
    const pSec = normalizarSector(patient.sector_sanitario || patient.sector || '');
    if (pSec && pSec !== userSec) return false;
  }

  return true;
}

function filterPatients(user, patients) {
  if (!user) return [];
  if (isAdmin(user)) return patients;
  if (!normalizeRed(user.red)) return [];
  return patients.filter(p => canSeePatient(user, p));
}

function filterEstablishments(user, establishments) {
  if (!user) return [];
  if (isAdmin(user)) return establishments;
  if (!normalizeRed(user.red)) return [];
  return establishments.filter(e => sameRed(user.red, e.red_salud));
}

/**
 * ETag distinto por usuario y alcance (rol, red, establecimiento y sector): dos usuarios nunca comparten la misma
 * versión en caché (F2-06; antes solo rol y red, y dos coordinadores de distinto establecimiento recibían 304).
 * Para ADMIN devuelve el ETag base sin cambios.
 */
function etagFor(user, baseEtag) {
  if (isAdmin(user)) return baseEtag;
  const key = user
    ? [user.username || '', user.role, normalizeRed(user.red) || '', user.establecimiento_id || '', user.sector_sanitario || ''].join('|')
    : 'sin-usuario';
  const tag = crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);
  const inner = String(baseEtag).replace(/^W\//, '').replace(/^"|"$/g, '');
  return `W/"${inner}-${tag}"`;
}

// Textos de relleno que upsertPatient NO escribe encima de un dato real (ver PLACEHOLDER_VALUES en db/database.js)
const SECTOR_RELLENO = 'Sector 01 - Centro Urbano';

/**
 * Cómo quedaría el paciente DESPUÉS de guardar: lo ya guardado más los campos de alcance que la escritura trae con valor
 * real (red, establecimiento y sector), igual que upsertPatient (un campo vacío o de relleno no pisa lo guardado).
 * Sirve para comprobar el alcance del resultado y no solo el del registro de partida (P3-13).
 */
function resultanteDeEscritura(existing, incoming) {
  const resultante = Object.assign({}, existing);
  for (const campo of ['red_salud', 'puerta_entrada_id', 'es_puerta_entrada_id', 'sector_sanitario', 'sector']) {
    const v = incoming[campo];
    if (v === null || v === undefined) continue;
    const t = typeof v === 'string' ? v.trim() : v;
    if (t === '' || (campo === 'sector_sanitario' && t === SECTOR_RELLENO)) continue;
    resultante[campo] = v;
  }
  return resultante;
}

function findExistingPatient(p) {
  const dni = p.dni ? String(p.dni).trim() : '';
  return (dni && db.getPatientByDni(dni)) || (p.id ? db.getPatientByIdOrDni(String(p.id).trim()) : null) || null;
}

function refMatchesBatch(ref, batchPatients) {
  const key = String(ref === null || ref === undefined ? '' : ref).trim();
  const m = /^pac-\d+-(.+)$/.exec(key);
  const dniKey = m ? m[1] : key;
  return batchPatients.some(p => String(p.id) === key || (p.dni && (String(p.dni) === dniKey || String(p.dni) === key)));
}

/**
 * Revisa un lote completo ANTES de escribir nada. Devuelve null si el usuario puede escribirlo,
 * o un texto con el motivo del rechazo (la ruta responde 403).
 * `parsedList` es un arreglo de { patients, conditions, appointments, observations, medications }.
 */
function checkWrite(user, parsedList) {
  if (!user) return 'Se requiere iniciar sesión.';
  if (isAdmin(user)) return null;
  if (user.role !== 'COORDINADOR') return `El rol '${user.role}' no puede escribir información.`;
  const userRed = normalizeRed(user.red);
  if (!userRed) return 'Su usuario no tiene una red asignada.';

  const batchPatients = [];
  for (const parsed of parsedList) {
    for (const p of (parsed.patients || [])) batchPatients.push(p);
  }

  for (const p of batchPatients) {
    const incomingRaw = p.red_salud;
    const hasIncoming = incomingRaw !== null && incomingRaw !== undefined && String(incomingRaw).trim() !== '';
    const incoming = hasIncoming ? normalizeRed(incomingRaw) : null;
    if (hasIncoming && !incoming) return 'red_salud del paciente no es una de las 7 RIS de Áncash.';
    if (incoming && incoming !== userRed) return `No puede registrar ni mover pacientes hacia la red ${incoming}.`;

    const puerta = p.puerta_entrada_id === null || p.puerta_entrada_id === undefined ? '' : String(p.puerta_entrada_id).trim();
    if (puerta) {
      const est = db.getEstablishmentById(puerta);
      if (!est || !sameRed(userRed, est.red_salud)) return 'El establecimiento indicado no pertenece a su red.';
    }

    const existing = findExistingPatient(p);
    if (existing) {
      // P3-12 (ACEPTADO): este rechazo revela que el documento ya existe en otra red/establecimiento, mientras que uno
      // inexistente se crea. Es inherente a exigir un documento único por paciente: un guardado no puede crear un
      // duplicado ni responder igual en ambos casos sin romper el registro. La mitigación es el cupo de escrituras por
      // usuario (120/min) y que el mensaje no diga nada del paciente ajeno (ni nombre, ni red, ni establecimiento).
      // La LECTURA sí es indistinguible (404 idéntico, ver pacienteVisible en apiRoutes.js).
      if (!canSeePatient(user, existing)) return 'No puede modificar pacientes fuera de su alcance.';
      // P3-13: tampoco puede dejarlo fuera de su alcance al guardarlo (otro establecimiento o sector del que tiene asignado)
      if (!canSeePatient(user, resultanteDeEscritura(existing, p))) {
        return 'No puede mover al paciente a otro establecimiento o sector: quedaría fuera de su alcance.';
      }
    } else if (patientRed(p) !== userRed) {
      return 'No puede registrar pacientes fuera de su red.';
    } else if (user.establecimiento_id && String(p.puerta_entrada_id || DEFAULT_ESTABLISHMENT).trim() !== String(user.establecimiento_id).trim()) {
      return 'No puede registrar pacientes de otro establecimiento.';
    }
  }

  for (const parsed of parsedList) {
    const children = [].concat(parsed.conditions || [], parsed.appointments || [], parsed.observations || [], parsed.medications || []);
    for (const rec of children) {
      const ref = rec.patient_id;
      const existing = db.getPatientByIdOrDni(db.resolvePatientId(ref));
      if (existing) {
        if (!canSeePatient(user, existing)) return 'No puede modificar información de pacientes de otra red.';
      } else if (!refMatchesBatch(ref, batchPatients)) {
        return 'El registro apunta a un paciente que no existe en su red.';
      }
    }
  }
  return null;
}

module.exports = {
  isAdmin,
  patientRed,
  canSeePatient,
  filterPatients,
  filterEstablishments,
  etagFor,
  checkWrite
};
