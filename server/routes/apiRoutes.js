/**
 * apiRoutes.js
 * Endpoints REST para el seguimiento territorial e interoperabilidad HL7 FHIR R4
 * Conectores integrados: HOSIX (SIVSA), Galenos (MINSA), Pakamuros Soft (HCE MINSA)
 * Preparado con Hooks de Seguridad Fase 2 (RBAC / OAuth2-JWT / Auditoría Ley N° 29733)
 */

const express = require('express');
const crypto = require('crypto');
// Dos enrutadores (S-11): `router` se monta en /api y `fhirRouter` en /fhir. Antes el mismo router iba en los dos
// prefijos y además declaraba rutas con prefijo propio, de modo que /api/api/cronicos o /fhir/fhir/Bundle respondían 200.
const router = express.Router();
const fhirRouter = express.Router();
const db = require('../db/database');
const fhirAdapter = require('../fhir/fhirAdapter');
const hosixConnector = require('../fhir/connectors/hosixConnector');
const galenosConnector = require('../fhir/connectors/galenosConnector');
const pakamurosConnector = require('../fhir/connectors/pakamurosConnector');
const { getLatestAppointment, getLatestObservation } = require('../utils/latestRecord');
const semaforoHearts = require('../../client/js/clinical/semaforo');
const indicadoresConvenio = require('../../client/js/clinical/indicadoresConvenio');
const auth = require('../auth/auth');
const fechaLima = require('../../client/js/utils/fechaLima');
const scope = require('../auth/scope');
const { sameRed, normalizeRed } = require('../auth/redes');
const validacion = require('../utils/validacion');

/**
 * Autorización (T-03a). server.js ya exige sesión (auth.authenticate) en /api y /fhir;
 * aquí cada ruta indica qué roles puede usarla y el alcance por red se aplica con auth/scope.js.
 *   ADMIN: todo.  COORDINADOR: leer y escribir información de SU red.  DIRECTOR: solo el dashboard (agregados) de SU red.
 */
const { requireScope } = auth;
const ROLES_DASHBOARD = ['ADMIN', 'COORDINADOR', 'DIRECTOR'];
const ROLES_PACIENTES = ['ADMIN', 'COORDINADOR'];
const ROLES_ESCRITURA = ['ADMIN', 'COORDINADOR'];

function forbidden(res, diagnostics) {
  return res.status(403).json(auth.outcome('forbidden', diagnostics));
}

const MSG_NO_ENCONTRADO = 'Paciente no encontrado';
/** Un paciente fuera del alcance responde igual que uno inexistente: no se revela que existe en otra red (F2-04). */
function noEncontrado(res) {
  return res.status(404).json({ error: MSG_NO_ENCONTRADO });
}

/** Busca un paciente por id o DNI y lo devuelve solo si el usuario puede verlo. */
function pacienteVisible(req, ref) {
  const key = typeof ref === 'string' || typeof ref === 'number' ? String(ref).trim().slice(0, 64) : '';
  if (!key) return null;
  const patient = db.getPatientByIdOrDni(db.resolvePatientId(key));
  return patient && scope.canSeePatient(req.user, patient) ? patient : null;
}

/**
 * Respuesta 400 a un contenido inválido. Los mensajes de validación son propios y se muestran; cualquier otro
 * error (por ejemplo, un TypeError por un tipo inesperado) se responde con un texto genérico (F2-10).
 */
function invalido(res, err, code = 'invalid') {
  const diagnostics = err && err.expose ? err.message : 'El contenido enviado no tiene la estructura esperada.';
  return res.status(400).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code, diagnostics }] });
}

/** ETag propio de cada usuario y alcance; datos de pacientes: nunca se guardan en la caché del navegador (F2-06). */
function setScopedEtag(req, res) {
  const etag = scope.etagFor(req.user, db.getETag());
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'private, no-store');
  return etag;
}

// --- Bitácora de lecturas de datos de pacientes (F2-13): quién consultó qué, una entrada por usuario, recurso y hora ---
const LECTURA_VENTANA_MS = 60 * 60 * 1000;
const ultimasLecturas = new Map();
function auditarLectura(req, recurso, patientId) {
  if (!req.user) return;
  const clave = `${req.user.username}|${recurso}|${patientId || ''}`;
  const ahora = Date.now();
  const previa = ultimasLecturas.get(clave);
  if (previa && ahora - previa < LECTURA_VENTANA_MS) return;
  ultimasLecturas.set(clave, ahora);
  if (ultimasLecturas.size > 50000) {
    for (const [k, t] of ultimasLecturas) if (ahora - t >= LECTURA_VENTANA_MS) ultimasLecturas.delete(k);
  }
  const payload = patientId ? { recurso, patient_id: patientId } : { recurso };
  db.addAuditLog('SISTEMA_LOCAL', patientId ? 'LECTURA_PACIENTE' : 'LECTURA_PACIENTES', payload, req.auditContext);
}

/** Lista de ids para la bitácora (hasta 200): una importación deja rastro de qué pacientes tocó (F2-13). */
function idsParaBitacora(ids) {
  return ids.length > 200 ? { pacientes: ids.slice(0, 200), pacientes_omitidos: ids.length - 200 } : { pacientes: ids };
}

/** Quién y cuándo modificó el registro: lo fija el servidor con la sesión, nunca el cliente (F2-11). */
function marcarModificacion(p, req) {
  p.ultima_modificacion_por = req.user.username;
  p.ultima_modificacion_fecha = new Date().toISOString();
}

/**
 * Helper de paginación y filtrado opcional (retrocompatible al 100% con clientes que esperan el array completo)
 */
function filterAndPaginatePatients(patients, query) {
  let result = patients;

  if (query.sector && query.sector !== 'ALL') {
    result = result.filter(p => p.sector_sanitario === query.sector);
  }
  if (query.semaforo && query.semaforo !== 'ALL') {
    result = result.filter(p => p.semaforo === query.semaforo);
  }
  if (query.condicion && query.condicion !== 'ALL') {
    result = result.filter(p => (p.tipo_condicion || '').includes(query.condicion));
  }
  if (query.q) {
    const q = String(query.q).trim().toLowerCase();
    result = result.filter(p =>
      String(p.dni || '').toLowerCase().includes(q) ||
      String(p.historia_clinica || '').toLowerCase().includes(q) ||
      String(p.apellidos_nombres || '').toLowerCase().includes(q) ||
      String(p.direccion || '').toLowerCase().includes(q)
    );
  }

  const page = parseInt(query.page, 10);
  const limit = parseInt(query.limit || query._count, 10);
  if (!isNaN(page) && page > 0 && !isNaN(limit) && limit > 0) {
    const safeLimit = Math.min(limit, 1000);
    const offset = (page - 1) * safeLimit;
    return {
      paginated: true,
      total: result.length,
      page,
      limit: safeLimit,
      data: result.slice(offset, offset + safeLimit)
    };
  }

  return {
    paginated: false,
    total: result.length,
    data: result
  };
}

// --- 1. Endpoints de Establecimientos de Salud GeoRIS ---
router.get('/establishments', requireScope(ROLES_DASHBOARD), (req, res) => {
  const est = scope.filterEstablishments(req.user, db.getEstablishments());
  res.json({ success: true, count: est.length, data: est });
});

// --- 2. Endpoints de Pacientes y GeoJSON Territorial (O(1) Cache + ETag) ---
router.get('/patients', requireScope(ROLES_PACIENTES), (req, res) => {
  const etag = setScopedEtag(req, res);
  if (req.headers['if-none-match'] === etag && !Object.keys(req.query).length) {
    return res.status(304).end();
  }

  const patients = scope.filterPatients(req.user, db.getAllPatients());
  const filtered = filterAndPaginatePatients(patients, req.query);
  auditarLectura(req, 'patients');
  res.json({
    success: true,
    count: filtered.data.length,
    total: filtered.total,
    page: filtered.page || 1,
    data: filtered.data
  });
});

router.get('/cronicos', requireScope(ROLES_PACIENTES), (req, res) => {
  const etag = setScopedEtag(req, res);
  if (req.headers['if-none-match'] === etag && !Object.keys(req.query).length) {
    return res.status(304).end();
  }

  const patients = scope.filterPatients(req.user, db.getAllPatients());
  const filtered = filterAndPaginatePatients(patients, req.query);
  auditarLectura(req, 'cronicos');
  if (filtered.paginated) {
    return res.json(filtered);
  }
  res.json(filtered.data);
});

router.get('/patients/geo', requireScope(ROLES_PACIENTES), (req, res) => {
  const etag = setScopedEtag(req, res);
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  const patients = scope.filterPatients(req.user, db.getAllPatients());
  auditarLectura(req, 'patients/geo');
  const hoy = new Date();
  const features = patients
    .filter(p => p.latitud !== null && p.latitud !== undefined && p.longitud !== null && p.longitud !== undefined)
    .map(p => {
      const latestAppt = getLatestAppointment(p.appointments);
      const latestObs = getLatestObservation(p.observations);

      let diasFrecuencia = 30;
      if (latestObs && latestObs.estado_control === 'Controlado') {
        diasFrecuencia = 90;
      }

      // Única fuente de verdad del semáforo (client/js/clinical/semaforo.js): fechas locales, fallecidos aparte
      const sem = semaforoHearts.calcularSemaforo(p, hoy);
      const semaforo = sem.semaforo;
      const diasRestantes = sem.dias_restantes;
      const diasVencido = sem.dias_vencido;

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [p.longitud, p.latitud]
        },
        properties: {
          id: p.id,
          dni: p.dni,
          historia_clinica: p.historia_clinica,
          apellidos_nombres: p.apellidos_nombres,
          telefono: p.telefono,
          direccion: p.direccion,
          sector_sanitario: p.sector_sanitario,
          puerta_entrada: p.puerta_entrada,
          diagnosticos: (p.conditions || []).map(c => c.cie10_cod),
          estado_control: latestObs ? latestObs.estado_control : (p.estado_control || 'No Registrado'),
          frecuencia_hearts: p.frecuencia_hearts !== undefined ? p.frecuencia_hearts : diasFrecuencia,
          semaforo,
          dias_restantes: diasRestantes,
          dias_vencido: diasVencido
        }
      };
    });

  res.json({
    type: 'FeatureCollection',
    features
  });
});

// --- 3. Endpoints Clínicos de Resumen de Alertas HEARTS ---
router.get('/alerts/summary', requireScope(ROLES_DASHBOARD), (req, res) => {
  const patients = scope.filterPatients(req.user, db.getAllPatients());
  const hoy = new Date();
  let green = 0;
  let yellow = 0;
  let red = 0;
  let purple = 0;
  let gray = 0;
  let black = 0;
  const dniUnicos = new Set();

  for (let i = 0; i < patients.length; i++) {
    const p = patients[i];
    if (p.dni) dniUnicos.add(String(p.dni).trim());
    // Misma función que /patients/geo y que el cliente: ya no depende del semáforo guardado
    const s = semaforoHearts.calcularSemaforo(p, hoy).semaforo;
    if (s === 'purple') purple++;
    else if (s === 'black') black++;
    else if (s === 'green') green++;
    else if (s === 'yellow') yellow++;
    else if (s === 'red') red++;
    else gray++;
  }

  res.json({
    total_pacientes: patients.length,
    personas_unicas_dni: dniUnicos.size,
    padron_dnt: patients.length - purple,
    hosix_brecha: purple,
    fallecidos: black,
    alertas: {
      vigentes_verde: green,
      proximos_amarillo: yellow,
      desertores_rojo: red,
      hosix_brecha_morado: purple,
      fallecidos_negro: black,
      sin_cita_gris: gray
    }
  });
});

// --- 4. Disparador de Pre-citas para HOSIX / Galenos / Pakamuros ---
router.post('/appointments/pre-cita', requireScope(ROLES_ESCRITURA), (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { patient_id, fecha_sugerida, comentario } = body;
  const cleanPatientId = typeof patient_id === 'string' || typeof patient_id === 'number' ? String(patient_id).trim() : '';
  if (!cleanPatientId || cleanPatientId.length > 64) {
    return res.status(400).json({ error: 'patient_id válido es requerido' });
  }
  if (fecha_sugerida !== undefined && fecha_sugerida !== null && fecha_sugerida !== '' && !fechaLima.esFechaReal(fecha_sugerida)) {
    return res.status(400).json({ error: 'fecha_sugerida debe ser una fecha real AAAA-MM-DD' });
  }
  if (comentario !== undefined && comentario !== null && typeof comentario !== 'string') {
    return res.status(400).json({ error: 'comentario debe ser texto' });
  }
  // El paciente debe existir y estar en el alcance del usuario; si no, 404 igual que inexistente (S-05, F2-04)
  const patient = pacienteVisible(req, cleanPatientId);
  if (!patient) return noEncontrado(res);

  const safeDate = fecha_sugerida ? String(fecha_sugerida) : fechaLima.hoy();
  const safeComment = comentario
    ? comentario.slice(0, 500)
    : 'Pre-cita generada por motor territorial de crónicos para Admisión hospitalaria';

  const apptId = `precita-${crypto.randomUUID()}`;
  const apptData = {
    id: apptId,
    patient_id: String(patient.id),
    fecha_cita: safeDate,
    estado: 'proposed',
    frecuencia_dias: 30,
    es_precita: 1,
    comentarios: safeComment
  };

  const denied = scope.checkWrite(req.user, [{ patients: [], appointments: [apptData] }]);
  if (denied) return forbidden(res, denied);

  db.upsertAppointment(apptData);
  // Sin el comentario: el cliente escribe ahí el nombre y el DNI del paciente (la bitácora guarda solo referencias)
  db.addAuditLog('SISTEMA_LOCAL', 'PRE_CITA_GENERADA', { id: apptData.id, patient_id: apptData.patient_id, fecha_cita: apptData.fecha_cita }, req.auditContext);

  res.json({
    success: true,
    message: 'Pre-cita generada exitosamente. Lista para confirmación en Admisión.',
    data: apptData
  });
});

// --- 5. Interoperabilidad Nativa HL7 FHIR Release 4 ---
// --- Indicadores del convenio SIS y de HEARTS (A8): IP02, IP03, IP04, control, cobertura y telemonitoreo ---
router.get('/indicadores/convenio', requireScope(ROLES_DASHBOARD), (req, res) => {
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  const q = req.query || {};
  const periodo = { ...indicadoresConvenio.PERIODO_2026 };
  if (q.desde !== undefined || q.hasta !== undefined) {
    if (typeof q.desde !== 'string' || typeof q.hasta !== 'string' || !fechaLima.esFechaReal(q.desde) || !fechaLima.esFechaReal(q.hasta) || q.desde > q.hasta) {
      return res.status(400).json({ error: 'desde y hasta deben tener formato AAAA-MM-DD y desde no puede ser posterior a hasta' });
    }
    periodo.desde = String(q.desde);
    periodo.hasta = String(q.hasta);
  }
  const esperados = {};
  for (const [clave, param] of [['hta', 'esperados_hta'], ['dm', 'esperados_dm']]) {
    if (q[param] === undefined) continue;
    const n = Number(q[param]);
    if (!Number.isInteger(n) || n <= 0 || n > 1000000) return res.status(400).json({ error: `${param} debe ser un entero positivo` });
    esperados[clave] = n;
  }

  const pacientes = scope.filterPatients(req.user, db.getAllPatients()).map(p => ({
    ...p,
    _eventos: db.getTimeline(p.id).map(e => ({ tipo: e.tipo, fecha: e.fecha }))
  }));
  const categoriaDe = p => {
    const est = db.getEstablishmentById(p.puerta_entrada_id);
    return est ? est.categoria : null;
  };
  const resultado = indicadoresConvenio.calcular(pacientes, { periodo, esperados, categoriaDe });
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ success: true, ...resultado });
});

// --- Consentimiento para recordatorios por WhatsApp (A12, Ley N° 29733) ---
router.put('/patients/:id/consentimiento', requireScope(ROLES_ESCRITURA), (req, res) => {
  const patient = pacienteVisible(req, req.params.id);
  if (!patient) return noEncontrado(res);
  const denied = scope.checkWrite(req.user, [{ patients: [], observations: [{ patient_id: patient.id }] }]);
  if (denied) return forbidden(res, denied);
  const result = db.setConsentimiento(patient.id, (req.body && typeof req.body === 'object' ? req.body : {}).consentimiento, { username: req.user.username, role: req.user.role });
  if (!result.ok) return res.status(400).json({ error: result.error });
  db.addAuditLog('SISTEMA_LOCAL', 'CONSENTIMIENTO_REGISTRADO', { patient_id: patient.id, consentimiento: result.patient.consentimiento }, req.auditContext);
  res.json({
    success: true,
    data: {
      patient_id: patient.id,
      consentimiento: result.patient.consentimiento,
      consentimiento_fecha: result.patient.consentimiento_fecha,
      consentimiento_registrado_por: result.patient.consentimiento_registrado_por
    }
  });
});

// --- Línea de tiempo del paciente (A11): controles, citas, referencias, cambios de establecimiento ---
router.get('/patients/:id/eventos', requireScope(ROLES_PACIENTES), (req, res) => {
  const patient = pacienteVisible(req, req.params.id);
  if (!patient) return noEncontrado(res);
  auditarLectura(req, 'patients/eventos', String(patient.id));
  const eventos = db.getTimeline(patient.id).map(e => {
    const est = e.establecimiento_id ? db.getEstablishmentById(e.establecimiento_id) : null;
    const dest = e.destino_establecimiento_id ? db.getEstablishmentById(e.destino_establecimiento_id) : null;
    return {
      ...e,
      establecimiento: est ? est.nombre : null,
      destino_establecimiento: dest ? dest.nombre : null
    };
  });
  setScopedEtag(req, res);
  res.json({ patient_id: patient.id, total: eventos.length, eventos });
});

router.post('/patients/:id/eventos', requireScope(ROLES_ESCRITURA), (req, res) => {
  const patient = pacienteVisible(req, req.params.id);
  if (!patient) return noEncontrado(res);
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  for (const campo of ['tipo', 'fecha', 'estado', 'detalle', 'establecimiento_id', 'destino_establecimiento_id']) {
    const v = body[campo];
    if (v !== undefined && v !== null && typeof v !== 'string') return res.status(400).json({ error: `${campo} debe ser texto` });
  }
  const denied = scope.checkWrite(req.user, [{ patients: [], observations: [{ patient_id: patient.id }] }]);
  if (denied) return forbidden(res, denied);
  if (!scope.isAdmin(req.user)) {
    for (const code of [body.establecimiento_id, body.destino_establecimiento_id]) {
      if (!code) continue;
      const est = db.getEstablishmentById(String(code).trim());
      if (est && !sameRed(req.user.red, est.red_salud)) return forbidden(res, 'El establecimiento indicado no pertenece a su red.');
    }
  }
  const result = db.addEvent({ ...body, patient_id: patient.id }, { username: req.user.username, role: req.user.role });
  if (!result.ok) return res.status(400).json({ error: result.error });
  db.addAuditLog('SISTEMA_LOCAL', 'EVENTO_LINEA_TIEMPO', { id: result.event.id, patient_id: result.event.patient_id, tipo: result.event.tipo }, req.auditContext);
  res.status(201).json({ success: true, data: result.event });
});

fhirRouter.get('/metadata', (req, res) => {
  res.json({
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: new Date().toISOString(),
    kind: 'instance',
    fhirVersion: '4.0.1',
    format: ['application/fhir+json', 'application/json'],
    implementation: {
      description: 'Motor de Inteligencia Territorial de Pacientes Crónicos — Hospital de Apoyo Huarmey II-1 (RENHICE / HEARTS / GeoRIS)',
      url: 'http://localhost:3000/fhir'
    },
    rest: [{
      mode: 'server',
      resource: [
        { type: 'Patient', interaction: [{ code: 'read' }, { code: 'search-type' }] },
        { type: 'Condition', interaction: [{ code: 'read' }] },
        { type: 'Observation', interaction: [{ code: 'read' }] },
        { type: 'Appointment', interaction: [{ code: 'read' }, { code: 'create' }] },
        { type: 'MedicationStatement', interaction: [{ code: 'read' }] },
        { type: 'Bundle', interaction: [{ code: 'read' }, { code: 'create' }] }
      ]
    }]
  });
});

fhirRouter.get('/Bundle', requireScope(ROLES_PACIENTES), (req, res) => {
  const allPatients = scope.filterPatients(req.user, db.getAllPatients());
  const filtered = filterAndPaginatePatients(allPatients, req.query);
  res.setHeader('Cache-Control', 'private, no-store');
  auditarLectura(req, 'fhir/Bundle');
  const host = `${req.protocol}://${req.get('host')}`;

  const bundle = {
    resourceType: 'Bundle',
    id: 'bundle-searchset-huarmey',
    type: 'searchset',
    total: filtered.total,
    timestamp: new Date().toISOString(),
    entry: filtered.data.map(p => ({
      fullUrl: `${host}/fhir/Patient/${p.id}`,
      search: { mode: 'match' },
      resource: {
        resourceType: 'Patient',
        id: String(p.id),
        identifier: [
          { use: 'official', system: 'urn:oid:2.16.840.1.113883.4.904', value: String(p.dni || '') },
          { use: 'usual', system: 'http://hospitalhuarmey.gob.pe/fhir/sid/historia-clinica', value: String(p.historia_clinica || '') }
        ],
        active: !p.fallecido,
        name: [{ use: 'official', text: p.apellidos_nombres }],
        gender: p.sexo === 'M' ? 'male' : (p.sexo === 'F' ? 'female' : 'unknown'),
        birthDate: p.fecha_nacimiento || undefined,
        telecom: p.telefono ? [{ system: 'phone', value: String(p.telefono) }] : [],
        address: [{
          text: p.direccion,
          district: p.distrito || 'Huarmey',
          state: 'Áncash',
          country: 'PE',
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/geolocation',
              extension: [
                { url: 'latitude', valueDecimal: p.latitud },
                { url: 'longitude', valueDecimal: p.longitud }
              ]
            },
            {
              url: 'http://minsa.gob.pe/georis/StructureDefinition/sector-sanitario',
              valueString: p.sector_sanitario
            }
          ]
        }]
      }
    }))
  };
  res.json(bundle);
});

fhirRouter.get(['/Patient/:id', '/Patient/:id/bundle'], requireScope(ROLES_PACIENTES), (req, res) => {
  const patient = db.getPatientByIdOrDni(req.params.id);
  // Un paciente de otra red responde igual que uno inexistente (no se revela que existe)
  if (!patient || !scope.canSeePatient(req.user, patient)) {
    return res.status(404).json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'not-found', diagnostics: 'Paciente no encontrado en el Padrón Territorial' }]
    });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  auditarLectura(req, 'fhir/Patient', String(patient.id));
  res.json(fhirAdapter.toFhirBundle(patient));
});

fhirRouter.get('/loinc-catalog', (req, res) => {
  res.json({
    standard: 'HL7 FHIR Release 4 / LOINC v2.78 / RENHICE MINSA Perú',
    catalog: fhirAdapter.LOINC
  });
});

/**
 * Helper unificado de persistencia transaccional de recursos FHIR parseados
 */
function persistParsedFhirResources(parsed) {
  const ids = [];
  db.runTransaction(() => {
    parsed.patients.forEach(p => ids.push(String(db.upsertPatient(p).id)));
    parsed.conditions.forEach(c => db.upsertCondition(c));
    parsed.appointments.forEach(a => db.upsertAppointment(a));
    parsed.observations.forEach(o => db.upsertObservation(o));
    (parsed.medications || []).forEach(m => db.upsertMedication(m));
  });
  return ids;
}

fhirRouter.post('/Bundle', requireScope(ROLES_ESCRITURA), (req, res) => {
  // Todo el Bundle se interpreta y valida ANTES de escribir; un recurso inválido rechaza el lote entero (F2-09)
  let parsed;
  try {
    parsed = fhirAdapter.processBundle(req.body);
    validacion.validarFhir([parsed], db);
  } catch (err) {
    return invalido(res, err);
  }
  const denied = scope.checkWrite(req.user, [parsed]);
  if (denied) return forbidden(res, denied);
  parsed.patients.forEach(p => marcarModificacion(p, req));
  const ids = persistParsedFhirResources(parsed);

  db.addAuditLog('FHIR_API', 'BUNDLE_INGESTED', Object.assign({
    patients: parsed.patients.length,
    conditions: parsed.conditions.length,
    appointments: parsed.appointments.length,
    observations: parsed.observations.length,
    medications: (parsed.medications || []).length
  }, idsParaBitacora(ids)), req.auditContext);

  res.json({
    resourceType: 'Bundle',
    type: 'transaction-response',
    total: parsed.patients.length,
    message: `Procesados con éxito: ${parsed.patients.length} pacientes, ${parsed.observations.length} observaciones, ${parsed.appointments.length} citas.`
  });
});

// --- 6. Webhooks de Ingesta Propietaria (HOSIX, Galenos, Pakamuros Soft) ---
function handleConnectorWebhook(connector, sourceName) {
  return (req, res) => {
    const records = Array.isArray(req.body) ? req.body : [req.body];
    if (records.length > 2000) {
      return res.status(413).json({ error: 'Lote excede el límite máximo de 2,000 registros por transacción.' });
    }
    // Se interpreta y valida TODO el lote y se revisa el alcance por red antes de escribir nada
    let parsedList;
    try {
      parsedList = records.map((rec, i) => {
        if (!rec || typeof rec !== 'object' || Array.isArray(rec)) throw new validacion.ErrorValidacion(`Registro ${i + 1}: debe ser un objeto.`);
        let bundle;
        try {
          bundle = connector.transformToFhir(rec);
        } catch (e) {
          // Los rechazos del conector son mensajes propios; un TypeError por un tipo inesperado no se muestra
          throw e instanceof TypeError ? new validacion.ErrorValidacion(`Registro ${i + 1}: estructura inesperada.`) : new validacion.ErrorValidacion(`Registro ${i + 1}: ${e.message}`);
        }
        return fhirAdapter.processBundle(bundle);
      });
      validacion.validarFhir(parsedList, db);
    } catch (err) {
      return invalido(res, err, 'processing');
    }
    const denied = scope.checkWrite(req.user, parsedList);
    if (denied) return forbidden(res, denied);

    let count = 0;
    const ids = [];
    db.runTransaction(() => {
      for (const parsed of parsedList) {
        parsed.patients.forEach(p => {
          p.fuente = sourceName.toUpperCase();
          marcarModificacion(p, req);
          ids.push(String(db.upsertPatient(p).id));
        });
        parsed.conditions.forEach(c => db.upsertCondition(c));
        parsed.appointments.forEach(a => db.upsertAppointment(a));
        parsed.observations.forEach(o => db.upsertObservation(o));
        (parsed.medications || []).forEach(m => db.upsertMedication(m));
        count++;
      }
    });

    db.addAuditLog(`${sourceName}_WEBHOOK`, 'INGEST_SUCCESS', Object.assign({ count }, idsParaBitacora(ids)), req.auditContext);
    res.json({
      success: true,
      processed: count,
      message: `Datos de ${sourceName} asimilados y convertidos a HL7 FHIR R4 con éxito`
    });
  };
}

router.post('/webhooks/hosix', requireScope(ROLES_ESCRITURA), handleConnectorWebhook(hosixConnector, 'HOSIX'));
router.post('/webhooks/galenos', requireScope(ROLES_ESCRITURA), handleConnectorWebhook(galenosConnector, 'GALENOS'));
router.post('/webhooks/pakamuros', requireScope(ROLES_ESCRITURA), handleConnectorWebhook(pakamurosConnector, 'PAKAMUROS'));

// --- 6b. Ingesta Masiva del Padrón Estandarizado Huarmey (v4) ---
/** Código RENIPRESS de 8 dígitos dentro de un texto como «C. S. La Victoria (00001744, I-3)». */
function codigoRenipressDeTexto(texto) {
  const m = /\((\d{8})\b/.exec(String(texto === undefined || texto === null ? '' : texto));
  return m ? m[1] : null;
}

/**
 * El establecimiento que hoy controla al paciente define su puerta de entrada y su red: se toma del texto del
 * Excel o del formulario (no se fija el hospital para todos). Si el texto no trae un código del catálogo, no se toca.
 */
function derivarEstablecimientoDelControl(p) {
  if (!p || typeof p !== 'object') return;
  const code = codigoRenipressDeTexto(p.establecimiento_control) || codigoRenipressDeTexto(p.puerta_entrada);
  const est = code ? db.getEstablishmentById(code) : null;
  if (!est) return;
  p.puerta_entrada_id = est.cod_renipress;
  p.puerta_entrada = est.nombre;
  p.red_salud = normalizeRed(est.red_salud) || p.red_salud;
}

router.post('/padron/importar-lote', requireScope(ROLES_ESCRITURA), (req, res) => {
  const list = Array.isArray(req.body) ? req.body
    : (req.body && typeof req.body === 'object' && Array.isArray(req.body.patients) ? req.body.patients : []);
  if (list.length === 0) {
    return res.status(400).json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid', diagnostics: 'El lote de pacientes está vacío.' }]
    });
  }

  if (list.length > 5000) {
    return res.status(413).json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'too-costly', diagnostics: 'El lote excede el límite máximo de 5,000 registros.' }]
    });
  }

  // Validación completa ANTES de escribir (S-03, F2-08/09/11): copias limpias, sin campos que fija el servidor.
  // También rechaza un id y un DNI de pacientes distintos (F2-03: escritura cruzada de red por los hijos).
  let validos;
  try {
    validos = validacion.validarLotePadron(list, db);
  } catch (err) {
    return invalido(res, err);
  }
  validos.forEach(derivarEstablecimientoDelControl);

  const denied = scope.checkWrite(req.user, [{ patients: validos }]);
  if (denied) return forbidden(res, denied);

  let count = 0;
  const ids = [];
  db.runTransaction(() => {
    for (const p of validos) {
      if (!p.diagnosticos && Array.isArray(p.conditions)) {
        p.diagnosticos = p.conditions.map(c => c.cie10_cod);
      }
      // Los diagnósticos se acumulan (igual que los registros de Condition): una importación o una atención que no
      // repite un diagnóstico ya no lo borra. Antes se perdía, por ejemplo, la dislipidemia (C-08).
      const previo = (p.dni && db.getPatientByDni(p.dni)) || (p.id && db.getPatientByIdOrDni(p.id)) || null;
      if (previo && Array.isArray(previo.diagnosticos) && previo.diagnosticos.length > 0) {
        const nuevos = Array.isArray(p.diagnosticos) ? p.diagnosticos : [];
        p.diagnosticos = [...new Set(previo.diagnosticos.concat(nuevos).map(String))];
      }
      if (p.pa_sistolica == null && Array.isArray(p.observations) && p.observations[0]) {
        p.pa_sistolica = p.observations[0].pa_sistolica;
        p.pa_diastolica = p.observations[0].pa_diastolica;
        p.hba1c = p.observations[0].hba1c;
        p.glucosa = p.observations[0].glucosa;
      }
      if (!p.estado_control && Array.isArray(p.observations) && p.observations[0]) {
        p.estado_control = p.observations[0].estado_control;
      }
      if (!p.semaforo && semaforoHearts) {
        const sem = semaforoHearts.calcularSemaforo(p, new Date());
        p.semaforo = sem.semaforo;
        p.dias_restantes = sem.dias_restantes;
        p.fecha_limite = sem.fecha_limite;
      }
      // Campos numéricos que la ficha muestra: si no son números, se descartan (el semáforo y los días se recalculan)
      for (const campo of ['dias_restantes', 'dias_vencido', 'edad', 'frecuencia_hearts', 'fila_excel']) {
        if (p[campo] !== undefined && p[campo] !== null && p[campo] !== '' && !Number.isFinite(Number(p[campo]))) delete p[campo];
      }
      // Consentimiento de WhatsApp (A12): quién y cuándo salen de la sesión; si ya estaba registrado igual, se conserva
      delete p.consentimiento_fecha;
      delete p.consentimiento_registrado_por;
      if (p.consentimiento === 'Sí, firmado' || p.consentimiento === 'No') {
        const previo = db.getPatientByIdOrDni(String(p.id || p.dni || '').trim());
        if (!previo || previo.consentimiento !== p.consentimiento) {
          p.consentimiento_fecha = fechaLima.hoy();
          p.consentimiento_registrado_por = req.user.username;
        }
      } else {
        delete p.consentimiento;
      }
      marcarModificacion(p, req);
      // Los diagnósticos, controles y citas se cuelgan del paciente REALMENTE guardado (el que se revisó en
      // checkWrite), no del id que mandó el cliente (F2-03)
      const pid = String(db.upsertPatient(p).id);
      ids.push(pid);
      if (Array.isArray(p.conditions)) {
        p.conditions.forEach(c => {
          db.upsertCondition({
            id: `cond-${pid}-${c.cie10_cod}`,
            patient_id: pid,
            cie10_cod: c.cie10_cod,
            diagnostico: c.diagnostico,
            fecha_diagnostico: p.fecha_captacion || fechaLima.hoy()
          });
        });
      }
      if (Array.isArray(p.observations)) {
        p.observations.forEach((o, oIdx) => {
          db.upsertObservation({
            id: `obs-${pid}-${oIdx + 1}`,
            patient_id: pid,
            fecha_registro: o.fecha_registro || fechaLima.hoy(),
            pa_sistolica: o.pa_sistolica,
            pa_diastolica: o.pa_diastolica,
            hba1c: o.hba1c,
            glucosa: o.glucosa,
            estado_control: o.estado_control
          });
        });
      }
      if (Array.isArray(p.appointments)) {
        p.appointments.forEach((a, aIdx) => {
          db.upsertAppointment({
            id: `app-${pid}-${aIdx + 1}`,
            patient_id: pid,
            fecha_cita: a.fecha_cita,
            estado: a.estado || 'booked'
          });
        });
      }
      count++;
    }
  });

  db.addAuditLog('PADRON_ESTANDARIZADO', 'BULK_IMPORT', Object.assign({ count }, idsParaBitacora(ids)), req.auditContext);

  res.json({
    success: true,
    processed: count,
    message: `Se importaron y sincronizaron con éxito ${count} pacientes del Padrón Estandarizado.`
  });
});

// --- 7. Endpoint de Auditoría de Seguridad (Fase 2 Readiness) ---
router.get('/security/audit-logs', requireScope(['ADMIN']), (req, res) => {
  const parsedLimit = parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 50, 1), 500);
  const evento = typeof req.query.evento === 'string' && /^[A-Z_]{1,40}$/.test(req.query.evento) ? req.query.evento : null;
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    success: true,
    standard: 'Ley N° 29733 — Protección de Datos Personales / RENHICE MINSA',
    logs: db.getAuditLogs(limit, evento)
  });
});

module.exports = { router, fhirRouter };
