/**
 * geoUbicacion.js
 * Reglas únicas para las coordenadas del domicilio del paciente (navegador y servidor).
 * - Interpreta lo que escribe o pega el personal: decimales con punto o coma, grados-minutos-segundos
 *   (10°02'52.1"S 78°09'17.3"W) y enlaces de Google Maps o de la ubicación compartida por WhatsApp.
 * - Valida rango, rechaza 0,0 y corrige latitud/longitud invertidas (en el Perú los rangos no se cruzan).
 * - Define la precisión de cada ubicación: las exactas (GPS, marcada en el mapa, coordenadas ingresadas)
 *   y las aproximadas que da el geocodificador por dirección (calle, barrio, localidad).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.GeoUbicacion = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {

  // Territorio del Perú (con margen) y del departamento de Áncash (con margen)
  const BBOX_PERU = { latMin: -18.6, latMax: 0.2, lngMin: -81.6, lngMax: -68.4 };
  const BBOX_ANCASH = { latMin: -10.95, latMax: -7.80, lngMin: -78.80, lngMax: -76.70 };

  // Precisión de la ubicación: exactas (verificadas en campo) y aproximadas (geocodificador)
  const PRECISION = {
    gps: { exacta: true, etiqueta: 'Exacta por GPS', radio_m: null },
    mapa: { exacta: true, etiqueta: 'Exacta marcada en el mapa', radio_m: 10 },
    manual: { exacta: true, etiqueta: 'Coordenadas ingresadas', radio_m: 10 },
    calle: { exacta: false, etiqueta: 'Aproximada a la calle (sin número de casa)', radio_m: 150 },
    sector: { exacta: false, etiqueta: 'Aproximada al barrio o AA.HH.', radio_m: 350 },
    localidad: { exacta: false, etiqueta: 'Aproximada a la localidad (centro poblado)', radio_m: 1000 }
  };
  const PRECISIONES_EXACTAS = Object.keys(PRECISION).filter(k => PRECISION[k].exacta);
  const PRECISIONES_VALIDAS = Object.keys(PRECISION);

  function esPrecisionExacta(precision) {
    return PRECISIONES_EXACTAS.includes(precision);
  }

  /** Convierte un valor (número o texto con punto o coma decimal) en número, o null. */
  function aNumero(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let s = String(v).trim().replace(/−/g, '-'); // signo menos tipográfico
    if (!s) return null;
    if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
    if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function enCaja(lat, lng, b) {
    return lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax;
  }

  /**
   * Valida un par latitud/longitud. Devuelve { ok:true, lat, lng, invertidas, enAncash } o { ok:false, error }.
   * Redondea a 6 decimales (≈ 0,1 m), más que suficiente para un domicilio.
   */
  function validarCoordenadas(latIn, lngIn) {
    let lat = aNumero(latIn);
    let lng = aNumero(lngIn);
    if (lat === null || lng === null) return { ok: false, error: 'La latitud y la longitud deben ser números.' };
    if (lat === 0 && lng === 0) return { ok: false, error: 'Las coordenadas 0, 0 no son una ubicación real.' };
    let invertidas = false;
    if (!enCaja(lat, lng, BBOX_PERU) && enCaja(lng, lat, BBOX_PERU)) {
      const t = lat; lat = lng; lng = t;
      invertidas = true;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { ok: false, error: 'Coordenadas fuera de rango (latitud entre -90 y 90, longitud entre -180 y 180).' };
    }
    if (!enCaja(lat, lng, BBOX_PERU)) {
      return { ok: false, error: 'Las coordenadas no están en el Perú. En Huarmey la latitud es cercana a -10.07 y la longitud a -78.15.' };
    }
    lat = Math.round(lat * 1e6) / 1e6;
    lng = Math.round(lng * 1e6) / 1e6;
    return { ok: true, lat, lng, invertidas, enAncash: enCaja(lat, lng, BBOX_ANCASH) };
  }

  /** Grados, minutos y segundos con hemisferio (S/N/W/O/E) a grados decimales. */
  function dmsADecimal(grados, minutos, segundos, hemisferio) {
    const g = Number(grados), m = Number(minutos || 0), s = Number(String(segundos || 0).replace(',', '.'));
    if (![g, m, s].every(Number.isFinite) || m >= 60 || s >= 60) return null;
    let dec = Math.abs(g) + m / 60 + s / 3600;
    const h = String(hemisferio || '').toUpperCase();
    if (h === 'S' || h === 'W' || h === 'O' || g < 0) dec = -dec;
    return dec;
  }

  /**
   * Interpreta el texto que el personal escribe o pega: "-10.0478, -78.1548", "-10,0478; -78,1548",
   * "10°02'52.1\"S 78°09'17.3\"W", o un enlace de Google Maps (…?q=-10.0478,-78.1548 / …@-10.0478,-78.1548,17z).
   * Devuelve lo mismo que validarCoordenadas.
   */
  function interpretarTexto(texto) {
    const t = String(texto === null || texto === undefined ? '' : texto).trim();
    if (!t) return { ok: false, error: 'Escriba o pegue las coordenadas.' };

    // Enlace de mapas: q=, query=, ll=, destination= o @lat,lng
    const enlace = /(?:[?&](?:q|query|ll|destination|daddr)=|@)\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i.exec(t);
    if (enlace) return validarCoordenadas(enlace[1], enlace[2]);

    // Grados-minutos-segundos
    const dmsRe = /(-?\d{1,3})\s*[°º]\s*(\d{1,2})?\s*['′]?\s*(\d{1,2}(?:[.,]\d+)?)?\s*(?:"|″|'')?\s*([NSEWO])/gi;
    const dms = [];
    let m;
    while ((m = dmsRe.exec(t)) !== null) dms.push(m);
    if (dms.length === 2) {
      const a = dmsADecimal(dms[0][1], dms[0][2], dms[0][3], dms[0][4]);
      const b = dmsADecimal(dms[1][1], dms[1][2], dms[1][3], dms[1][4]);
      if (a === null || b === null) return { ok: false, error: 'Grados, minutos o segundos fuera de rango.' };
      const esLatA = /[NS]/i.test(dms[0][4]);
      return esLatA ? validarCoordenadas(a, b) : validarCoordenadas(b, a);
    }

    // Dos números decimales (punto o coma decimal), separados por coma+espacio, punto y coma, barra o espacios
    const limpio = t.replace(/−/g, '-');
    let partes = null;
    if (/;|\//.test(limpio)) partes = limpio.split(/\s*[;/]\s*/);
    else if (/\d,\d+\s*,\s*-?\d/.test(limpio) || /\d,\d+\s+-?\d/.test(limpio)) partes = limpio.split(/\s*,\s+|\s+/).filter(Boolean);
    else if (limpio.includes(',')) partes = limpio.split(/\s*,\s*/);
    else partes = limpio.split(/\s+/);
    partes = partes.map(s => s.trim()).filter(Boolean);
    if (partes.length !== 2) {
      return { ok: false, error: 'Formato no reconocido. Ejemplo: -10.04780, -78.15480' };
    }
    return validarCoordenadas(partes[0], partes[1]);
  }

  /** Etiqueta legible de la precisión de una ubicación ya guardada. */
  function describirPrecision(p) {
    if (!p) return { clave: 'sin_ubicacion', exacta: false, etiqueta: 'Sin ubicación' };
    const tieneCoords = validarCoordenadas(p.latitud, p.longitud).ok;
    if (!tieneCoords) return { clave: 'sin_ubicacion', exacta: false, etiqueta: 'Sin ubicación' };
    const def = PRECISION[p.precision_geo];
    if (!def) return { clave: 'no_verificada', exacta: false, etiqueta: 'Ubicación no verificada', radio_m: 150 };
    let etiqueta = def.etiqueta;
    const radio = (p.precision_geo === 'gps' && Number.isFinite(Number(p.precision_m)) && Number(p.precision_m) > 0)
      ? Math.round(Number(p.precision_m))
      : def.radio_m;
    if (p.precision_geo === 'gps' && radio) etiqueta += ` (±${radio} m)`;
    return { clave: p.precision_geo, exacta: def.exacta, etiqueta, radio_m: radio };
  }

  /** Distancia geodésica en metros (Haversine). */
  function distanciaMetros(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const t = x => x * Math.PI / 180;
    const dLat = t(lat2 - lat1);
    const dLon = t(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(t(lat1)) * Math.cos(t(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /** Normaliza una dirección para compararla (mayúsculas, sin tildes ni signos ni espacios dobles). */
  function normalizarDireccion(texto) {
    return String(texto === null || texto === undefined ? '' : texto)
      .toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9Ñ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return {
    BBOX_PERU,
    BBOX_ANCASH,
    PRECISION,
    PRECISIONES_EXACTAS,
    PRECISIONES_VALIDAS,
    esPrecisionExacta,
    aNumero,
    validarCoordenadas,
    interpretarTexto,
    describirPrecision,
    distanciaMetros,
    normalizarDireccion
  };
});
