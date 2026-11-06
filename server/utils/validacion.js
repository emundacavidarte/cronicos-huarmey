/**
 * validacion.js
 * Validación de entradas en el SERVIDOR (Fase 2, F2-08/F2-09/F2-11): la regla ya no vive solo en la interfaz.
 * Se valida TODO el lote antes de escribir nada; un error rechaza el lote entero (400) con la fila y el motivo.
 * Los mensajes de ErrorValidacion son propios y se pueden mostrar; cualquier otro error se responde con un texto genérico.
 */

const fechaLima = require('../../client/js/utils/fechaLima');
// Única fuente de las reglas clínicas (cliente y servidor): aquí, quién cuenta como fallecido (K3-02)
const ReglasClinicas = require('../../client/js/clinical/reglasClinicas');

class ErrorValidacion extends Error {
  constructor(message) {
    super(message);
    this.name = 'ErrorValidacion';
    this.expose = true;
    this.status = 400;
  }
}

// --- Reglas ---
const CLAVE_REGEX = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const ID_REGEX = /^[A-Za-z0-9_.-]{0,79}[A-Za-z0-9]$/; // no termina en guion: «pac-00001741-» sin documento no es un id
const DNI_REGEX = /^\d{8}$/;
const DOC_OTRO_REGEX = /^[A-Za-z0-9]{6,15}$/; // carné de extranjería, pasaporte
const RENIPRESS_REGEX = /^\d{8}$/;
const CIE10_REGEX = /^[A-Za-z][0-9]{2}(\.?[0-9A-Za-z]{1,4})?$/;
const SIN_MARCADO = /[<>]/; // ningún dato de código, nombre o diagnóstico necesita < o >
const MAX_CLAVES = 300;
const MAX_TEXTO = 4000;
const MAX_NOMBRE = 200;
const ANIDADOS = { conditions: 50, observations: 1000, appointments: 1000, medications: 50, diagnosticos: 50 };
const PLACEHOLDERS_NOMBRE = ['PACIENTE SIN NOMBRE', 'PACIENTE HOSIX'];
const SEXOS = ['M', 'F', 'O', 'FEMENINO', 'MASCULINO'];
// Campos que fija el servidor: el cliente no puede escribirlos (trazabilidad y origen)
const CAMPOS_DEL_SERVIDOR = ['fuente', 'ultima_modificacion_por', 'ultima_modificacion_fecha', 'consentimiento_fecha', 'consentimiento_registrado_por'];
// Números clínicos: si vienen, deben ser números (o vacío/null)
const NUMEROS_OBSERVACION = ['pa_sistolica', 'pa_diastolica', 'glucosa', 'hba1c', 'peso', 'talla', 'imc', 'pab', 'creatinina', 'microalbumina',
  'depuracion_creatinina', 'colesterol_total', 'trigliceridos', 'colesterol_hdl', 'colesterol_ldl'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const NUMEROS_PACIENTE = ['pa_sistolica', 'pa_diastolica', 'glucosa', 'hba1c', 'latitud', 'longitud']
  .concat(MESES.map(m => 'pas_' + m), MESES.map(m => 'pad_' + m));

const esObjetoPlano = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const vacio = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const esClaveHeredada = k => k === '__proto__' || Object.prototype.hasOwnProperty.call(Object.prototype, k);

/** Texto seguro a partir de un valor primitivo; objetos y funciones devuelven '' (String(obj) puede lanzar). */
function texto(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

function esNumero(v) {
  if (vacio(v)) return true;
  if (typeof v === 'number') return Number.isFinite(v);
  return typeof v === 'string' && /^-?\d+([.,]\d+)?$/.test(v.trim());
}

/** Fecha AAAA-MM-DD real (o fecha y hora ISO con fecha real), entre 1900 y 2100. */
function esFechaIso(v) {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(v.trim());
  if (!m || !fechaLima.esFechaReal(m[1])) return false;
  const anio = Number(m[1].slice(0, 4));
  return anio >= 1900 && anio <= 2100;
}

function fechaNacimientoValida(v) {
  return typeof v === 'string' && fechaLima.esFechaReal(v.trim()) && v.trim() >= '1900-01-01' && v.trim() <= fechaLima.hoy();
}

function tipoDocumento(p) {
  const t = texto(p.tipo_documento).trim().toUpperCase();
  if (!t || t === 'DNI') return 'DNI';
  if (t.startsWith('SIN')) return 'SIN';
  return 'OTRO';
}

/** Revisa claves y valores primitivos de un objeto plano (fila del padrón o registro anidado). */
function revisarObjeto(obj, donde, { anidados = {} } = {}) {
  if (!esObjetoPlano(obj)) throw new ErrorValidacion(`${donde}: debe ser un objeto.`);
  const claves = Object.keys(obj);
  if (claves.length > MAX_CLAVES) throw new ErrorValidacion(`${donde}: tiene demasiados campos (${claves.length}).`);
  for (const k of claves) {
    if (esClaveHeredada(k) || !CLAVE_REGEX.test(k)) throw new ErrorValidacion(`${donde}: nombre de campo no permitido.`);
    const v = obj[k];
    if (Object.prototype.hasOwnProperty.call(anidados, k)) continue;
    if (v === null || typeof v === 'boolean') continue;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new ErrorValidacion(`${donde}: el campo ${k} no es un número válido.`);
      continue;
    }
    if (typeof v === 'string') {
      if (v.length > MAX_TEXTO) throw new ErrorValidacion(`${donde}: el campo ${k} supera ${MAX_TEXTO} caracteres.`);
      continue;
    }
    throw new ErrorValidacion(`${donde}: el campo ${k} debe ser texto, número o vacío.`);
  }
}

function revisarTextoCorto(v, campo, donde, max) {
  if (vacio(v)) return;
  if (typeof v !== 'string' && typeof v !== 'number') throw new ErrorValidacion(`${donde}: ${campo} debe ser texto.`);
  const s = String(v);
  if (s.length > max) throw new ErrorValidacion(`${donde}: ${campo} supera ${max} caracteres.`);
  if (SIN_MARCADO.test(s)) throw new ErrorValidacion(`${donde}: ${campo} contiene caracteres no permitidos (< o >).`);
}

/** true / false si el valor es una bandera clara (booleano, «true»/«false», «sí»/«no», 1/0); undefined si no lo es. */
function banderaClara(v) {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === 0) return v === 1;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (t === 'true' || t === 'sí' || t === 'si') return true;
    if (t === 'false' || t === 'no') return false;
  }
  return undefined;
}

/**
 * K3-02: la interfaz y la cuadrícula del padrón solo envían `estado_paciente = "Fallecido"`; nadie fijaba `fallecido`
 * y el semáforo contaba al paciente como desertor. Regla: si el registro trae una bandera `fallecido` explícita, se
 * respeta; si no la trae pero sí `estado_paciente`, la bandera sale de ReglasClinicas.esFallecido. Sin ninguno de los
 * dos no se toca lo ya guardado (upsertPatient ignora un campo ausente).
 */
function fijarFallecido(p, donde) {
  if (vacio(p.fallecido)) {
    delete p.fallecido;
    if (!vacio(p.estado_paciente)) p.fallecido = ReglasClinicas.esFallecido(p);
    return;
  }
  const bandera = banderaClara(p.fallecido);
  if (bandera === undefined) throw new ErrorValidacion(`${donde}: fallecido debe ser verdadero o falso.`);
  p.fallecido = bandera;
}

function revisarNumeros(obj, campos, donde) {
  for (const c of campos) {
    if (!esNumero(obj[c])) throw new ErrorValidacion(`${donde}: ${c} debe ser un número.`);
  }
}

function revisarLista(lista, campo, donde) {
  if (lista === undefined || lista === null) return [];
  if (!Array.isArray(lista)) throw new ErrorValidacion(`${donde}: ${campo} debe ser una lista.`);
  if (lista.length > ANIDADOS[campo]) throw new ErrorValidacion(`${donde}: ${campo} tiene más de ${ANIDADOS[campo]} elementos.`);
  return lista;
}

/**
 * Valida y limpia el lote de /padron/importar-lote. Devuelve copias limpias (sin los campos que fija el servidor).
 * `db` se usa para saber si el paciente ya existe y para detectar un id y un DNI de pacientes distintos (F2-03).
 */
function validarLotePadron(lista, db) {
  const dnis = new Set();
  return lista.map((original, i) => {
    const donde = `Fila ${i + 1}`;
    revisarObjeto(original, donde, { anidados: ANIDADOS });
    const p = Object.assign({}, original);
    for (const c of CAMPOS_DEL_SERVIDOR) delete p[c];

    // Identificación
    const tipo = tipoDocumento(p);
    const dni = texto(p.dni).trim();
    const id = texto(p.id).trim();
    if (!vacio(p.dni) && typeof p.dni !== 'string' && typeof p.dni !== 'number') throw new ErrorValidacion(`${donde}: dni debe ser texto.`);
    if (!vacio(p.id) && !ID_REGEX.test(id)) throw new ErrorValidacion(`${donde}: id inválido.`);
    // Decisión de Edward (05/11/2026): el documento es obligatorio para registrar a un paciente
    if (tipo === 'SIN' || !dni) {
      throw new ErrorValidacion(`${donde}: el documento es obligatorio (DNI, carné de extranjería o pasaporte); no se registran pacientes sin documento.`);
    }
    if (tipo === 'DNI' && !DNI_REGEX.test(dni)) throw new ErrorValidacion(`${donde}: el DNI debe tener exactamente 8 dígitos.`);
    if (tipo === 'OTRO' && !DOC_OTRO_REGEX.test(dni)) throw new ErrorValidacion(`${donde}: el número de documento debe tener de 6 a 15 letras o dígitos.`);
    if (dnis.has(dni)) throw new ErrorValidacion(`${donde}: el documento ${dni} está repetido en el lote.`);
    dnis.add(dni);
    p.dni = dni;
    if (id) p.id = id;

    const porDni = dni ? db.getPatientByDni(dni) : null;
    const porId = id ? db.getPatientByIdOrDni(id) : null;
    if (porDni && porId && String(porDni.id) !== String(porId.id)) {
      throw new ErrorValidacion(`${donde}: el id y el documento corresponden a pacientes distintos.`);
    }
    const existente = porDni || porId;

    // Datos personales
    revisarTextoCorto(p.apellidos_nombres, 'apellidos_nombres', donde, MAX_NOMBRE);
    if (!existente) {
      const nombre = texto(p.apellidos_nombres).trim();
      if (nombre.length < 3 || PLACEHOLDERS_NOMBRE.includes(nombre.toUpperCase())) {
        throw new ErrorValidacion(`${donde}: un paciente nuevo necesita apellidos y nombres.`);
      }
    }
    if (!vacio(p.fecha_nacimiento) && !fechaNacimientoValida(p.fecha_nacimiento)) {
      throw new ErrorValidacion(`${donde}: fecha_nacimiento debe ser una fecha real AAAA-MM-DD entre 1900 y hoy.`);
    }
    for (const k of Object.keys(p)) {
      if ((k.startsWith('fecha_') || k === 'proxima_cita') && k !== 'fecha_nacimiento' && !vacio(p[k]) && !esFechaIso(p[k])) {
        throw new ErrorValidacion(`${donde}: ${k} debe ser una fecha real AAAA-MM-DD.`);
      }
    }
    if (!vacio(p.sexo) && !SEXOS.includes(texto(p.sexo).trim().toUpperCase())) throw new ErrorValidacion(`${donde}: sexo no válido.`);
    if (!vacio(p.puerta_entrada_id) && !RENIPRESS_REGEX.test(texto(p.puerta_entrada_id).trim())) {
      throw new ErrorValidacion(`${donde}: puerta_entrada_id debe ser un código RENIPRESS de 8 dígitos.`);
    }
    for (const c of ['historia_clinica', 'telefono', 'sector_sanitario', 'red_salud']) revisarTextoCorto(p[c], c, donde, 200);
    // C3-01 (defensa en profundidad): la nota del duplicado se pinta en la ficha; si llegara a pintarse sin escape, un
    // «<button>» inyectado actuaría con la sesión de quien lo pulsa. Se rechaza < y > igual que los textos cortos.
    // Los textos libres (observaciones, tratamientos…) NO se tocan: «PA < 140» es legítimo y el cliente los escapa.
    revisarTextoCorto(p.nota_duplicado_padron, 'nota_duplicado_padron', donde, MAX_TEXTO);
    revisarNumeros(p, NUMEROS_PACIENTE, donde);
    fijarFallecido(p, donde);

    // Registros clínicos anidados
    revisarLista(p.conditions, 'conditions', donde).forEach((c, j) => {
      const d = `${donde}, diagnóstico ${j + 1}`;
      revisarObjeto(c, d);
      if (vacio(c.cie10_cod)) throw new ErrorValidacion(`${d}: falta el código CIE-10.`);
      revisarTextoCorto(c.cie10_cod, 'cie10_cod', d, 120);
      revisarTextoCorto(c.diagnostico, 'diagnostico', d, 300);
    });
    revisarLista(p.observations, 'observations', donde).forEach((o, j) => {
      const d = `${donde}, control ${j + 1}`;
      revisarObjeto(o, d);
      if (!vacio(o.fecha_registro) && !esFechaIso(o.fecha_registro)) throw new ErrorValidacion(`${d}: fecha_registro debe ser una fecha real.`);
      revisarNumeros(o, NUMEROS_OBSERVACION, d);
      revisarTextoCorto(o.estado_control, 'estado_control', d, 60);
    });
    revisarLista(p.appointments, 'appointments', donde).forEach((a, j) => {
      const d = `${donde}, cita ${j + 1}`;
      revisarObjeto(a, d);
      if (!esFechaIso(a.fecha_cita)) throw new ErrorValidacion(`${d}: fecha_cita debe ser una fecha real.`);
      revisarTextoCorto(a.estado, 'estado', d, 30);
    });
    revisarLista(p.medications, 'medications', donde).forEach((m, j) => revisarObjeto(m, `${donde}, medicación ${j + 1}`));
    revisarLista(p.diagnosticos, 'diagnosticos', donde).forEach(dx => revisarTextoCorto(dx, 'diagnosticos', donde, 120));
    return p;
  });
}

/**
 * Valida lo que devolvió fhirAdapter.processBundle (FHIR o webhooks). Los identificadores de FHIR son DNI (RENIEC):
 * 8 dígitos. Un paciente nuevo necesita DNI y nombre. Un diagnóstico (Condition) necesita un código CIE-10 (nunca se inventa).
 */
function validarFhir(parsedList, db) {
  parsedList.forEach((parsed, b) => {
    const pre = parsedList.length > 1 ? `Registro ${b + 1}, ` : '';
    (parsed.patients || []).forEach((p, i) => {
      const donde = `${pre}Paciente ${i + 1} (Patient)`;
      const dni = texto(p.dni).trim();
      const id = texto(p.id).trim();
      if (!ID_REGEX.test(id)) throw new ErrorValidacion(`${donde}: id inválido.`);
      // DNI, carné de extranjería o pasaporte (también por HOSIX y FHIR: decisión de Edward, 05/11/2026)
      const tipoDoc = tipoDocumento({ tipo_documento: p.tipo_documento });
      if (p._documento_invalido) throw new ErrorValidacion(`${donde}: el documento tiene caracteres no permitidos.`);
      if (dni && tipoDoc === 'DNI' && !DNI_REGEX.test(dni)) throw new ErrorValidacion(`${donde}: el identificador DNI debe tener exactamente 8 dígitos.`);
      if (dni && tipoDoc !== 'DNI' && !DOC_OTRO_REGEX.test(dni)) throw new ErrorValidacion(`${donde}: el carné de extranjería o pasaporte debe tener de 6 a 15 letras o dígitos.`);
      const porDni = dni ? db.getPatientByDni(dni) : null;
      const porId = db.getPatientByIdOrDni(id);
      if (porDni && porId && String(porDni.id) !== String(porId.id)) throw new ErrorValidacion(`${donde}: el id y el DNI corresponden a pacientes distintos.`);
      if (!porDni && !porId) {
        if (!dni) throw new ErrorValidacion(`${donde}: un paciente nuevo necesita un documento (DNI, carné de extranjería o pasaporte).`);
        const nombre = texto(p.apellidos_nombres).trim();
        if (nombre.length < 3 || PLACEHOLDERS_NOMBRE.includes(nombre.toUpperCase())) throw new ErrorValidacion(`${donde}: un paciente nuevo necesita apellidos y nombres.`);
      }
      revisarTextoCorto(p.apellidos_nombres, 'nombre', donde, MAX_NOMBRE);
      if (!vacio(p.fecha_nacimiento) && !fechaNacimientoValida(p.fecha_nacimiento)) throw new ErrorValidacion(`${donde}: la fecha de nacimiento (birthDate) debe ser una fecha real AAAA-MM-DD entre 1900 y hoy.`);
      if (!vacio(p.puerta_entrada_id) && !RENIPRESS_REGEX.test(texto(p.puerta_entrada_id))) throw new ErrorValidacion(`${donde}: el establecimiento (managingOrganization) debe ser un código RENIPRESS de 8 dígitos.`);
      for (const c of ['historia_clinica', 'telefono', 'sector_sanitario', 'financiador', 'distrito']) revisarTextoCorto(p[c], c, donde, 200);
      if (!vacio(p.direccion) && (typeof p.direccion !== 'string' || p.direccion.length > 300)) throw new ErrorValidacion(`${donde}: dirección inválida.`);
      for (const c of ['latitud', 'longitud']) {
        if (!vacio(p[c]) && (typeof p[c] !== 'number' || !Number.isFinite(p[c]))) throw new ErrorValidacion(`${donde}: ${c} debe ser un número.`);
      }
    });
    const referencia = (r, d) => {
      if (typeof r.id !== 'string' || !ID_REGEX.test(r.id)) throw new ErrorValidacion(`${d}: id inválido.`);
      const ref = texto(r.patient_id).trim();
      if (!ref || !ID_REGEX.test(ref)) throw new ErrorValidacion(`${d}: la referencia al paciente es inválida.`);
    };
    (parsed.conditions || []).forEach((c, i) => {
      const d = `${pre}Diagnóstico ${i + 1} (Condition)`;
      referencia(c, d);
      if (typeof c.cie10_cod !== 'string' || !CIE10_REGEX.test(c.cie10_cod)) throw new ErrorValidacion(`${d}: falta un código CIE-10 válido (por ejemplo I10 o E11.9).`);
      revisarTextoCorto(c.diagnostico, 'diagnóstico', d, 300);
      if (!vacio(c.fecha_diagnostico) && !esFechaIso(c.fecha_diagnostico)) throw new ErrorValidacion(`${d}: la fecha del diagnóstico (onsetDateTime) no es una fecha real.`);
    });
    (parsed.observations || []).forEach((o, i) => {
      const d = `${pre}Control ${i + 1} (Observation)`;
      referencia(o, d);
      if (!esFechaIso(o.fecha_registro)) throw new ErrorValidacion(`${d}: la fecha del control (effectiveDateTime) no es una fecha real.`);
      for (const c of NUMEROS_OBSERVACION) {
        if (!vacio(o[c]) && (typeof o[c] !== 'number' || !Number.isFinite(o[c]))) throw new ErrorValidacion(`${d}: ${c} debe ser un número.`);
      }
      for (const c of ['riesgo_cv', 'diagnostico_nutricional']) revisarTextoCorto(o[c], c, d, 60);
    });
    (parsed.appointments || []).forEach((a, i) => {
      const d = `${pre}Cita ${i + 1} (Appointment)`;
      referencia(a, d);
      if (!esFechaIso(a.fecha_cita)) throw new ErrorValidacion(`${d}: la fecha de la cita (start) no es una fecha real.`);
      revisarTextoCorto(a.estado, 'estado (status)', d, 30);
      if (!vacio(a.comentarios) && (typeof a.comentarios !== 'string' || a.comentarios.length > 500)) throw new ErrorValidacion(`${d}: el comentario (comment) debe ser un texto de hasta 500 caracteres.`);
    });
    (parsed.medications || []).forEach((m, i) => {
      const d = `${pre}Medicación ${i + 1} (Medication)`;
      referencia(m, d);
      revisarTextoCorto(m.categoria, 'categoría', d, 20);
      if (!vacio(m.esquema) && (typeof m.esquema !== 'string' || m.esquema.length > 500)) throw new ErrorValidacion(`${d}: esquema inválido.`);
    });
  });
}

module.exports = { ErrorValidacion, validarLotePadron, validarFhir, esFechaIso, texto, CAMPOS_DEL_SERVIDOR };
