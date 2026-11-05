/**
 * padronSchema.js
 * Catálogo Oficial de Columnas, Bloques Pastel y Motor de Validación
 * Padrón Nominal de Pacientes Crónicos · Distrito de Huarmey (Padrón Estandarizado)
 * Hospital de Apoyo Huarmey (II-1) — Red Integrada de Salud Pacífico Sur
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PadronSchema = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {

  // 1. Listas oficiales permitidas según el Padrón Estandarizado
  const SECTORES_HUARMEY = [
    "Sector I – Centro",
    "Sector II – La Victoria",
    "Sector III – Santo Domingo",
    "Sector IV – Buenos Aires",
    "Santo Domingo Ampliación – Miramar",
    "Puerto Huarmey",
    "Huamba",
    "Lecheral",
    "Congón – San Isidro"
  ];

  const OTROS_DISTRITOS = [
    "Culebras",
    "Huayán",
    "Malvas",
    "Cochapetí",
    "Otro distrito (se anota cuál en la dirección)"
  ];

  const EESS = [
    "Hospital de Apoyo Huarmey (00001741, II-1)",
    "C. S. La Victoria (00001744, I-3)",
    "P. S. Puerto Huarmey (00001742, I-2)",
    "P. S. Huamba (00001751, I-1)"
  ];

  const LISTAS = {
    TIPO_DOC: ["DNI", "Carné de extranjería", "Pasaporte", "Sin documento"],
    SEXO: ["Femenino", "Masculino"],
    SEGURO: ["SIS", "EsSalud", "Otro seguro", "Sin seguro"],
    SECTOR: [...SECTORES_HUARMEY, ...OTROS_DISTRITOS],
    EESS_ADS: [...EESS],
    EESS_CTRL: [...EESS, "Fuera del distrito (se anota cuál en Observaciones)"],
    DX_CONFIRMADO: ["Sí", "En estudio"],
    ECV: ["Sí (infarto, angina, ACV, arteriopatía periférica)", "No"],
    SI_NO: ["Sí", "No"],
    AAS: ["Sí", "No", "No indicado"],
    MESES_MED: ["1", "2", "3"],
    ALBUMINURIA: ["Menor de 30 mg/g (A1)", "30 a 300 mg/g (A2)", "Mayor de 300 mg/g (A3)"],
    ESTADO: ["Activo", "Cambió de residencia", "Abandono (solo después de intentar contactarlo)", "Fallecido"],
    CONSENT: ["Sí, firmado", "No"]
  };

  // 2. Colores Pastel por Bloque Temático
  const BLOQUES = {
    A: { nombre: "A · Captación e identificación", franja: "#BBD6EE", fondo: "#DCE9F8", texto: "#1F4E79" },
    B: { nombre: "B · Contacto y ubicación", franja: "#BCE6D3", fondo: "#DEF3E7", texto: "#166534" },
    C: { nombre: "C · Diagnóstico", franja: "#F6CFA8", fondo: "#FBE6D4", texto: "#9A3412" },
    D: { nombre: "D · Riesgo cardiovascular", franja: "#F2B8C6", fondo: "#F8DDE4", texto: "#9F1239" },
    E: { nombre: "E · Tratamiento", franja: "#CDBFE8", fondo: "#E7DFF2", texto: "#5B21B6" },
    F: { nombre: "F · Medidas", franja: "#A9DAD6", fondo: "#D9F0EF", texto: "#115E59" },
    G: { nombre: "G · Presión arterial del mes (mmHg)", franja: "#F3E2A0", fondo: "#FBF3D2", texto: "#854D0E" },
    H: { nombre: "H · Laboratorio (último resultado)", franja: "#A9C4EC", fondo: "#DCE4F5", texto: "#1E40AF" },
    I: { nombre: "I · Diabetes: enlace Epidemiología", franja: "#F3B8CF", fondo: "#FCE1EC", texto: "#9D174D" },
    J: { nombre: "J · Seguimiento", franja: "#B9DFAE", fondo: "#E0F2DE", texto: "#14532D" },
    K: { nombre: "K · Consentimiento y trazabilidad", franja: "#D7DCE8", fondo: "#ECEEF5", texto: "#334155" }
  };

  // 3. Catálogo de 76 Columnas de Ingreso Manual
  const COLUMNAS = [
    // Bloque A
    { key: "fecha_captacion", bloque: "A", label: "Fecha de captación", tipo: "date", required: false, desc: "Fecha de primera atención o ingreso al padrón" },
    { key: "tipo_documento", bloque: "A", label: "Tipo de documento", tipo: "select", opciones: LISTAS.TIPO_DOC, default: "DNI", required: true },
    { key: "nro_documento", bloque: "A", label: "N.º de documento (DNI)", tipo: "text", required: true, freeze: true, desc: "Clave única del paciente. Debe tener exactamente 8 dígitos numéricos" },
    { key: "historia_clinica", bloque: "A", label: "Historia Clínica / Carpeta", tipo: "text", required: false },
    { key: "apellidos_nombres", bloque: "A", label: "Apellidos y nombres", tipo: "text", required: true, freeze: true, desc: "Apellidos y nombres del paciente" },
    { key: "sexo", bloque: "A", label: "Sexo", tipo: "select", opciones: LISTAS.SEXO, required: true },
    { key: "fecha_nacimiento", bloque: "A", label: "Fecha de nacimiento", tipo: "date", required: true, desc: "Fecha de nacimiento (debe ser anterior a hoy y posterior a 1900)" },
    { key: "seguro_salud", bloque: "A", label: "Seguro de salud", tipo: "select", opciones: LISTAS.SEGURO, default: "SIS", required: true },

    // Bloque B
    { key: "telefono", bloque: "B", label: "Teléfono o celular", tipo: "text", required: false, desc: "Solo dígitos numéricos" },
    { key: "sector", bloque: "B", label: "Sector o centro poblado", tipo: "select", opciones: LISTAS.SECTOR, required: true },
    { key: "direccion", bloque: "B", label: "Dirección y referencia", tipo: "text", required: true, desc: "Calle, número, barrio y referencia para geocodificación" },
    { key: "establecimiento_adscripcion", bloque: "B", label: "EESS Adscripción", tipo: "select", opciones: LISTAS.EESS_ADS, required: true },
    { key: "establecimiento_control", bloque: "B", label: "EESS que hoy lo controla", tipo: "select", opciones: LISTAS.EESS_CTRL, required: true },

    // Bloque C
    { key: "cie10_hta", bloque: "C", label: "Hipertensión (CIE-10)", tipo: "text", required: false, desc: "Código I10 a I15 o nombre diagnóstico" },
    { key: "cie10_dm", bloque: "C", label: "Diabetes (CIE-10)", tipo: "text", required: false, desc: "Código E10 a E14 o nombre diagnóstico" },
    { key: "cie10_dislipidemia", bloque: "C", label: "Dislipidemia (CIE-10)", tipo: "text", required: false, desc: "Código E78 o nombre diagnóstico" },
    { key: "cie10_erc", bloque: "C", label: "ERC (CIE-10)", tipo: "text", required: false, desc: "Código N18.1 a N18.5 o nombre" },
    { key: "dx_confirmado", bloque: "C", label: "Diagnóstico confirmado", tipo: "select", opciones: LISTAS.DX_CONFIRMADO, default: "Sí", required: false },
    { key: "enfermedad_cardiovascular", bloque: "C", label: "Enfermedad Cardiovascular", tipo: "select", opciones: LISTAS.ECV, default: "No", required: false },

    // Bloque D
    { key: "riesgo_cv_porcentaje", bloque: "D", label: "Riesgo CV (%)", tipo: "number", min: 0, max: 100, step: 0.1, required: false },
    { key: "fecha_valoracion_riesgo", bloque: "D", label: "Fecha valoración riesgo", tipo: "date", required: false },

    // Bloque E
    { key: "tratamiento_hta", bloque: "E", label: "Tratamiento HTA", tipo: "text", required: false },
    { key: "tratamiento_dm", bloque: "E", label: "Tratamiento Diabetes", tipo: "text", required: false },
    { key: "estatina", bloque: "E", label: "Estatina", tipo: "select", opciones: LISTAS.SI_NO, default: "No", required: false },
    { key: "aspirina_aas", bloque: "E", label: "Ácido acetilsalicílico (AAS)", tipo: "select", opciones: LISTAS.AAS, default: "No indicado", required: false },
    { key: "meses_medicacion", bloque: "E", label: "Meses medicación entregados", tipo: "select", opciones: LISTAS.MESES_MED, required: false },

    // Bloque F
    { key: "peso", bloque: "F", label: "Peso (kg)", tipo: "number", min: 25, max: 250, step: 0.1, required: false },
    { key: "talla", bloque: "F", label: "Talla (m)", tipo: "number", min: 1.20, max: 2.10, step: 0.01, required: false },
    { key: "perimetro_abdominal", bloque: "F", label: "Perímetro abdominal (cm)", tipo: "number", min: 50, max: 200, step: 1, required: false }
  ];

  // Agregar las 12 columnas PAS y 12 PAD (Bloque G)
  const MESES = [
    { id: "01", cod: "ene", nombre: "Ene" }, { id: "02", cod: "feb", nombre: "Feb" },
    { id: "03", cod: "mar", nombre: "Mar" }, { id: "04", cod: "abr", nombre: "Abr" },
    { id: "05", cod: "may", nombre: "May" }, { id: "06", cod: "jun", nombre: "Jun" },
    { id: "07", cod: "jul", nombre: "Jul" }, { id: "08", cod: "ago", nombre: "Ago" },
    { id: "09", cod: "set", nombre: "Set" }, { id: "10", cod: "oct", nombre: "Oct" },
    { id: "11", cod: "nov", nombre: "Nov" }, { id: "12", cod: "dic", nombre: "Dic" }
  ];

  MESES.forEach(m => {
    COLUMNAS.push({
      key: `pas_${m.cod}`, bloque: "G", label: `PAS ${m.nombre}`, tipo: "number", min: 70, max: 260, step: 1, required: false
    });
  });
  MESES.forEach(m => {
    COLUMNAS.push({
      key: `pad_${m.cod}`, bloque: "G", label: `PAD ${m.nombre}`, tipo: "number", min: 40, max: 150, step: 1, required: false
    });
  });

  // Bloque H (Laboratorio)
  COLUMNAS.push(
    { key: "glucosa", bloque: "H", label: "Glucosa (mg/dl)", tipo: "number", min: 20, max: 800, step: 1, required: false },
    { key: "fecha_glucosa", bloque: "H", label: "Fecha glucosa", tipo: "date", required: false },
    { key: "hba1c", bloque: "H", label: "HbA1c (%)", tipo: "number", min: 3.0, max: 20.0, step: 0.1, required: false },
    { key: "fecha_hba1c", bloque: "H", label: "Fecha HbA1c", tipo: "date", required: false },
    { key: "creatinina", bloque: "H", label: "Creatinina (mg/dl)", tipo: "number", min: 0.2, max: 20.0, step: 0.01, required: false },
    { key: "fecha_creatinina", bloque: "H", label: "Fecha creatinina", tipo: "date", required: false },
    { key: "albuminuria", bloque: "H", label: "Albuminuria", tipo: "select", opciones: LISTAS.ALBUMINURIA, required: false },
    { key: "fecha_albuminuria", bloque: "H", label: "Fecha albuminuria", tipo: "date", required: false },
    { key: "colesterol_total", bloque: "H", label: "Colesterol total", tipo: "number", min: 50, max: 600, step: 1, required: false },
    { key: "trigliceridos", bloque: "H", label: "Triglicéridos", tipo: "number", min: 20, max: 3000, step: 1, required: false },
    { key: "colesterol_hdl", bloque: "H", label: "Colesterol HDL", tipo: "number", min: 5, max: 200, step: 1, required: false },
    { key: "colesterol_ldl", bloque: "H", label: "Colesterol LDL", tipo: "number", min: 10, max: 500, step: 1, required: false },
    { key: "fecha_perfil_lipidico", bloque: "H", label: "Fecha perfil lipídico", tipo: "date", required: false }
  );

  // Bloque I
  COLUMNAS.push(
    { key: "fecha_notificacion_diabetes", bloque: "I", label: "Fecha notificación DM", tipo: "date", required: false },
    { key: "fecha_evaluacion_pie", bloque: "I", label: "Fecha evaluación pie", tipo: "date", required: false }
  );

  // Bloque J
  COLUMNAS.push(
    { key: "fecha_ultimo_control", bloque: "J", label: "Fecha último control", tipo: "date", required: false },
    { key: "proxima_cita", bloque: "J", label: "Próxima cita", tipo: "date", required: false },
    { key: "fecha_visita_domiciliaria", bloque: "J", label: "Fecha visita domiciliaria", tipo: "date", required: false },
    { key: "estado_paciente", bloque: "J", label: "Estado paciente", tipo: "select", opciones: LISTAS.ESTADO, default: "Activo", required: true },
    { key: "fecha_estado", bloque: "J", label: "Fecha del estado", tipo: "date", required: false },
    { key: "observaciones", bloque: "J", label: "Observaciones", tipo: "text", required: false }
  );

  // Bloque K
  COLUMNAS.push(
    { key: "consentimiento", bloque: "K", label: "Consentimiento", tipo: "select", opciones: LISTAS.CONSENT, required: true, desc: "Autorización del paciente para recibir recordatorios por WhatsApp: Sí, firmado o No. Se pregunta una sola vez; si el paciente ya lo tiene registrado en el sistema, se precarga." },
    { key: "actualizado_por", bloque: "K", label: "Registrado / Actualizado por", tipo: "text", required: false }
  );

  // Mapa rápido de configuración por key
  const COLUMNAS_MAP = new Map();
  COLUMNAS.forEach((col, idx) => {
    col.colIndex = idx;
    COLUMNAS_MAP.set(col.key, col);
  });

  // 4. Motor de Validación de Celdas y Filas
  /**
   * Fecha real del calendario en AAAA-MM-DD o DD/MM/AAAA (C-05). Rechaza fechas imposibles como 31/02/1960
   * (JavaScript las corría al 3 de marzo) y textos sueltos que Date() interpretaba a su manera.
   */
  function parseDateOnly(str) {
    if (!str) return null;
    if (str instanceof Date) return isNaN(str.getTime()) ? null : str;
    const t = String(str).trim();
    let y, m, d;
    let x = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t);
    if (x) { y = +x[1]; m = +x[2]; d = +x[3]; }
    else if ((x = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t))) { d = +x[1]; m = +x[2]; y = +x[3]; }
    else return null;
    const f = new Date(y, m - 1, d);
    return (f.getFullYear() === y && f.getMonth() === m - 1 && f.getDate() === d) ? f : null;
  }

  // Catálogo de establecimientos (navegador o Node) para aceptar cualquier EESS con su código RENIPRESS (C-09)
  function establecimientoConocido(texto) {
    const m = /\((\d{8})\b/.exec(String(texto));
    if (!m) return false;
    let cat = null;
    if (typeof window !== 'undefined' && window.EstablecimientosHuarmey) cat = window.EstablecimientosHuarmey;
    else if (typeof require === 'function') { try { cat = require('../map/establecimientos'); } catch (e) { cat = null; } }
    return !!(cat && typeof cat.getByCode === 'function' && cat.getByCode(m[1]));
  }

  /** Tipo de documento normalizado: 'DNI' (o vacío), 'SIN' (sin documento) u 'OTRO' (carné de extranjería, pasaporte). */
  function tipoDocumento(row) {
    const t = row && row.tipo_documento ? String(row.tipo_documento).trim().toUpperCase() : 'DNI';
    if (!t || t === 'DNI') return 'DNI';
    if (t.startsWith('SIN')) return 'SIN';
    return 'OTRO';
  }

  /** Número de documento que se guarda: DNI solo dígitos; CE o pasaporte conservan sus letras (en mayúsculas). */
  function documentoNormalizado(row) {
    const v = row && row.nro_documento !== undefined && row.nro_documento !== null ? String(row.nro_documento).trim() : '';
    const tipo = tipoDocumento(row);
    if (tipo === 'SIN') return '';
    return tipo === 'DNI' ? v.replace(/\D/g, '') : v.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  function validateCell(key, value, row, dniCounts) {
    const col = COLUMNAS_MAP.get(key);
    if (!col) return null;

    const valStr = value !== null && value !== undefined ? String(value).trim() : '';

    // Requerido (el número de documento no lo es si el tipo es «Sin documento»)
    const sinDocumento = key === 'nro_documento' && tipoDocumento(row) === 'SIN';
    if (col.required && !valStr && !sinDocumento) {
      return `El campo "${col.label}" es obligatorio.`;
    }

    if (!valStr) return null; // Campo vacío no obligatorio es válido

    // 1. Validación de DNI
    if (key === 'nro_documento') {
      const tipo = tipoDocumento(row);
      if (tipo === 'SIN') return 'Con «Sin documento» deje vacío el número de documento.';
      const clean = documentoNormalizado({ tipo_documento: row && row.tipo_documento, nro_documento: valStr });
      if (tipo === 'DNI' && clean.length !== 8) {
        return `El DNI debe tener exactamente 8 dígitos numéricos (actual: ${clean.length}).`;
      }
      if (tipo === 'OTRO' && !/^[A-Z0-9]{6,15}$/.test(clean)) {
        return 'El carné de extranjería o pasaporte debe tener de 6 a 15 letras o dígitos.';
      }
      if (dniCounts && dniCounts.get(clean) > 1) {
        return `Documento repetido en el archivo (${dniCounts.get(clean)} veces).`;
      }
      return null;
    }

    // 2. Validación de Fecha
    if (col.tipo === 'date') {
      const d = parseDateOnly(valStr);
      if (!d) {
        return `Fecha inválida ("${valStr}"). Use formato DD/MM/AAAA o AAAA-MM-DD.`;
      }
      const y = d.getFullYear();
      if (y < 1900) {
        return `El año (${y}) no puede ser anterior a 1900.`;
      }
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (key !== 'proxima_cita' && d > today) {
        return `La fecha no puede ser futura.`;
      }
      if (key === 'proxima_cita' && row && row.fecha_ultimo_control) {
        const u = parseDateOnly(row.fecha_ultimo_control);
        if (u && d < u) {
          return `La próxima cita debe ser posterior al último control.`;
        }
      }
      return null;
    }

    // 3. Validación de Números y Rangos
    if (col.tipo === 'number') {
      // C-05: «12abc» o «150<img…>» ya no pasan como 12 o 150
      if (!/^-?\d+([.,]\d+)?$/.test(valStr)) {
        return `Debe ser un valor numérico válido.`;
      }
      const num = parseFloat(valStr.replace(',', '.'));
      if (col.min !== undefined && num < col.min) {
        return `Valor mínimo permitido es ${col.min} (ingresó ${num}).`;
      }
      if (col.max !== undefined && num > col.max) {
        return `Valor máximo permitido es ${col.max} (ingresó ${num}).`;
      }
      return null;
    }

    // 4. Validación de Listas / Select
    if (col.tipo === 'select' && Array.isArray(col.opciones)) {
      const match = col.opciones.some(op => op.toLowerCase() === valStr.toLowerCase());
      if (!match) {
        // En EESS o Sectores permitir si incluye el código o nombre básico
        if (key === 'sector' && SECTORES_HUARMEY.some(s => valStr.toLowerCase().includes(s.toLowerCase().split('–')[0].trim()))) {
          return null;
        }
        if ((key === 'establecimiento_adscripcion' || key === 'establecimiento_control') &&
            (EESS.some(e => valStr.includes(e.split('(')[0].trim())) || establecimientoConocido(valStr))) {
          return null;
        }
        return `Opción no válida. Seleccione una opción de la lista oficial.`;
      }
      return null;
    }

    // 5. Validación de Teléfono
    if (key === 'telefono') {
      const digits = valStr.replace(/\D/g, '');
      if (digits.length > 0 && digits.length < 6) {
        return `El teléfono debe tener al menos 6 a 9 dígitos numéricos.`;
      }
    }

    return null;
  }

  function validateRow(row, rowIndex, dniCounts) {
    const errors = {};
    let errorCount = 0;

    COLUMNAS.forEach(col => {
      const err = validateCell(col.key, row[col.key], row, dniCounts);
      if (err) {
        errors[col.key] = err;
        errorCount++;
      }
    });

    return {
      isValid: errorCount === 0,
      errorCount,
      errors
    };
  }

  function validateBatch(rows) {
    // 1. Contar frecuencias de DNI para detectar duplicados
    const dniCounts = new Map();
    rows.forEach(r => {
      const dni = documentoNormalizado(r);
      if (dni) {
        dniCounts.set(dni, (dniCounts.get(dni) || 0) + 1);
      }
    });

    let totalErrors = 0;
    const rowResults = rows.map((row, idx) => {
      const res = validateRow(row, idx, dniCounts);
      totalErrors += res.errorCount;
      return res;
    });

    const validRowsCount = rowResults.filter(r => r.isValid).length;
    const percent = rows.length > 0 ? Math.round((validRowsCount / rows.length) * 100) : 100;

    return {
      totalRows: rows.length,
      validRows: validRowsCount,
      rowsWithErrors: rows.length - validRowsCount,
      totalErrors,
      percent,
      rowResults
    };
  }

  return {
    COLUMNAS,
    COLUMNAS_MAP,
    BLOQUES,
    LISTAS,
    validateCell,
    validateRow,
    validateBatch,
    parseDateOnly,
    tipoDocumento,
    documentoNormalizado
  };
});
