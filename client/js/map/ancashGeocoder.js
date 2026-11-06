/**
 * ancashGeocoder.js
 * Geocodificador toponímico determinista para Huarmey y el departamento de Áncash (navegador y Node).
 *
 * Qué hace y qué NO hace (auditoría de geolocalización, 06/11/2026):
 * - Determinista: la misma dirección da siempre el mismo punto (hash FNV-1a, sin Math.random()).
 * - Coincidencia por palabra completa y por especificidad (frases más largas primero).
 * - Una calle que se llama como una ciudad («Jr. Huaraz», «Av. Casma», «Pje. Culebras») NO se manda a esa ciudad.
 * - Una dirección que nombra otra ciudad («Urb. Buenos Aires, Chimbote», «Jr. Belén 20, Casma») NO se queda en Huarmey.
 * - Calles del catastro (OpenStreetMap, 49 vías con nombre): el pin queda SOBRE la línea de la calle (G-05).
 *   El catastro no tiene numeración, manzana ni lote: la precisión máxima es «calle», nunca la vivienda.
 * - El sector GeoRIS se calcula por punto-en-polígono; si la calle cruza varios sectores se marca sector_incierto.
 * - Sin coincidencia: lat/lng null y precision_geo 'sin_ubicacion' (no se inventa un punto).
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(true);
  } else {
    const inst = factory(false);
    root.AncashGeocoder = inst;
    root.ancashGeocoder = inst;
  }
})(typeof window !== 'undefined' ? window : this, function (isNode) {

  const EstablecimientosRef = isNode
    ? (function () { try { return require('./establecimientos'); } catch (e) { return null; } })()
    : (typeof window !== 'undefined' ? window.EstablecimientosHuarmey : null);

  const CallesIndex = isNode
    ? (function () { try { return require('./huarmeyCallesIndex'); } catch (e) { return null; } })()
    : (typeof window !== 'undefined' ? window.HUARMEY_CALLES_INDEX : null);

  function getEstCoord(code, defLat, defLng) {
    const est = EstablecimientosRef ? EstablecimientosRef.getByCode(code) : null;
    if (est) return { lat: est.latitud, lng: est.longitud, es: est.cod_renipress };
    return { lat: defLat, lng: defLng, es: code };
  }

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
  const EST_YUGOSLAVIA = getEstCoord("00001704", -9.132220,  -78.519410);
  const EST_LA_CALETA  = getEstCoord("00001652", -9.075123,  -78.601920);
  const EST_HUARAZ     = getEstCoord("00001543", -9.534570,  -77.529310);

  /** Tipos de vía: si van justo antes de un nombre de localidad, ese nombre es una calle, no la localidad. */
  const VIAS = new Set(['JR', 'JIRON', 'AV', 'AVDA', 'AVENIDA', 'CALLE', 'CA', 'CL', 'PJE', 'PSJE', 'PSJ', 'PJ', 'PASAJE',
    'PROL', 'PROLONG', 'PROLONGACION', 'CARRETERA', 'CARR', 'MALECON', 'ALAMEDA']);
  const PASAJES = ['PJE', 'PSJE', 'PSJ', 'PASAJE'];
  const conVia = (vias, nombre) => vias.map(v => `${v} ${nombre}`);

  /**
   * Diccionario toponímico.
   * ambito: 'urbano' (casco urbano de Huarmey), 'provincia' (otra localidad de la red de Huarmey),
   *         'externo' (otra provincia o red). Una localidad 'provincia' o 'externo' nombrada en la dirección
   *         descarta las calles del casco urbano.
   * catastro: nombres de vías del catastro sobre cuya línea se pone el pin.
   * Sectores declarados = sectorización GeoRIS 62 a 72 (solo respaldo si no hay polígono).
   */
  const HUARMEY_TOPONYMS = [
    // 1. Casco urbano de Huarmey
    { keywords: ["PLAZA DE ARMAS", "CENTRO CIVICO", "CASCO URBANO", "MUNICIPALIDAD DE HUARMEY"], lat: -10.0689, lng: -78.1524, sector: "Sector 67", precision: "calle", catastro: ["Calle Plaza de Armas"] },
    { keywords: ["ALBERTO REYES"], lat: -10.0686, lng: -78.1526, sector: "Sector 67", precision: "calle", catastro: ["Avenida Alberto Reyes"] },
    { keywords: ["PATIVILCA", "JR PATIVILCA"], lat: -10.0710, lng: -78.1530, sector: "Sector 67", precision: "calle" },
    { keywords: ["28 DE JULIO", "VEINTIOCHO DE JULIO"], lat: -10.0691, lng: -78.1515, sector: "Sector 67", precision: "calle", catastro: ["Jirón 28 de Julio"] },
    { keywords: ["GARCILASO DE LA VEGA", "GARCILAZO DE LA VEGA", "GARCILASO", "GARCILAZO"], lat: -10.0650, lng: -78.1506, sector: "Sector 67", precision: "calle", catastro: ["Avenida Garcilaso de la Vega"] },
    { keywords: ["FRANCISCO BOLOGNESI", "BOLOGNESI"], lat: -10.0666, lng: -78.1533, sector: "Sector 67", precision: "calle", catastro: ["Calle Francisco Bolognesi"] },
    { keywords: ["CALLE NUEVA", "JR NUEVA", "NUEVA 117", "NUEVA 205"], lat: -10.0693, lng: -78.1540, sector: "Sector 67", precision: "calle", catastro: ["Calle Nueva"] },
    { keywords: ["VICTOR ANDRES BELAUNDE", "BELAUNDE TERRY", "BELAUNDE"], lat: -10.0708, lng: -78.1483, sector: "Sector 67", precision: "calle", catastro: ["Jirón Victor Andres Belaunde"] },
    { keywords: conVia(PASAJES, "BELAUNDE"), lat: -10.0708, lng: -78.1483, sector: "Sector 67", precision: "calle", catastro: ["Pasaje Belaunde"] },
    { keywords: ["CESAR VALLEJO", "VALLEJO"], lat: -10.0643, lng: -78.1515, sector: "Sector 67", precision: "calle", catastro: ["Calle Cesar Vallejo"] },
    { keywords: ["MANUEL SCORZA", "MANUEL ESCORSA", "SCORZA", "ESCORSA"], lat: -10.0642, lng: -78.1540, sector: "Sector 67", precision: "calle", catastro: ["Calle Manuel Scorza"] },
    { keywords: ["MANUEL GONZALES PRADA", "GONZALES PRADA", "GONZALEZ PRADA"], lat: -10.0645, lng: -78.1503, sector: "Sector 67", precision: "calle", catastro: ["Calle Gonzales Prada"] },
    { keywords: ["SAN LUIS 2DA ETAPA", "SAN LUIS SEGUNDA ETAPA", "SAN LUIS"], lat: -10.0635, lng: -78.1494, sector: "Sector 67", precision: "calle", catastro: ["Calle San Luis"] },
    { keywords: ["PRIMERO DE MAYO", "1 DE MAYO", "1RO DE MAYO"], lat: -10.0612, lng: -78.1590, sector: "Sector 67", precision: "calle", catastro: ["Calle 1 de Mayo"] },
    { keywords: ["ERNESTO REYNA"], lat: -10.0682, lng: -78.1557, sector: "Sector 67", precision: "calle", catastro: ["Calle Ernesto Reyna"] },
    { keywords: ["MARIA GRANA"], lat: -10.0682, lng: -78.1557, sector: "Sector 67", precision: "calle", catastro: ["Calle María Graña"] },
    { keywords: ["RICARDO PALMA"], lat: -10.0668, lng: -78.1517, sector: "Sector 67", precision: "calle", catastro: ["Calle Ricardo Palma"] },
    { keywords: conVia(PASAJES, "RICARDO PALMA"), lat: -10.0668, lng: -78.1517, sector: "Sector 67", precision: "calle", catastro: ["Pasaje Ricardo Palma"] },
    { keywords: ["IQUITOS", "JR IQUITOS"], lat: -10.0698, lng: -78.1505, sector: "Sector 67", precision: "calle", catastro: ["Jirón Iquitos"] },
    { keywords: conVia(PASAJES, "IQUITOS").concat(["PSJ IQYUTIS"]), lat: -10.0698, lng: -78.1505, sector: "Sector 67", precision: "calle", catastro: ["Pasaje Iquitos"] },
    { keywords: ["QUILPE", "QUILIPE"], lat: -10.0698, lng: -78.1540, sector: "Sector 67", precision: "calle", catastro: ["Calle Quilpe"] },
    { keywords: conVia(['AV', 'AVENIDA', 'CALLE', 'JR', 'JIRON', 'PROL', 'PROLONGACION'], "AIJA"), lat: -10.0676, lng: -78.1503, sector: "Sector 67", precision: "calle", catastro: ["Avenida Aija"] },
    { keywords: conVia(['JR', 'JIRON'], "CASMA"), lat: -10.0690, lng: -78.1494, sector: "Sector 67", precision: "calle", catastro: ["Jirón Casma"] },
    { keywords: conVia(['CALLE', 'CA', 'CL'], "CASMA"), lat: -10.0690, lng: -78.1494, sector: "Sector 67", precision: "calle", catastro: ["Calle Casma"] },
    { keywords: conVia(PASAJES, "CASMA"), lat: -10.0690, lng: -78.1494, sector: "Sector 67", precision: "calle", catastro: ["Pasaje Casma"] },
    { keywords: ["RAMON CASTILLA", "MARISCAL CASTILLA", "PROL CASTILLA", "CASTILLA"], lat: -10.0708, lng: -78.1541, sector: "Sector 67", precision: "calle", catastro: ["Jirón Ramón Castilla"] },
    { keywords: ["DOS DE MAYO", "2 DE MAYO"], lat: -10.0707, lng: -78.1412, sector: "Sector 67", precision: "calle", catastro: ["Jirón 2 de Mayo"] },
    { keywords: ["PARAMONGA"], lat: -10.0720, lng: -78.1540, sector: "Sector 67", precision: "calle", catastro: ["Calle Paramonga"] },
    { keywords: ["AV EL OLIVAR", "AV OLIVAR", "AVENIDA EL OLIVAR", "AVENIDA OLIVAR", "EL OLIVAR"], lat: -10.06058, lng: -78.15415, sector: "Sector 67", precision: "calle", catastro: ["Avenida El Olivar", "Avenida Olivar"] },
    { keywords: ["MIGUEL GRAU", "JR GRAU", "JIRON GRAU", "CALLE GRAU", "AV GRAU", "AVENIDA GRAU"], lat: -10.0664, lng: -78.1473, sector: "Sector 67", precision: "calle", catastro: ["Calle MIguel Grau"] },
    { keywords: ["RAYMONDI", "RAIMONDI"], lat: -10.068, lng: -78.152, sector: "Sector 67", precision: "calle", catastro: ["Jirón Raymondi"] },
    { keywords: conVia(['CALLE', 'JR', 'JIRON', 'AV'], "OLARTE"), lat: -10.068, lng: -78.152, sector: "Sector 67", precision: "calle", catastro: ["Calle Olarte"] },
    { keywords: ["JOSE SANTOS CHOCANO", "SANTOS CHOCANO", "SANTOS COCANO"], lat: -10.068, lng: -78.152, sector: "Sector 67", precision: "calle", catastro: ["Calle Jose Santos Cocano"] },
    { keywords: ["CALLE PANAMERICANA", "JR PANAMERICANA"], lat: -10.0696, lng: -78.1555, sector: "Sector 67", precision: "calle", catastro: ["Calle Panamericana"] },
    { keywords: ["ALFONSO UGARTE"], lat: -10.068, lng: -78.152, sector: "Sector 67", precision: "calle", catastro: ["Pasaje Alfonso Ugarte"] },
    { keywords: ["ELIAS AGUIRRE"], lat: -10.068, lng: -78.152, sector: "Sector 67", precision: "calle", catastro: ["Pasaje Elías Aguirre"] },
    { keywords: ["JOSE CARLOS MARIATEGUI", "MARIATEGUI", "MARIATEQUI"], lat: -10.068, lng: -78.152, sector: "Sector 67", precision: "calle", catastro: ["Pasaje Jose Carlos Mariatequi"] },
    { keywords: ["JOSE OLAYA"], lat: -10.068, lng: -78.152, sector: "Sector 67", precision: "calle", catastro: ["Pasaje Jose Olaya"] },
    { keywords: ["HORACIO ZEVALLOS", "HORACIO CEVALLOS"], lat: -10.068, lng: -78.152, sector: "Sector 67", precision: "calle", catastro: ["Pasaje Horacio Zevallos"] },
    { keywords: ["MELITON CARBAJAL", "MELITON CARVAJAL"], lat: -10.068, lng: -78.152, sector: "Sector 67", precision: "calle", catastro: ["Pasaje Meliton Carbajal"] },
    { keywords: ["2 DE ENERO", "DOS DE ENERO"], lat: -10.068, lng: -78.152, sector: "Sector 67", precision: "calle", catastro: ["Pasaje 2 de Enero"] },
    { keywords: conVia(PASAJES, "ROSARIO"), lat: -10.068, lng: -78.152, sector: "Sector 67", precision: "calle", catastro: ["Pasaje Rosario"] },
    { keywords: conVia(PASAJES, "SANTA ROSA").concat(["PARQUE SANTA ROSA"]), lat: -10.068, lng: -78.152, sector: "Sector 67", precision: "calle", catastro: ["Pasaje Santa Rosa", "Pasaje Parque Santa Rosa"] },
    { keywords: conVia(PASAJES, "HUARI"), lat: -10.068, lng: -78.152, sector: "Sector 67", precision: "calle", catastro: ["Pasaje Huari"] },
    { keywords: conVia(PASAJES, "RECUAY"), lat: -10.068, lng: -78.152, sector: "Sector 67", precision: "calle", catastro: ["Pasaje Recuay"] },
    { keywords: ["VIA DE EVITAMIENTO", "EVITAMIENTO"], lat: -10.060, lng: -78.162, sector: "Sector 68", precision: "calle", catastro: ["Vía de Evitamiento Huarmey"] },
    // Panamericana: vía de kilómetros; se deja un punto de referencia del tramo urbano (no se reparte por toda la vía)
    { keywords: ["PANAMERICANA NORTE", "PAN NORTE", "PANA NORTE", "PNM NORTE"], lat: -10.05200, lng: -78.15750, sector: "Sector 68", precision: "calle" },
    { keywords: ["EL ARENAL", "ARENAL", "AH EL ARENAL"], lat: -10.0620, lng: -78.1480, sector: "Sector 69", precision: "sector" },

    // 2. Nuevo Hospital y zona norte
    { keywords: ["NUEVO HOSPITAL DE APOYO HUARMEY", "NUEVO HOSPITAL HUARMEY", "HOSPITAL HUARMEY", "HOSPITAL DE APOYO HUARMEY", "HOSPITAL II-1", "HOSPITAL II 1"], lat: EST_HOSPITAL.lat, lng: EST_HOSPITAL.lng, sector: "Sector 68", es: EST_HOSPITAL.es, precision: "calle", fuente: "establecimiento" },
    { keywords: ["HOTEL LA SIESTA", "RESTAURANT LA SIESTA", "LA SIESTA"], lat: -10.04792, lng: -78.15401, sector: "Sector 68", precision: "sector" },
    { keywords: ["SANTO DOMINGO AMPLIACION", "AMPLIACION SANTO DOMINGO"], lat: -10.04780, lng: -78.15480, sector: "Sector 68", precision: "sector" },
    { keywords: ["AH MIRAMAR", "A H MIRAMAR", "ASENTAMIENTO HUMANO MIRAMAR", "MIRAMAR"], lat: -10.04850, lng: -78.15600, sector: "Sector 68", precision: "sector" },

    // 3. Santo Domingo, La Victoria, Buenos Aires
    { keywords: ["AH SANTO DOMINGO", "A H SANTO DOMINGO", "ASENTAMIENTO HUMANO SANTO DOMINGO", "STO DOMINGO", "SANTO DOMINGO"], lat: -10.0682, lng: -78.1495, sector: "Sector 69", precision: "sector" },
    { keywords: ["CENTRO DE SALUD LA VICTORIA", "C S LA VICTORIA", "CS LA VICTORIA"], lat: EST_VICTORIA.lat, lng: EST_VICTORIA.lng, sector: "Sector 65", es: EST_VICTORIA.es, precision: "calle", fuente: "establecimiento" },
    { keywords: ["NUEVE DE OCTUBRE", "9 DE OCTUBRE"], lat: -10.0715, lng: -78.1475, sector: "Sector 69", precision: "calle" },
    { keywords: ["BUENA VILLA", "AH BUENA VILLA"], lat: -10.0750, lng: -78.1455, sector: "Sector 69", precision: "sector" },
    { keywords: ["CALLE BELEN", "JR BELEN", "BELEN"], lat: -10.0745, lng: -78.1470, sector: "Sector 69", precision: "calle" },
    { keywords: ["JOSE GALVEZ"], lat: -10.0735, lng: -78.1460, sector: "Sector 69", precision: "calle" },
    { keywords: ["JR TRUJILLO", "JIRON TRUJILLO", "CALLE TRUJILLO"], lat: -10.0755, lng: -78.1450, sector: "Sector 69", precision: "calle" },
    { keywords: ["AH LA VICTORIA", "ASENTAMIENTO HUMANO LA VICTORIA", "LA VICTORIA"], lat: -10.0763, lng: -78.1465, sector: "Sector 69", precision: "sector" },
    { keywords: ["AH BUENOS AIRES", "ASENTAMIENTO HUMANO BUENOS AIRES", "SECTOR B8", "MANZANARES", "PAY PAY", "BUENOS AIRES"], lat: -10.0645, lng: -78.1550, sector: "Sector 67", precision: "sector" },

    // 4. Puerto Huarmey (otra localidad del distrito)
    { keywords: ["CALLE GRAU PUERTO HUARMEY", "AV GRAU PUERTO HUARMEY", "PUESTO DE SALUD PUERTO HUARMEY", "PUERTO HUARMEY", "PTO HUARMEY"], lat: EST_PUERTO.lat, lng: EST_PUERTO.lng, sector: "Sector 66", es: EST_PUERTO.es, precision: "localidad", ambito: "provincia" },
    { keywords: ["MUELLE PUERTO", "PLAYA PUERTO HUARMEY", "PLAYA PUERTO"], lat: -10.1010, lng: -78.1650, sector: "Sector 66", es: EST_PUERTO.es, precision: "localidad", ambito: "provincia" },

    // 5. Localidades rurales de la red de Huarmey (centro = establecimiento de salud de la localidad)
    { keywords: ["CALETA CULEBRAS", "PUESTO DE SALUD CULEBRAS", "DISTRITO DE CULEBRAS", "CULEBRAS"], lat: EST_CULEBRAS.lat, lng: EST_CULEBRAS.lng, sector: "Sector 62", es: EST_CULEBRAS.es, precision: "localidad", ambito: "provincia" },
    { keywords: ["MOLINO CULEBRAS", "CASERIO EL MOLINO", "PUESTO DE SALUD MOLINO", "EL MOLINO"], lat: EST_MOLINO.lat, lng: EST_MOLINO.lng, sector: "Sector 62", es: EST_MOLINO.es, precision: "localidad", ambito: "provincia" },
    { keywords: ["CASERIO QUIAN", "PUESTO DE SALUD QUIAN", "QUIAN"], lat: EST_QUIAN.lat, lng: EST_QUIAN.lng, sector: "Sector 64", es: EST_QUIAN.es, precision: "localidad", ambito: "provincia" },
    { keywords: ["CASERIO RAYPA", "PUESTO DE SALUD RAYPA", "RAYPA"], lat: EST_RAYPA.lat, lng: EST_RAYPA.lng, sector: "Sector 64", es: EST_RAYPA.es, precision: "localidad", ambito: "provincia" },
    { keywords: ["VALLE HUAMBA", "PUESTO DE SALUD HUAMBA", "CASERIO HUAMBA", "HUAMBA"], lat: EST_HUAMBA.lat, lng: EST_HUAMBA.lng, sector: "Sector 70", es: EST_HUAMBA.es, precision: "localidad", ambito: "provincia" },
    { keywords: ["CASERIO LECHERAL", "LECHERAL"], lat: -10.0510, lng: -78.1250, sector: "Sector 69", precision: "localidad", ambito: "provincia" },
    { keywords: ["CASERIO CONGON", "CONGON"], lat: -10.0350, lng: -78.0920, sector: "Sector 69", precision: "localidad", ambito: "provincia" },
    { keywords: ["PUESTO DE SALUD HUAYAN", "DISTRITO DE HUAYAN", "HUAYAN"], lat: EST_HUAYAN.lat, lng: EST_HUAYAN.lng, sector: "Sector 72", es: EST_HUAYAN.es, precision: "localidad", ambito: "provincia" },
    { keywords: ["PUESTO DE SALUD MALVAS", "DISTRITO DE MALVAS", "MALVAS"], lat: EST_MALVAS.lat, lng: EST_MALVAS.lng, sector: "Sector 71", es: EST_MALVAS.es, precision: "localidad", ambito: "provincia" },
    { keywords: ["SAN MIGUEL MALVAS", "PUESTO DE SALUD SAN MIGUEL", "CASERIO SAN MIGUEL"], lat: EST_SAN_MIGUEL.lat, lng: EST_SAN_MIGUEL.lng, sector: "Sector 71", es: EST_SAN_MIGUEL.es, precision: "localidad", ambito: "provincia" },
    { keywords: ["PUESTO DE SALUD COCHAPETI", "DISTRITO DE COCHAPETI", "ENCLAVE COCHAPETI", "COCHAPETI"], lat: EST_COCHAPETI.lat, lng: EST_COCHAPETI.lng, sector: "Sector 71", es: EST_COCHAPETI.es, precision: "localidad", ambito: "provincia" },
    { keywords: ["PUESTO DE SALUD HUANCHAY HZ", "PUESTO DE SALUD HUANCHAY", "DISTRITO DE HUANCHAY", "HUANCHAY"], lat: EST_HUANCHAY.lat, lng: EST_HUANCHAY.lng, sector: "Sector 63", es: EST_HUANCHAY.es, precision: "localidad", ambito: "provincia" },

    // 6. Otras provincias y redes (punto = hospital o centro de referencia de la ciudad)
    { keywords: ["CIUDAD DE CASMA", "DISTRITO DE CASMA", "PROVINCIA DE CASMA", "CASMA CIUDAD", "CASMA"], lat: EST_CASMA.lat, lng: EST_CASMA.lng, sector: "RIS Pacífico Sur - Casma", es: EST_CASMA.es, precision: "localidad", ambito: "externo" },
    { keywords: ["NUEVO CHIMBOTE"], lat: EST_YUGOSLAVIA.lat, lng: EST_YUGOSLAVIA.lng, sector: "RIS Pacífico Sur - Nuevo Chimbote", es: EST_YUGOSLAVIA.es, precision: "localidad", ambito: "externo" },
    // El distrito de Chimbote pertenece a la RIS Pacífico Norte (157), no a Pacífico Sur
    { keywords: ["CIUDAD DE CHIMBOTE", "DISTRITO DE CHIMBOTE", "CHIMBOTE"], lat: EST_LA_CALETA.lat, lng: EST_LA_CALETA.lng, sector: "RIS Pacífico Norte - Chimbote", es: EST_LA_CALETA.es, precision: "localidad", ambito: "externo" },
    { keywords: ["CIUDAD DE HUARAZ", "HUARAZ"], lat: EST_HUARAZ.lat, lng: EST_HUARAZ.lng, sector: "RIS Huaylas Sur 1 - Huaraz", es: EST_HUARAZ.es, precision: "localidad", ambito: "externo" }
  ];

  /**
   * Sector o centro poblado del padrón (lista de padronSchema.js) → topónimo que lo representa.
   * Se usa como CONTEXTO de la dirección: una localidad fuera del casco urbano manda sobre la calle
   * («Calle Grau» + «Puerto Huarmey»), y si la dirección no se reconoce se ubica en el sector (precisión 'sector').
   */
  const SECTOR_PADRON_A_TOPONIMO = [
    { re: /^SECTOR I\b.*CENTRO|^CENTRO$/, kw: 'CASCO URBANO', ambito: 'urbano' },
    { re: /LA VICTORIA/, kw: 'AH LA VICTORIA', ambito: 'urbano' },
    { re: /AMPLIACION|MIRAMAR/, kw: 'SANTO DOMINGO AMPLIACION', ambito: 'urbano' },
    { re: /SANTO DOMINGO/, kw: 'AH SANTO DOMINGO', ambito: 'urbano' },
    { re: /BUENOS AIRES/, kw: 'AH BUENOS AIRES', ambito: 'urbano' },
    { re: /PUERTO HUARMEY/, kw: 'PUERTO HUARMEY', ambito: 'provincia' },
    { re: /HUAMBA/, kw: 'VALLE HUAMBA', ambito: 'provincia' },
    { re: /LECHERAL/, kw: 'CASERIO LECHERAL', ambito: 'provincia' },
    { re: /CONGON|SAN ISIDRO/, kw: 'CASERIO CONGON', ambito: 'provincia' },
    { re: /CULEBRAS/, kw: 'DISTRITO DE CULEBRAS', ambito: 'provincia' },
    { re: /HUAYAN/, kw: 'DISTRITO DE HUAYAN', ambito: 'provincia' },
    { re: /MALVAS/, kw: 'DISTRITO DE MALVAS', ambito: 'provincia' },
    { re: /COCHAPETI/, kw: 'DISTRITO DE COCHAPETI', ambito: 'provincia' }
  ];

  /** Punto de origen supuesto de la numeración de las calles del casco urbano (Plaza de Armas). */
  const ORIGEN_NUMERACION = { lat: -10.0689, lng: -78.1524 };
  const LARGO_CUADRA_M = 100;

  // --- Utilidades geométricas ---
  const R = 6371000;
  const rad = x => x * Math.PI / 180;
  function haversine(lat1, lon1, lat2, lon2) {
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
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

  /** Límites de Áncash (con margen) para validar coordenadas. Fuente: extensión de las 7 RIS de GeoRIS. */
  const LIMITES_ANCASH = { latMin: -10.95, latMax: -7.95, lngMin: -78.95, lngMax: -76.65 };
  // 'exacta' = punto de la vivienda tomado en campo (GPS del dispositivo, marcado en el mapa o columnas de la matriz)
  // 'cuadra' = calle del catastro + cuadra estimada por el número de puerta (±50 m a lo largo de la calle)
  const PRECISIONES = ['exacta', 'origen', 'cuadra', 'calle', 'sector', 'localidad', 'sin_ubicacion'];

  /** Número decimal desde texto («-10.0478», «-10,0478», «−10.0478»). null si no es un número. */
  function parseCoordenada(txt) {
    if (txt === null || txt === undefined) return null;
    if (typeof txt === 'number') return Number.isFinite(txt) ? txt : null;
    const t = String(txt).trim().replace(/[\u2212\u2013]/g, '-').replace(/\s+/g, '').replace(',', '.');
    if (!/^[-+]?\d{1,3}(\.\d+)?$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  /** Par «lat, lng» en un solo texto (formato de Google Maps / WhatsApp: «-10.0478, -78.1548»). */
  function parseParCoordenadas(txt) {
    if (txt === null || txt === undefined) return null;
    const t = String(txt).trim().replace(/[\u2212\u2013]/g, '-');
    if (!t) return null;
    let partes = null;
    if (t.includes(';')) partes = t.split(';');
    else {
      const m = /^\s*([-+]?\d{1,3}(?:[.,]\d+)?)\s*(?:,\s*|\s+)([-+]?\d{1,3}(?:[.,]\d+)?)\s*$/.exec(t);
      if (m) partes = [m[1], m[2]];
    }
    if (!partes || partes.length !== 2) return null;
    const lat = parseCoordenada(partes[0]);
    const lng = parseCoordenada(partes[1]);
    return (lat === null || lng === null) ? null : { lat, lng };
  }

  function cargarBundleGeoris() {
    if (!isNode) return (typeof window !== 'undefined' && window.GEORIS_DATA_BUNDLE) ? window.GEORIS_DATA_BUNDLE : null;
    try {
      // Se evalúa en un contexto aislado: NO se crea `global.window` en el servidor
      const fs = require('fs');
      const path = require('path');
      const vm = require('vm');
      const file = path.resolve(__dirname, '../../data/georis/georisDataBundle.js');
      const sandbox = { window: {} };
      vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
      return sandbox.window.GEORIS_DATA_BUNDLE || null;
    } catch (e) {
      return null;
    }
  }

  class AncashGeocoder {
    constructor() {
      this.LIMITES_ANCASH = LIMITES_ANCASH;
      this.PRECISIONES = PRECISIONES;
      this.parseCoordenada = parseCoordenada;
      this.parseParCoordenadas = parseParCoordenadas;
      this.georisBundle = null;
      this._sectorCache = new Map();
      this._calles = new Map();
      for (const c of (CallesIndex && CallesIndex.calles) || []) this._calles.set(c.nombre, c.tramos);
      this._prepareSortedToponyms();
    }

    _initBundle() {
      if (!this.georisBundle) this.georisBundle = cargarBundleGeoris();
      return this.georisBundle;
    }

    _prepareSortedToponyms() {
      this.entries = [];
      for (const item of HUARMEY_TOPONYMS) {
        const tramos = (item.catastro || []).map(n => this._calles.get(n)).filter(Boolean).flat();
        for (const kw of item.keywords) {
          const normKw = this.normalize(kw);
          if (!normKw) continue;
          this.entries.push({
            kw: normKw,
            kwOriginal: kw,
            wordCount: normKw.split(' ').length,
            charCount: normKw.length,
            lat: item.lat,
            lng: item.lng,
            sector: item.sector,
            es: item.es || null,
            precision: item.precision || 'calle',
            ambito: item.ambito || 'urbano',
            catastro: item.catastro || null,
            tramos: tramos.length ? tramos : null,
            fuente: tramos.length ? 'catastro_osm' : (item.fuente || 'diccionario'),
            _item: item
          });
        }
      }
      this.entries.sort((a, b) => b.wordCount - a.wordCount || b.charCount - a.charCount);
    }

    /** Normaliza texto: mayúsculas, sin tildes ni puntuación, espacios simples */
    normalize(text) {
      if (text === null || text === undefined) return "";
      return String(text)
        .toUpperCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"´°ºª]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    /** Hash determinista FNV-1a (32 bits) */
    hashString(str) {
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0);
    }

    /** Posiciones (índice de inicio) donde la palabra clave aparece como palabras completas */
    _positions(cleanText, normKw) {
      const escaped = normKw.split(' ').map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
      const re = new RegExp(`(^|\\s)(${escaped})(?=\\s|$)`, 'g');
      const out = [];
      let m;
      while ((m = re.exec(cleanText)) !== null) {
        out.push(m.index + m[1].length);
        if (re.lastIndex === m.index) re.lastIndex++;
      }
      return out;
    }

    /** Palabra que precede a la posición indicada */
    _prevWord(cleanText, pos) {
      const before = cleanText.slice(0, pos).trim();
      if (!before) return '';
      const parts = before.split(' ');
      return parts[parts.length - 1];
    }

    /**
     * ¿La palabra clave aparece como palabra completa y con sentido?
     * Para localidades se descarta la aparición precedida por un tipo de vía («JR HUARAZ» es una calle).
     */
    matchesKeyword(cleanText, normKw, entry) {
      if (!cleanText || !normKw) return false;

      // «CALLE NUEVA» no debe coincidir con «CALLE NUEVA ESPERANZA», «NUEVA VICTORIA», etc.
      if (normKw === 'CALLE NUEVA' || normKw === 'JR NUEVA') {
        const nextMatch = cleanText.match(/\bNUEVA\s+([A-Z0-9]+)/);
        if (nextMatch) {
          const nextWord = nextMatch[1];
          const allowed = new Set(['S', 'SN', 'N', 'MZ', 'LT', 'LOTE', 'MANZANA', 'CDA', 'CUADRA', 'NRO', 'NO', 'NUM', 'NUMERO', 'INT', 'PISO', 'DPTO', 'HUARMEY']);
          if (!allowed.has(nextWord) && !/^\d+$/.test(nextWord)) return false;
        }
      }

      const positions = this._positions(cleanText, normKw);
      if (positions.length === 0) return false;
      const firstWord = normKw.split(' ')[0];
      if (entry && entry.precision === 'localidad' && !VIAS.has(firstWord)) {
        return positions.some(pos => !VIAS.has(this._prevWord(cleanText, pos)));
      }
      return true;
    }

    /** ¿El texto nombra a Huarmey como ciudad (no como parte de «Puerto Huarmey» ni de una vía)? */
    _mencionaHuarmey(cleanText) {
      return this._positions(cleanText, 'HUARMEY').some(pos => {
        const prev = this._prevWord(cleanText, pos);
        return prev !== 'PUERTO' && prev !== 'PTO' && prev !== 'PLAYA' && prev !== 'HOSPITAL' && !VIAS.has(prev);
      });
    }

    /** Valida un par de coordenadas para Áncash. Devuelve { ok, motivo } */
    validarCoordenadas(lat, lng) {
      if (lat === null || lat === undefined || lng === null || lng === undefined || lat === '' || lng === '') return { ok: false, motivo: 'sin_coordenadas' };
      const la = Number(lat), lo = Number(lng);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) return { ok: false, motivo: 'no_numericas' };
      const L = LIMITES_ANCASH;
      const dentro = (a, b) => a >= L.latMin && a <= L.latMax && b >= L.lngMin && b <= L.lngMax;
      if (dentro(la, lo)) return { ok: true, lat: la, lng: lo };
      if (dentro(lo, la)) return { ok: false, motivo: 'intercambiadas' };
      if (la === 0 && lo === 0) return { ok: false, motivo: 'cero' };
      return { ok: false, motivo: 'fuera_de_ancash' };
    }

    /** Sector GeoRIS por punto-en-polígono (Ray Casting) */
    getSectorFromCoordinates(lat, lng) {
      const bundle = this._initBundle();
      if (!bundle || !bundle.sectores) return null;
      const key = `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
      if (this._sectorCache.has(key)) return this._sectorCache.get(key);
      const feature = bundle.sectores.features.find(f => inGeom(lng, lat, f.geometry));
      let res = null;
      if (feature) {
        const p = feature.properties;
        res = {
          id_sector: p.id_sector,
          nombre: `Sector ${p.id_sector}`,
          ipress: p.ipress,
          cod_renipress: p.cod_reni ? String(p.cod_reni) : null,
          distrito: p.distrito,
          id_zona: p.id_zona,
          id_ris: p.id_ris
        };
      }
      if (this._sectorCache.size > 5000) this._sectorCache.clear();
      this._sectorCache.set(key, res);
      return res;
    }

    /** Sectores GeoRIS que toca una calle del catastro (para saber si el sector es incierto) */
    _sectoresDeCalle(entry) {
      if (!entry.tramos) return null;
      if (entry._item._sectores) return entry._item._sectores;
      const set = new Set();
      for (const tramo of entry.tramos) {
        for (const [la, lo] of tramo) {
          const s = this.getSectorFromCoordinates(la, lo);
          set.add(s ? s.id_sector : null);
        }
      }
      entry._item._sectores = [...set];
      return entry._item._sectores;
    }

    /** Punto sobre la línea de la calle, a una fracción t (0..1) de su longitud total */
    _puntoSobreCalle(tramos, t) {
      const segs = [];
      let total = 0;
      for (const tr of tramos) {
        for (let i = 0; i < tr.length - 1; i++) {
          const d = haversine(tr[i][0], tr[i][1], tr[i + 1][0], tr[i + 1][1]);
          segs.push([tr[i], tr[i + 1], d]);
          total += d;
        }
      }
      if (!segs.length) return { lat: tramos[0][0][0], lng: tramos[0][0][1], largo: 0 };
      let objetivo = total * t;
      for (const [a, b, d] of segs) {
        if (objetivo <= d || d === 0) {
          const f = d === 0 ? 0 : objetivo / d;
          return { lat: a[0] + (b[0] - a[0]) * f, lng: a[1] + (b[1] - a[1]) * f, largo: total };
        }
        objetivo -= d;
      }
      const last = segs[segs.length - 1][1];
      return { lat: last[0], lng: last[1], largo: total };
    }

    /**
     * Número de puerta o cuadra escrito justo después del nombre de la calle:
     * «JR BOLOGNESI 120», «JR BOLOGNESI N 120», «AV GRAU NRO 450», «CALLE NUEVA CDRA 3».
     * Devuelve { cuadra, numero } o null. «MZ A LT 5» no tiene número de puerta (null).
     */
    _numeroDePuerta(clean, normKw) {
      const pos = this._positions(clean, normKw);
      for (const p0 of pos) {
        const resto = clean.slice(p0 + normKw.length);
        let m = /^\s+(?:CUADRA|CDRA|CDA|CUAD)\s+(\d{1,2})(?=\s|$)/.exec(resto);
        if (m) return parseInt(m[1], 10) > 0 ? { cuadra: parseInt(m[1], 10), numero: null } : null;
        m = /^\s+(?:N|NO|NRO|NUM|NUMERO)?\s*(\d{1,4})(?=\s|$)/.exec(resto);
        if (m) {
          const n = parseInt(m[1], 10);
          // «28 DE JULIO», «2 DE MAYO»: un número seguido de «DE» es parte de otro nombre, no la puerta
          if (/^\s+DE\s/.test(resto.slice(m[0].length) + ' ')) continue;
          // Convención peruana: 100-199 = cuadra 1, 200-299 = cuadra 2… (1-99 se toma como cuadra 1)
          if (n > 0) return { cuadra: Math.max(1, Math.floor(n / 100)), numero: n };
        }
      }
      return null;
    }

    /**
     * Punto de la calle a la distancia de la cuadra indicada, contada desde el extremo de la calle más cercano
     * a la Plaza de Armas (supuesto: la numeración crece al alejarse del centro; verificar en campo).
     */
    _puntoPorCuadra(tramos, cuadra, cacheObj) {
      let geo = cacheObj && cacheObj._geoCuadra;
      if (!geo) {
        const puntos = [];
        for (const tr of tramos) {
          for (let i = 0; i < tr.length - 1; i++) {
            const d = haversine(tr[i][0], tr[i][1], tr[i + 1][0], tr[i + 1][1]);
            const pasos = Math.max(1, Math.ceil(d / 10));
            for (let k = 0; k <= pasos; k++) {
              const f = k / pasos;
              puntos.push([tr[i][0] + (tr[i + 1][0] - tr[i][0]) * f, tr[i][1] + (tr[i + 1][1] - tr[i][1]) * f]);
            }
          }
        }
        if (!puntos.length) return null;
        // Extremos de la calle = el par de puntos más alejado entre sí; la numeración se cuenta desde
        // el extremo más cercano a la Plaza de Armas (supuesto: la numeración crece al alejarse del centro).
        let ext = [puntos[0], puntos[0]], dExt = -1;
        for (let i = 0; i < puntos.length; i++) {
          for (let j = i + 1; j < puntos.length; j++) {
            const d = haversine(puntos[i][0], puntos[i][1], puntos[j][0], puntos[j][1]);
            if (d > dExt) { dExt = d; ext = [puntos[i], puntos[j]]; }
          }
        }
        const d0 = haversine(ext[0][0], ext[0][1], ORIGEN_NUMERACION.lat, ORIGEN_NUMERACION.lng);
        const d1 = haversine(ext[1][0], ext[1][1], ORIGEN_NUMERACION.lat, ORIGEN_NUMERACION.lng);
        const inicio = d0 <= d1 ? ext[0] : ext[1];
        geo = { puntos, inicio, largo: Math.max(dExt, 0) };
        if (cacheObj) cacheObj._geoCuadra = geo;
      }
      const objetivo = (cuadra - 0.5) * LARGO_CUADRA_M;
      if (objetivo > geo.largo + LARGO_CUADRA_M / 2) return { fuera_de_rango: true };
      let mejor = geo.inicio, err = Infinity;
      for (const p of geo.puntos) {
        const e = Math.abs(haversine(p[0], p[1], geo.inicio[0], geo.inicio[1]) - objetivo);
        if (e < err) { err = e; mejor = p; }
      }
      return { lat: mejor[0], lng: mejor[1], fuera_de_rango: false };
    }

    _sinUbicacion(motivo) {
      return {
        lat: null, lng: null, sector: null, id_sector: null, ipress_sector: null, es_puerta_id: null,
        matched: false, precision_geo: 'sin_ubicacion', toponym: null, fuente_geo: null, motivo: motivo || 'sin_coincidencia'
      };
    }

    /** Elige la entrada que corresponde a la dirección, o null */
    _elegir(clean) {
      const hits = this.entries.filter(e => this.matchesKeyword(clean, e.kw, e));
      if (!hits.length) return null;
      let candidatos = hits;
      // Una ciudad de otra provincia nombrada en la dirección manda, salvo que la dirección diga «Huarmey»
      const externos = candidatos.filter(e => e.ambito === 'externo');
      if (externos.length && !this._mencionaHuarmey(clean)) {
        candidatos = externos;
      } else {
        candidatos = candidatos.filter(e => e.ambito !== 'externo');
        // Una localidad de la red (Culebras, Puerto Huarmey, Huayán…) descarta las calles del casco urbano
        if (candidatos.some(e => e.ambito === 'provincia')) candidatos = candidatos.filter(e => e.ambito === 'provincia');
      }
      return candidatos[0] || null; // ya vienen ordenadas por especificidad
    }

    /** Geocodifica una dirección. Nunca inventa un punto cuando no hay coincidencia. */
    geocode(addressText) {
      const clean = this.normalize(addressText);
      if (!clean) return this._sinUbicacion('direccion_vacia');

      const item = this._elegir(clean);
      if (!item) return this._sinUbicacion('sin_coincidencia');

      const h = this.hashString(clean);
      let lat, lng, anchorLat, anchorLng, sectorIncierto = false;

      let cuadra = null, numero = null, detalle = null;
      if (item.tramos) {
        const np = this._numeroDePuerta(clean, item.kw);
        const pc = np ? this._puntoPorCuadra(item.tramos, np.cuadra, item._item) : null;
        if (pc && !pc.fuera_de_rango) {
          // Pin en la cuadra que indica el número de puerta (±50 m a lo largo de la calle)
          lat = anchorLat = pc.lat;
          lng = anchorLng = pc.lng;
          cuadra = np.cuadra;
          numero = np.numero;
          detalle = `cuadra ${cuadra}${numero ? ` (N.º ${numero})` : ''} estimada: numeración contada desde el extremo de la calle más cercano a la Plaza de Armas`;
        } else {
          // Sin número de puerta: pin sobre la línea de la calle; la posición a lo largo depende (fija) del texto
          const t = 0.1 + 0.8 * ((h % 10007) / 10007);
          const p = this._puntoSobreCalle(item.tramos, t);
          lat = anchorLat = p.lat;
          lng = anchorLng = p.lng;
          detalle = pc && pc.fuera_de_rango
            ? `${np.numero ? `el N.º ${np.numero}` : `la cuadra ${np.cuadra}`} pasa el largo de la calle en el catastro; se ubicó sobre la calle`
            : 'sin número de puerta: en algún punto de la calle';
        }
        const secs = this._sectoresDeCalle(item);
        sectorIncierto = !!(secs && secs.length > 1);
      } else {
        // Sin línea de calle: punto de referencia del topónimo con una dispersión fija de ±0,0003° (~±33 m)
        // solo para que los pines no se encimen. El sector se calcula sobre el punto de referencia, no sobre el disperso.
        anchorLat = item.lat;
        anchorLng = item.lng;
        lat = item.lat + ((h % 1000) / 1000 - 0.5) * 0.0006;
        lng = item.lng + (((h >>> 10) % 1000) / 1000 - 0.5) * 0.0006;
      }

      const pip = this.getSectorFromCoordinates(item.tramos ? lat : anchorLat, item.tramos ? lng : anchorLng);
      return {
        lat: parseFloat(lat.toFixed(6)),
        lng: parseFloat(lng.toFixed(6)),
        sector: pip ? `Sector ${pip.id_sector}` : item.sector,
        id_sector: pip ? pip.id_sector : null,
        id_ris: pip ? pip.id_ris : null,
        ipress_sector: pip ? pip.cod_renipress : null,
        sector_incierto: sectorIncierto,
        es_puerta_id: item.es || (pip ? pip.cod_renipress : null),
        matched: true,
        precision_geo: cuadra ? 'cuadra' : item.precision,
        cuadra,
        numero_puerta: numero,
        detalle_geo: detalle,
        toponym: item.kwOriginal,
        ambito: item.ambito,
        fuente_geo: item.fuente,
        motivo: null
      };
    }
  }

  /**
   * Decide la ubicación de un paciente con una sola regla para matriz Excel, registro directo y CSV:
   *  1. Coordenadas de la vivienda (lat/lng o «lat, lng») válidas para Áncash → precisión 'exacta'.
   *  2. Si no hay o no son válidas → dirección por el geocodificador → precisión aproximada ('calle', 'sector', 'localidad').
   *  3. Si la dirección no se reconoce → SIN UBICACIÓN (null), nunca un punto inventado.
   * @param {object} d { latitud, longitud, coordenadas, direccion, fuente } (fuente: 'matriz_excel' | 'gps_dispositivo' | 'mapa_manual' | ...)
   */
  AncashGeocoder.prototype.resolverUbicacion = function (d) {
    d = d || {};
    let lat = this.parseCoordenada(d.latitud);
    let lng = this.parseCoordenada(d.longitud);
    if ((lat === null || lng === null) && d.coordenadas) {
      const par = this.parseParCoordenadas(d.coordenadas);
      if (par) { lat = par.lat; lng = par.lng; }
    }
    const informo = (d.latitud !== undefined && d.latitud !== null && String(d.latitud).trim() !== '') ||
      (d.longitud !== undefined && d.longitud !== null && String(d.longitud).trim() !== '') ||
      (d.coordenadas !== undefined && d.coordenadas !== null && String(d.coordenadas).trim() !== '');
    let rechazo = null;
    if (lat !== null && lng !== null) {
      const v = this.validarCoordenadas(lat, lng);
      if (v.ok) {
        const pip = this.getSectorFromCoordinates(v.lat, v.lng);
        return {
          lat: parseFloat(v.lat.toFixed(6)), lng: parseFloat(v.lng.toFixed(6)),
          precision_geo: 'exacta', geo_fuente: d.fuente || 'coordenadas_informadas',
          sector: pip ? `Sector ${pip.id_sector}` : null, id_sector: pip ? pip.id_sector : null,
          ipress_sector: pip ? pip.cod_renipress : null, matched: true, exacta: true, toponym: null, coordenadas_rechazadas: null
        };
      }
      rechazo = v.motivo;
    } else if (informo) {
      rechazo = 'no_numericas';
    }
    const geo = this.geocodeConSector(d.direccion, d.sector);
    return Object.assign({}, geo, {
      geo_fuente: geo.matched ? 'geocodificador' : null,
      exacta: false,
      coordenadas_rechazadas: rechazo
    });
  };

  /** Topónimo del sector/centro poblado del padrón, o null («Otro distrito» no da contexto). */
  AncashGeocoder.prototype.toponimoDeSector = function (sector) {
    const n = this.normalize(sector);
    if (!n || /OTRO DISTRITO/.test(n)) return null;
    return SECTOR_PADRON_A_TOPONIMO.find(x => x.re.test(n)) || null;
  };

  /**
   * Dirección + sector del padrón:
   *  - Si el sector es una localidad fuera del casco urbano (Puerto Huarmey, Culebras, Huamba…) y la dirección
   *    no nombra otra localidad, manda la localidad (la calle homónima del centro sería un error de kilómetros).
   *  - Si la dirección se reconoce, se usa la dirección.
   *  - Si no, se ubica en el sector declarado con precisión 'sector'.
   */
  AncashGeocoder.prototype.geocodeConSector = function (direccion, sector) {
    const ctx = this.toponimoDeSector(sector);
    const g = this.geocode(direccion);
    if (!ctx) return g;
    if (ctx.ambito === 'provincia' && (!g.matched || g.ambito === 'urbano')) {
      const gl = this.geocode(`${this.normalize(direccion)} ${ctx.kw}`);
      if (gl.matched) return Object.assign(gl, { detalle_geo: `ubicado en la localidad del sector declarado (${sector})`, por_sector: true });
    }
    if (g.matched) return g;
    const gs = this.geocode(ctx.kw);
    if (!gs.matched) return g;
    return Object.assign(gs, {
      precision_geo: ctx.ambito === 'provincia' ? 'localidad' : 'sector',
      toponym: null,
      detalle_geo: `la dirección no se reconoció; se ubicó en el sector declarado (${sector})`,
      por_sector: true,
      motivo: 'direccion_sin_coincidencia'
    });
  };

  return new AncashGeocoder();
});
