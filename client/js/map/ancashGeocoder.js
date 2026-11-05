/**
 * ancashGeocoder.js
 * Geocodificador toponímico determinista para Huarmey y el departamento de Áncash.
 * Integra coordenadas oficiales GeoRIS MINSA / RENIPRESS, el trazo de las vías del Catastro Urbano de Huarmey
 * (OpenStreetMap) y la sectorización oficial por punto-en-polígono.
 *
 * Reglas:
 * - Determinista y sin desplazamientos inventados: la misma dirección da siempre el mismo punto, y ese punto es
 *   el del topónimo (sobre el trazo real de la vía cuando está en el catastro), no uno movido al azar.
 * - Honesto: una dirección se ubica a nivel de calle, barrio o localidad (nunca de casa, porque no hay numeración
 *   catastral). Lo dice en precision_geo. La ubicación exacta del domicilio se fija en campo (GPS o mapa).
 * - Primero la localidad: si la dirección nombra otra localidad (Puerto Huarmey, Culebras, Casma, Chimbote…),
 *   no se usan las calles homónimas del casco urbano de Huarmey.
 * - Abreviaturas normalizadas (AV/AVENIDA, JR/JIRÓN, PSJ/PSJE/PASAJE, AA.HH./A.H., P.J., C.P., MZ, LT…).
 * - Una ciudad escrita como nombre de vía («Jr. Casma», «Av. Huaraz») es la vía, no la ciudad.
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

// Coordenadas verificadas de establecimientos de la red (GeoRIS MINSA)
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

const HUARMEY = 'HUARMEY'; // casco urbano de Huarmey (capital provincial)

/**
 * Diccionario toponímico de Huarmey y Áncash.
 * - lat/lng de las vías: punto SOBRE el trazo de la vía homónima del Catastro Urbano de Huarmey (OpenStreetMap),
 *   el más cercano a su centro. Vías sin trazo con nombre en el catastro conservan su referencia anterior.
 * - sector: el que da el punto-en-polígono GeoRIS en esas coordenadas (respaldo si el bundle no está cargado).
 * - localidad: HUARMEY es el casco urbano; las demás son localidades distintas que mandan sobre las calles.
 * Las palabras clave se escriben ya con las abreviaturas normalizadas (AV, JR, PSJ, CALLE, AH, PJ, CP, PS, CS).
 */
const HUARMEY_TOPONYMS = [
  // 1. Casco urbano de Huarmey: plaza, edificios públicos y vías (catastro OSM)
  { keywords: ["PLAZA DE ARMAS DE HUARMEY", "PLAZA DE ARMAS", "CENTRO CIVICO", "CASCO URBANO"], lat: -10.068655, lng: -78.151869, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["MUNICIPALIDAD PROVINCIAL DE HUARMEY", "MUNICIPALIDAD DE HUARMEY"], lat: -10.068675, lng: -78.151621, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["TERMINAL TERRESTRE DE HUARMEY", "TERMINAL TERRESTRE"], lat: -10.070551, lng: -78.155616, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["COMISARIA DE HUARMEY", "COMISARIA HUARMEY"], lat: -10.068889, lng: -78.154443, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["AV ALBERTO REYES", "JR ALBERTO REYES", "CALLE ALBERTO REYES", "ALBERTO REYES"], lat: -10.069209, lng: -78.154370, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["JR PATIVILCA", "CALLE PATIVILCA", "PATIVILCA"], lat: -10.0710, lng: -78.1530, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["JR 28 DE JULIO", "CALLE 28 DE JULIO", "AV 28 DE JULIO", "28 DE JULIO"], lat: -10.069055, lng: -78.151239, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["AV GARCILASO DE LA VEGA", "GARCILASO DE LA VEGA", "GARCILAZO DE LA VEGA", "AV GARCILASO", "AV GARCILAZO", "GARCILASO", "GARCILAZO"], lat: -10.067324, lng: -78.150343, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE FRANCISCO BOLOGNESI", "FRANCISCO BOLOGNESI", "CALLE BOLOGNESI", "JR BOLOGNESI", "BOLOGNESI"], lat: -10.066654, lng: -78.153599, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE NUEVA", "JR NUEVA"], lat: -10.070433, lng: -78.153693, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PSJ BELAUNDE"], lat: -10.069544, lng: -78.147733, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["JR VICTOR ANDRES BELAUNDE", "VICTOR ANDRES BELAUNDE", "BELAUNDE TERRY", "JR BELAUNDE", "CALLE BELAUNDE", "AV BELAUNDE", "BELAUNDE"], lat: -10.070371, lng: -78.148454, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE CESAR VALLEJO", "JR CESAR VALLEJO", "CESAR VALLEJO", "JR VALLEJO", "CALLE VALLEJO"], lat: -10.064467, lng: -78.151440, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE MANUEL SCORZA", "MANUEL SCORZA", "MANUEL ESCORSA", "SCORZA", "ESCORSA"], lat: -10.064042, lng: -78.152715, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE MANUEL GONZALES PRADA", "MANUEL GONZALES PRADA", "CALLE GONZALES PRADA", "GONZALES PRADA", "GONZALEZ PRADA"], lat: -10.064724, lng: -78.151557, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE SAN LUIS", "SAN LUIS 2DA ETAPA", "SAN LUIS SEGUNDA ETAPA", "URB SAN LUIS", "AH SAN LUIS"], lat: -10.063427, lng: -78.149335, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE 1 DE MAYO", "JR 1 DE MAYO", "AV 1 DE MAYO", "1 DE MAYO"], lat: -10.061120, lng: -78.159242, sector: "Sector 65", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE ERNESTO REYNA", "ERNESTO REYNA"], lat: -10.068118, lng: -78.155045, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE MARIA GRANA", "MARIA GRANA"], lat: -10.067568, lng: -78.155150, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PSJ RICARDO PALMA"], lat: -10.066790, lng: -78.151623, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE RICARDO PALMA", "JR RICARDO PALMA", "RICARDO PALMA"], lat: -10.064039, lng: -78.152554, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PSJ IQUITOS", "PSJ IQYUTIS"], lat: -10.069800, lng: -78.150416, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["JR IQUITOS", "CALLE IQUITOS", "IQUITOS"], lat: -10.070483, lng: -78.150894, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE QUILPE", "JR QUILPE", "QUILPE", "QUILIPE"], lat: -10.069836, lng: -78.154245, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["AV AIJA", "CALLE AIJA", "JR AIJA"], lat: -10.067443, lng: -78.148784, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["JR CASMA"], lat: -10.069029, lng: -78.149293, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE CASMA", "AV CASMA"], lat: -10.068932, lng: -78.148032, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PSJ CASMA"], lat: -10.069964, lng: -78.149078, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["JR RAMON CASTILLA", "RAMON CASTILLA", "MARISCAL CASTILLA", "PROL CASTILLA", "JR CASTILLA", "CALLE CASTILLA"], lat: -10.070775, lng: -78.154113, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["JR 2 DE MAYO", "CALLE 2 DE MAYO", "AV 2 DE MAYO", "2 DE MAYO"], lat: -10.071319, lng: -78.146680, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE PARAMONGA", "JR PARAMONGA", "PARAMONGA"], lat: -10.071922, lng: -78.153738, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE MIGUEL GRAU", "MIGUEL GRAU", "JR GRAU", "CALLE GRAU", "AV GRAU"], lat: -10.067099, lng: -78.150514, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE JOSE SANTOS CHOCANO", "JOSE SANTOS CHOCANO", "JOSE SANTOS COCANO", "SANTOS CHOCANO"], lat: -10.062924, lng: -78.152761, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE OLARTE", "JR OLARTE"], lat: -10.070157, lng: -78.152987, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["JR RAYMONDI", "CALLE RAYMONDI", "RAYMONDI"], lat: -10.070191, lng: -78.151653, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PSJ ALFONSO UGARTE", "ALFONSO UGARTE"], lat: -10.067603, lng: -78.153624, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PSJ ELIAS AGUIRRE", "ELIAS AGUIRRE"], lat: -10.067446, lng: -78.153657, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PSJ HORACIO ZEVALLOS", "HORACIO ZEVALLOS", "HORACIO CEVALLOS"], lat: -10.063863, lng: -78.149233, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PSJ JOSE CARLOS MARIATEGUI", "JOSE CARLOS MARIATEGUI", "MARIATEGUI"], lat: -10.065929, lng: -78.153271, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PSJ JOSE OLAYA", "JOSE OLAYA"], lat: -10.071491, lng: -78.154402, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PSJ MELITON CARBAJAL", "MELITON CARBAJAL", "MELITON CARVAJAL"], lat: -10.068095, lng: -78.154379, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PSJ PARQUE SANTA ROSA", "PARQUE SANTA ROSA"], lat: -10.067454, lng: -78.154726, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PSJ SANTA ROSA"], lat: -10.067236, lng: -78.154311, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PSJ ROSARIO"], lat: -10.068140, lng: -78.148948, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PSJ HUARI"], lat: -10.069766, lng: -78.147482, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PSJ RECUAY"], lat: -10.070589, lng: -78.147637, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PSJ 2 DE ENERO", "2 DE ENERO"], lat: -10.069643, lng: -78.151618, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE PANAMERICANA"], lat: -10.069573, lng: -78.155679, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  // Avenida El Olivar (trazo OSM) y Panamericana Norte en su paso por la ciudad: vías largas, ubicación referencial
  { keywords: ["AV EL OLIVAR", "AV OLIVAR", "EL OLIVAR"], lat: -10.06058, lng: -78.15415, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["PANAMERICANA NORTE", "PAN NORTE", "PANA NORTE", "PNM NORTE", "CARRETERA PANAMERICANA"], lat: -10.05200, lng: -78.15750, sector: "Sector 68", es: EST_HOSPITAL.es, precision: "sector", localidad: HUARMEY, viaLarga: true },

  // 2. Asentamientos humanos y barrios del casco urbano (referencia de barrio)
  { keywords: ["AH EL ARENAL", "EL ARENAL", "ARENAL"], lat: -10.0620, lng: -78.1480, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "sector", localidad: HUARMEY },
  { keywords: ["NUEVO HOSPITAL DE APOYO HUARMEY", "NUEVO HOSPITAL HUARMEY", "HOSPITAL DE APOYO HUARMEY", "HOSPITAL HUARMEY", "HOSPITAL II 1"], lat: EST_HOSPITAL.lat, lng: EST_HOSPITAL.lng, sector: "Sector 68", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["HOTEL LA SIESTA", "RESTAURANT LA SIESTA", "LA SIESTA"], lat: -10.04792, lng: -78.15401, sector: "Sector 68", es: EST_HOSPITAL.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["AH SANTO DOMINGO AMPLIACION", "SANTO DOMINGO AMPLIACION", "AMPLIACION SANTO DOMINGO"], lat: -10.04780, lng: -78.15480, sector: "Sector 68", es: EST_HOSPITAL.es, precision: "sector", localidad: HUARMEY },
  { keywords: ["AH MIRAMAR", "MIRAMAR"], lat: -10.04850, lng: -78.15600, sector: "Sector 68", es: EST_HOSPITAL.es, precision: "sector", localidad: HUARMEY },
  { keywords: ["AH SANTO DOMINGO", "PJ SANTO DOMINGO", "SANTO DOMINGO"], lat: -10.0682, lng: -78.1495, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "sector", localidad: HUARMEY },
  { keywords: ["CS LA VICTORIA"], lat: EST_VICTORIA.lat, lng: EST_VICTORIA.lng, sector: "Sector 65", es: EST_VICTORIA.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["CALLE 9 DE OCTUBRE", "JR 9 DE OCTUBRE", "9 DE OCTUBRE"], lat: -10.0715, lng: -78.1475, sector: "Sector 69", es: EST_VICTORIA.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["AH BUENA VILLA", "BUENA VILLA", "BUENAVILLA"], lat: -10.0750, lng: -78.1455, sector: "Sector 69", es: EST_VICTORIA.es, precision: "sector", localidad: HUARMEY },
  { keywords: ["CALLE BELEN", "JR BELEN", "PSJ BELEN"], lat: -10.0745, lng: -78.1470, sector: "Sector 66", es: EST_VICTORIA.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["JR JOSE GALVEZ", "CALLE JOSE GALVEZ", "JOSE GALVEZ"], lat: -10.0735, lng: -78.1460, sector: "Sector 69", es: EST_VICTORIA.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["JR TRUJILLO", "CALLE TRUJILLO", "PSJ TRUJILLO"], lat: -10.0755, lng: -78.1450, sector: "Sector 69", es: EST_VICTORIA.es, precision: "calle", localidad: HUARMEY },
  { keywords: ["AH LA VICTORIA", "LA VICTORIA"], lat: -10.0763, lng: -78.1465, sector: "Sector 69", es: EST_VICTORIA.es, precision: "sector", localidad: HUARMEY },
  { keywords: ["AH BUENOS AIRES", "BUENOS AIRES", "SECTOR B8", "MANZANARES", "PAY PAY"], lat: -10.0645, lng: -78.1550, sector: "Sector 67", es: EST_HOSPITAL.es, precision: "sector", localidad: HUARMEY },

  // 3. Puerto Huarmey (Sector 66 GeoRIS, P.S. Puerto Huarmey)
  { keywords: ["CALETA PUERTO HUARMEY", "PS PUERTO HUARMEY", "CP PUERTO HUARMEY", "PUERTO DE HUARMEY", "PUERTO HUARMEY", "PTO HUARMEY"], lat: EST_PUERTO.lat, lng: EST_PUERTO.lng, sector: "Sector 66", es: EST_PUERTO.es, precision: "localidad", localidad: "PUERTO HUARMEY" },
  { keywords: ["MUELLE PUERTO HUARMEY", "PLAYA PUERTO HUARMEY", "MUELLE PUERTO", "PLAYA PUERTO"], lat: -10.1010, lng: -78.1650, sector: "Sector 66", es: EST_PUERTO.es, precision: "sector", localidad: "PUERTO HUARMEY" },

  // 4. Distrito de Culebras (Sector 62 GeoRIS)
  { keywords: ["CALETA CULEBRAS", "PS CULEBRAS", "DISTRITO DE CULEBRAS", "CP CULEBRAS", "CULEBRAS"], lat: EST_CULEBRAS.lat, lng: EST_CULEBRAS.lng, sector: "Sector 62", es: EST_CULEBRAS.es, precision: "localidad", localidad: "CULEBRAS" },
  { keywords: ["CASERIO EL MOLINO", "PS MOLINO", "MOLINO CULEBRAS", "EL MOLINO"], lat: EST_MOLINO.lat, lng: EST_MOLINO.lng, sector: "Sector 62", es: EST_MOLINO.es, precision: "localidad", localidad: "EL MOLINO" },

  // 5. Quian y Raypa (Sector 64 GeoRIS)
  { keywords: ["CASERIO QUIAN", "PS QUIAN", "QUIAN"], lat: EST_QUIAN.lat, lng: EST_QUIAN.lng, sector: "Sector 64", es: EST_QUIAN.es, precision: "localidad", localidad: "QUIAN" },
  { keywords: ["CASERIO RAYPA", "PS RAYPA", "RAYPA"], lat: EST_RAYPA.lat, lng: EST_RAYPA.lng, sector: "Sector 64", es: EST_RAYPA.es, precision: "localidad", localidad: "RAYPA" },

  // 6. Valles y caseríos rurales de Huarmey
  { keywords: ["VALLE HUAMBA", "PS HUAMBA", "CASERIO HUAMBA", "HUAMBA"], lat: EST_HUAMBA.lat, lng: EST_HUAMBA.lng, sector: "Sector 70", es: EST_HUAMBA.es, precision: "localidad", localidad: "HUAMBA" },
  { keywords: ["CASERIO LECHERAL", "LECHERAL"], lat: -10.0510, lng: -78.1250, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "localidad", localidad: "LECHERAL" },
  { keywords: ["CASERIO CONGON", "FUNDO CONGON", "CONGON"], lat: -10.0350, lng: -78.0920, sector: "Sector 69", es: EST_HOSPITAL.es, precision: "localidad", localidad: "CONGON" },

  // 7. Zona andina de la cuenca
  { keywords: ["PS HUAYAN", "DISTRITO DE HUAYAN", "HUAYAN"], lat: EST_HUAYAN.lat, lng: EST_HUAYAN.lng, sector: "Sector 72", es: EST_HUAYAN.es, precision: "localidad", localidad: "HUAYAN" },
  { keywords: ["PS MALVAS", "DISTRITO DE MALVAS", "MALVAS"], lat: EST_MALVAS.lat, lng: EST_MALVAS.lng, sector: "Sector 71", es: EST_MALVAS.es, precision: "localidad", localidad: "MALVAS" },
  { keywords: ["SAN MIGUEL MALVAS", "PS SAN MIGUEL", "CASERIO SAN MIGUEL"], lat: EST_SAN_MIGUEL.lat, lng: EST_SAN_MIGUEL.lng, sector: "Sector 71", es: EST_SAN_MIGUEL.es, precision: "localidad", localidad: "SAN MIGUEL" },
  { keywords: ["PS COCHAPETI", "DISTRITO DE COCHAPETI", "ENCLAVE COCHAPETI", "COCHAPETI"], lat: EST_COCHAPETI.lat, lng: EST_COCHAPETI.lng, sector: "Sector 71", es: EST_COCHAPETI.es, precision: "localidad", localidad: "COCHAPETI" },
  { keywords: ["PS HUANCHAY HZ", "PS HUANCHAY", "DISTRITO DE HUANCHAY", "HUANCHAY"], lat: EST_HUANCHAY.lat, lng: EST_HUANCHAY.lng, sector: "Sector 63", es: EST_HUANCHAY.es, precision: "localidad", localidad: "HUANCHAY" },

  // 8. Otras ciudades de Áncash (la ciudad, no una vía con su nombre)
  { keywords: ["CIUDAD DE CASMA", "DISTRITO DE CASMA", "PROVINCIA DE CASMA", "CASMA CIUDAD", "CASMA"], lat: EST_CASMA.lat, lng: EST_CASMA.lng, sector: "Sector 56", es: EST_CASMA.es, precision: "localidad", localidad: "CASMA", ciudad: true },
  { keywords: ["NUEVO CHIMBOTE", "CHIMBOTE"], lat: EST_CHIMBOTE.lat, lng: EST_CHIMBOTE.lng, sector: "Sector 19", es: EST_CHIMBOTE.es, precision: "localidad", localidad: "CHIMBOTE", ciudad: true },
  { keywords: ["CIUDAD DE HUARAZ", "HUARAZ"], lat: EST_HUARAZ.lat, lng: EST_HUARAZ.lng, sector: null, es: EST_HUARAZ.es, precision: "localidad", localidad: "HUARAZ", ciudad: true }
];

// Abreviaturas y variantes: se reemplazan frases completas (palabra por palabra) antes de buscar
const FRASES_EQUIVALENTES = [
  [/\bASENTAMIENTO HUMANO\b/g, 'AH'], [/\bA ?A ?H ?H\b/g, 'AH'], [/\bA H\b/g, 'AH'], [/\bAAHH\b/g, 'AH'],
  [/\bPUEBLO JOVEN\b/g, 'PJ'], [/\bP J\b/g, 'PJ'],
  [/\bCENTRO POBLADO\b/g, 'CP'], [/\bC P\b/g, 'CP'],
  [/\bPUESTO DE SALUD\b/g, 'PS'], [/\bP S\b/g, 'PS'],
  [/\bCENTRO DE SALUD\b/g, 'CS'], [/\bC S\b/g, 'CS'],
  [/\bAVENIDA\b/g, 'AV'], [/\bAVDA\b/g, 'AV'], [/\bAVE\b/g, 'AV'],
  [/\bJIRON\b/g, 'JR'], [/\bJRN\b/g, 'JR'],
  [/\bPASAJE\b/g, 'PSJ'], [/\bPSJE\b/g, 'PSJ'], [/\bPJE\b/g, 'PSJ'], [/\bPSAJE\b/g, 'PSJ'],
  [/\bCLL\b/g, 'CALLE'], [/\bCAL\b/g, 'CALLE'],
  [/\bPROLONGACION\b/g, 'PROL'],
  [/\bURBANIZACION\b/g, 'URB'],
  [/\bCARRETERA\b/g, 'CARRETERA'], [/\bCARR\b/g, 'CARRETERA'], [/\bCTRA\b/g, 'CARRETERA'],
  [/\bCAS\b/g, 'CASERIO'],
  [/\bPUERTO\b/g, 'PUERTO'], [/\bPTO\b/g, 'PUERTO'],
  [/\bSTO\b/g, 'SANTO'], [/\bSTA\b/g, 'SANTA'], [/\bAMPL\b/g, 'AMPLIACION'], [/\bAMP\b/g, 'AMPLIACION'],
  [/\bKILOMETRO\b/g, 'KM'], [/\bKMS\b/g, 'KM'],
  [/\bPRIMERO DE MAYO\b/g, '1 DE MAYO'], [/\b1RO DE MAYO\b/g, '1 DE MAYO'], [/\b1ERO DE MAYO\b/g, '1 DE MAYO'], [/\b1RO MAYO\b/g, '1 DE MAYO'],
  [/\bDOS DE MAYO\b/g, '2 DE MAYO'], [/\bNUEVE DE OCTUBRE\b/g, '9 DE OCTUBRE'], [/\bVEINTIOCHO DE JULIO\b/g, '28 DE JULIO'],
  [/\bDOS DE ENERO\b/g, '2 DE ENERO'], [/\bII 1\b/g, 'II 1']
];

// Primera palabra de un nombre de vía: si precede a una ciudad, el texto es la vía y no la ciudad
const TIPOS_DE_VIA = new Set(['AV', 'JR', 'CALLE', 'PSJ', 'PROL', 'CARRETERA', 'MALECON', 'OVALO']);
// Tipos de vía que se omiten al comparar («Jr. Pativilca 245» = «Pativilca 245» = «Ca. Pativilca 245»)
const TIPOS_DE_VIA_CLAVE = new Set(['AV', 'JR', 'CALLE', 'CA', 'PSJ', 'PROL', 'CARRETERA', 'URB']);
// Palabras que no cambian el lugar al comparar dos direcciones («Jr. Pativilca Nro 245» = «JR PATIVILCA 245»)
const PALABRAS_NEUTRAS = new Set(['NRO', 'NO', 'NUM', 'NUMERO', 'N', 'S', 'SN', 'HUARMEY', 'ANCASH', 'PERU', 'DPTO', 'INT', 'PISO', 'DE', 'LA', 'EL', 'PROVINCIA', 'DISTRITO']);

class AncashGeocoder {
  constructor() {
    this._cache = new Map();
    this._initBundle();
    this._prepareSortedToponyms();
  }

  _initBundle() {
    this.georisBundle = (typeof window !== 'undefined' && window.GEORIS_DATA_BUNDLE) ? window.GEORIS_DATA_BUNDLE : null;
    if (!this.georisBundle && typeof require !== 'undefined' && typeof __dirname !== 'undefined') {
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
    this._bboxIndex = null;
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
            precision: item.precision || 'calle',
            localidad: item.localidad || HUARMEY,
            ciudad: !!item.ciudad,
            viaLarga: !!item.viaLarga
          });
        }
      }
    }
    // Ordenar: primero mayor cantidad de palabras, luego mayor longitud de caracteres
    this.entries.sort((a, b) => b.wordCount - a.wordCount || b.charCount - a.charCount);
  }

  /**
   * Normaliza texto: mayúsculas, sin tildes, sin signos, con abreviaturas equivalentes (AV, JR, PSJ, AH, PJ, CP, PS, CS).
   */
  normalize(text) {
    if (text === null || text === undefined) return "";
    let t = String(text)
      .toUpperCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[º°]/g, " ")
      .replace(/[^A-Z0-9Ñ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!t) return "";
    for (const [re, rep] of FRASES_EQUIVALENTES) t = t.replace(re, rep);
    return t.replace(/\s+/g, ' ').trim();
  }

  /**
   * Hash determinista FNV-1a (32-bit). Se conserva por compatibilidad; ya no se usa para mover coordenadas.
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
   * Coincidencia de palabras completas para evitar falsos positivos.
   * `entry` (opcional) permite aplicar la regla de ciudad: «JR CASMA» es una vía, no la ciudad de Casma.
   */
  matchesKeyword(cleanText, normKw, entry) {
    if (!cleanText || !normKw) return false;

    // Regla especial: "CALLE NUEVA" o "JR NUEVA" no debe coincidir si va seguido de otro nombre propio
    // (ej. "NUEVA ESPERANZA", "NUEVA VICTORIA", "NUEVA ALIANZA")
    if (normKw === 'CALLE NUEVA' || normKw === 'JR NUEVA' || normKw === 'NUEVA') {
      const nextMatch = cleanText.match(/\bNUEVA\s+([A-Z0-9]+)/);
      if (nextMatch) {
        const nextWord = nextMatch[1].toUpperCase();
        const allowedDescriptors = new Set(['SN', 'S', 'N', 'MZ', 'MZA', 'LT', 'LOTE', 'MANZANA', 'CDA', 'CUADRA', 'NRO', 'NO', 'NUM', 'NUMERO', 'INT', 'PISO', 'DPTO', 'HUARMEY']);
        if (!allowedDescriptors.has(nextWord) && !/^\d+$/.test(nextWord)) {
          return false;
        }
      }
    }

    // Una vía larga con kilómetro («Panamericana Norte Km 312») no se puede ubicar en un solo punto
    if (entry && entry.viaLarga && /\bKM\s*\d/.test(cleanText)) return false;

    const escaped = normKw.split(' ').map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(' ');
    const regex = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'g');
    let m;
    while ((m = regex.exec(cleanText)) !== null) {
      if (entry && entry.ciudad) {
        // La palabra anterior a la coincidencia: si es un tipo de vía, el texto nombra una calle con nombre de ciudad
        const antes = cleanText.slice(0, m.index + m[1].length).trim().split(' ');
        const previa = antes.length ? antes[antes.length - 1] : '';
        if (TIPOS_DE_VIA.has(previa)) continue;
        // «CASMA 230»: un número de casa después del nombre indica una calle, no la ciudad
        const despues = cleanText.slice(m.index + m[0].length).trim().split(' ')[0] || '';
        if (/^\d+$/.test(despues)) continue;
      }
      return true;
    }
    return false;
  }

  /** Índice de cajas envolventes de los sectores (acelera el punto-en-polígono de miles de pacientes). */
  _getBboxIndex() {
    if (this._bboxIndex) return this._bboxIndex;
    const idx = [];
    const feats = (this.georisBundle && this.georisBundle.sectores && this.georisBundle.sectores.features) || [];
    for (const f of feats) {
      const g = f.geometry;
      if (!g) continue;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of polys) for (const pt of p[0]) {
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
      }
      idx.push({ f, polys, minX, minY, maxX, maxY });
    }
    this._bboxIndex = idx;
    return idx;
  }

  static _inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  static _inPolys(x, y, polys) {
    return polys.some(p => AncashGeocoder._inRing(x, y, p[0]) && !p.slice(1).some(h => AncashGeocoder._inRing(x, y, h)));
  }

  /**
   * Calcula el sector oficial GeoRIS por Punto-en-Polígono (Ray Casting)
   */
  getSectorFromCoordinates(lat, lng) {
    if (!this.georisBundle || !this.georisBundle.sectores) {
      this._initBundle();
    }
    if (!this.georisBundle || !this.georisBundle.sectores) return null;
    const la = Number(lat), lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;

    const hit = this._getBboxIndex().find(e =>
      lo >= e.minX && lo <= e.maxX && la >= e.minY && la <= e.maxY && AncashGeocoder._inPolys(lo, la, e.polys));
    if (!hit) return null;

    const p = hit.f.properties;
    return {
      id_sector: p.id_sector,
      nombre: `Sector ${p.id_sector}`,
      ipress: p.ipress,
      cod_reni: p.cod_reni,
      distrito: p.distrito,
      id_zona: p.id_zona,
      id_ris: p.id_ris
    };
  }

  /**
   * Zona sanitaria y RIS oficiales que contienen un punto (sirve también fuera de los sectores, en zona rural).
   */
  getTerritorioFromCoordinates(lat, lng) {
    if (!this.georisBundle) this._initBundle();
    const b = this.georisBundle;
    const la = Number(lat), lo = Number(lng);
    if (!b || !Number.isFinite(la) || !Number.isFinite(lo)) return { sector: null, zona: null, ris: null };
    const polysDe = g => (g && g.type === 'Polygon') ? [g.coordinates] : (g && g.type === 'MultiPolygon') ? g.coordinates : [];
    const zonaF = (b.zonas && b.zonas.features || []).find(f => AncashGeocoder._inPolys(lo, la, polysDe(f.geometry)));
    const risF = (b.ris && b.ris.features || []).find(f => AncashGeocoder._inPolys(lo, la, polysDe(f.geometry)));
    return {
      sector: this.getSectorFromCoordinates(la, lo),
      zona: zonaF ? { id_zona: zonaF.properties.id_zona, id_ris: zonaF.properties.id_ris, cabecera: zonaF.properties.ipress, distrito: zonaF.properties.distrito } : null,
      ris: risF ? { id_ris: risF.properties.id_ris, nombre: risF.properties.ris } : null
    };
  }

  _sinUbicacion() {
    return {
      lat: null,
      lng: null,
      sector: null,
      es_puerta_id: null,
      matched: false,
      precision_geo: 'sin_ubicacion',
      toponym: null,
      localidad: null
    };
  }

  /**
   * Geocodifica una dirección hacia el punto del topónimo más específico y su sector sanitario oficial.
   */
  geocode(addressText) {
    const clean = this.normalize(addressText);
    if (!clean) return this._sinUbicacion();
    if (this._cache.has(clean)) return { ...this._cache.get(clean) };

    // 1. Todas las coincidencias por palabra completa (ya ordenadas de la más específica a la menos)
    const hits = this.entries.filter(item => this.matchesKeyword(clean, item.kw, item));
    if (hits.length === 0) {
      const none = this._sinUbicacion();
      this._cache.set(clean, none);
      return { ...none };
    }

    // 2. Primero la localidad: si se nombra una localidad distinta del casco urbano, solo valen sus topónimos
    const otraLocalidad = hits.find(h => h.localidad !== HUARMEY);
    const candidatos = otraLocalidad ? hits.filter(h => h.localidad === otraLocalidad.localidad) : hits;
    const item = candidatos[0];

    // 3. Sector exacto por punto-en-polígono con GeoRIS (sin bundle: el sector del diccionario)
    const pipSector = this.getSectorFromCoordinates(item.lat, item.lng);
    const sectorNombre = pipSector ? `Sector ${pipSector.id_sector}` : item.sector;
    // Establecimiento de referencia: en un caserío o localidad con puesto propio, ese puesto; en el casco urbano, la
    // IPRESS oficial del sector GeoRIS (si es de la microrred Huarmey). Para otra ciudad (Casma, Chimbote, Huaraz) es
    // su establecimiento, que NO pertenece a la microrred: quien asigne la puerta de entrada debe validarlo contra el
    // catálogo (hosixParser lo hace) para no dejar al paciente fuera del alcance de su red.
    const esDeLaRed = code => !!code && !!EstablecimientosRef && EstablecimientosRef.getAllHuarmey().some(e => e.cod_renipress === String(code));
    const esSector = pipSector && esDeLaRed(pipSector.cod_reni) ? String(pipSector.cod_reni) : null;
    let esPuerta;
    if (item.ciudad) esPuerta = item.es;
    else if (item.localidad !== HUARMEY && esDeLaRed(item.es) && item.es !== EST_HOSPITAL.es) esPuerta = item.es;
    else esPuerta = esSector || item.es;

    const result = {
      lat: item.lat,
      lng: item.lng,
      sector: sectorNombre,
      es_puerta_id: esPuerta,
      matched: true,
      precision_geo: item.precision,
      toponym: item.kwOriginal,
      localidad: item.localidad
    };
    this._cache.set(clean, result);
    return { ...result };
  }
}

/**
 * Clave para comparar dos direcciones: misma clave = mismo lugar escrito de otra forma
 * («Jirón Pativilca N° 245, Huarmey» y «JR PATIVILCA 245»). Sirve para saber si el paciente se mudó.
 */
AncashGeocoder.prototype.claveDireccion = function (texto) {
  // Las referencias entre paréntesis o tras «frente a / al costado de / ref.» no cambian el lugar
  const sinRef = String(texto === null || texto === undefined ? '' : texto)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(frente|al costado|costado|cerca|altura|espalda|ref|referencia)\b[\s\S]*$/i, ' ');
  const palabras = this.normalize(sinRef).split(' ')
    .map(w => (w === 'MZA' || w === 'MANZANA') ? 'MZ' : ((w === 'LOTE' || w === 'LTE') ? 'LT' : w))
    .filter(w => w && !PALABRAS_NEUTRAS.has(w) && !TIPOS_DE_VIA_CLAVE.has(w));
  // El orden no importa («Mz F Lt 3» = «Lt 3 Mz F»)
  return palabras.sort().join(' ');
};

// Exportación compatible navegador / Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = new AncashGeocoder();
  module.exports.HUARMEY_TOPONYMS = HUARMEY_TOPONYMS;
} else {
  window.AncashGeocoder = new AncashGeocoder();
  window.ancashGeocoder = window.AncashGeocoder;
}
