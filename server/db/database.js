/**
 * database.js
 * Motor de Persistencia en Memoria Indexada O(1) con Escritura Asíncrona Atómica (Debounced).
 * Diseñado para soportar 1,000+ usuarios concurrentes sin bloquear el Event Loop de Node.js,
 * manteniendo compatibilidad nativa en Windows sin dependencias C++ externas.
 */

const fs = require('fs');
const fechaLima = require('../../client/js/utils/fechaLima');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { getLatestObservation } = require('../utils/latestRecord');
const { DEFAULT_ESTABLISHMENTS } = require('../../client/js/map/establecimientos');

// Carpeta de datos reales (store.json y padron_inicial.js). Por defecto, esta misma carpeta.
// Se puede cambiar con la variable de entorno DATA_DIR (recomendado: una ruta fuera de OneDrive).
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
const DEFAULT_SEED_FILE = path.join(__dirname, 'padron_inicial.js');
const SEED_FILE = fs.existsSync(path.join(DATA_DIR, 'padron_inicial.js')) ? path.join(DATA_DIR, 'padron_inicial.js') : DEFAULT_SEED_FILE;
const DB_FILE = path.join(DATA_DIR, 'store.json');
const DB_TMP_FILE = path.join(DATA_DIR, 'store.json.tmp');
const DB_BAK_FILE = path.join(DATA_DIR, 'store.json.bak');
const MAX_AUDIT_LOGS = 5000;

function syncEstablishments(savedList) {
  const map = new Map();
  for (const est of DEFAULT_ESTABLISHMENTS) {
    map.set(est.cod_renipress, { ...est });
  }
  if (Array.isArray(savedList)) {
    for (const e of savedList) {
      if (!map.has(e.cod_renipress)) {
        map.set(e.cod_renipress, e);
      }
    }
  }
  return Array.from(map.values());
}

/**
 * Sanitiza objetos entrantes contra Prototype Pollution (__proto__, constructor, prototype)
 */
const CONSENTIMIENTOS = ['Sí, firmado', 'No'];
const EVENT_TIPOS = ['control', 'cita', 'referencia', 'contrarreferencia', 'cambio_establecimiento', 'telemonitoreo'];
const EVENT_ESTADOS = ['pendiente', 'aceptada', 'rechazada', 'completada', 'contrarreferida'];

function sanitizeRecord(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    clean[key] = obj[key];
  }
  return clean;
}

// Valores por defecto que se aplican SOLO al crear un paciente nuevo (nunca al actualizar uno existente)
const PATIENT_DEFAULTS = {
  historia_clinica: 'S/N',
  apellidos_nombres: 'PACIENTE SIN NOMBRE',
  sexo: 'O',
  fecha_nacimiento: '',
  fallecido: false,
  financiador: 'SIS',
  telefono: '',
  direccion: 'Sin dirección consignada',
  distrito: 'Huarmey',
  sector_sanitario: 'Sector 01 - Centro Urbano',
  puerta_entrada_id: '00001741'
};

// Textos de relleno que nunca deben reemplazar un dato real ya guardado
const PLACEHOLDER_VALUES = {
  historia_clinica: ['S/N'],
  apellidos_nombres: ['PACIENTE SIN NOMBRE', 'PACIENTE HOSIX'],
  direccion: ['Sin dirección consignada', 'Huarmey'],
  sector_sanitario: ['Sector 01 - Centro Urbano']
};

/**
 * Indica si un valor entrante es un dato real (no null, no vacío, no texto de relleno)
 */
function hasRealValue(field, value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') return false;
    if ((PLACEHOLDER_VALUES[field] || []).includes(text)) return false;
  }
  return true;
}

class Database {
  constructor() {
    this.data = {
      establishments: DEFAULT_ESTABLISHMENTS,
      patients: [],
      conditions: [],
      appointments: [],
      observations: [],
      medications: [],
      events: [],
      users: [],
      audit_logs: []
    };

    // Índices en memoria O(1) para alta concurrencia (1,000+ usuarios simultáneos)
    this.establishmentMap = new Map();
    this.patientByDniMap = new Map();
    this.patientByIdMap = new Map();
    this.conditionsByPatient = new Map();
    this.appointmentsByPatient = new Map();
    this.observationsByPatient = new Map();
    this.medicationsByPatient = new Map();
    this.eventsByPatient = new Map();

    // Caché materializada de vistas y control de ETag
    this._materializedPatients = null;
    this._dirty = true;
    this._version = 1;
    this._saveTimer = null;
    this._isSaving = false;
    this._pendingSave = false;

    this.init();
  }

  init() {
    if (fs.existsSync(DB_FILE)) {
      let raw;
      let parsed = null;
      try {
        raw = fs.readFileSync(DB_FILE, 'utf8');
        parsed = JSON.parse(raw);
      } catch (e) {
        console.error('FATAL: Error al parsear store.json (archivo corrupto o incompleto):', e.message);
        const corruptTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const corruptPath = path.join(DATA_DIR, `store.json.corrupt-${corruptTimestamp}`);
        try {
          fs.renameSync(DB_FILE, corruptPath);
          console.error(`store.json dañado preservado para auditoría en: ${corruptPath}`);
        } catch (renameErr) {
          console.error('Error al renombrar archivo corrupto:', renameErr.message);
        }

        // Intento de recuperación inmediata desde el backup rotativo .bak
        if (fs.existsSync(DB_BAK_FILE)) {
          try {
            console.warn(`Intentando recuperar datos desde backup: ${DB_BAK_FILE}...`);
            const bakRaw = fs.readFileSync(DB_BAK_FILE, 'utf8');
            parsed = JSON.parse(bakRaw);
            fs.copyFileSync(DB_BAK_FILE, DB_FILE);
            console.warn('¡Recuperación exitosa de base de datos desde store.json.bak!');
          } catch (bakErr) {
            console.error('El archivo de backup store.json.bak también se encuentra dañado:', bakErr.message);
          }
        }

        if (!parsed) {
          throw new Error(`CRITICAL: store.json está dañado y no hay backup válido disponible. Servidor detenido para proteger datos reales. Copia preservada en: ${corruptPath}`);
        }
      }

      if (parsed) {
        this.data = {
          establishments: syncEstablishments(parsed.establishments),
          patients: Array.isArray(parsed.patients) ? parsed.patients : [],
          conditions: Array.isArray(parsed.conditions) ? parsed.conditions : [],
          appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
          observations: Array.isArray(parsed.observations) ? parsed.observations : [],
          medications: Array.isArray(parsed.medications) ? parsed.medications : [],
          events: Array.isArray(parsed.events) ? parsed.events : [],
          users: Array.isArray(parsed.users) ? parsed.users : [],
          audit_logs: Array.isArray(parsed.audit_logs) ? parsed.audit_logs.slice(-MAX_AUDIT_LOGS) : []
        };
      }
    }

    if (!this.data.patients || this.data.patients.length === 0) {
      this.seedSampleData();
    }
    this.rebuildIndexes();
  }

  /**
   * Construye todos los índices O(1) en memoria a partir de this.data
   */
  rebuildIndexes() {
    this.establishmentMap.clear();
    this.patientByDniMap.clear();
    this.patientByIdMap.clear();
    this.conditionsByPatient.clear();
    this.appointmentsByPatient.clear();
    this.observationsByPatient.clear();
    this.medicationsByPatient.clear();
    this.eventsByPatient.clear();

    for (const est of this.data.establishments) {
      this.establishmentMap.set(est.cod_renipress, est);
    }

    for (const p of this.data.patients) {
      if (p.dni) this.patientByDniMap.set(String(p.dni), p);
      if (p.id) this.patientByIdMap.set(String(p.id), p);
    }

    for (const c of this.data.conditions) {
      const pid = String(c.patient_id);
      if (!this.conditionsByPatient.has(pid)) this.conditionsByPatient.set(pid, []);
      this.conditionsByPatient.get(pid).push(c);
    }

    for (const a of this.data.appointments) {
      const pid = String(a.patient_id);
      if (!this.appointmentsByPatient.has(pid)) this.appointmentsByPatient.set(pid, []);
      this.appointmentsByPatient.get(pid).push(a);
    }

    for (const o of this.data.observations) {
      const pid = String(o.patient_id);
      if (!this.observationsByPatient.has(pid)) this.observationsByPatient.set(pid, []);
      this.observationsByPatient.get(pid).push(o);
    }

    for (const m of (this.data.medications || [])) {
      const pid = String(m.patient_id);
      if (!this.medicationsByPatient.has(pid)) this.medicationsByPatient.set(pid, []);
      this.medicationsByPatient.get(pid).push(m);
    }

    for (const e of (this.data.events || [])) {
      const pid = String(e.patient_id);
      if (!this.eventsByPatient.has(pid)) this.eventsByPatient.set(pid, []);
      this.eventsByPatient.get(pid).push(e);
    }

    this.invalidateCache();
  }

  invalidateCache() {
    this._dirty = true;
    this._materializedPatients = null;
    this._version++;
  }

  getETag() {
    return `W/"cronicos-v${this._version}-${this.data.patients.length}"`;
  }

  seedSampleData() {
    try {
      // El padrón inicial vive fuera de client/ para que no se publique como archivo estático (S1, S10)
      const samplePath = SEED_FILE;
      if (fs.existsSync(samplePath)) {
        const samples = require(samplePath);
        if (Array.isArray(samples) && samples.length > 0) {
          this.data.patients = samples.map((p, idx) => ({
            id: p.id || `pac-00001741-${p.dni || (idx + 1)}`,
            ...p
          }));
          this.scheduleSave(true);
        }
      }
    } catch (e) {
      console.warn('No se pudo precargar muestra de pacientes:', e.message);
    }
  }

  /**
   * Persistencia Asíncrona Atómica con Debounce (250ms) para no bloquear el Event Loop
   * bajo ráfagas de concurrencia o transacciones masivas FHIR Bundle.
   */
  scheduleSave(immediate = false) {
    if (immediate) {
      this.flushSync();
      return;
    }

    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
    }

    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._flushToDiskAsync();
    }, 250);
  }

  async _flushToDiskAsync() {
    if (this._isSaving) {
      this._pendingSave = true;
      return;
    }
    this._isSaving = true;
    try {
      const payload = JSON.stringify(this.data);
      await fsp.writeFile(DB_TMP_FILE, payload, 'utf8');
      if (fs.existsSync(DB_FILE)) {
        try {
          await fsp.copyFile(DB_FILE, DB_BAK_FILE);
        } catch (_) {}
      }
      await fsp.rename(DB_TMP_FILE, DB_FILE);
    } catch (e) {
      console.error('Error en persistencia asíncrona atómica:', e.message);
    } finally {
      this._isSaving = false;
      if (this._pendingSave) {
        this._pendingSave = false;
        this.scheduleSave();
      }
    }
  }

  /**
   * Vacía inmediatamente y de forma síncrona los datos a disco.
   * Utilizado en apagado limpio (SIGINT/SIGTERM), transacciones críticas y rotación de backups.
   */
  flushSync() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    try {
      const payload = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(DB_TMP_FILE, payload, 'utf8');
      if (fs.existsSync(DB_FILE)) {
        try {
          fs.copyFileSync(DB_FILE, DB_BAK_FILE);
        } catch (_) {}
      }
      fs.renameSync(DB_TMP_FILE, DB_FILE);
    } catch (e) {
      console.error('Error guardando DB síncronamente (flushSync):', e.message);
    }
  }

  save() {
    this.scheduleSave(false);
  }

  /**
   * Ejecuta múltiples operaciones en una sola transacción en memoria y persiste una sola vez
   */
  runTransaction(fn) {
    const result = fn(this);
    this.invalidateCache();
    this.scheduleSave(false);
    return result;
  }

  // --- Operaciones de Establecimientos O(1) ---
  getEstablishments() {
    return this.data.establishments;
  }

  getEstablishmentById(code) {
    if (!code) return null;
    return this.establishmentMap.get(String(code)) || null;
  }

  getEstablishmentByCode(code) {
    return this.getEstablishmentById(code);
  }

  // --- Operaciones de Pacientes O(1) con Vista Materializada ---
  getAllPatients() {
    if (!this._dirty && this._materializedPatients) {
      return this._materializedPatients;
    }

    this._materializedPatients = this.data.patients.map(p => this._enrichPatient(p));
    this._dirty = false;
    return this._materializedPatients;
  }

  _enrichPatient(p) {
    const pid = String(p.id);
    const cond = this.conditionsByPatient.get(pid);
    const appts = this.appointmentsByPatient.get(pid);
    const obs = this.observationsByPatient.get(pid);
    const meds = this.medicationsByPatient.get(pid);
    const renipressCode = p.puerta_entrada_id || p.es_puerta_entrada_id || '00001741';
    const es = this.getEstablishmentById(renipressCode);

    const resolvedConditions = (cond && cond.length > 0) ? cond : (p.conditions || []);
    const resolvedObs = (obs && obs.length > 0) ? obs : (p.observations || []);

    // Derivar array de diagnósticos CIE-10 si no existe o está vacío
    let diagnosticos = (Array.isArray(p.diagnosticos) && p.diagnosticos.length > 0)
      ? p.diagnosticos
      : resolvedConditions.map(c => c.cie10_cod || (c.code && c.code.coding && c.code.coding[0] && c.code.coding[0].code) || c.codigo || c.cie10).filter(Boolean);

    // Derivar signos vitales y estado de control desde la observación más reciente si faltan en p
    let pa_sistolica = (p.pa_sistolica !== undefined && p.pa_sistolica !== null && p.pa_sistolica !== '') ? p.pa_sistolica : null;
    let pa_diastolica = (p.pa_diastolica !== undefined && p.pa_diastolica !== null && p.pa_diastolica !== '') ? p.pa_diastolica : null;
    let estado_control = p.estado_control || null;
    let semaforo = p.semaforo || null;

    if (resolvedObs.length > 0) {
      const latestObs = getLatestObservation(resolvedObs);
      if (latestObs) {
        if (pa_sistolica === null && latestObs.pa_sistolica !== undefined && latestObs.pa_sistolica !== null) {
          pa_sistolica = latestObs.pa_sistolica;
        }
        if (pa_diastolica === null && latestObs.pa_diastolica !== undefined && latestObs.pa_diastolica !== null) {
          pa_diastolica = latestObs.pa_diastolica;
        }
        if (!estado_control && latestObs.estado_control) {
          estado_control = latestObs.estado_control;
        }
      }
    }

    // Derivar semáforo si aún no está asignado
    if (!semaforo) {
      if (estado_control === 'Controlado' || (pa_sistolica !== null && pa_diastolica !== null && pa_sistolica < 140 && pa_diastolica < 90)) {
        semaforo = 'green';
      } else if (estado_control === 'No Controlado' || (pa_sistolica !== null && (pa_sistolica >= 140 || pa_diastolica >= 90))) {
        semaforo = (pa_sistolica >= 160 || pa_diastolica >= 100) ? 'red' : 'yellow';
      } else {
        semaforo = 'gray';
      }
    }

    return {
      ...p,
      puerta_entrada_id: renipressCode,
      conditions: resolvedConditions,
      diagnosticos,
      pa_sistolica,
      pa_diastolica,
      estado_control,
      semaforo,
      appointments: (appts && appts.length > 0) ? appts : (p.appointments || []),
      observations: resolvedObs,
      medications: (meds && meds.length > 0) ? meds : (p.medications || []),
      puerta_entrada: es ? es.nombre : (p.puerta_entrada || 'NUEVO HOSPITAL DE APOYO HUARMEY')
    };
  }

  getPatientByDni(dni) {
    if (!dni) return null;
    const raw = this.patientByDniMap.get(String(dni).trim());
    return raw ? this._enrichPatient(raw) : null;
  }

  getPatientByIdOrDni(idOrDni) {
    if (!idOrDni) return null;
    const key = String(idOrDni).trim();
    const raw = this.patientByIdMap.get(key) || this.patientByDniMap.get(key);
    return raw ? this._enrichPatient(raw) : null;
  }

  /**
   * Devuelve el id vigente del paciente al que apunta una referencia (id o DNI).
   * Los conectores envían ids del tipo "pac-<renipress>-<dni>", que pueden no coincidir
   * con el id con el que el paciente ya existe en el padrón. Si no se encuentra el paciente,
   * devuelve la referencia sin cambios.
   */
  resolvePatientId(ref) {
    const key = String(ref === null || ref === undefined ? '' : ref).trim();
    if (!key) return key;
    const byId = this.patientByIdMap.get(key);
    if (byId) return String(byId.id);
    const match = /^pac-\d+-(.+)$/.exec(key);
    const byDni = this.patientByDniMap.get(match ? match[1] : key);
    return byDni ? String(byDni.id) : key;
  }

  upsertPatient(patientData) {
    const clean = sanitizeRecord(patientData);
    const dniKey = clean.dni ? String(clean.dni).trim() : '';
    const idKey = clean.id ? String(clean.id).trim() : `pac-00001741-${dniKey || crypto.randomUUID()}`;
    clean.id = idKey;

    const existing = (dniKey && this.patientByDniMap.get(dniKey)) || this.patientByIdMap.get(idKey);
    if (existing) {
      // Actualiza solo los campos con valor real; conserva lo ya guardado en el resto.
      // El id NUNCA se reemplaza: las citas, atenciones, diagnósticos y medicación del paciente
      // lo referencian en patient_id, y cambiarlo los dejaría huérfanos (F4).
      for (const key of Object.keys(clean)) {
        if (key === 'id') continue;
        if (hasRealValue(key, clean[key])) existing[key] = clean[key];
      }
      if (existing.dni) this.patientByDniMap.set(String(existing.dni), existing);
      this.patientByIdMap.set(String(existing.id), existing);
    } else {
      // Paciente nuevo: aplicar valores por defecto a lo que no vino informado
      for (const key of Object.keys(PATIENT_DEFAULTS)) {
        if (clean[key] === null || clean[key] === undefined) clean[key] = PATIENT_DEFAULTS[key];
      }
      this.data.patients.push(clean);
      if (dniKey) this.patientByDniMap.set(dniKey, clean);
      this.patientByIdMap.set(idKey, clean);
    }

    this.invalidateCache();
    this.scheduleSave();
    return existing || clean;
  }

  // --- Operaciones de Diagnósticos, Citas, Observaciones y Medicación O(1) ---
  upsertCondition(condData) {
    const clean = sanitizeRecord(condData);
    if (!clean.id) clean.id = `cond-${crypto.randomUUID()}`;
    const pid = this.resolvePatientId(clean.patient_id);
    clean.patient_id = pid;
    const list = this.conditionsByPatient.get(pid) || [];
    const existing = list.find(c => c.cie10_cod === clean.cie10_cod);

    if (existing) {
      Object.assign(existing, clean);
    } else {
      this.data.conditions.push(clean);
      list.push(clean);
      this.conditionsByPatient.set(pid, list);
    }

    this.invalidateCache();
    this.scheduleSave();
    return existing || clean;
  }

  upsertAppointment(apptData) {
    const clean = sanitizeRecord(apptData);
    if (!clean.id) clean.id = `apt-${crypto.randomUUID()}`;
    const pid = this.resolvePatientId(clean.patient_id);
    clean.patient_id = pid;
    const list = this.appointmentsByPatient.get(pid) || [];
    // Idempotencia (F5): es la misma cita si coincide el id, o si es del mismo paciente,
    // misma fecha y mismo tipo (pre-cita o cita). Reenviar un registro no la duplica.
    const existing = list.find(a =>
      a.id === clean.id ||
      (clean.fecha_cita && a.fecha_cita === clean.fecha_cita && Number(a.es_precita || 0) === Number(clean.es_precita || 0))
    );

    if (existing) {
      // Se conserva el id con el que la cita ya existe
      const { id: _ignoredId, ...rest } = clean;
      Object.assign(existing, rest);
    } else {
      this.data.appointments.push(clean);
      list.push(clean);
      this.appointmentsByPatient.set(pid, list);
    }

    this.invalidateCache();
    this.scheduleSave();
    return existing || clean;
  }

  upsertObservation(obsData) {
    const clean = sanitizeRecord(obsData);
    if (!clean.id) clean.id = `obs-${crypto.randomUUID()}`;
    const pid = this.resolvePatientId(clean.patient_id);
    clean.patient_id = pid;
    const list = this.observationsByPatient.get(pid) || [];
    // Idempotencia (F5): es la misma atención si coincide el id, o si tiene la misma fecha y
    // todos los valores informados coinciden con los ya guardados. Dos atenciones con la misma
    // fecha pero valores distintos se conservan ambas.
    const sameMeasurement = (o) => {
      if (!clean.fecha_registro || o.fecha_registro !== clean.fecha_registro) return false;
      const informed = Object.keys(clean).filter(k =>
        k !== 'id' && k !== 'patient_id' && clean[k] !== null && clean[k] !== undefined && clean[k] !== ''
      );
      return informed.every(k => o[k] === clean[k]);
    };
    const existing = list.find(o => o.id === clean.id || sameMeasurement(o));

    if (existing) {
      // Se conserva el id con el que la atención ya existe
      const { id: _ignoredId, ...rest } = clean;
      Object.assign(existing, rest);
    } else {
      this.data.observations.push(clean);
      list.push(clean);
      this.observationsByPatient.set(pid, list);
    }

    // Sincronizar signos vitales recientes en el registro raíz del paciente si existe.
    // Solo si esta observación es la más reciente por fecha (una observación antigua no debe pisar la nueva).
    const patient = this.patientByIdMap.get(pid) || this.patientByDniMap.get(pid);
    const isLatest = getLatestObservation(list) === (existing || clean);
    if (patient && isLatest) {
      if (clean.pa_sistolica !== null && clean.pa_sistolica !== undefined) patient.pa_sistolica = clean.pa_sistolica;
      if (clean.pa_diastolica !== null && clean.pa_diastolica !== undefined) patient.pa_diastolica = clean.pa_diastolica;
      if (clean.glucosa !== null && clean.glucosa !== undefined) patient.glucosa = clean.glucosa;
      if (clean.hba1c !== null && clean.hba1c !== undefined) patient.hba1c = clean.hba1c;
      if (clean.estado_control) patient.estado_control = clean.estado_control;
    }

    this.invalidateCache();
    this.scheduleSave();
    return existing || clean;
  }

  upsertMedication(medData) {
    const clean = sanitizeRecord(medData);
    if (!clean.id) clean.id = `med-${crypto.randomUUID()}`;
    const pid = this.resolvePatientId(clean.patient_id);
    clean.patient_id = pid;
    if (!this.data.medications) this.data.medications = [];
    const list = this.medicationsByPatient.get(pid) || [];
    const existing = list.find(m => m.id === clean.id || (m.categoria && m.categoria === clean.categoria));

    if (existing) {
      Object.assign(existing, clean);
    } else {
      this.data.medications.push(clean);
      list.push(clean);
      this.medicationsByPatient.set(pid, list);
    }

    // Sincronizar esquema terapéutico con el paciente raíz
    const patient = this.patientByIdMap.get(pid) || this.patientByDniMap.get(pid);
    if (patient && clean.esquema) {
      if (clean.categoria === 'HTA') patient.tratamiento_hta = clean.esquema;
      else if (clean.categoria === 'DM') patient.tratamiento_dm = clean.esquema;
      else if (!patient.tratamiento_hta) patient.tratamiento_hta = clean.esquema;
    }

    this.invalidateCache();
    this.scheduleSave();
    return existing || clean;
  }

  // --- Usuarios (T-03a). Se guardan en store.json con la clave ya cifrada (scrypt); nunca en texto. ---
  listUsers() {
    if (!this.data.users) this.data.users = [];
    return this.data.users;
  }

  getUserByUsername(username) {
    if (!username) return null;
    const key = String(username).trim().toLowerCase();
    return this.listUsers().find(u => u.username === key) || null;
  }

  createUser(userData) {
    const clean = sanitizeRecord(userData);
    clean.username = String(clean.username || '').trim().toLowerCase();
    if (!clean.username) throw new Error('username es obligatorio');
    if (this.getUserByUsername(clean.username)) throw new Error(`El usuario ${clean.username} ya existe`);
    this.listUsers().push(clean);
    this.scheduleSave();
    return clean;
  }

  /** Actualiza solo los campos indicados de un usuario existente. Devuelve el usuario o null si no existe. */
  updateUser(username, changes) {
    const user = this.getUserByUsername(username);
    if (!user) return null;
    Object.assign(user, sanitizeRecord(changes));
    this.scheduleSave();
    return user;
  }

  /**
   * Registra el consentimiento del paciente para recordatorios por WhatsApp (Ley N° 29733).
   * El registrante sale del usuario autenticado. Devuelve { ok:true, patient } o { ok:false, error }.
   */
  setConsentimiento(idOrDni, valor, registrante) {
    if (!CONSENTIMIENTOS.includes(valor)) return { ok: false, error: `consentimiento debe ser uno de: ${CONSENTIMIENTOS.join(', ')}` };
    if (!registrante || !registrante.username) return { ok: false, error: 'Se requiere un usuario registrante' };
    const pid = this.resolvePatientId(idOrDni);
    const patient = this.patientByIdMap.get(String(pid));
    if (!patient) return { ok: false, error: 'El paciente no existe' };
    patient.consentimiento = valor;
    patient.consentimiento_fecha = fechaLima.hoy();
    patient.consentimiento_registrado_por = String(registrante.username);
    this.invalidateCache();
    this.scheduleSave();
    return { ok: true, patient };
  }

  // --- Línea de tiempo del paciente (A11): eventos, no historia clínica ---

  /**
   * Registra un evento de la línea de tiempo. `registrante` sale del usuario autenticado, nunca del cuerpo.
   * Devuelve { ok:true, event } o { ok:false, error }.
   */
  addEvent(evtData, registrante) {
    const src = sanitizeRecord(evtData);
    if (!EVENT_TIPOS.includes(src.tipo)) return { ok: false, error: `tipo debe ser uno de: ${EVENT_TIPOS.join(', ')}` };
    if (!fechaLima.esFechaReal(src.fecha)) {
      return { ok: false, error: 'fecha debe ser una fecha real del calendario con formato AAAA-MM-DD' };
    }
    // Solo una cita puede ser futura: los demás eventos ya ocurrieron
    if (src.tipo !== 'cita' && src.fecha > fechaLima.hoy()) {
      return { ok: false, error: 'fecha no puede ser futura (solo una cita puede serlo)' };
    }
    if (src.estado !== undefined && src.estado !== null && src.estado !== '' && !EVENT_ESTADOS.includes(src.estado)) {
      return { ok: false, error: `estado debe ser uno de: ${EVENT_ESTADOS.join(', ')}` };
    }
    const pid = this.resolvePatientId(src.patient_id);
    if (!this.patientByIdMap.has(String(pid))) return { ok: false, error: 'El paciente no existe' };
    const estId = src.establecimiento_id ? String(src.establecimiento_id).trim() : null;
    if (estId && !this.getEstablishmentById(estId)) return { ok: false, error: 'establecimiento_id no es un establecimiento conocido' };
    const destId = src.destino_establecimiento_id ? String(src.destino_establecimiento_id).trim() : null;
    if (destId && !this.getEstablishmentById(destId)) return { ok: false, error: 'destino_establecimiento_id no es un establecimiento conocido' };
    if (!registrante || !registrante.username) return { ok: false, error: 'Se requiere un usuario registrante' };

    const event = {
      id: `evt-${crypto.randomUUID()}`,
      patient_id: String(pid),
      tipo: src.tipo,
      fecha: src.fecha,
      establecimiento_id: estId,
      destino_establecimiento_id: destId,
      estado: src.estado || null,
      detalle: src.detalle ? String(src.detalle).slice(0, 300) : null,
      registrado_por: String(registrante.username),
      rol_registrante: registrante.role ? String(registrante.role) : null,
      fecha_registro: new Date().toISOString()
    };
    this.data.events.push(event);
    if (!this.eventsByPatient.has(event.patient_id)) this.eventsByPatient.set(event.patient_id, []);
    this.eventsByPatient.get(event.patient_id).push(event);
    this.invalidateCache();
    this.scheduleSave();
    return { ok: true, event };
  }

  /**
   * Línea de tiempo ordenada (más reciente primero): eventos guardados + controles (observaciones)
   * + citas del paciente. Lo que no tiene dato de establecimiento o registrante queda en null.
   */
  getTimeline(idOrDni) {
    const pid = String(this.resolvePatientId(idOrDni));
    const stored = (this.eventsByPatient.get(pid) || []).map(e => ({ ...e, origen: 'evento' }));
    const controles = (this.observationsByPatient.get(pid) || []).map(o => ({
      id: `obs:${o.id}`,
      patient_id: pid,
      tipo: 'control',
      fecha: String(o.fecha_registro || '').slice(0, 10),
      establecimiento_id: o.establecimiento_id || null,
      estado: o.estado_control || null,
      detalle: (o.pa_sistolica != null && o.pa_diastolica != null) ? `PA ${o.pa_sistolica}/${o.pa_diastolica} mmHg` : null,
      registrado_por: o.registrado_por || null,
      origen: 'observacion'
    }));
    const citas = (this.appointmentsByPatient.get(pid) || []).map(a => ({
      id: `apt:${a.id}`,
      patient_id: pid,
      tipo: 'cita',
      fecha: String(a.fecha_cita || '').slice(0, 10),
      establecimiento_id: a.establecimiento_id || null,
      estado: Number(a.es_precita || 0) ? 'pre-cita' : (a.estado || null),
      detalle: a.comentarios || null,
      registrado_por: a.registrado_por || null,
      origen: 'cita'
    }));
    return stored.concat(controles, citas)
      .filter(e => e.fecha)
      .sort((x, y) => (y.fecha.localeCompare(x.fecha)) || String(y.id).localeCompare(String(x.id)));
  }

  // --- Auditoría e Historial de Ingesta (Ring Buffer acotado para escalabilidad) ---
  addAuditLog(sistemaOrigen, evento, payload, meta = {}) {
    const log = {
      id: `aud-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      sistema_origen: String(sistemaOrigen || 'SISTEMA'),
      evento: String(evento || 'EVENTO'),
      actor: meta.actor || 'ANONYMOUS_PHASE1',
      ip: meta.ip || '127.0.0.1',
      payload_json: typeof payload === 'string' ? payload : JSON.stringify(payload),
      fecha: new Date().toISOString()
    };
    this.data.audit_logs.push(log);
    if (this.data.audit_logs.length > MAX_AUDIT_LOGS) {
      this.data.audit_logs = this.data.audit_logs.slice(-MAX_AUDIT_LOGS);
    }
    this.scheduleSave();
    return log;
  }

  getAuditLogs(limit = 100) {
    return this.data.audit_logs.slice(-Math.min(limit, 500)).reverse();
  }
}

const dbInstance = new Database();
dbInstance.DEFAULT_ESTABLISHMENTS = DEFAULT_ESTABLISHMENTS;
module.exports = dbInstance;
