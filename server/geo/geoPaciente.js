/**
 * geoPaciente.js
 * Geolocalización del paciente en el SERVIDOR (G-03 y G-04).
 * Usa el mismo geocodificador que el navegador (client/js/map/ancashGeocoder.js), sin tocar los conectores.
 *
 * Reglas:
 * 1. Coordenadas informadas por el origen: se validan (números, dentro de Áncash, no intercambiadas).
 *    Si son válidas se respetan (precision_geo 'origen' salvo que el origen informe otra válida).
 *    Si no son válidas se descartan y se deja constancia en geo_alerta; luego se intenta con la dirección.
 * 2. Sin coordenadas válidas: se geocodifica la dirección. Sin coincidencia, el paciente queda
 *    SIN UBICACIÓN (latitud/longitud null, precision_geo 'sin_ubicacion'), nunca en un punto inventado.
 * 3. Coordenadas ya guardadas: no se pisan, salvo que las hubiera puesto el geocodificador y la dirección cambie.
 * 4. sector_georis se calcula por punto-en-polígono; sector_sanitario no se inventa.
 */

const geocoder = require('../../client/js/map/ancashGeocoder');

const DIRECCIONES_DE_RELLENO = new Set(['', 'SIN DIRECCION CONSIGNADA', 'HUARMEY', 'S N', 'SN', 'NINGUNA', 'NO REFIERE']);
const PRECISIONES_ORIGEN = new Set(['exacta', 'origen', 'cuadra', 'calle', 'sector', 'localidad']);

function direccionReal(dir) {
  if (dir === null || dir === undefined) return null;
  const n = geocoder.normalize(dir);
  return DIRECCIONES_DE_RELLENO.has(n) ? null : String(dir);
}

function tieneCoordenadas(p) {
  return p && p.latitud !== null && p.latitud !== undefined && p.latitud !== '' &&
    p.longitud !== null && p.longitud !== undefined && p.longitud !== '';
}

/**
 * Paso previo a combinar: valida las coordenadas ENTRANTES. Las inválidas se quitan del registro
 * (para que no se guarden) y se devuelve el motivo.
 */
function validarEntrante(entrante) {
  const informo = tieneCoordenadas(entrante);
  if (!informo) {
    // Un solo valor sin su par tampoco sirve
    if (entrante && ((entrante.latitud !== undefined && entrante.latitud !== null) || (entrante.longitud !== undefined && entrante.longitud !== null))) {
      entrante.latitud = null;
      entrante.longitud = null;
      return { informo: false, valida: false, motivo: 'coordenada_incompleta' };
    }
    return { informo: false, valida: false, motivo: null };
  }
  const v = geocoder.validarCoordenadas(entrante.latitud, entrante.longitud);
  if (!v.ok) {
    entrante.latitud = null;
    entrante.longitud = null;
    return { informo: true, valida: false, motivo: v.motivo };
  }
  entrante.latitud = v.lat;
  entrante.longitud = v.lng;
  return { informo: true, valida: true, motivo: null };
}

/**
 * Paso previo a combinar, cuando el paciente ya existe: unas coordenadas APROXIMADAS (puestas por el
 * geocodificador a partir de la dirección) no reemplazan una ubicación exacta o del origen si la dirección
 * no cambió. Si la dirección cambió (el paciente se mudó), sí la reemplazan.
 */
function protegerExistente(entrante, existente, validacion) {
  if (!existente || !validacion || !validacion.valida) return validacion;
  const entranteAprox = entrante.geo_fuente === 'geocodificador';
  const existenteTiene = tieneCoordenadas(existente) && geocoder.validarCoordenadas(existente.latitud, existente.longitud).ok;
  const existenteMejor = existenteTiene && existente.geo_fuente !== 'geocodificador';
  const dirEntrante = entrante.direccion === undefined || entrante.direccion === null ? existente.direccion : entrante.direccion;
  const mismaDireccion = String(dirEntrante || '') === String(existente.direccion || '');
  if (entranteAprox && existenteMejor && mismaDireccion) {
    entrante.latitud = null;
    entrante.longitud = null;
    delete entrante.precision_geo;
    delete entrante.geo_fuente;
    delete entrante.geo_toponimo;
    return { informo: false, valida: false, motivo: null };
  }
  return validacion;
}

function aplicarSectorGeoris(reg) {
  const s = geocoder.getSectorFromCoordinates(reg.latitud, reg.longitud);
  reg.sector_georis = s ? `Sector ${s.id_sector}` : null;
  reg.id_sector_georis = s ? s.id_sector : null;
  reg.ipress_sector_georis = s ? s.cod_renipress : null;
}

function limpiarUbicacion(reg) {
  reg.latitud = null;
  reg.longitud = null;
  reg.precision_geo = 'sin_ubicacion';
  reg.geo_fuente = null;
  reg.sector_georis = null;
  reg.id_sector_georis = null;
  reg.ipress_sector_georis = null;
}

/**
 * Paso posterior a combinar: deja el registro guardado con ubicación honesta.
 * @param reg        registro ya combinado (el que se guarda)
 * @param entrante   lo que llegó (ya pasado por validarEntrante)
 * @param ctx        { validacion, esNuevo, direccionAnterior }
 */
function aplicar(reg, entrante, ctx) {
  const { validacion, esNuevo, direccionAnterior } = ctx;
  if (validacion && validacion.motivo) reg.geo_alerta = `coordenadas_rechazadas:${validacion.motivo}`;

  // 1. El origen informó coordenadas válidas
  if (validacion && validacion.valida) {
    const precEntrante = entrante.precision_geo;
    reg.precision_geo = PRECISIONES_ORIGEN.has(precEntrante) ? precEntrante : 'origen';
    reg.geo_fuente = entrante.geo_fuente === 'geocodificador' ? 'geocodificador' : (entrante.geo_fuente || 'origen');
    if (!validacion.motivo) delete reg.geo_alerta;
    delete reg.geo_motivo;
    const pm = Number(entrante.geo_precision_m);
    reg.geo_precision_m = Number.isFinite(pm) && pm > 0 && pm <= 5000 ? Math.round(pm) : null;
    aplicarSectorGeoris(reg);
    return reg;
  }

  const dir = direccionReal(reg.direccion);
  const dirCambio = !esNuevo && direccionAnterior !== undefined && String(direccionAnterior || '') !== String(reg.direccion || '');

  // 2. Ya tenía coordenadas guardadas
  if (tieneCoordenadas(reg)) {
    const v = geocoder.validarCoordenadas(reg.latitud, reg.longitud);
    const puestasPorGeocodificador = reg.geo_fuente === 'geocodificador';
    if (v.ok && !(dirCambio && puestasPorGeocodificador)) {
      if (!reg.precision_geo || reg.precision_geo === 'sin_ubicacion') reg.precision_geo = 'origen';
      if (!reg.geo_fuente) reg.geo_fuente = 'origen';
      if (dirCambio) reg.geo_alerta = 'direccion_cambio_coordenadas_del_origen_sin_actualizar';
      if (reg.sector_georis === undefined) aplicarSectorGeoris(reg);
      return reg;
    }
    if (!v.ok) reg.geo_alerta = `coordenadas_rechazadas:${v.motivo}`;
  }

  // 3. Geocodificar la dirección (o quedar sin ubicación)
  // Dirección + sector/centro poblado declarado (padrón) como contexto
  const sectorDeclarado = reg.sector || reg.sector_sanitario || null;
  const geo = dir ? geocoder.geocodeConSector(dir, sectorDeclarado) : null;
  if (geo && geo.matched) {
    reg.latitud = geo.lat;
    reg.longitud = geo.lng;
    reg.precision_geo = geo.precision_geo;
    reg.geo_fuente = 'geocodificador';
    reg.geo_toponimo = geo.toponym;
    reg.geo_detalle = geo.detalle_geo || null;
    reg.sector_incierto = !!geo.sector_incierto;
    aplicarSectorGeoris(reg);
    delete reg.geo_motivo;
    if (reg.geo_alerta && reg.geo_alerta.startsWith('direccion_cambio')) delete reg.geo_alerta;
  } else {
    limpiarUbicacion(reg);
    reg.geo_toponimo = null;
    reg.geo_motivo = dir ? 'direccion_sin_coincidencia' : 'sin_direccion';
  }
  return reg;
}

const FUENTES_MANUALES = new Set(['mapa_manual', 'gps_dispositivo']);

/**
 * Ubicación confirmada a mano (panel «Revisar ubicaciones» o registro): exacta, con quién y cuándo.
 * Devuelve { ok:true } o { ok:false, error }.
 */
function confirmarManual(reg, datos, registrante) {
  const fuente = FUENTES_MANUALES.has(datos && datos.geo_fuente) ? datos.geo_fuente : 'mapa_manual';
  const v = geocoder.validarCoordenadas(datos && datos.latitud, datos && datos.longitud);
  if (!v.ok) return { ok: false, error: `Coordenadas no válidas para Áncash (${v.motivo})` };
  reg.latitud = +v.lat.toFixed(6);
  reg.longitud = +v.lng.toFixed(6);
  reg.precision_geo = 'exacta';
  reg.geo_fuente = fuente;
  const pm = Number(datos.geo_precision_m);
  reg.geo_precision_m = Number.isFinite(pm) && pm > 0 && pm <= 5000 ? Math.round(pm) : null;
  reg.geo_confirmado_por = registrante && registrante.username ? String(registrante.username) : null;
  reg.geo_confirmado_fecha = new Date().toISOString();
  reg.geo_direccion_confirmada = reg.direccion || null;
  delete reg.geo_alerta;
  delete reg.geo_motivo;
  reg.geo_detalle = null;
  reg.sector_incierto = false;
  aplicarSectorGeoris(reg);
  if (!reg.sector_sanitario) reg.sector_sanitario = reg.sector_georis;
  return { ok: true };
}

module.exports = { validarEntrante, protegerExistente, aplicar, confirmarManual, direccionReal, tieneCoordenadas, geocoder };
