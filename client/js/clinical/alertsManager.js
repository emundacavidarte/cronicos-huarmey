/**
 * alertsManager.js
 * Gestor de Pre-citas hospitalarias para el Hospital II-1 Huarmey (HOSIX, Galenos y Pakamuros Soft)
 */

class AlertsManager {
  constructor() {
    this.precitas = [];
  }

  /**
   * Genera una solicitud formal de pre-cita para Admisión
   */
  crearPreCita(patient, fechaSugerida = null, consultorio = "Consultorio de Crónicos / Medicina Interna") {
    const fecha = fechaSugerida || window.FechaLima.hoy(3);

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
    if (typeof patientOrDni === 'string' && window.app && window.app.patients) {
      patient = window.app.patients.find(x => x.id === patientOrDni || x.dni === patientOrDni) || { dni: patientOrDni, apellidos_nombres: patientOrDni };
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
if (typeof module !== 'undefined' && module.exports) {
  module.exports = new AlertsManager();
} else {
  window.AlertsManager = new AlertsManager();
}
