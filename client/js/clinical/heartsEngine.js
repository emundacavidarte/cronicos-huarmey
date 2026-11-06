/**
 * heartsEngine.js
 * Motor Clínico de Inteligencia Sanitaria basado en la Iniciativa HEARTS (MINSA / OPS)
 * Reglas de periodicidad de citas (30 vs 90 días) y semáforo de riesgo para HTA y diabetes.
 *
 * Fase 3 (T3-02, K3-07): este módulo ya no tiene lógica propia de meta, estado de control, diagnósticos ni fechas.
 *   - metas, diagnósticos, estado de control, frecuencia y fechas: reglasClinicas.js (ReglasClinicas)
 *   - semáforo (color, días, fallecidos, HOSIX, cita cumplida): semaforo.js (SemaforoHearts)
 * Ambos se cargan antes en index.html; en Node se obtienen con require.
 */
(function (root) {
  const enNode = typeof module !== 'undefined' && module.exports;
  const R = enNode ? require('./reglasClinicas') : root.ReglasClinicas;
  const SemaforoHearts = enNode ? require('./semaforo') : root.SemaforoHearts;
  if (!R || !SemaforoHearts) {
    throw new Error('Motor clínico incompleto: reglasClinicas.js y semaforo.js deben cargarse antes que heartsEngine.js');
  }

  class HeartsEngine {
    /**
     * Evalúa la condición de un paciente bajo el protocolo HEARTS. No modifica al paciente ni sus listas.
     * @param {Object} patient Objeto paciente con condiciones, citas y observaciones
     * @param {Date} [hoy] fecha de referencia (por defecto, hoy); solo para pruebas
     */
    evaluatePatient(patient, hoy) {
      const p = patient || {};
      const observations = Array.isArray(p.observations) ? p.observations.filter(o => o && typeof o === 'object') : [];

      // 1. Diagnósticos (I10-I15, E10-E14) y banderas de alto riesgo, siempre por reglasClinicas
      const perfil = R.perfilClinico(p);

      // 2. Mediciones: la observación más reciente por fecha (en una copia: la lista del paciente no se reordena)
      //    Ante igual fecha gana la que está más adelante en la lista (misma regla que semaforo.js: ultimaPorFecha).
      const porFecha = observations
        .map((o, i) => { const f = R.parseFechaLocal(o.fecha_registro); return { o, i, t: f ? f.getTime() : -Infinity }; })
        .sort((a, b) => (a.t === b.t ? b.i - a.i : (b.t > a.t ? 1 : -1)))
        .map(x => x.o);
      const latestObs = porFecha[0];
      const elegir = (a, b) => (R.tieneValor(a) ? a : (R.tieneValor(b) ? b : null));
      const med = {
        pas: elegir(latestObs && latestObs.pa_sistolica, p.pa_sistolica),
        pad: elegir(latestObs && latestObs.pa_diastolica, p.pa_diastolica),
        hba1c: elegir(latestObs && latestObs.hba1c, p.hba1c),
        glucosa: elegir(latestObs && latestObs.glucosa, p.glucosa)
      };

      // 3. Estado de control: sale de las MEDICIONES (K3-01). La etiqueta guardada solo cuenta si no hay ninguna medición,
      //    y entonces solo en la dirección segura: «No Controlado». Nunca «Controlado» sin mediciones.
      let estado = R.estadoControl(med, perfil);
      if (estado === R.SIN_DATOS) {
        const etiqueta = elegir(latestObs && latestObs.estado_control, p.estado_control);
        if (etiqueta === 'No Controlado') estado = 'No Controlado';
      }

      // 4. «Estable» = las últimas REGLAS.CONTROLES_PARA_ESTABLE observaciones están en meta, cada una por sí sola (K3-05)
      const n = R.REGLAS.CONTROLES_PARA_ESTABLE;
      let estable = false;
      if (estado === 'Controlado' && porFecha.length >= n) {
        estable = porFecha.slice(0, n).every((o, i) => R.estadoControl(
          i === 0 ? med : { pas: o.pa_sistolica, pad: o.pa_diastolica, hba1c: o.hba1c, glucosa: o.glucosa },
          perfil
        ) === 'Controlado');
      }

      // 5. Periodicidad HEARTS: 30 días si no está controlado; 90 solo si está controlado Y estable
      const frecuencia = R.frecuenciaDias(estado, estable);

      // 6. Semáforo: única implementación en semaforo.js (fechas locales, fallecidos, HOSIX, cita cumplida)
      const sem = SemaforoHearts.calcularSemaforo({ ...p, observations }, hoy);

      // 7. Recomendación de adscripción territorial
      let recomendacion = 'Control hospitalario regular en Hospital II-1 Huarmey.';
      const valorPA = (v) => (v === null || v === undefined ? '--' : v);
      if (R.esFallecido(p)) {
        recomendacion = 'Paciente fallecido: no se programan controles ni recordatorios.';
      } else if (estado === 'Controlado') {
        if (!estable) {
          recomendacion = `Paciente en meta en la última medición; completar ${n} controles en meta para pasar al control cada ${R.REGLAS.DIAS_CONTROLADO} días.`;
        } else if (p.puerta_entrada && !String(p.puerta_entrada).includes('HOSPITAL')) {
          recomendacion = `Paciente controlado en meta HEARTS. Candidato para contrarreferencia y recojo trimestral de medicación en su puerta de entrada: ${p.puerta_entrada}.`;
        }
      } else if (estado === 'No Controlado') {
        recomendacion = `Paciente no controlado (PA: ${valorPA(med.pas)}/${valorPA(med.pad)}). Requiere control mensual a los ${R.REGLAS.DIAS_NO_CONTROLADO} días y ajuste terapéutico en Medicina Interna.`;
      } else {
        recomendacion = 'Sin mediciones registradas: tomar presión arterial y glucemia para evaluar el control.';
      }

      return {
        hasHta: perfil.hta,
        hasDm2: perfil.dm,
        estado_control: estado,
        frecuencia_hearts: frecuencia,
        semaforo: sem.semaforo,
        dias_restantes: sem.dias_restantes,
        dias_vencido: sem.dias_vencido,
        fecha_limite: sem.fecha_limite,
        recomendacion
      };
    }
  }

  // Exportación
  if (enNode) {
    module.exports = new HeartsEngine();
  } else {
    root.HeartsEngine = new HeartsEngine();
  }
})(typeof window !== 'undefined' ? window : this);
