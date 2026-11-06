/**
 * hosixParser.js
 * Ingestor y Procesador de Archivos CSV / Tablas Exportadas de HOSIX, Galenos y Pakamuros Soft (Client-Side)
 * Traduce cada fila a un recurso HL7 FHIR Patient y calcula sus coordenadas con AncashGeocoder.
 */

(function (root) {
  // ---------- ayudas del módulo (sin depender de window a nivel de módulo: en Node también carga) ----------
  const enNode = typeof module !== 'undefined' && module.exports;

  /** Reglas clínicas compartidas (en el navegador se cargan antes; en Node, require). */
  function reglas() {
    if (typeof window !== 'undefined' && window.ReglasClinicas) return window.ReglasClinicas;
    if (enNode) return require('../clinical/reglasClinicas');
    throw new Error('Reglas clínicas no cargadas');
  }

  /** Motor HEARTS. Sin él NO se devuelve un respaldo «verde / Controlado» (T3-05): se lanza el error. */
  function motorClinico() {
    if (typeof window !== 'undefined' && window.HeartsEngine) return window.HeartsEngine;
    if (typeof global !== 'undefined' && global.HeartsEngine) return global.HeartsEngine;
    if (enNode) {
      try { return require('../clinical/heartsEngine'); } catch (e) { /* cae al error de abajo */ }
    }
    throw new Error('Motor clínico no cargado');
  }

  /** Geocodificador del navegador. Sin él, el paciente queda SIN coordenadas (antes: un punto fijo marcado como encontrado). */
  function geocodificador() {
    const g = (typeof window !== 'undefined' && window.AncashGeocoder) || (typeof global !== 'undefined' && global.AncashGeocoder);
    return g || { geocode: () => ({ lat: null, lng: null, matched: false }) };
  }

  /** Hoy (AAAA-MM-DD, hora de Lima) con FechaLima si existe; si no, la fecha local. */
  function hoyTexto(R) {
    let F = null;
    if (typeof window !== 'undefined' && window.FechaLima) F = window.FechaLima;
    else if (enNode) { try { F = require('../utils/fechaLima'); } catch (e) { F = null; } }
    return F ? F.hoy() : R.aTexto(new Date());
  }

  /**
   * Valida el documento. Con tipo en el archivo: DNI = 8 dígitos; otro tipo = 6 a 15 letras o dígitos.
   * Sin tipo: 8 dígitos = DNI; si no, carné de extranjería (solo dígitos) o pasaporte (con letras), de 6 a 15 caracteres.
   * El documento no se modifica (solo se recorta y se pasa a mayúsculas): un guion o un espacio lo vuelven inválido.
   */
  function validarDocumento(crudo, tipoCrudo) {
    if (!crudo) return { valido: false, motivo: 'Sin número de documento' };
    const numero = crudo.toUpperCase();
    const tipoTxt = tipoCrudo.toUpperCase();
    if (tipoTxt) {
      if (tipoTxt.startsWith('SIN')) return { valido: false, motivo: 'Sin documento (el tipo de documento es «Sin documento»)' };
      if (tipoTxt === 'DNI') {
        return /^\d{8}$/.test(numero)
          ? { valido: true, numero, tipo: 'DNI' }
          : { valido: false, motivo: `Documento no válido: el DNI debe tener exactamente 8 dígitos (${crudo})` };
      }
      return /^[A-Z0-9]{6,15}$/.test(numero)
        ? { valido: true, numero, tipo: /PASAPORTE/.test(tipoTxt) ? 'Pasaporte' : 'Carné de extranjería' }
        : { valido: false, motivo: `Documento no válido: el carné de extranjería o pasaporte debe tener de 6 a 15 letras o dígitos (${crudo})` };
    }
    if (/^\d{8}$/.test(numero)) return { valido: true, numero, tipo: 'DNI' };
    if (/^[A-Z0-9]{6,15}$/.test(numero)) return { valido: true, numero, tipo: /^\d+$/.test(numero) ? 'Carné de extranjería' : 'Pasaporte' };
    return { valido: false, motivo: `Documento no válido: DNI de 8 dígitos, o carné de extranjería o pasaporte de 6 a 15 letras o dígitos (${crudo})` };
  }

  /** Diagnósticos de la celda CIE-10: uno por código reconocible (varios separados por ; , | o /). Sin código, ninguno. */
  function diagnosticosDe(R, celda) {
    const lista = [];
    String(celda === undefined || celda === null ? '' : celda).split(/[;,|/]+/).forEach(trozo => {
      const codigo = R.extraerCodigo(trozo);
      if (!codigo) return;
      if (lista.some(c => c.cie10_cod === codigo)) return;
      const rotulo = R.rotuloCie10(codigo) || trozo.trim().replace(/^[A-Za-z]\d{2}(?:\.[0-9Xx]+)?\s*[-–—:]?\s*/, '') || codigo;
      lista.push({ cie10_cod: codigo, diagnostico: rotulo });
    });
    return lista;
  }

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
     * Convierte registros de tabla a objetos de paciente enriquecidos con HL7 FHIR y geocodificación.
     *
     * Fase 3 (K3-10, T3-05): NO inventa documento, historia clínica, nombre ni diagnóstico. Una fila sin documento válido
     * (DNI de 8 dígitos; carné de extranjería o pasaporte de 6 a 15 letras o dígitos) no entra al arreglo devuelto y se
     * informa en `resultado.observados = [{ fila, motivo }]` (fila empieza en 1). Sin diagnóstico, `conditions` queda
     * vacío. El rótulo sale del código CIE-10 (ReglasClinicas.rotuloCie10) y el estado de control, de las cifras
     * (ReglasClinicas.estadoControl), nunca de la etiqueta que traiga el archivo.
     * Si el motor clínico (HeartsEngine) no cargó, lanza Error('Motor clínico no cargado'): no devuelve verde / Controlado.
     */
    processRecords(records) {
      const R = reglas();
      const hearts = motorClinico(); // lanza si no está cargado
      const geocoder = geocodificador();
      const hoy = hoyTexto(R);

      const resultado = [];
      resultado.observados = [];

      (records || []).forEach((r, index) => {
        const fila = index + 1;

        // Documento: Soporte para HOSIX, Galenos y Pakamuros Soft. Sin documento válido la fila NO entra (decisión 05/11/2026).
        const docCrudo = String(r.NRO_DOCUMENTO || r.DNI || r.DocIdentidad || r.dni_paciente || r.numero_documento || '').trim();
        const tipoCrudo = String(r.TIPO_DOCUMENTO || r.TipoDocumento || r.TIPO_DOC || r.tipo_documento || '').trim();
        const doc = validarDocumento(docCrudo, tipoCrudo);
        if (!doc.valido) {
          resultado.observados.push({ fila, motivo: doc.motivo });
          return;
        }
        const dni = doc.numero;

        // Historia Clínica y nombre: lo que traiga el archivo, o vacío (no se inventan)
        const hc = String(r.HISTORIA_CLINICA || r.NUM_HC || r.NroHistoriaClinica || r.hc_numero || r.nro_historia || '').trim();
        const nombre = String(r.APELLIDOS_NOMBRES || r.PACIENTE || r.Nombres || r.paciente_apellidos_nombres || r.nombre_completo || '').trim();
        // Dirección
        const direccion = r.DIRECCION || r.REF_DIRECCION || r.Domicilio || r.direccion_actual || 'Huarmey';
        // Teléfono
        const telefono = r.TELEFONO || r.CELULAR || r.Movil || r.telefono_celular || '';
        // CIE-10: solo códigos reconocibles; sin código no hay diagnóstico
        const conditions = diagnosticosDe(R, r.CIE10_COD || r.DIAGNOSTICO || r.CodigoCIE10 || r.diagnostico_cie10 || r.cie10 || '');
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
          tipo_documento: doc.tipo,
          historia_clinica: hc,
          apellidos_nombres: nombre.toUpperCase(),
          telefono,
          direccion,
          distrito: r.DISTRITO || r.distrito || 'Huarmey',
          latitud: geo.lat === undefined ? null : geo.lat,
          longitud: geo.lng === undefined ? null : geo.lng,
          sector_sanitario: geo.sector || '',
          puerta_entrada_id: geo.es_puerta_id || '00001741',
          puerta_entrada: geo.toponym ? `Zona ${geo.toponym}` : 'Hospital de Apoyo Huarmey II-1',
          conditions,
          // Solo la PRÓXIMA cita es una cita: la fecha de la última atención ya ocurrió y no se agenda como «booked»
          appointments: fechaProxima ? [{ fecha_cita: fechaProxima, estado: 'booked' }] : [],
          observations: [],
          // La etiqueta del archivo solo la usa el motor si no hay ninguna medición (y entonces solo «No Controlado»)
          estado_control: estadoControlRaw
        };

        // El estado de control de la observación sale de las cifras, no de la etiqueta del archivo
        if (pas || pad || hba1c) {
          patientObj.observations.push({
            fecha_registro: fechaUltima || hoy,
            pa_sistolica: pas,
            pa_diastolica: pad,
            hba1c: hba1c,
            estado_control: R.estadoControl({ pas, pad, hba1c }, R.perfilClinico(patientObj))
          });
        }

        // Evaluación clínica HEARTS
        const evalRes = hearts.evaluatePatient(patientObj);

        resultado.push({
          ...patientObj,
          ...evalRes,
          diagnosticos: conditions.map(c => c.cie10_cod)
        });
      });

      return resultado;
    }
  }

  // Exportación
  if (enNode) {
    module.exports = new HosixParser();
  } else {
    root.HosixParser = new HosixParser();
  }
})(typeof window !== 'undefined' ? window : this);
