/**
 * hosixParser.js
 * Ingestor y Procesador de Archivos CSV / Tablas Exportadas de HOSIX, Galenos y Pakamuros Soft (Client-Side)
 * Traduce cada fila a un recurso HL7 FHIR Patient y calcula sus coordenadas con AncashGeocoder.
 */

class HosixParser {
  /**
   * Parsea una línea de texto CSV respetando comillas y conservando columnas vacías (,,)
   */
  parseCSVLine(line, delimiter = ',') {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // escapar comilla doble ""
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  /**
   * Parsea texto CSV con soporte para comillas, campos vacíos y encabezados delimitados por coma o punto y coma
   */
  parseCSV(csvText) {
    if (!csvText || typeof csvText !== 'string') return [];
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const delimiter = (lines[0].includes(';') && !lines[0].includes(',')) ? ';' : ',';
    const headers = this.parseCSVLine(lines[0], delimiter).map(h => h.replace(/^"|"$/g, ''));
    const records = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = this.parseCSVLine(line, delimiter);
      const row = {};

      headers.forEach((h, idx) => {
        let val = values[idx] !== undefined ? values[idx] : '';
        val = val.replace(/^"|"$/g, '');
        row[h] = val;
      });

      records.push(row);
    }

    return records;
  }

  /**
   * Convierte registros de tabla a objetos de paciente enriquecidos con HL7 FHIR y geocodificación
   */
  processRecords(records) {
    // Sin geocodificador no se inventa una ubicación: el paciente queda sin coordenadas (el servidor puede ubicarlo)
    const geocoder = (typeof window !== 'undefined' && window.AncashGeocoder) || (typeof global !== 'undefined' && global.AncashGeocoder) || { geocode: () => ({ lat: null, lng: null, sector: null, matched: false, precision_geo: 'sin_ubicacion', es_puerta_id: null, toponym: null }) };
    const estRef = (typeof window !== 'undefined' && window.EstablecimientosHuarmey) || null;
    const esDeLaRed = code => !!code && (!estRef || estRef.getAllHuarmey().some(e => e.cod_renipress === String(code)));
    const hearts = (typeof window !== 'undefined' && window.HeartsEngine) || (typeof global !== 'undefined' && global.HeartsEngine) || { evaluatePatient: () => ({ semaforo: "green", estado_control: "Controlado" }) };

    return records.map((r, index) => {
      // DNI: Soporte para HOSIX, Galenos y Pakamuros Soft
      const dni = r.NRO_DOCUMENTO || r.DNI || r.DocIdentidad || r.dni_paciente || r.numero_documento || `DNI-${index+1}`;
      // Historia Clínica
      const hc = r.HISTORIA_CLINICA || r.NUM_HC || r.NroHistoriaClinica || r.hc_numero || r.nro_historia || `HC-${1000+index}`;
      // Nombres
      const nombre = r.APELLIDOS_NOMBRES || r.PACIENTE || r.Nombres || r.paciente_apellidos_nombres || r.nombre_completo || 'PACIENTE REGISTRADO';
      // Dirección
      const direccion = r.DIRECCION || r.REF_DIRECCION || r.Domicilio || r.direccion_actual || 'Huarmey';
      // Teléfono
      const telefono = r.TELEFONO || r.CELULAR || r.Movil || r.telefono_celular || '';
      // CIE-10
      const cie10 = r.CIE10_COD || r.DIAGNOSTICO || r.CodigoCIE10 || r.diagnostico_cie10 || r.cie10 || 'I10';
      // Parámetros clínicos
      const pas = parseInt(r.PA_SISTOLICA || r.PresionSistolica || r.pa_sistolica) || null;
      const pad = parseInt(r.PA_DIASTOLICA || r.PresionDiastolica || r.pa_diastolica) || null;
      const hba1c = parseFloat(r.HBA1C || r.HbA1c || r.hba1c) || null;
      // Fechas
      const fechaUltima = r.FEC_ULTIMA_ATENCION || r.FechaAtencion || r.fecha_atencion || null;
      const fechaProxima = r.FEC_PROXIMA_CITA || r.FechaProximaCita || r.fecha_control_cita || r.proxima_cita || null;
      const estadoControlRaw = r.ESTADO_CONTROL || r.CondicionControl || null;

      // Geocodificación inteligente de la dirección en Huarmey
      const geo = geocoder.geocode(direccion);

      const patientObj = {
        id: `pac-00001741-${dni}`,
        dni,
        historia_clinica: hc,
        apellidos_nombres: nombre.toUpperCase(),
        telefono,
        direccion,
        distrito: r.DISTRITO || r.distrito || 'Huarmey',
        latitud: geo.matched ? geo.lat : null,
        longitud: geo.matched ? geo.lng : null,
        precision_geo: geo.matched ? geo.precision_geo : undefined,
        geo_fuente: geo.matched ? 'geocodificador' : undefined,
        geo_toponimo: geo.matched ? geo.toponym : undefined,
        sector_sanitario: geo.matched ? geo.sector : undefined,
        // Solo un establecimiento del catálogo de la microrred (uno de otra red dejaría al paciente fuera del alcance)
        puerta_entrada_id: esDeLaRed(geo.es_puerta_id) ? geo.es_puerta_id : '00001741',
        puerta_entrada: (esDeLaRed(geo.es_puerta_id) && estRef && estRef.getByCode(geo.es_puerta_id)) ? estRef.getByCode(geo.es_puerta_id).nombre : 'NUEVO HOSPITAL DE APOYO HUARMEY',
        conditions: [
          {
            cie10_cod: cie10,
            diagnostico: cie10.startsWith('I') ? 'Hipertensión Arterial' : 'Diabetes Mellitus Tipo 2'
          }
        ],
        appointments: fechaProxima || fechaUltima ? [
          {
            fecha_cita: fechaProxima || fechaUltima,
            estado: 'booked'
          }
        ] : [],
        observations: (pas || pad || hba1c) ? [
          {
            fecha_registro: fechaUltima || window.FechaLima.hoy(),
            pa_sistolica: pas,
            pa_diastolica: pad,
            hba1c: hba1c,
            estado_control: estadoControlRaw || (pas >= 140 || pad >= 90 ? 'No Controlado' : 'Controlado')
          }
        ] : []
      };

      // Evaluación clínica HEARTS
      const evalRes = hearts.evaluatePatient(patientObj);

      return {
        ...patientObj,
        ...evalRes,
        diagnosticos: [cie10]
      };
    });
  }
}

// Exportación
if (typeof module !== 'undefined' && module.exports) {
  module.exports = new HosixParser();
} else {
  window.HosixParser = new HosixParser();
}
