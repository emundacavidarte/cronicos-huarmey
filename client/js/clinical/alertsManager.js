/**
 * alertsManager.js
 * Gestor de Pre-citas hospitalarias para el Hospital II-1 Huarmey (HOSIX, Galenos y Pakamuros Soft)
 *
 * Fase 3: no inventa datos. Una pre-cita sin fecha sugerida válida (antes «hoy + 3 días») o de un paciente que no
 * está en la lista (antes un «paciente» cuyo nombre era el propio DNI) no se crea: se devuelve null.
 */
(function (root) {
  const enNode = typeof module !== 'undefined' && module.exports;
  const R = enNode ? require('./reglasClinicas') : root.ReglasClinicas;
  if (!R) throw new Error('Reglas clínicas no cargadas (reglasClinicas.js debe cargarse antes que alertsManager.js)');

  class AlertsManager {
    constructor() {
      this.precitas = [];
    }

    /**
     * Genera una solicitud formal de pre-cita para Admisión
     */
    crearPreCita(patient, fechaSugerida = null, consultorio = "Consultorio de Crónicos / Medicina Interna") {
      // La fecha la elige quien genera la pre-cita; sin una fecha real AAAA-MM-DD no se inventa otra
      if (!patient || typeof fechaSugerida !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fechaSugerida.trim()) || !R.parseFechaLocal(fechaSugerida.trim())) return null;
      const fecha = fechaSugerida.trim();

      const precita = {
        id: `PRECIT-${Date.now()}`,
        dni: patient.dni,
        historia_clinica: patient.historia_clinica,
        paciente: patient.apellidos_nombres,
        telefono: patient.telefono,
        direccion: patient.direccion,
        sector: patient.sector_sanitario,
        puerta_entrada: patient.puerta_entrada,
        diagnosticos: (patient.conditions || []).map(c => c.cie10_cod).join(', '),
        consultorio_destino: consultorio,
        fecha_sugerida: fecha,
        estado: "PENDIENTE_ADMISIÓN",
        generado_en: new Date().toISOString()
      };

      this.precitas.push(precita);
      return precita;
    }

    registrarPreCita(patientOrDni, fechaSugerida = null, consultorio = "Consultorio de Crónicos / Medicina Interna") {
      let patient = patientOrDni;
      if (typeof patientOrDni === 'string') {
        const lista = (typeof window !== 'undefined' && window.app && window.app.patients) || [];
        patient = lista.find(x => x.id === patientOrDni || x.dni === patientOrDni) || null;
      }
      return this.crearPreCita(patient, fechaSugerida, consultorio);
    }

    obtenerTodas() {
      return this.precitas;
    }

    /**
     * Sanitiza valores contra inyección de fórmulas CSV (CWE-1236 / OWASP) y escapa comillas dobles
     */
    _escapeCsvValue(val) {
      if (val === null || val === undefined) return '""';
      let str = String(val).replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }
      return `"${str}"`;
    }

    /**
     * Exporta las pre-citas a formato CSV para cargarlas en bloque a HOSIX o Galenhos
     */
    exportarCsvParaHosix() {
      if (this.precitas.length === 0) return null;

      const headers = ["ID_PRE_CITA", "DNI", "NUM_HC", "PACIENTE", "TELEFONO", "DIRECCION", "DIAGNOSTICO", "CONSULTORIO", "FECHA_SUGERIDA", "ESTADO"];
      const rows = this.precitas.map(p => [
        this._escapeCsvValue(p.id),
        this._escapeCsvValue(p.dni),
        this._escapeCsvValue(p.historia_clinica),
        this._escapeCsvValue(p.paciente),
        this._escapeCsvValue(p.telefono),
        this._escapeCsvValue(p.direccion),
        this._escapeCsvValue(p.diagnosticos),
        this._escapeCsvValue(p.consultorio_destino),
        this._escapeCsvValue(p.fecha_sugerida),
        this._escapeCsvValue(p.estado)
      ]);

      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }
  }

  // Exportación
  if (enNode) {
    module.exports = new AlertsManager();
  } else {
    root.AlertsManager = new AlertsManager();
  }
})(typeof window !== 'undefined' ? window : this);
