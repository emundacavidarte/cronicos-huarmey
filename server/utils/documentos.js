/**
 * documentos.js
 * Tipos de documento de identidad (decisión de Edward, 05/11/2026): el documento es obligatorio y puede ser DNI,
 * carné de extranjería (CE) o pasaporte, también por HOSIX y por FHIR.
 *
 * En FHIR cada tipo va con su identificador:
 *   DNI        system urn:oid:2.16.840.1.113883.4.904 (RENIEC)          type v2-0203 NNPER
 *   CE         system http://hospitalhuarmey.gob.pe/fhir/sid/carne-extranjeria  type v2-0203 PRC
 *   Pasaporte  system http://hospitalhuarmey.gob.pe/fhir/sid/pasaporte          type v2-0203 PPN
 * (Para CE y pasaporte no se conoce un OID oficial peruano: se usan sistemas propios del hospital.)
 */

const V2_0203 = 'http://terminology.hl7.org/CodeSystem/v2-0203';

const TIPOS = {
  DNI: { etiqueta: 'DNI', system: 'urn:oid:2.16.840.1.113883.4.904', codigo: 'NNPER', display: 'Documento Nacional de Identidad' },
  CE: { etiqueta: 'Carné de extranjería', system: 'http://hospitalhuarmey.gob.pe/fhir/sid/carne-extranjeria', codigo: 'PRC', display: 'Carné de extranjería' },
  PASAPORTE: { etiqueta: 'Pasaporte', system: 'http://hospitalhuarmey.gob.pe/fhir/sid/pasaporte', codigo: 'PPN', display: 'Pasaporte' }
};

const sinTildes = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Tipo a partir de un texto (DNI, CE, «Carné de extranjería», PAS, «Pasaporte», …) o null si no se reconoce. */
function tipoDesdeTexto(valor) {
  if (valor === undefined || valor === null) return null;
  const t = sinTildes(valor).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (t === 'DNI' || t === 'D N I' || t === '1' || t.startsWith('DOCUMENTO NACIONAL')) return 'DNI';
  if (t === 'CE' || t === 'C E' || t === '4' || t.startsWith('CARNE') || t.includes('EXTRANJERIA')) return 'CE';
  if (t === 'PAS' || t === 'PP' || t === '7' || t.startsWith('PASAPORTE') || t.startsWith('PASSPORT')) return 'PASAPORTE';
  return null;
}

/** Normaliza el número según el tipo: DNI solo dígitos; CE y pasaporte letras y dígitos en mayúsculas. */
function normalizar(numero, tipo) {
  const v = numero === undefined || numero === null ? '' : String(numero).trim();
  return tipo === 'DNI' ? v.replace(/\D/g, '') : v.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Sin tipo informado: 8 dígitos es DNI; solo dígitos de otra longitud, carné de extranjería; con letras, pasaporte.
 * (Supuesto para HOSIX mientras no se conozca el formato real de su envío: ver H-01.)
 */
function inferirTipo(numero) {
  const v = String(numero || '').replace(/[^A-Za-z0-9]/g, '');
  if (/^\d{8}$/.test(v)) return 'DNI';
  if (/^\d+$/.test(v)) return 'CE';
  return 'PASAPORTE';
}

/** El texto original solo puede tener letras, dígitos y separadores de formato (espacio, punto, guion). */
function crudoAceptable(valor) {
  return (typeof valor === 'string' || typeof valor === 'number') && /^[A-Za-z0-9 .\-]{1,20}$/.test(String(valor).trim());
}

function valido(numero, tipo) {
  if (tipo === 'DNI') return /^\d{8}$/.test(numero);
  return /^[A-Z0-9]{6,15}$/.test(numero);
}

const MENSAJE_INVALIDO = 'el documento debe ser un DNI de 8 dígitos, o un carné de extranjería o pasaporte de 6 a 15 letras o dígitos';

/** Identificador FHIR del documento. */
function identificadorFhir(tipo, numero) {
  const t = TIPOS[tipo];
  return { use: 'official', system: t.system, type: { coding: [{ system: V2_0203, code: t.codigo, display: t.display }] }, value: numero };
}

/** Tipo de un identificador FHIR (por su código v2-0203 o su sistema) o null si no es un documento de identidad. */
function tipoDeIdentificador(identificador) {
  if (!identificador || typeof identificador !== 'object') return null;
  const codigo = identificador.type && identificador.type.coding && identificador.type.coding[0] && identificador.type.coding[0].code;
  if (codigo === 'NNPER' || codigo === 'NI') return 'DNI';
  if (codigo === 'PRC') return 'CE';
  if (codigo === 'PPN') return 'PASAPORTE';
  const sistema = typeof identificador.system === 'string' ? identificador.system.toLowerCase() : '';
  if (sistema.includes('4.904') || sistema.includes('dni') || sistema.includes('reniec')) return 'DNI';
  if (sistema.includes('extranjeria') || sistema.includes('carne')) return 'CE';
  if (sistema.includes('pasaporte') || sistema.includes('passport')) return 'PASAPORTE';
  return null;
}

/** Clave interna ('DNI', 'CE', 'PASAPORTE') a partir de la etiqueta del padrón o del texto, o null. */
function tipoDesdeEtiqueta(etiqueta) {
  return tipoDesdeTexto(etiqueta);
}

/**
 * Lee el documento de un registro de un conector: busca el número en `camposNumero` y el tipo en `camposTipo`.
 * Devuelve { tipo, numero, etiqueta } o lanza Error con un mensaje propio.
 */
function leerDeRegistro(registro, camposNumero, camposTipo, sistema) {
  const crudo = camposNumero.map(c => registro[c]).find(v => v !== undefined && v !== null && String(v).trim() !== '');
  if (crudo === undefined) throw new Error(`Registro ${sistema} inválido: el número de documento es obligatorio (${camposNumero.join(' / ')})`);
  // Primero el texto crudo: comillas, < > o ; no se «limpian» para convertirlos en un documento válido
  if (!crudoAceptable(crudo)) throw new Error(`Registro ${sistema} inválido: el número de documento tiene caracteres no permitidos`);
  const tipoCrudo = camposTipo.map(c => registro[c]).find(v => v !== undefined && v !== null && String(v).trim() !== '');
  let tipo = null;
  if (tipoCrudo !== undefined) {
    tipo = tipoDesdeTexto(tipoCrudo);
    if (!tipo) throw new Error(`Registro ${sistema} inválido: tipo de documento no reconocido (use DNI, CE o PASAPORTE)`);
  } else {
    tipo = inferirTipo(crudo);
  }
  const numero = normalizar(crudo, tipo);
  if (!valido(numero, tipo)) throw new Error(`Registro ${sistema} inválido: ${MENSAJE_INVALIDO}`);
  return { tipo, numero, etiqueta: TIPOS[tipo].etiqueta };
}

module.exports = { TIPOS, crudoAceptable, tipoDesdeTexto, tipoDesdeEtiqueta, normalizar, inferirTipo, valido, identificadorFhir, tipoDeIdentificador, leerDeRegistro, MENSAJE_INVALIDO };
