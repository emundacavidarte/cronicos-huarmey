/**
 * heartsEngine.js
 * Motor Clínico de Inteligencia Sanitaria basado en la Iniciativa HEARTS (MINSA / OPS)
 * Reglas de periodicidad de citas (30 vs 90 días) y semáforo de riesgo para HTA y DM2.
 */

class HeartsEngine {
  /**
   * Evalúa la condición de un paciente bajo el protocolo HEARTS
   * @param {Object} patient Objeto paciente con condiciones, citas y observaciones
   */
  evaluatePatient(patient) {
    const conditions = patient.conditions || [];
    const observations = patient.observations || [];
    const appointments = patient.appointments || [];

    // 1. Diagnósticos prioritarios
    const hasHta = conditions.some(c => c.cie10_cod?.startsWith('I10') || c.diagnostico?.toLowerCase().includes('hipertens'));
    const hasDm2 = conditions.some(c => c.cie10_cod?.startsWith('E11') || c.diagnostico?.toLowerCase().includes('diabet'));

    // 2. Última observación clínica (Presión Arterial / HbA1c)
    const latestObs = observations.sort((a,b) => new Date(b.fecha_registro) - new Date(a.fecha_registro))[0];
    
    let isControlado = false;
    let pas = latestObs?.pa_sistolica ?? patient.pa_sistolica ?? null;
    let pad = latestObs?.pa_diastolica ?? patient.pa_diastolica ?? null;
    let hba1c = latestObs?.hba1c ?? patient.hba1c ?? null;
    let glucosa = latestObs?.glucosa ?? patient.glucosa ?? null;
    const hasAnyVital = (pas !== null && pad !== null) || hba1c !== null || glucosa !== null;

    if (patient.fallecido) {
      isControlado = false;
    } else if (latestObs && latestObs.estado_control === 'Controlado' && hasAnyVital) {
      isControlado = true;
    } else if (latestObs && (latestObs.estado_control === 'No Controlado' || latestObs.estado_control === 'Sin Datos de Control en Padrón')) {
      isControlado = false;
    } else if (hasAnyVital) {
      // Evaluación estricta por umbrales clínicos HEARTS: PA < 140/90, HbA1c < 7.0% y Glucosa 70-130 mg/dL
      const paOk = (pas !== null && pad !== null) ? (pas < 140 && pad < 90) : !hasHta;
      let gluOk = true;
      if (hasDm2) {
        if (hba1c !== null && glucosa !== null) gluOk = (hba1c < 7.0 && glucosa >= 70 && glucosa <= 130);
        else if (hba1c !== null) gluOk = (hba1c < 7.0);
        else if (glucosa !== null) gluOk = (glucosa >= 70 && glucosa <= 130);
        else gluOk = false;
      }
      isControlado = paOk && gluOk;
    }

    // 3. Periodicidad oficial HEARTS: 30 días si NO controlado; 90 días si CONTROLADO
    const frecuenciaDias = isControlado ? 90 : 30;

    // 4. Última cita o cita programada
    const sortedAppts = [...appointments].sort((a,b) => new Date(b.fecha_cita) - new Date(a.fecha_cita));
    const latestAppt = sortedAppts[0];

    let semaforo = 'gray';
    let diasRestantes = null;
    let diasVencido = 0;
    let fechaLimite = null;

    if (latestAppt && latestAppt.fecha_cita) {
      fechaLimite = new Date(latestAppt.fecha_cita);
      const hoy = new Date();
      // Reset horas para cálculo exacto de días
      hoy.setHours(0,0,0,0);
      fechaLimite.setHours(0,0,0,0);

      const diffMs = fechaLimite.getTime() - hoy.getTime();
      diasRestantes = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diasRestantes > 7) {
        semaforo = 'green'; // Control Vigente
      } else if (diasRestantes >= 0) {
        semaforo = 'yellow'; // Próximo a vencer (a 7 días o menos)
      } else {
        semaforo = 'red'; // Vencido / Inasistente (Deserción)
        diasVencido = Math.abs(diasRestantes);
      }
    }

    // 5. Recomendación de adscripción territorial
    let recomendacion = "Control hospitalario regular en Hospital II-1 Huarmey.";
    if (isControlado && (patient.puerta_entrada && !patient.puerta_entrada.includes('HOSPITAL'))) {
      recomendacion = `Paciente controlado en meta HEARTS. Candidato para contrarreferencia y recojo trimestral de medicación en su puerta de entrada: ${patient.puerta_entrada}.`;
    } else if (!isControlado) {
      recomendacion = `Paciente no controlado (PA: ${pas || '--'}/${pad || '--'}). Requiere control mensual a los 30 días y ajuste terapéutico en Medicina Interna.`;
    }

    return {
      hasHta,
      hasDm2,
      estado_control: isControlado ? 'Controlado' : 'No Controlado',
      frecuencia_hearts: frecuenciaDias,
      semaforo,
      dias_restantes: diasRestantes,
      dias_vencido: diasVencido,
      fecha_limite: fechaLimite ? fechaLimite.toISOString().split('T')[0] : 'Sin fecha',
      recomendacion
    };
  }
}

// Exportación
if (typeof module !== 'undefined' && module.exports) {
  module.exports = new HeartsEngine();
} else {
  window.HeartsEngine = new HeartsEngine();
}
