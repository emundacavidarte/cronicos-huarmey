/**
 * establecimientos.js
 * Módulo Único de Establecimientos de Salud Oficiales (GeoRIS MINSA & RENIPRESS SUSALUD).
 * Fuente canónica compartida entre servidor, base de datos, geocodificador y mapas.
 * Garantiza coordenadas exactas sin discrepancias ni duplicaciones en todo el prototipo.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.EstablecimientosHuarmey = factory();
    root.ESTABLECIMIENTOS_HUARMEY = root.EstablecimientosHuarmey.DEFAULT_ESTABLISHMENTS;
  }
})(typeof window !== 'undefined' ? window : this, function () {

  // Catálogo maestro oficial de la Microrred Huarmey (Zona Sanitaria 6 - RIS Pacífico Sur N° 156)
  // Coordenadas verificadas al 100% contra GeoRIS MINSA (georisDataBundle.js) y RENIPRESS SUSALUD.
  // Rol GeoRIS según el bundle oficial: Puertas de Entrada (p_ent = SI) = La Victoria, Culebras, Huamba, Huayán y
  // Huanchay; los demás puestos son Establecimientos Vinculados (p_vin = SI) a la puerta indicada en vinculado_a.
  // Nota: Hospital 00001741 apunta al Nuevo Hospital de Apoyo Huarmey (detrás de Hotel La Siesta).
  const ESTABLECIMIENTOS_MICRORRED_HUARMEY = [
    {
      cod_renipress: "00001741",
      nombre: "NUEVO HOSPITAL DE APOYO HUARMEY",
      categoria: "II-1",
      rol_georis: "Area Sanitaria / Hospital de Referencia (Puesto en Marcha)",
      red_salud: "PACIFICO SUR",
      id_ris: 156,
      id_zona: 6,
      microrred: "Huarmey",
      provincia: "Huarmey",
      distrito: "Huarmey",
      direccion: "AA.HH. Santo Domingo Ampliación Mz. P´ Lte. 1 / Miramar (detrás de Hotel La Siesta)",
      latitud: -10.04780,
      longitud: -78.15480
    },
    {
      cod_renipress: "00001744",
      nombre: "CENTRO DE SALUD LA VICTORIA",
      categoria: "I-3",
      rol_georis: "Zona Sanitaria (Cabecera Microrred)",
      red_salud: "PACIFICO SUR",
      id_ris: 156,
      id_zona: 6,
      microrred: "Huarmey",
      provincia: "Huarmey",
      distrito: "Huarmey",
      direccion: "Av. Alberto Reyes s/n - La Victoria",
      latitud: -10.055462,
      longitud: -78.159814
    },
    {
      cod_renipress: "00001742",
      nombre: "PUESTO DE SALUD PUERTO HUARMEY",
      categoria: "I-2",
      rol_georis: "Establecimiento Vinculado", vinculado_a: "00001744", vinculado_a_nombre: "CENTRO DE SALUD LA VICTORIA",
      red_salud: "PACIFICO SUR",
      id_ris: 156,
      id_zona: 6,
      microrred: "Huarmey",
      provincia: "Huarmey",
      distrito: "Huarmey",
      direccion: "Calle Grau s/n - Puerto Huarmey",
      latitud: -10.098216,
      longitud: -78.161813
    },
    {
      cod_renipress: "00001743",
      nombre: "PUESTO DE SALUD CULEBRAS",
      categoria: "I-2",
      rol_georis: "Puerta de Entrada",
      red_salud: "PACIFICO SUR",
      id_ris: 156,
      id_zona: 6,
      microrred: "Huarmey",
      provincia: "Huarmey",
      distrito: "Culebras",
      direccion: "Caleta Culebras s/n",
      latitud: -9.950048,
      longitud: -78.221874
    },
    {
      cod_renipress: "00001745",
      nombre: "PUESTO DE SALUD MOLINO",
      categoria: "I-1",
      rol_georis: "Establecimiento Vinculado", vinculado_a: "00001743", vinculado_a_nombre: "PUESTO DE SALUD CULEBRAS",
      red_salud: "PACIFICO SUR",
      id_ris: 156,
      id_zona: 6,
      microrred: "Huarmey",
      provincia: "Huarmey",
      distrito: "Culebras",
      direccion: "Caserío El Molino s/n",
      latitud: -9.881821,
      longitud: -78.114691
    },
    {
      cod_renipress: "00001746",
      nombre: "PUESTO DE SALUD QUIAN",
      categoria: "I-2",
      rol_georis: "Establecimiento Vinculado", vinculado_a: "00001744", vinculado_a_nombre: "CENTRO DE SALUD LA VICTORIA",
      red_salud: "PACIFICO SUR",
      id_ris: 156,
      id_zona: 6,
      microrred: "Huarmey",
      provincia: "Huarmey",
      distrito: "Culebras",
      direccion: "Caserío Quian s/n",
      latitud: -9.773745,
      longitud: -77.949487
    },
    {
      cod_renipress: "00001751",
      nombre: "PUESTO DE SALUD HUAMBA",
      categoria: "I-1",
      rol_georis: "Puerta de Entrada",
      red_salud: "PACIFICO SUR",
      id_ris: 156,
      id_zona: 6,
      microrred: "Huarmey",
      provincia: "Huarmey",
      distrito: "Huarmey",
      direccion: "Valle Huamba s/n",
      latitud: -9.965200,
      longitud: -77.856912
    },
    {
      cod_renipress: "00001752",
      nombre: "PUESTO DE SALUD HUAYAN",
      categoria: "I-2",
      rol_georis: "Puerta de Entrada",
      red_salud: "PACIFICO SUR",
      id_ris: 156,
      id_zona: 6,
      microrred: "Huarmey",
      provincia: "Huarmey",
      distrito: "Huayan",
      direccion: "Plaza Principal Huayán s/n",
      latitud: -9.875857,
      longitud: -77.707839
    },
    {
      cod_renipress: "00001753",
      nombre: "PUESTO DE SALUD MALVAS",
      categoria: "I-1",
      rol_georis: "Establecimiento Vinculado", vinculado_a: "00001751", vinculado_a_nombre: "PUESTO DE SALUD HUAMBA",
      red_salud: "PACIFICO SUR",
      id_ris: 156,
      id_zona: 6,
      microrred: "Huarmey",
      provincia: "Huarmey",
      distrito: "Malvas",
      direccion: "Plaza Principal Malvas s/n",
      latitud: -9.926268,
      longitud: -77.657878
    },
    {
      cod_renipress: "00001801",
      nombre: "PUESTO DE SALUD SAN MIGUEL",
      categoria: "I-1",
      rol_georis: "Establecimiento Vinculado", vinculado_a: "00001751", vinculado_a_nombre: "PUESTO DE SALUD HUAMBA",
      red_salud: "PACIFICO SUR",
      id_ris: 156,
      id_zona: 6,
      microrred: "Huarmey",
      provincia: "Huarmey",
      distrito: "Malvas",
      direccion: "Caserío San Miguel s/n",
      latitud: -9.945159,
      longitud: -77.746954
    },
    {
      cod_renipress: "00001747",
      nombre: "PUESTO DE SALUD RAYPA",
      categoria: "I-1",
      rol_georis: "Establecimiento Vinculado", vinculado_a: "00001744", vinculado_a_nombre: "CENTRO DE SALUD LA VICTORIA",
      red_salud: "PACIFICO SUR",
      id_ris: 156,
      id_zona: 6,
      microrred: "Huarmey",
      provincia: "Huaraz",
      distrito: "Huanchay",
      direccion: "Caserío Raypa s/n",
      latitud: -9.745963,
      longitud: -77.881366
    },
    {
      cod_renipress: "00001748",
      nombre: "PUESTO DE SALUD HUANCHAY HZ",
      categoria: "I-2",
      rol_georis: "Puerta de Entrada",
      red_salud: "PACIFICO SUR",
      id_ris: 156,
      id_zona: 6,
      microrred: "Huarmey",
      provincia: "Huaraz",
      distrito: "Huanchay",
      direccion: "Av. Principal Huanchay s/n",
      latitud: -9.724693,
      longitud: -77.820581
    },
    {
      cod_renipress: "00001749",
      nombre: "PUESTO DE SALUD COCHAPETI",
      categoria: "I-1",
      rol_georis: "Establecimiento Vinculado", vinculado_a: "00001751", vinculado_a_nombre: "PUESTO DE SALUD HUAMBA",
      red_salud: "PACIFICO SUR",
      id_ris: 156,
      id_zona: 6,
      microrred: "Huarmey",
      provincia: "Huarmey",
      distrito: "Cochapeti",
      direccion: "Plaza Principal Cochapetí s/n",
      latitud: -9.985718,
      longitud: -77.645025,
      is_enclave: true,
      red_origen: "Red Huaylas Sur (Microrred Cátac)"
    }
  ];

  // Establecimientos referenciales externos utilizados por el geocodificador departamental
  const ESTABLECIMIENTOS_REFERENCIA_EXTERNA = [
    {
      cod_renipress: "00001719",
      nombre: "HOSPITAL DE APOYO CASMA",
      categoria: "II-1",
      rol_georis: "Hospital de Referencia Zona Casma",
      red_salud: "PACIFICO SUR",
      id_ris: 156,
      id_zona: 5,
      distrito: "Casma",
      provincia: "Casma",
      latitud: -9.473970,
      longitud: -78.304980
    },
    {
      cod_renipress: "00001704",
      nombre: "CENTRO DE SALUD YUGOSLAVIA",
      categoria: "I-4",
      rol_georis: "Cabecera Zona Sanitaria 1 Nuevo Chimbote",
      red_salud: "PACIFICO SUR",
      id_ris: 156,
      id_zona: 1,
      distrito: "Nuevo Chimbote",
      provincia: "Santa",
      latitud: -9.132220,
      longitud: -78.519410
    },
    {
      cod_renipress: "00001543",
      nombre: "HOSPITAL VICTOR RAMOS GUARDIA - HUARAZ",
      categoria: "II-2",
      rol_georis: "Hospital Regional Referencial Huaylas Sur",
      red_salud: "HUAYLAS SUR 1",
      id_ris: 101,
      id_zona: 4,
      distrito: "Huaraz",
      provincia: "Huaraz",
      latitud: -9.534570,
      longitud: -77.529310
    }
  ];

  const mapByCode = new Map();
  for (const e of ESTABLECIMIENTOS_MICRORRED_HUARMEY) {
    mapByCode.set(e.cod_renipress, e);
  }
  for (const e of ESTABLECIMIENTOS_REFERENCIA_EXTERNA) {
    mapByCode.set(e.cod_renipress, e);
  }

  function getByCode(code) {
    if (!code) return null;
    return mapByCode.get(String(code).padStart(8, '0')) || null;
  }

  function getAllHuarmey() {
    return ESTABLECIMIENTOS_MICRORRED_HUARMEY.map(e => ({ ...e }));
  }

  function getAll() {
    return Array.from(mapByCode.values()).map(e => ({ ...e }));
  }

  function haversineMetros(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const t = x => x * Math.PI / 180;
    const dLat = t(lat2 - lat1);
    const dLon = t(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(t(lat1)) * Math.cos(t(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  return {
    DEFAULT_ESTABLISHMENTS: ESTABLECIMIENTOS_MICRORRED_HUARMEY,
    ESTABLECIMIENTOS_MICRORRED_HUARMEY,
    ESTABLECIMIENTOS_REFERENCIA_EXTERNA,
    getByCode,
    getAllHuarmey,
    getAll,
    haversineMetros
  };
});
