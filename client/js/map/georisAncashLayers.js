/**
 * georisAncashLayers.js
 * Capas Cartográficas Oficiales y Sistemática Geoespacial GeoRIS MINSA (Áncash)
 * Fuente: Servidores Oficiales GeoRIS MINSA (D.S. 019-2024-SA / Ley Nº 30885)
 * Incluye:
 * - 7 Redes Integradas de Salud (RIS) de Áncash con polígonos oficiales de alta precisión
 * - 44 Zonas Sanitarias (Microrredes) delimitadas oficialmente
 * - 72 Sectores Sanitarios de RIS Pacífico Sur (malla territorial a nivel comunal)
 * - Establecimientos de Área Sanitaria (Hospitales II-1, II-2)
 * - Establecimientos de Zona Sanitaria (Cabeceras I-3, I-4)
 * - Establecimientos Puerta de Entrada (Postas y Centros I-1, I-2, I-3)
 * - Establecimientos Vinculados y Red Completa RENIPRESS Áncash
 */

const GEORIS_RIS_CONFIG = {
  156: {
    id: "RIS_156",
    id_ris: 156,
    nombre: "RIS PACIFICO SUR",
    color: "#0284c7",
    fillColor: "#0284c7",
    fillOpacity: 0.12,
    weight: 3,
    center: [-9.750, -78.100],
    zoom: 9,
    hospital_principal: "HOSPITAL DE APOYO HUARMEY (II-1)",
    cod_hospital_principal: "00001741"
  },
  157: {
    id: "RIS_157",
    id_ris: 157,
    nombre: "RIS PACIFICO NORTE",
    color: "#7c3aed",
    fillColor: "#7c3aed",
    fillOpacity: 0.10,
    weight: 2.5,
    center: [-8.850, -78.400],
    zoom: 9,
    hospital_principal: "HOSPITAL LA CALETA (II-2)",
    cod_hospital_principal: "00001652"
  },
  101: {
    id: "RIS_101",
    id_ris: 101,
    nombre: "RIS HUAYLAS SUR 1",
    color: "#dc2626",
    fillColor: "#dc2626",
    fillOpacity: 0.10,
    weight: 2.5,
    center: [-9.530, -77.530],
    zoom: 9,
    hospital_principal: "HOSPITAL 'VICTOR RAMOS GUARDIA' - HUARAZ (II-2)",
    cod_hospital_principal: "00001543"
  },
  104: {
    id: "RIS_104",
    id_ris: 104,
    nombre: "RIS HUAYLAS SUR 2",
    color: "#ea580c",
    fillColor: "#ea580c",
    fillOpacity: 0.10,
    weight: 2.5,
    center: [-9.850, -77.400],
    zoom: 9,
    hospital_principal: "HOSPITAL DE APOYO RECUAY (II-1)",
    cod_hospital_principal: "00001472"
  },
  69: {
    id: "RIS_69",
    id_ris: 69,
    nombre: "RIS HUAYLAS NORTE",
    color: "#16a34a",
    fillColor: "#16a34a",
    fillOpacity: 0.10,
    weight: 2.5,
    center: [-9.050, -77.800],
    zoom: 9,
    hospital_principal: "HOSPITAL DE APOYO CARAZ (II-1)",
    cod_hospital_principal: "00001587"
  },
  111: {
    id: "RIS_111",
    id_ris: 111,
    nombre: "RIS CONCHUCOS NORTE",
    color: "#0d9488",
    fillColor: "#0d9488",
    fillOpacity: 0.10,
    weight: 2.5,
    center: [-8.650, -77.550],
    zoom: 9,
    hospital_principal: "HOSPITAL DE APOYO SIHUAS (II-1)",
    cod_hospital_principal: "00001795"
  },
  87: {
    id: "RIS_87",
    id_ris: 87,
    nombre: "RIS CONCHUCOS SUR",
    color: "#b45309",
    fillColor: "#b45309",
    fillOpacity: 0.10,
    weight: 2.5,
    center: [-9.350, -77.150],
    zoom: 9,
    hospital_principal: "HOSPITAL DE APOYO HUARI (II-1)",
    cod_hospital_principal: "00001813"
  }
};

// Paleta diferenciada para las Zonas Sanitarias de RIS Pacífico Sur (y otras RIS)
const ZONAS_COLORS = [
  "#0284c7", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#06b6d4"
];

// Cálculo geodésico Haversine (km)
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c * 10) / 10;
}

// Estimación de tiempo por carretera/trocha (minutos)
function estimateTravelTimeMinutes(km, factorCurvas = 1.35, velPromedioKmh = 45) {
  const distRealKm = km * factorCurvas;
  const horas = distRealKm / velPromedioKmh;
  return Math.round(horas * 60);
}

// Formatear minutos en texto amigable
function formatMinutes(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Punto en polígono (Polygon / MultiPolygon GeoJSON, con huecos)
function _puntoEnAnillo(x, y, r) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins;
  }
  return ins;
}
function _poligonosDe(g) {
  return (g && g.type === 'Polygon') ? [g.coordinates] : (g && g.type === 'MultiPolygon') ? g.coordinates : [];
}

// Objeto de acceso y métodos de consulta territorial
const GeorisTerritory = {
  bundle: (typeof window !== 'undefined' && window.GEORIS_DATA_BUNDLE) ? window.GEORIS_DATA_BUNDLE : null,
  _zonaPorUbicacion: null,

  isReady() {
    return !!(this.bundle && this.bundle.ris && this.bundle.zonas);
  },

  /** Zona sanitaria oficial (polígono) que contiene un punto: { id_ris, id_zona } o null. */
  zonaQueContiene(lat, lng) {
    if (!this.bundle || !this.bundle.zonas) return null;
    if (!this._indiceZonas) {
      this._indiceZonas = this.bundle.zonas.features.map(f => {
        const ps = _poligonosDe(f.geometry);
        let a = [Infinity, Infinity, -Infinity, -Infinity];
        ps.forEach(p => p[0].forEach(q => { a = [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[0]), Math.max(a[3], q[1])]; }));
        return { p: f.properties, ps, bb: a };
      });
    }
    const z = this._indiceZonas.find(e => lng >= e.bb[0] && lng <= e.bb[2] && lat >= e.bb[1] && lat <= e.bb[3] &&
      e.ps.some(p => _puntoEnAnillo(lng, lat, p[0]) && !p.slice(1).some(h => _puntoEnAnillo(lng, lat, h))));
    return z ? { id_ris: z.p.id_ris, id_zona: z.p.id_zona } : null;
  },

  /**
   * Zona de un establecimiento según su ubicación. En el bundle GeoRIS, 32 establecimientos vinculados (RIS Huaylas
   * Sur 1, Conchucos Sur y Conchucos Norte; ninguno de Huarmey) declaran un id_zona distinto del de la zona donde están
   * su punto y su puerta de entrada (los polígonos no se superponen ni dejan huecos). Para dibujarlos y filtrarlos en su
   * zona real se usa la zona que contiene el punto y se conserva la declarada en id_zona_declarada.
   */
  _zonaEstablecimiento(f) {
    const p = f.properties;
    if (!this._zonaPorUbicacion) this._zonaPorUbicacion = new Map();
    const clave = `${p.cod_reni}|${f.geometry.coordinates.join(',')}`;
    if (!this._zonaPorUbicacion.has(clave)) {
      const z = this.zonaQueContiene(f.geometry.coordinates[1], f.geometry.coordinates[0]);
      const corregida = !!z && z.id_ris === p.id_ris && z.id_zona !== p.id_zona;
      this._zonaPorUbicacion.set(clave, corregida ? { id_zona: z.id_zona, id_zona_declarada: p.id_zona } : { id_zona: p.id_zona, id_zona_declarada: null });
    }
    return this._zonaPorUbicacion.get(clave);
  },

  getAllRis() {
    if (!this.bundle || !this.bundle.ris) return [];
    return this.bundle.ris.features.map(f => {
      const p = f.properties;
      const cfg = GEORIS_RIS_CONFIG[p.id_ris] || {};
      return {
        id_ris: p.id_ris,
        nombre: p.ris,
        departamento: p.departamen || "ANCASH",
        poblacion: (p.pob_t || 0).toLocaleString(),
        hombres: (p.pob_h || 0).toLocaleString(),
        mujeres: (p.pob_m || 0).toLocaleString(),
        familias: (p.n_fam || 0).toLocaleString(),
        viviendas: (p.n_viv || 0).toLocaleString(),
        zonas_count: p.n_zona || 0,
        sectores_count: p.n_sec || 0,
        hospitales: p.hospital || "",
        color: cfg.color || "#0284c7",
        fillColor: cfg.fillColor || "#0284c7",
        fillOpacity: cfg.fillOpacity || 0.12,
        weight: cfg.weight || 2.5,
        center: cfg.center || [-9.5, -77.8],
        zoom: cfg.zoom || 9,
        hospital_principal: cfg.hospital_principal || "",
        cod_hospital_principal: cfg.cod_hospital_principal || null,
        feature: f
      };
    });
  },

  getRisById(idRis) {
    const numericId = parseInt(idRis, 10);
    return this.getAllRis().find(r => r.id_ris === numericId);
  },

  getZonasByRis(idRis) {
    if (!this.bundle || !this.bundle.zonas) return [];
    let list = this.bundle.zonas.features;
    if (idRis && idRis !== 'ALL') {
      const numericId = parseInt(idRis, 10);
      list = list.filter(f => f.properties.id_ris === numericId);
    }
    return list.map((f, idx) => {
      const p = f.properties;
      const color = ZONAS_COLORS[idx % ZONAS_COLORS.length];
      return {
        id_zona: p.id_zona,
        id_ris: p.id_ris,
        ris: p.ris,
        nombre: `ZONA SANITARIA ${p.distrito || p.ipress}`,
        cabecera: p.ipress,
        categoria: p.categoria,
        cod_renipress: p.cod_reni,
        distrito: p.distrito,
        provincia: p.provincia,
        poblacion: (p.pob_t || 0).toLocaleString(),
        poblacion_num: p.pob_t || 0,
        sectores_count: p.n_sec || 0,
        viviendas: (p.n_viv || 0).toLocaleString(),
        familias: (p.n_fam || 0).toLocaleString(),
        color: color,
        feature: f
      };
    });
  },

  getSectoresByZona(idZona, idRis = 156) {
    if (!this.bundle || !this.bundle.sectores) return [];
    let list = this.bundle.sectores.features;
    if (idRis) {
      list = list.filter(f => f.properties.id_ris === parseInt(idRis, 10));
    }
    if (idZona && idZona !== 'ALL') {
      list = list.filter(f => f.properties.id_zona === parseInt(idZona, 10));
    }
    return list;
  },

  getHospitalesArea(idRis = null) {
    if (!this.bundle || !this.bundle.eessArea) return [];
    // Solo las 7 RIS de Áncash y sin duplicados (el bundle trae a Sihuas dos veces, una con una RIS 177 inexistente)
    const vistos = new Set();
    let list = this.bundle.eessArea.features.filter(f => {
      const p = f.properties;
      if (!GEORIS_RIS_CONFIG[p.id_ris] || vistos.has(p.cod_reni)) return false;
      vistos.add(p.cod_reni);
      return true;
    });
    if (idRis && idRis !== 'ALL') {
      list = list.filter(f => f.properties.id_ris === parseInt(idRis, 10));
    }
    return list.map(f => {
      const p = f.properties;
      return {
        cod_renipress: p.cod_reni,
        nombre: p.ipress,
        categoria: p.categoria || "II-1",
        id_ris: p.id_ris,
        ris: p.ris,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        feature: f
      };
    });
  },

  getEessZona(idRis = null) {
    if (!this.bundle || !this.bundle.eessZona) return [];
    let list = this.bundle.eessZona.features;
    if (idRis && idRis !== 'ALL') {
      list = list.filter(f => f.properties.id_ris === parseInt(idRis, 10));
    }
    return list.map(f => {
      const p = f.properties;
      const zona = this._zonaEstablecimiento(f);
      return {
        cod_renipress: p.cod_reni,
        nombre: p.ipress,
        categoria: p.categoria || "I-3",
        id_ris: p.id_ris,
        id_zona: zona.id_zona,
        id_zona_declarada: zona.id_zona_declarada,
        ris: p.ris,
        cod_hos: p.cod_hos || null,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        feature: f
      };
    });
  },

  /** Hospital de referencia (eessArea) por su código RENIPRESS, o null. */
  getHospitalByCode(codReni) {
    if (!codReni) return null;
    return this.getHospitalesArea('ALL').find(h => h.cod_renipress === String(codReni)) || null;
  },

  /** Establecimientos vinculados (satélites de una puerta de entrada) de una RIS y zona. */
  getVinculados(idRis = 156, idZona = null) {
    if (!this.bundle || !this.bundle.eessVinculados) return [];
    let list = this.bundle.eessVinculados.features;
    if (idRis && idRis !== 'ALL') list = list.filter(f => f.properties.id_ris === parseInt(idRis, 10));
    if (idZona && idZona !== 'ALL') list = list.filter(f => this._zonaEstablecimiento(f).id_zona === parseInt(idZona, 10));
    return list.map(f => {
      const p = f.properties;
      const zona = this._zonaEstablecimiento(f);
      return {
        cod_renipress: p.cod_reni,
        nombre: p.ipress,
        categoria: p.categoria || "I-1",
        id_ris: p.id_ris,
        id_zona: zona.id_zona,
        id_zona_declarada: zona.id_zona_declarada,
        distrito: p.distrito,
        provincia: p.provincia,
        cod_hos: p.cod_hos || null,
        rol_georis: 'Establecimiento Vinculado',
        vinculado_a_nombre: (p.vincu_a || '').trim() || null,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        feature: f
      };
    });
  },

  getPuertasEntrada(idRis = 156, idZona = null) {
    if (!this.bundle || !this.bundle.eessPuertas) return [];
    let list = this.bundle.eessPuertas.features;
    if (idRis && idRis !== 'ALL') {
      list = list.filter(f => f.properties.id_ris === parseInt(idRis, 10));
    }
    if (idZona && idZona !== 'ALL') {
      list = list.filter(f => this._zonaEstablecimiento(f).id_zona === parseInt(idZona, 10));
    }
    return list.map(f => {
      const p = f.properties;
      const zona = this._zonaEstablecimiento(f);
      return {
        cod_renipress: p.cod_reni,
        nombre: p.ipress,
        categoria: p.categoria || "I-1",
        id_ris: p.id_ris,
        id_zona: zona.id_zona,
        id_zona_declarada: zona.id_zona_declarada,
        distrito: p.distrito,
        provincia: p.provincia,
        cod_hos: p.cod_hos || null,
        rol_georis: 'Puerta de Entrada',
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        feature: f
      };
    });
  },

  // Obtener toda la red integrada de Huarmey articulada al Nuevo Hospital II-1
  getHuarmeyNetwork() {
    const EstMod = (typeof window !== 'undefined' && window.EstablecimientosHuarmey) ||
      (typeof require !== 'undefined' ? (function () { try { return require('./establecimientos'); } catch (e) { return null; } })() : null);

    const estList = EstMod ? EstMod.getAllHuarmey() : null;
    const estHospital = EstMod ? EstMod.getByCode('00001741') : null;
    const estCabecera = EstMod ? EstMod.getByCode('00001744') : null;

    const hospHuarmey = {
      cod_renipress: estHospital?.cod_renipress || "00001741",
      nombre: estHospital?.nombre || "NUEVO HOSPITAL DE APOYO HUARMEY",
      categoria: estHospital?.categoria || "II-1",
      rol_georis: "Hospital de Referencia del Área Sanitaria Huarmey (Puesto en Marcha)",
      ubicacion: estHospital?.direccion || "AA.HH. Santo Domingo Ampliación Mz. P´ Lte. 1 / Miramar (detrás de Hotel La Siesta)",
      lat: estHospital ? estHospital.latitud : -10.04780,
      lng: estHospital ? estHospital.longitud : -78.15480,
      area_terreno: "11,325.98 m²",
      area_techada: "11,000 m² (3 niveles)",
      camas: 55,
      consultorios: 18,
      especialidades: "Medicina Interna, Cardiología, Emergencia 24h, Centro Quirúrgico, Laboratorio Clínico II, Farmacia, Teleconsulta HEARTS",
      // Contorno REFERENCIAL del terreno detrás de Hotel La Siesta (no es un levantamiento topográfico):
      // dibujado con el área oficial de 11,325.98 m² alrededor del punto GeoRIS del hospital
      polygonCoords: [
        [-10.047344, -78.155511],
        [-10.047459, -78.154365],
        [-10.048261, -78.154289],
        [-10.048185, -78.155435],
        [-10.047344, -78.155511]
      ]
    };

    const cabeceraZona = {
      cod_renipress: estCabecera?.cod_renipress || "00001744",
      nombre: estCabecera?.nombre || "CENTRO DE SALUD LA VICTORIA",
      categoria: estCabecera?.categoria || "I-3",
      rol_georis: "Cabecera de Zona Sanitaria Huarmey",
      lat: estCabecera ? estCabecera.latitud : -10.055462,
      lng: estCabecera ? estCabecera.longitud : -78.159814,
      consultorios: 6,
      id_zona: 6
    };

    const puertas = estList
      ? estList.filter(e => e.cod_renipress !== '00001741' && e.cod_renipress !== '00001744').map(e => ({
          cod_renipress: e.cod_renipress,
          nombre: e.nombre,
          categoria: e.categoria,
          lat: e.latitud,
          lng: e.longitud,
          distrito: e.distrito,
          provincia: e.provincia,
          is_enclave: !!e.is_enclave,
          red_origen: e.red_origen || undefined,
          rol_georis: e.rol_georis || 'Puerta de Entrada',
          vinculado_a: e.vinculado_a || undefined,
          vinculado_a_nombre: e.vinculado_a_nombre || undefined,
          cod_hos: '00001741'
        }))
      : [
          { cod_renipress: "00001742", nombre: "PUESTO DE SALUD PUERTO HUARMEY", categoria: "I-2", lat: -10.098216, lng: -78.161813, distrito: "Huarmey", provincia: "Huarmey" },
          { cod_renipress: "00001743", nombre: "PUESTO DE SALUD CULEBRAS", categoria: "I-2", lat: -9.950048, lng: -78.221874, distrito: "Culebras", provincia: "Huarmey" },
          { cod_renipress: "00001745", nombre: "PUESTO DE SALUD MOLINO", categoria: "I-1", lat: -9.881821, lng: -78.114691, distrito: "Culebras", provincia: "Huarmey" },
          { cod_renipress: "00001746", nombre: "PUESTO DE SALUD QUIAN", categoria: "I-2", lat: -9.773745, lng: -77.949487, distrito: "Culebras", provincia: "Huarmey" },
          { cod_renipress: "00001747", nombre: "PUESTO DE SALUD RAYPA", categoria: "I-1", lat: -9.745963, lng: -77.881366, distrito: "Huanchay", provincia: "Huaraz" },
          { cod_renipress: "00001748", nombre: "PUESTO DE SALUD HUANCHAY HZ", categoria: "I-2", lat: -9.724693, lng: -77.820581, distrito: "Huanchay", provincia: "Huaraz" },
          { cod_renipress: "00001751", nombre: "PUESTO DE SALUD HUAMBA", categoria: "I-1", lat: -9.965200, lng: -77.856912, distrito: "Huarmey", provincia: "Huarmey" },
          { cod_renipress: "00001752", nombre: "PUESTO DE SALUD HUAYAN", categoria: "I-2", lat: -9.875857, lng: -77.707839, distrito: "Huayán", provincia: "Huarmey" },
          { cod_renipress: "00001753", nombre: "PUESTO DE SALUD MALVAS", categoria: "I-1", lat: -9.926268, lng: -77.657878, distrito: "Malvas", provincia: "Huarmey" },
          { cod_renipress: "00001801", nombre: "PUESTO DE SALUD SAN MIGUEL", categoria: "I-1", lat: -9.945159, lng: -77.746954, distrito: "Malvas", provincia: "Huarmey" },
          { cod_renipress: "00001749", nombre: "PUESTO DE SALUD COCHAPETI", categoria: "I-1", lat: -9.985718, lng: -77.645025, distrito: "Cochapetí", provincia: "Huarmey", is_enclave: true, red_origen: "Red Huaylas Sur (Microrred Cátac)" }
        ];

    // Enriquecer cada puerta con cálculo exacto de distancia y tiempo al hospital
    const puertasConDistancia = puertas.map(p => {
      const distKm = haversineDistance(p.lat, p.lng, hospHuarmey.lat, hospHuarmey.lng);
      const minutos = estimateTravelTimeMinutes(distKm);
      return {
        ...p,
        distancia_hospital_km: distKm,
        tiempo_traslado_min: minutos,
        tiempo_traslado_txt: formatMinutes(minutos),
        cumple_estandar_area: minutos <= 240, // < 4 horas según GeoRIS
        cumple_estandar_zona: minutos <= 120  // < 2 horas
      };
    });

    const distCabeceraKm = haversineDistance(cabeceraZona.lat, cabeceraZona.lng, hospHuarmey.lat, hospHuarmey.lng);
    cabeceraZona.distancia_hospital_km = distCabeceraKm;
    cabeceraZona.tiempo_traslado_min = estimateTravelTimeMinutes(distCabeceraKm);
    cabeceraZona.tiempo_traslado_txt = formatMinutes(cabeceraZona.tiempo_traslado_min);

    return {
      hospital: hospHuarmey,
      cabecera: cabeceraZona,
      puertas: puertasConDistancia
    };
  }
};

/** Totales de Áncash calculados del bundle GeoRIS (no se escriben a mano). */
GeorisTerritory.getResumenAncash = function () {
  if (!this.bundle || !this.bundle.ris) return null;
  const r = { ris: 0, poblacion: 0, familias: 0, viviendas: 0, zonas: 0, sectores: 0, sectores_con_poligono: 0, hospitales: 0, cabeceras: 0, puertas: 0, vinculados: 0 };
  this.bundle.ris.features.forEach(f => {
    const p = f.properties;
    r.ris++; r.poblacion += p.pob_t || 0; r.familias += p.n_fam || 0; r.viviendas += p.n_viv || 0; r.zonas += p.n_zona || 0; r.sectores += p.n_sec || 0;
  });
  r.sectores_con_poligono = (this.bundle.sectores && this.bundle.sectores.features.length) || 0;
  r.hospitales = this.getHospitalesArea('ALL').length;
  r.cabeceras = (this.bundle.eessZona && this.bundle.eessZona.features.length) || 0;
  r.puertas = (this.bundle.eessPuertas && this.bundle.eessPuertas.features.length) || 0;
  r.vinculados = (this.bundle.eessVinculados && this.bundle.eessVinculados.features.length) || 0;
  return r;
};

/** Cuántos sectores de una RIS tienen polígono en el bundle (solo Pacífico Sur los trae). */
GeorisTerritory.getSectoresConPoligono = function (idRis) {
  if (!this.bundle || !this.bundle.sectores) return 0;
  return this.bundle.sectores.features.filter(f => idRis === 'ALL' || f.properties.id_ris === parseInt(idRis, 10)).length;
};

// Objeto retrocompatible para el resto de la app
const GEORIS_ANCASH_DATA = {
  get redes() { return GeorisTerritory.getAllRis(); },
  get zonasSanitarias() { return GeorisTerritory.getZonasByRis(156); },
  get establecimientosAreaSanitaria() { return GeorisTerritory.getHospitalesArea(156); },
  get establecimientosZonaSanitaria() { return GeorisTerritory.getEessZona(156); },
  get establecimientosPuertaEntrada() { return GeorisTerritory.getHuarmeyNetwork().puertas; }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GeorisTerritory, GEORIS_ANCASH_DATA, GEORIS_RIS_CONFIG, haversineDistance, estimateTravelTimeMinutes, formatMinutes };
} else {
  window.GeorisTerritory = GeorisTerritory;
  window.GEORIS_ANCASH_DATA = GEORIS_ANCASH_DATA;
  window.GEORIS_RIS_CONFIG = GEORIS_RIS_CONFIG;
  window.haversineDistance = haversineDistance;
  window.estimateTravelTimeMinutes = estimateTravelTimeMinutes;
  window.formatMinutes = formatMinutes;
}
