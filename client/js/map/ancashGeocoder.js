/**
 * ancashGeocoder.js
 * Geocodificador inteligente toponímico determinista para Huarmey y el departamento de Áncash.
 * Integra coordenadas oficiales GeoRIS MINSA / RENIPRESS y sectorización por punto-en-polígono.
 * - Sin Math.random(): dispersión determinista por hash de dirección para reproducibilidad.
 * - Coincidencia por palabra completa y por especificidad (frases largas primero).
 * - Sin precisión inventada: devuelve precision_geo honesta y matched: false sin coordenadas inventadas.
 */

// Carga del catálogo único de establecimientos si está en entorno Node o Browser
const EstablecimientosRef = (typeof window !== 'undefined' && window.EstablecimientosHuarmey) ||
  (typeof require !== 'undefined' ? (function () { try { return require('./establecimientos'); } catch (e) { return null; } })() : null);

function getEstCoord(code, defLat, defLng) {
  if (EstablecimientosRef) {
    const est = EstablecimientosRef.getByCode(code);
    if (est) return { lat: est.latitud, lng: est.longitud, es: est.cod_renipress };
  }
  return { lat: defLat, lng: defLng, es: code };
}

// Coordenadas verificadas de establecimientos de la red
const EST_HOSPITAL   = getEstCoord("00001741", -10.04780,  -78.15480);
const EST_VICTORIA   = getEstCoord("00001744", -10.055462, -78.159814);
const EST_PUERTO     = getEstCoord("00001742", -10.098216, -78.161813);
const EST_CULEBRAS   = getEstCoord("00001743", -9.950048,  -78.221874);
const EST_MOLINO     = getEstCoord("00001745", -9.881821,  -78.114691);
const EST_QUIAN      = getEstCoord("00001746", -9.773745,  -77.949487);
const EST_HUAMBA     = getEstCoord("00001751", -9.965200,  -77.856912);
const EST_HUAYAN     = getEstCoord("00001752", -9.875857,  -77.707839);
const EST_MALVAS     = getEstCoord("00001753", -9.926268,  -77.657878);
const EST_SAN_MIGUEL = getEstCoord("00001801", -9.945159,  -77.746954);
const EST_COCHAPETI  = getEstCoord("00001749", -9.985718,  -77.645025);
const EST_HUANCHAY   = getEstCoord("00001748", -9.724693,  -77.820581);
const EST_RAYPA      = getEstCoord("00001747", -9.745963,  -77.881366);
const EST_CASMA      = getEstCoord("00001719", -9.473970,  -78.304980);
const EST_CHIMBOTE   = getEstCoord("00001704", -9.132220,  -78.519410);
const EST_HUARAZ     = getEstCoord("00001543", -9.534570,  -77.529310);

/**
 * Diccionario toponímico oficial de Huarmey y Áncash.
 * Todos los sectores corresponden a la sectorización oficial GeoRIS (62 a 72).
 * Vías verificadas contra el Catastro Urbano de Huarmey.
 */
const HUARMEY_TOPONYMS = [
  // 1. Casco Urbano Huarmey - Calles Principales (Sector 67 GeoRIS)
  { keywords: ["PLAZA DE ARMAS", "CENTRO CIVICO", "CASCO URBANO", "MUNICIPALIDAD DE HUARMEY"], lat: -10.0689, lng: -78.1524, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["ALBERTO REYES", "JR ALBERTO REYES", "AV ALBERTO REYES"], lat: -10.0686, lng: -78.1526, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["PATIVILCA", "JR PATIVILCA"], lat: -10.0710, lng: -78.1530, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["28 DE JULIO", "JR 28 DE JULIO"], lat: -10.0691, lng: -78.1515, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["GARCILASO DE LA VEGA", "AV GARCILAZO DE LA VEGA", "GARCILASO", "GARCILAZO", "AV GARCILAZO"], lat: -10.0650, lng: -78.1506, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["BOLOGNESI", "CALLE BOLOGNESI", "JR BOLOGNESI"], lat: -10.0666, lng: -78.1533, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["CALLE NUEVA", "JR NUEVA", "NUEVA 117", "NUEVA 205"], lat: -10.0693, lng: -78.1540, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["VICTOR ANDRES BELAUNDE", "BELAUNDE TERRY", "BELAUNDE"], lat: -10.0708, lng: -78.1483, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["CESAR VALLEJO", "VALLEJO", "JR VALLEJO"], lat: -10.0643, lng: -78.1515, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["MANUEL SCORZA", "MANUEL ESCORSA", "SCORZA", "ESCORSA"], lat: -10.0642, lng: -78.1540, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["MANUEL GONZALES PRADA", "GONZALES PRADA"], lat: -10.0645, lng: -78.1503, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["SAN LUIS 2DA ETAPA", "SAN LUIS SEGUNDA ETAPA", "SAN LUIS"], lat: -10.0635, lng: -78.1494, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["PRIMERO DE MAYO", "1 DE MAYO"], lat: -10.0612, lng: -78.1590, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["CALLE ERNESTO REYNA", "ERNESTO REYNA", "MARIA GRANA"], lat: -10.0682, lng: -78.1557, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["RICARDO PALMA", "PSJ RICARDO PALMA"], lat: -10.0668, lng: -78.1517, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["IQUITOS", "JR IQUITOS", "PSJ IQUITOS", "PSJ IQYUTIS"], lat: -10.0698, lng: -78.1505, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["QUILPE", "QUILIPE", "JR QUILPE"], lat: -10.0698, lng: -78.1540, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["AV AIJA", "CALLE AIJA", "JR AIJA"], lat: -10.0676, lng: -78.1503, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["JR CASMA", "CALLE CASMA", "PASAJE CASMA"], lat: -10.0690, lng: -78.1494, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["RAMON CASTILLA", "MARISCAL CASTILLA", "PROL CASTILLA", "CASTILLA"], lat: -10.0708, lng: -78.1541, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["DOS DE MAYO", "2 DE MAYO", "JR 2 DE MAYO"], lat: -10.0707, lng: -78.1412, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["PARAMONGA", "JR PARAMONGA"], lat: -10.0720, lng: -78.1540, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  // El Olivar corregido con catastro OpenStreetMap (-10.06058, -78.15415)
  { keywords: ["AV EL OLIVAR", "AV OLIVAR", "AVENIDA EL OLIVAR", "AVENIDA OLIVAR", "EL OLIVAR"], lat: -10.06058, lng: -78.15415, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },
  // Panamericana Norte corregida con catastro OpenStreetMap (-10.05200, -78.15750)
  { keywords: ["PANAMERICANA NORTE", "PAN NORTE", "PANA NORTE", "PNM NORTE"], lat: -10.05200, lng: -78.15750, sector: "Sector 68", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["EL ARENAL", "ARENAL", "AH EL ARENAL"], lat: -10.0620, lng: -78.1480, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "sector" },

  // Grau en casco urbano de Huarmey
  { keywords: ["MIGUEL GRAU", "JR GRAU", "CALLE GRAU", "AV GRAU"], lat: -10.0664, lng: -78.1473, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle" },

  // 2. Nuevo Hospital y Zona Norte (Sector 68 GeoRIS)
  { keywords: ["NUEVO HOSPITAL DE APOYO HUARMEY", "NUEVO HOSPITAL HUARMEY", "HOSPITAL HUARMEY", "HOSPITAL DE APOYO HUARMEY", "HOSPITAL II-1"], lat: EST_HOSPITAL.lat, lng: EST_HOSPITAL.lng, sector: "Sector 68", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["HOTEL LA SIESTA", "RESTAURANT LA SIESTA", "LA SIESTA"], lat: -10.04792, lng: -78.15401, sector: "Sector 68", es: EST_HOSPITAL.es, precision: "calle" },
  { keywords: ["SANTO DOMINGO AMPLIACION", "AMPLIACION SANTO DOMINGO"], lat: -10.04780, lng: -78.15480, sector: "Sector 68", es: EST_HOSPITAL.es, precision: "sector" },
  { keywords: ["AH MIRAMAR", "A H MIRAMAR", "ASENTAMIENTO HUMANO MIRAMAR", "MIRAMAR"], lat: -10.04850, lng: -78.15600, sector: "Sector 68", es: EST_HOSPITAL.es, precision: "sector" },

  // 3. Asentamiento Humano Santo Domingo (Sector 69 GeoRIS)
  { keywords: ["AH SANTO DOMINGO", "A H SANTO DOMINGO", "ASENTAMIENTO HUMANO SANTO DOMINGO", "STO DOMINGO", "SANTO DOMINGO"], lat: -10.0682, lng: -78.1495, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "sector" },

  // 4. Asentamiento Humano La Victoria (Sector 65 y 69 GeoRIS - Cabecera Microrred)
  { keywords: ["CENTRO DE SALUD LA VICTORIA", "C S LA VICTORIA", "CS LA VICTORIA"], lat: EST_VICTORIA.lat, lng: EST_VICTORIA.lng, sector: "Sector 65", es: EST_VICTORIA.es, precision: "calle" },
  { keywords: ["NUEVE DE OCTUBRE", "9 DE OCTUBRE", "CALLE 9 DE OCTUBRE"], lat: -10.0715, lng: -78.1475, sector: "Sector 69", es: EST_VICTORIA.es, precision: "calle" },
  { keywords: ["BUENA VILLA", "AH BUENA VILLA"], lat: -10.0750, lng: -78.1455, sector: "Sector 69", es: EST_VICTORIA.es, precision: "sector" },
  { keywords: ["CALLE BELEN", "BELEN"], lat: -10.0745, lng: -78.1470, sector: "Sector 69", es: EST_VICTORIA.es, precision: "calle" },
  { keywords: ["JOSE GALVEZ", "JR JOSE GALVEZ"], lat: -10.0735, lng: -78.1460, sector: "Sector 69", es: EST_VICTORIA.es, precision: "calle" },
  { keywords: ["JR TRUJILLO", "TRUJILLO"], lat: -10.0755, lng: -78.1450, sector: "Sector 69", es: EST_VICTORIA.es, precision: "calle" },
  { keywords: ["AH LA VICTORIA", "ASENTAMIENTO HUMANO LA VICTORIA", "LA VICTORIA"], lat: -10.0763, lng: -78.1465, sector: "Sector 69", es: EST_VICTORIA.es, precision: "sector" },

  // 5. Asentamiento Humano Buenos Aires (Sector 67 GeoRIS)
  { keywords: ["AH BUENOS AIRES", "ASENTAMIENTO HUMANO BUENOS AIRES", "SECTOR B8", "MANZANARES", "PAY PAY", "PAY-PAY", "BUENOS AIRES"], lat: -10.0645, lng: -78.1550, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "sector" },

  // 6. Puerto Huarmey (Sector 66 GeoRIS - P.S. Puerto Huarmey)
  { keywords: ["CALLE GRAU PUERTO HUARMEY", "AV GRAU PUERTO HUARMEY", "PUERTO HUARMEY", "PTO HUARMEY", "PUESTO DE SALUD PUERTO HUARMEY"], lat: EST_PUERTO.lat, lng: EST_PUERTO.lng, sector: "Sector 66", es: EST_PUERTO.es, precision: "calle" },
  { keywords: ["MUELLE PUERTO", "PLAYA PUERTO HUARMEY", "PLAYA PUERTO"], lat: -10.1010, lng: -78.1650, sector: "Sector 66", es: EST_PUERTO.es, precision: "calle" },

  // 7. Distrito de Culebras (Sector 62 GeoRIS)
  { keywords: ["CALETA CULEBRAS", "PUESTO DE SALUD CULEBRAS", "DISTRITO DE CULEBRAS", "CULEBRAS"], lat: EST_CULEBRAS.lat, lng: EST_CULEBRAS.lng, sector: "Sector 62", es: EST_CULEBRAS.es, precision: "localidad" },
  { keywords: ["MOLINO CULEBRAS", "CASERIO EL MOLINO", "PUESTO DE SALUD MOLINO", "EL MOLINO"], lat: EST_MOLINO.lat, lng: EST_MOLINO.lng, sector: "Sector 62", es: EST_MOLINO.es, precision: "localidad" },

  // 8. Zona Raypa y Quian (Sector 64 GeoRIS)
  { keywords: ["CASERIO QUIAN", "PUESTO DE SALUD QUIAN", "QUIAN"], lat: EST_QUIAN.lat, lng: EST_QUIAN.lng, sector: "Sector 64", es: EST_QUIAN.es, precision: "localidad" },
  { keywords: ["CASERIO RAYPA", "PUESTO DE SALUD RAYPA", "RAYPA"], lat: EST_RAYPA.lat, lng: EST_RAYPA.lng, sector: "Sector 64", es: EST_RAYPA.es, precision: "localidad" },

  // 9. Valles y Caseríos Rurales de Huarmey
  { keywords: ["VALLE HUAMBA", "PUESTO DE SALUD HUAMBA", "CASERIO HUAMBA", "HUAMBA"], lat: EST_HUAMBA.lat, lng: EST_HUAMBA.lng, sector: "Sector 70", es: EST_HUAMBA.es, precision: "localidad" },
  { keywords: ["CASERIO LECHERAL", "LECHERAL"], lat: -10.0510, lng: -78.1250, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "localidad" },
  { keywords: ["CASERIO CONGON", "CONGON"], lat: -10.0350, lng: -78.0920, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "localidad" },

  // 10. Zona Andina de la Cuenca
  { keywords: ["PUESTO DE SALUD HUAYAN", "DISTRITO DE HUAYAN", "HUAYAN"], lat: EST_HUAYAN.lat, lng: EST_HUAYAN.lng, sector: "Sector 72", es: EST_HUAYAN.es, precision: "localidad" },
  { keywords: ["PUESTO DE SALUD MALVAS", "DISTRITO DE MALVAS", "MALVAS"], lat: EST_MALVAS.lat, lng: EST_MALVAS.lng, sector: "Sector 71", es: EST_MALVAS.es, precision: "localidad" },
  { keywords: ["SAN MIGUEL MALVAS", "PUESTO DE SALUD SAN MIGUEL", "CASERIO SAN MIGUEL"], lat: EST_SAN_MIGUEL.lat, lng: EST_SAN_MIGUEL.lng, sector: "Sector 71", es: EST_SAN_MIGUEL.es, precision: "localidad" },
  { keywords: ["PUESTO DE SALUD COCHAPETI", "DISTRITO DE COCHAPETI", "ENCLAVE COCHAPETI", "COCHAPETI"], lat: EST_COCHAPETI.lat, lng: EST_COCHAPETI.lng, sector: "Sector 71", es: EST_COCHAPETI.es, precision: "localidad" },
  { keywords: ["PUESTO DE SALUD HUANCHAY HZ", "PUESTO DE SALUD HUANCHAY", "DISTRITO DE HUANCHAY", "HUANCHAY"], lat: EST_HUANCHAY.lat, lng: EST_HUANCHAY.lng, sector: "Sector 63", es: EST_HUANCHAY.es, precision: "localidad" },

  // 11. Otros distritos principales de Áncash
  { keywords: ["CIUDAD DE CASMA", "DISTRITO DE CASMA", "PROVINCIA DE CASMA", "CASMA CIUDAD", "CASMA"], lat: EST_CASMA.lat, lng: EST_CASMA.lng, sector: "Red Pacífico Sur - Casma", es: EST_CASMA.es, precision: "localidad" },
  { keywords: ["NUEVO CHIMBOTE", "CHIMBOTE"], lat: EST_CHIMBOTE.lat, lng: EST_CHIMBOTE.lng, sector: "Red Pacífico Sur - Chimbote", es: EST_CHIMBOTE.es, precision: "localidad" },
  { keywords: ["CIUDAD DE HUARAZ", "HUARAZ"], lat: EST_HUARAZ.lat, lng: EST_HUARAZ.lng, sector: "Red Huaylas Sur - Huaraz", es: EST_HUARAZ.es, precision: "localidad" }
];

class AncashGeocoder {
  constructor() {
    this._initBundle();
    this._prepareSortedToponyms();
  }

  _initBundle() {
    this.georisBundle = (typeof window !== 'undefined' && window.GEORIS_DATA_BUNDLE) ? window.GEORIS_DATA_BUNDLE : null;
    if (!this.georisBundle && typeof require !== 'undefined') {
      try {
        const path = require('path');
        const bundlePath = path.resolve(__dirname, '../../data/georis/georisDataBundle.js');
        global.window = global.window || {};
        require(bundlePath);
        this.georisBundle = global.window.GEORIS_DATA_BUNDLE;
      } catch (e) {
        // bundle opcional en entornos restringidos
      }
    }
  }

  _prepareSortedToponyms() {
    // Normalizar y ordenar palabras clave por especificidad (más largas primero)
    this.entries = [];
    for (const item of HUARMEY_TOPONYMS) {
      for (const kw of item.keywords) {
        const normKw = this.normalize(kw);
        if (normKw) {
          this.entries.push({
            kw: normKw,
            kwOriginal: kw,
            wordCount: normKw.split(' ').length,
            charCount: normKw.length,
            lat: item.lat,
            lng: item.lng,
            sector: item.sector,
            es: item.es,
            precision: item.precision || 'calle'
          });
        }
      }
    }
    // Ordenar: primero mayor cantidad de palabras, luego mayor longitud de caracteres
    this.entries.sort((a, b) => b.wordCount - a.wordCount || b.charCount - a.charCount);
  }

  /**
   * Normaliza texto eliminando tildes, signos de puntuación y mayúsculas
   */
  normalize(text) {
    if (!text || typeof text !== 'string') return "";
    return text
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Hash determinista FNV-1a (32-bit) para dispersión reproducible de coordenadas
   */
  hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0);
  }

  /**
   * Coincidencia de palabras completas para evitar falsos positivos
   */
  matchesKeyword(cleanText, normKw) {
    if (!cleanText || !normKw) return false;

    // Regla especial: "CENTRO" no debe coincidir si es "CENTRO POBLADO" (CP) ni "CENTRO DE SALUD" (CS)
    if (normKw === 'CENTRO') {
      if (/CENTRO\s+(POBLADO|DE\s+SALUD)/i.test(cleanText) || /\b(CP|CS)\b/i.test(cleanText)) {
        return false;
      }
    }

    // Regla especial: "CALLE NUEVA" o "JR NUEVA" no debe coincidir si va seguido de otro nombre propio
    // (ej. "NUEVA ESPERANZA", "NUEVA VICTORIA", "NUEVA ALIANZA")
    if (normKw === 'CALLE NUEVA' || normKw === 'JR NUEVA' || normKw === 'NUEVA') {
      const nextMatch = cleanText.match(/\bNUEVA\s+([A-Z0-9]+)/i);
      if (nextMatch) {
        const nextWord = nextMatch[1].toUpperCase();
        const allowedDescriptors = new Set(['SN', 'S', 'N', 'MZ', 'LT', 'LOTE', 'MANZANA', 'CDA', 'CUADRA', 'NRO', 'NO', 'NUM', 'NUMERO', 'INT', 'PISO', 'DPTO']);
        if (!allowedDescriptors.has(nextWord) && !/^\d+$/.test(nextWord)) {
          return false;
        }
      }
    }

    const words = normKw.split(' ');
    if (words.length === 1) {
      const regex = new RegExp(`(^|\\s)${normKw}(\\s|$)`, 'i');
      return regex.test(cleanText);
    }

    // Para frases multipalabra, requerir secuencia exacta con límites de palabra
    const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    const regex = new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'i');
    return regex.test(cleanText);
  }

  /**
   * Calcula el sector oficial GeoRIS por Punto-en-Polígono (Ray Casting)
   */
  getSectorFromCoordinates(lat, lng) {
    if (!this.georisBundle || !this.georisBundle.sectores) {
      this._initBundle();
    }
    if (!this.georisBundle || !this.georisBundle.sectores) return null;

    const inRing = (x, y, ring) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    };

    const inGeom = (x, y, g) => {
      if (!g) return false;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      return polys.some(p => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h)));
    };

    const feature = this.georisBundle.sectores.features.find(f => inGeom(lng, lat, f.geometry));
    if (!feature) return null;

    const p = feature.properties;
    return {
      id_sector: p.id_sector,
      nombre: `Sector ${p.id_sector}`,
      ipress: p.ipress,
      distrito: p.distrito,
      id_zona: p.id_zona,
      id_ris: p.id_ris
    };
  }

  /**
   * Geocodifica una dirección hacia coordenadas exactas y sector sanitario
   */
  geocode(addressText) {
    const clean = this.normalize(addressText);
    if (!clean) {
      return {
        lat: null,
        lng: null,
        sector: null,
        es_puerta_id: null,
        matched: false,
        precision_geo: 'sin_ubicacion',
        toponym: null
      };
    }

    // 1. Búsqueda determinista por coincidencia de palabra completa en orden de especificidad
    for (const item of this.entries) {
      if (this.matchesKeyword(clean, item.kw)) {
        // Micro-dispersión determinista controlada basada en hash de la dirección para simular manzanas
        const h = this.hashString(clean);
        const jitterLat = ((h % 1000) / 1000 - 0.5) * 0.0006;
        const jitterLng = (((h >>> 10) % 1000) / 1000 - 0.5) * 0.0006;

        const finalLat = parseFloat((item.lat + jitterLat).toFixed(6));
        const finalLng = parseFloat((item.lng + jitterLng).toFixed(6));

        // Calcular sector exacto por punto-en-polígono con GeoRIS si es posible
        const pipSector = this.getSectorFromCoordinates(finalLat, finalLng);
        const sectorNombre = pipSector ? `Sector ${pipSector.id_sector}` : item.sector;

        return {
          lat: finalLat,
          lng: finalLng,
          sector: sectorNombre,
          es_puerta_id: item.es,
          matched: true,
          precision_geo: item.precision,
          toponym: item.kwOriginal
        };
      }
    }

    // 2. Si no coincide con ninguna palabra clave del catálogo: no inventar precisión
    return {
      lat: null,
      lng: null,
      sector: null,
      es_puerta_id: null,
      matched: false,
      precision_geo: 'sin_ubicacion',
      toponym: null
    };
  }
}

// Exportación compatible navegador / Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = new AncashGeocoder();
} else {
  window.AncashGeocoder = new AncashGeocoder();
  window.ancashGeocoder = window.AncashGeocoder;
}
