/**
 * padronExcelParser.js
 * Extractor y Normalizador Inteligente de Archivos Excel (.xlsx, .xls, .csv)
 * Mapea las columnas del Padrón Nominal Estandarizado Huarmey (v4) a objetos limpios.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./padronSchema'));
  } else {
    root.PadronExcelParser = factory(root.PadronSchema);
  }
})(typeof window !== 'undefined' ? window : this, function (schema) {

  // Mapeo flexible de nombres de columna en el Excel hacia las claves internas
  // Regex para descartar automáticamente las columnas calculadas al final del libro (Bloque X)
  const CALCULATED_COLUMNS_REGEX = /en meta|calculad|autom[aá]tic|alerta del dato|qu[eé] le falta|d[ií]as de atraso|telemonitoreo|\(a[ñn]os\)|^imc$|valoraci[oó]n nutricional|nivel de riesgo|alto riesgo cardiovascular|meta de presi[oó]n|[uú]ltima pas|[uú]ltima pad|controlado y estable|cumple ip04|tfge|estadio de erc|distrito de residencia|controles en el a[ñn]o|medicaci[oó]n hasta|aux:/i;

  const HEADER_ALIASES = [
    { key: "fecha_captacion", regex: /^fecha.*captaci[oó]n/i },
    { key: "tipo_documento", regex: /^tipo.*doc/i },
    { key: "nro_documento", regex: /^(n[º°\.\s_]*|nro[_\s]*|numero[_\s]*)(de\s+)?doc|^dni$|documento.*(clave|dni)|^documento$|^n[º°\.\s]*identidad/i },
    { key: "historia_clinica", regex: /^(n[º°\.\s_]*|nro[_\s]*|numero[_\s]*)historia|historia.*cl[ií]nica|^hcl$|^hc$/i },
    { key: "apellidos_nombres", regex: /^apellidos|^nombres|^paciente|nombre_apellido|nombre_completo/i },
    { key: "sexo", regex: /^sexo|^g[eé]nero/i },
    { key: "fecha_nacimiento", regex: /fecha.*nac|f_nac/i },
    { key: "seguro_salud", regex: /seguro|financiador/i },
    { key: "telefono", regex: /tel[eé]fono|celular|fono/i },
    { key: "sector", regex: /sector|centro.*poblado/i },
    { key: "direccion", regex: /direcci[oó]n|domicilio/i },
    { key: "establecimiento_adscripcion", regex: /establecimiento.*adscrip|eess.*ads|eess_adscripcion/i },
    { key: "establecimiento_control", regex: /establecimiento.*control|eess.*ctrl|hoy.*control|eess_control/i },
    { key: "cie10_raw", regex: /^cie\s*-?10$|^codigo.*cie/i },
    { key: "diagnostico_raw", regex: /^diagn[oó]stico$|^dx$/i },
    { key: "cie10_hta", regex: /^(?!tratamiento|fecha).*hipertensi[oó]n|^hta$/i },
    { key: "cie10_dm", regex: /^(?!tratamiento|fecha).*diabetes|^dm$|^dm2$/i },
    { key: "cie10_dislipidemia", regex: /dislipidemia|^dislip/i },
    { key: "cie10_erc", regex: /renal.*cr[oó]nica|^erc$/i },
    { key: "dx_confirmado", regex: /diagn[oó]stico.*confirmado/i },
    { key: "enfermedad_cardiovascular", regex: /cardiovascular.*establecida/i },
    { key: "riesgo_cv_porcentaje", regex: /^riesgo.*cardiovascular.*%/i },
    { key: "fecha_valoracion_riesgo", regex: /^fecha.*valoraci[oó]n.*riesgo/i },
    { key: "tratamiento_hta", regex: /^tratamiento.*hipertensi|^tratamiento.*hta/i },
    { key: "tratamiento_dm", regex: /^tratamiento.*diab|^tratamiento.*dm/i },
    { key: "estatina", regex: /^estatina$/i },
    { key: "aspirina_aas", regex: /[aá]cido.*acetilsalic[ií]lico|^aas$/i },
    { key: "meses_medicacion", regex: /^meses.*medicaci[oó]n/i },
    { key: "peso", regex: /^peso/i },
    { key: "talla", regex: /^talla/i },
    { key: "perimetro_abdominal", regex: /^per[ií]metro.*abdominal|^pab$/i },

    // PAS y PAD por mes
    { key: "pas_ene", regex: /^pas.*ene/i }, { key: "pad_ene", regex: /^pad.*ene/i },
    { key: "pas_feb", regex: /^pas.*feb/i }, { key: "pad_feb", regex: /^pad.*feb/i },
    { key: "pas_mar", regex: /^pas.*mar/i }, { key: "pad_mar", regex: /^pad.*mar/i },
    { key: "pas_abr", regex: /^pas.*abr/i }, { key: "pad_abr", regex: /^pad.*abr/i },
    { key: "pas_may", regex: /^pas.*may/i }, { key: "pad_may", regex: /^pad.*may/i },
    { key: "pas_jun", regex: /^pas.*jun/i }, { key: "pad_jun", regex: /^pad.*jun/i },
    { key: "pas_jul", regex: /^pas.*jul/i }, { key: "pad_jul", regex: /^pad.*jul/i },
    { key: "pas_ago", regex: /^pas.*ago/i }, { key: "pad_ago", regex: /^pad.*ago/i },
    { key: "pas_set", regex: /^pas.*set|^pas.*sep/i }, { key: "pad_set", regex: /^pad.*set|^pad.*sep/i },
    { key: "pas_oct", regex: /^pas.*oct/i }, { key: "pad_oct", regex: /^pad.*oct/i },
    { key: "pas_nov", regex: /^pas.*nov/i }, { key: "pad_nov", regex: /^pad.*nov/i },
    { key: "pas_dic", regex: /^pas.*dic/i }, { key: "pad_dic", regex: /^pad.*dic/i },

    // Laboratorio
    { key: "glucosa", regex: /^glucosa/i },
    { key: "fecha_glucosa", regex: /^fecha.*glucosa/i },
    { key: "hba1c", regex: /^hba1c\s*\(|^hemoglobina.*glicosilada/i },
    { key: "fecha_hba1c", regex: /^fecha.*hba1c/i },
    { key: "creatinina", regex: /^creatinina/i },
    { key: "fecha_creatinina", regex: /^fecha.*creatinina/i },
    { key: "albuminuria", regex: /^albuminuria|^microalb/i },
    { key: "fecha_albuminuria", regex: /^fecha.*albuminuria|^fecha.*microalb/i },
    { key: "colesterol_total", regex: /^colesterol.*total/i },
    { key: "trigliceridos", regex: /^triglic[eé]ridos/i },
    { key: "colesterol_hdl", regex: /^colesterol.*hdl/i },
    { key: "colesterol_ldl", regex: /^colesterol.*ldl/i },
    { key: "fecha_perfil_lipidico", regex: /^fecha.*perfil.*lip[ií]dico/i },

    // Epidemiología y Seguimiento
    { key: "fecha_notificacion_diabetes", regex: /^fecha.*notificaci[oó]n.*diabetes/i },
    { key: "fecha_evaluacion_pie", regex: /^fecha.*evaluaci[oó]n.*pie/i },
    { key: "fecha_ultimo_control", regex: /^fecha.*[uú]ltimo.*control/i },
    { key: "proxima_cita", regex: /^pr[oó]xima.*cita/i },
    { key: "fecha_visita_domiciliaria", regex: /^fecha.*visita.*domiciliaria/i },
    { key: "estado_paciente", regex: /^estado.*paciente/i },
    { key: "fecha_estado", regex: /^fecha.*estado/i },
    { key: "observaciones", regex: /^observaci[oó]n/i },
    { key: "consentimiento", regex: /^consentimiento/i },
    { key: "actualizado_por", regex: /^registrado.*actualizado|^actualizado.*por/i }
  ];

  /** "Sí", "si", "SI", "Sí firmado", "firmado" -> "Sí, firmado"; "No" -> "No". Cualquier otro texto se deja para que la validación lo observe. */
  function normalizarConsentimiento(val) {
    const s = String(val === undefined || val === null ? '' : val).trim();
    if (!s) return '';
    const base = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.,;]/g, '').replace(/\s+/g, ' ');
    if (['si', 'si firmado', 'firmado'].includes(base)) return 'Sí, firmado';
    if (base === 'no') return 'No';
    return s;
  }

  function matchHeader(str) {
    if (!str || typeof str !== 'string') return null;
    const clean = str.trim();
    if (CALCULATED_COLUMNS_REGEX.test(clean)) return null;
    for (const item of HEADER_ALIASES) {
      if (item.regex.test(clean)) return item.key;
    }
    return null;
  }

  function formatDate(val) {
    if (!val) return '';
    if (val instanceof Date && !isNaN(val.getTime())) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const str = String(val).trim();
    // Manejo de DD/MM/YYYY o MM/DD/YYYY con 4 dígitos
    let match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (match) {
      const p1 = parseInt(match[1], 10);
      const p2 = parseInt(match[2], 10);
      const y = match[3];
      let d, m;
      if (p1 > 12 && p2 <= 12) { d = p1; m = p2; }
      else if (p2 > 12 && p1 <= 12) { m = p1; d = p2; }
      else { d = p1; m = p2; }
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    // Manejo de 2 dígitos de año (e.g. 11/23/59 de HOSIX)
    match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
    if (match) {
      const p1 = parseInt(match[1], 10);
      const p2 = parseInt(match[2], 10);
      const yy = parseInt(match[3], 10);
      const y = (yy > 30 ? 1900 + yy : 2000 + yy);
      let d, m;
      if (p1 > 12 && p2 <= 12) { d = p1; m = p2; }
      else if (p2 > 12 && p1 <= 12) { m = p1; d = p2; }
      else { d = p1; m = p2; }
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return str;
  }

  class PadronExcelParser {
    /** Clave del esquema para un encabezado de columna (null si no se reconoce o es calculada). */
    matchHeader(texto) {
      return matchHeader(texto);
    }

    /**
     * Parsea un buffer o File usando SheetJS
     * Devuelve una promesa con el array de registros normalizados y los metadatos de la hoja.
     */
    async parseWorkbook(fileOrBuffer) {
      const XLSX = (typeof window !== 'undefined' && window.XLSX) || (typeof global !== 'undefined' && global.XLSX);
      if (!XLSX) {
        throw new Error('La librería SheetJS (xlsx.full.min.js) no está cargada.');
      }

      let data;
      if (fileOrBuffer instanceof ArrayBuffer) {
        data = new Uint8Array(fileOrBuffer);
      } else if (ArrayBuffer.isView(fileOrBuffer)) {
        data = new Uint8Array(fileOrBuffer.buffer, fileOrBuffer.byteOffset, fileOrBuffer.byteLength);
      } else if (typeof Blob !== 'undefined' && fileOrBuffer instanceof Blob) {
        if (typeof fileOrBuffer.arrayBuffer === 'function') {
          const ab = await fileOrBuffer.arrayBuffer();
          data = new Uint8Array(ab);
        } else {
          data = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(new Uint8Array(fr.result));
            fr.onerror = () => reject(fr.error);
            fr.readAsArrayBuffer(fileOrBuffer);
          });
        }
      } else {
        throw new Error('Formato de archivo no soportado para lectura binaria.');
      }

      const workbook = XLSX.read(data, {
        type: 'array',
        cellDates: true,
        dateNF: 'yyyy-mm-dd'
      });

      // 1. Detectar la hoja y fila que contiene los encabezados del Padrón Estandarizado o HOSIX
      let sheetName = null;
      let worksheet = null;
      let rawRows = null;
      let headerRowIndex = -1;
      let headerKeyMap = [];

      // Ordenar hojas: primero las que contengan 'padr', luego las demás
      const candidateSheets = [...workbook.SheetNames].sort((a, b) => {
        const aHas = a.toLowerCase().includes('padr');
        const bHas = b.toLowerCase().includes('padr');
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        return 0;
      });

      for (const sName of candidateSheets) {
        const ws = workbook.Sheets[sName];
        if (!ws) continue;
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
        if (!rows || rows.length < 2) continue;

        for (let r = 0; r < Math.min(rows.length, 35); r++) {
          const row = rows[r];
          if (!Array.isArray(row)) continue;
          const matches = [];
          const seenKeys = new Set();
          row.forEach((cellVal, cIdx) => {
            const key = matchHeader(cellVal);
            if (key && !seenKeys.has(key)) {
              seenKeys.add(key);
              matches.push({ colIdx: cIdx, key });
            }
          });

          const hasDni = matches.some(m => m.key === 'nro_documento');
          const hasNombres = matches.some(m => m.key === 'apellidos_nombres');

          if ((hasDni && hasNombres) || (matches.length >= 5)) {
            sheetName = sName;
            worksheet = ws;
            rawRows = rows;
            headerRowIndex = r;
            headerKeyMap = matches;
            break;
          }
        }

        if (headerRowIndex !== -1) {
          break; // Hoja encontrada con éxito
        }
      }

      if (headerRowIndex === -1 || !rawRows) {
        throw new Error('No se pudo identificar la fila de encabezados del Padrón Estandarizado en ninguna de las hojas del archivo. Verifique que el archivo coincida con la plantilla oficial o contenga columnas de identificación.');
      }

      // 2. Extraer las filas de datos
      const parsedPatients = [];

      for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!Array.isArray(row) || row.length === 0) continue;

        // Construir objeto con las claves oficiales
        const patientRow = { _excelRowNumber: r + 1 };
        let hasAnyData = false;

        headerKeyMap.forEach(h => {
          let val = row[h.colIdx];
          if (val !== undefined && val !== null) {
            val = String(val).trim();
            if (val) hasAnyData = true;
          } else {
            val = '';
          }

          // Si es fecha, normalizar formato
          const colDef = schema.COLUMNAS_MAP.get(h.key);
          if (colDef && colDef.tipo === 'date') {
            val = formatDate(val);
          }

          if (h.key === 'consentimiento') val = normalizarConsentimiento(val);
          patientRow[h.key] = val;
        });

        // Asegurar que todas las columnas del esquema existan con valor por defecto si falta
        schema.COLUMNAS.forEach(col => {
          if (patientRow[col.key] === undefined) {
            patientRow[col.key] = col.default || '';
          }
        });

        if (!hasAnyData) continue; // Descartar filas 100% vacías

        // Conservar toda fila que tenga al menos documento o nombres (descarta filas en blanco de la plantilla)
        const hasIdentity = String(patientRow.nro_documento || '').trim() || String(patientRow.apellidos_nombres || '').trim();
        if (!hasIdentity) {
          continue;
        }

        // Post-procesamiento inteligente para compatibilidad universal (HOSIX / Galenos / Padrón)
        if (patientRow.cie10_raw || patientRow.diagnostico_raw) {
          const c = String(patientRow.cie10_raw || '').toUpperCase().trim();
          const d = String(patientRow.diagnostico_raw || '').toLowerCase().trim();
          if (c.startsWith('I10') || c.startsWith('I11') || c.startsWith('I15') || d.includes('hipertens')) {
            if (!patientRow.cie10_hta) patientRow.cie10_hta = 'I10.X – Hipertensión esencial (primaria)';
          }
          if (c.startsWith('E11') || c.startsWith('E10') || c.startsWith('E14') || d.includes('diabet')) {
            if (!patientRow.cie10_dm) patientRow.cie10_dm = 'E11.9 – Diabetes mellitus tipo 2 sin mención de complicación';
          }
          if (c.startsWith('E78') || d.includes('dislipid')) {
            if (!patientRow.cie10_dislipidemia) patientRow.cie10_dislipidemia = 'E78.5 – Hiperlipidemia no especificada';
          }
          if (c.startsWith('N18') || d.includes('renal')) {
            if (!patientRow.cie10_erc) patientRow.cie10_erc = 'N18.9 – Enfermedad renal crónica, no especificada';
          }
          delete patientRow.cie10_raw;
          delete patientRow.diagnostico_raw;
        }

        // Normalizar sexo
        if (patientRow.sexo) {
          const sx = String(patientRow.sexo).trim().toLowerCase();
          if (sx === 'f' || sx.startsWith('fem')) patientRow.sexo = 'Femenino';
          else if (sx === 'm' || sx.startsWith('mas')) patientRow.sexo = 'Masculino';
        }

        // Completar valores por defecto para registros sin EESS explícito (ej. exportes HOSIX del hospital)
        if (!patientRow.tipo_documento) patientRow.tipo_documento = 'DNI';
        if (!patientRow.dx_confirmado) patientRow.dx_confirmado = 'Sí';
        if (!patientRow.estado_paciente) patientRow.estado_paciente = 'Activo';
        if (!patientRow.establecimiento_adscripcion) patientRow.establecimiento_adscripcion = 'Hospital de Apoyo Huarmey (00001741, II-1)';
        if (!patientRow.establecimiento_control) patientRow.establecimiento_control = 'Hospital de Apoyo Huarmey (00001741, II-1)';

        parsedPatients.push(patientRow);
      }

      return {
        sheetName,
        totalRowsParsed: parsedPatients.length,
        headerRowNumber: headerRowIndex + 1,
        patients: parsedPatients
      };
    }
  }

  return new PadronExcelParser();
});
