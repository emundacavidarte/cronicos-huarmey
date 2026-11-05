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
   * Parsea texto CSV completo: comillas, comas y saltos de línea dentro de comillas, campos vacíos (,,),
   * fin de línea Windows (\r\n) y marca BOM inicial. Delimitador coma o punto y coma (T-11, F9).
   */
  parseCSV(csvText) {
    if (!csvText || typeof csvText !== 'string') return [];
    const texto = csvText.replace(/^\uFEFF/, '');
    const primera = texto.split(/\r?\n/, 1)[0] || '';
    const delimiter = (primera.includes(';') && !primera.includes(',')) ? ';' : ',';

    const filas = [];
    let fila = [];
    let campo = '';
    let enComillas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (enComillas) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') enComillas = false;
        else campo += c;
      } else if (c === '"') {
        enComillas = true;
      } else if (c === delimiter) {
        fila.push(campo.trim()); campo = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        fila.push(campo.trim()); campo = '';
        filas.push(fila); fila = [];
      } else {
        campo += c;
      }
    }
    if (campo !== '' || fila.length > 0) { fila.push(campo.trim()); filas.push(fila); }

    const utiles = filas.filter(f => f.some(v => v !== ''));
    if (utiles.length < 2) return [];
    const headers = utiles[0].map(h => h.trim());
    return utiles.slice(1).map(valores => {
      const row = {};
      headers.forEach((h, idx) => { row[h] = valores[idx] !== undefined ? valores[idx] : ''; });
      return row;
    });
  }

  /**
   * Prepara las filas para guardarlas en el servidor (F-1): descarta las que no tienen documento válido ni nombre
   * (antes se inventaban «DNI-1» y «PACIENTE REGISTRADO») y quita el semáforo calculado aquí, para que el
   * servidor lo calcule con la misma regla que el resto del sistema.
   * Devuelve { validos, descartados: [{ fila, motivo }] }.
   */
  procesarParaServidor(records) {
    const procesados = this.processRecords(records);
    const validos = [];
    const descartados = [];
    procesados.forEach((p, i) => {
      const fila = i + 2; // la fila 1 es la cabecera
      if (!/^[A-Za-z0-9]{8,12}$/.test(String(p.dni || ''))) { descartados.push({ fila, motivo: 'sin número de documento válido' }); return; }
      if (!p.apellidos_nombres) { descartados.push({ fila, motivo: 'sin apellidos y nombres' }); return; }
      const limpio = Object.assign({}, p);
      ['semaforo', 'dias_restantes', 'dias_vencido', 'fecha_limite', 'motivo'].forEach(k => { delete limpio[k]; });
      validos.push(limpio);
    });
    return { validos, descartados };
  }

  /**
   * Convierte registros de tabla a objetos de paciente enriquecidos con HL7 FHIR y geocodificación
   */
  processRecords(records) {
    const geocoder = (typeof window !== 'undefined' && window.AncashGeocoder) || (typeof global !== 'undefined' && global.AncashGeocoder) || { geocode: (addr) => ({ lat: -10.0689, lng: -78.1524, sector: "Sector 01 - Centro", matched: false }) };
    const hearts = (typeof window !== 'undefined' && window.HeartsEngine) || (typeof global !== 'undefined' && global.HeartsEngine) || { evaluatePatient: () => ({ semaforo: "green", estado_control: "Controlado" }) };

    return records.map((r, index) => {
      // Sin datos inventados (T-07): si la columna no viene, el campo queda vacío
      const limpiar = v => (v === undefined || v === null) ? '' : String(v).trim();
      // DNI: Soporte para HOSIX, Galenos y Pakamuros Soft
      const dni = limpiar(r.NRO_DOCUMENTO || r.DNI || r.DocIdentidad || r.dni_paciente || r.numero_documento);
      // Historia Clínica
      const hc = limpiar(r.HISTORIA_CLINICA || r.NUM_HC || r.NroHistoriaClinica || r.hc_numero || r.nro_historia);
      // Nombres
      const nombre = limpiar(r.APELLIDOS_NOMBRES || r.PACIENTE || r.Nombres || r.paciente_apellidos_nombres || r.nombre_completo);
      // Dirección
      const direccion = limpiar(r.DIRECCION || r.REF_DIRECCION || r.Domicilio || r.direccion_actual);
      // Teléfono
      const telefono = limpiar(r.TELEFONO || r.CELULAR || r.Movil || r.telefono_celular);
      // CIE-10: el código va en su columna; DIAGNOSTICO solo se toma como código si tiene forma de código
      const esCodigo = v => /^[A-Z]\d{2}(\.\d{1,2})?$/i.test(limpiar(v));
      const cie10 = limpiar(r.CIE10_COD || r.CodigoCIE10 || r.diagnostico_cie10 || r.cie10 || (esCodigo(r.DIAGNOSTICO) ? r.DIAGNOSTICO : '')).toUpperCase();
      const diagTexto = (!esCodigo(r.DIAGNOSTICO) && limpiar(r.DIAGNOSTICO)) ||
        (cie10.startsWith('I1') ? 'Hipertensión Arterial' : cie10.startsWith('E1') ? 'Diabetes Mellitus' : cie10.startsWith('N18') ? 'Enfermedad Renal Crónica' : cie10);
      // Parámetros clínicos
      const pas = parseInt(r.PA_SISTOLICA || r.PresionSistolica || r.pa_sistolica) || null;
      const pad = parseInt(r.PA_DIASTOLICA || r.PresionDiastolica || r.pa_diastolica) || null;
      const hba1c = parseFloat(r.HBA1C || r.HbA1c || r.hba1c) || null;
      // Fechas
      const fechaUltima = r.FEC_ULTIMA_ATENCION || r.FechaAtencion || r.fecha_atencion || null;
      const fechaProxima = r.FEC_PROXIMA_CITA || r.FechaProximaCita || r.fecha_control_cita || r.proxima_cita || null;
      const estadoControlRaw = r.ESTADO_CONTROL || r.CondicionControl || null;
      // Establecimiento de origen: el código RENIPRESS del archivo manda; si no viene, el que sugiere la dirección
      const codIpress = /^\d{8}$/.test(limpiar(r.COD_IPRESS_ORIGEN)) ? limpiar(r.COD_IPRESS_ORIGEN) : null;
      const catalogo = (typeof window !== 'undefined' && window.ESTABLECIMIENTOS_HUARMEY) || [];
      const hoy = (typeof window !== 'undefined' && window.FechaLima) ? window.FechaLima.hoy() : new Date().toISOString().slice(0, 10);

      // Geocodificación inteligente de la dirección en Huarmey
      const geo = geocoder.geocode(direccion);

      const puertaId = codIpress || geo.es_puerta_id || '00001741';
      const est = catalogo.find(e => e.cod_renipress === puertaId);

      const patientObj = {
        id: `pac-00001741-${dni}`,
        dni,
        historia_clinica: hc,
        apellidos_nombres: nombre.toUpperCase(),
        telefono,
        direccion,
        distrito: limpiar(r.DISTRITO || r.distrito) || 'Huarmey',
        latitud: geo.lat,
        longitud: geo.lng,
        sector_sanitario: geo.sector,
        puerta_entrada_id: puertaId,
        // El servidor toma el código entre paréntesis y completa nombre y red desde el catálogo oficial
        puerta_entrada: est ? est.nombre : '',
        establecimiento_control: `${est ? est.nombre : 'Establecimiento'} (${puertaId})`,
        fuente: 'IMPORTACION_CSV',
        conditions: cie10 ? [{ cie10_cod: cie10, diagnostico: diagTexto }] : [],
        appointments: fechaProxima || fechaUltima ? [
          {
            fecha_cita: fechaProxima || fechaUltima,
            estado: 'booked'
          }
        ] : [],
        observations: (pas || pad || hba1c) ? [
          {
            fecha_registro: fechaUltima || hoy,
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
        diagnosticos: cie10 ? [cie10] : []
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
