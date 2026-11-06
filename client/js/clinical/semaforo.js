/**
 * semaforo.js
 * Única fuente de verdad del semáforo de adherencia HEARTS (cliente y servidor).
 * Reglas (las cifras salen de reglasClinicas.js, REGLAS):
 *   cita más reciente a más de UMBRAL_PROXIMA_DIAS (7) días -> green | de 0 a 7 días -> yellow | vencida -> red
 * Reglas añadidas tras la auditoría del padrón real:
 *   fallecido (bandera o estado_paciente «Fallecido») -> black (no cuenta como desertor)  |  fuente HOSIX -> purple
 *   sin cita -> gray
 * Fase 3 (K3-06): si REGLAS.ASISTENCIA_CIERRA_CITA y el paciente tiene un control con fecha igual o posterior a la
 *   de su cita más reciente, y esa cita ya pasó, el paciente SÍ asistió: gray con motivo 'cita_cumplida'
 *   (sin próxima cita) en vez de red «desertor». Si el control es anterior a la cita, sigue red.
 *   El control se busca en observations[].fecha_registro, fecha_ultimo_control y _eventos[] con tipo 'control'.
 * Todas las fechas 'yyyy-mm-dd' se interpretan como FECHA LOCAL (no UTC), para evitar el desfase de 1 día.
 * Se carga también en el servidor (require): no usa DOM.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./reglasClinicas'));
  } else {
    root.SemaforoHearts = factory(root.ReglasClinicas);
  }
})(typeof window !== 'undefined' ? window : this, function (R) {
  if (!R) throw new Error('Reglas clínicas no cargadas (reglasClinicas.js debe cargarse antes que semaforo.js)');

  const DIA_MS = 86400000;
  const UMBRAL_PROXIMA_DIAS = R.REGLAS.UMBRAL_PROXIMA_DIAS;

  function inicioDia(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /** Convierte un valor a fecha local (medianoche). Devuelve null si no es una fecha válida. */
  function parseFechaLocal(value) {
    return R.parseFechaLocal(value);
  }

  /** Elemento con la fecha más reciente (válida). Ante empate gana el último de la lista. No modifica la lista. */
  function ultimaPorFecha(lista, campo) {
    if (!Array.isArray(lista) || lista.length === 0) return undefined;
    let mejor;
    let mejorFecha = null;
    for (const item of lista) {
      const f = parseFechaLocal(item && item[campo]);
      if (mejor === undefined || (f && (!mejorFecha || f >= mejorFecha)) || (!f && !mejorFecha)) {
        mejor = item;
        mejorFecha = f;
      }
    }
    return mejor;
  }

  /** Fechas (locales) en que el paciente tuvo un control registrado, venga de donde venga. */
  function fechasDeControl(p) {
    const fechas = [];
    const anotar = (valor) => { const f = parseFechaLocal(valor); if (f) fechas.push(f); };
    (Array.isArray(p.observations) ? p.observations : []).forEach(o => { if (o) anotar(o.fecha_registro); });
    anotar(p.fecha_ultimo_control);
    (Array.isArray(p._eventos) ? p._eventos : []).forEach(e => { if (e && e.tipo === 'control') anotar(e.fecha); });
    return fechas;
  }

  /**
   * Calcula el semáforo de un paciente a la fecha indicada (por defecto, hoy).
   * Devuelve { semaforo, dias_restantes, dias_vencido, fecha_limite, motivo }.
   */
  function calcularSemaforo(patient, hoy) {
    const ref = inicioDia(hoy instanceof Date ? hoy : new Date());
    const p = patient || {};

    if (R.esFallecido(p)) {
      return { semaforo: 'black', dias_restantes: null, dias_vencido: 0, fecha_limite: null, motivo: 'fallecido' };
    }
    if (p.fuente === 'HOSIX') {
      return { semaforo: 'purple', dias_restantes: null, dias_vencido: 0, fecha_limite: null, motivo: 'hosix' };
    }

    const cita = ultimaPorFecha(p.appointments, 'fecha_cita');
    const fecha = cita ? parseFechaLocal(cita.fecha_cita) : null;
    if (!fecha) {
      return { semaforo: 'gray', dias_restantes: null, dias_vencido: 0, fecha_limite: null, motivo: 'sin_cita' };
    }

    const dias = Math.round((fecha.getTime() - ref.getTime()) / DIA_MS);

    // K3-06: la cita ya pasó pero el paciente asistió (control en la fecha de la cita o después): no es desertor
    if (dias < 0 && R.REGLAS.ASISTENCIA_CIERRA_CITA && fechasDeControl(p).some(f => f.getTime() >= fecha.getTime())) {
      return { semaforo: 'gray', dias_restantes: null, dias_vencido: 0, fecha_limite: null, motivo: 'cita_cumplida' };
    }

    let semaforo = 'red';
    if (dias > UMBRAL_PROXIMA_DIAS) semaforo = 'green';
    else if (dias >= 0) semaforo = 'yellow';
    return {
      semaforo,
      dias_restantes: dias,
      dias_vencido: dias < 0 ? Math.abs(dias) : 0,
      fecha_limite: R.aTexto(fecha),
      motivo: 'cita'
    };
  }

  /**
   * Recalcula y aplica el semáforo sobre cada paciente de la lista (en el mismo objeto).
   * Conserva el valor original en semaforo_guardado la primera vez que cambia.
   * Devuelve cuántos registros cambiaron de color.
   */
  function aplicarSemaforo(lista, hoy) {
    let cambiados = 0;
    for (const p of lista || []) {
      const r = calcularSemaforo(p, hoy);
      if (p.semaforo !== r.semaforo) {
        if (p.semaforo_guardado === undefined) p.semaforo_guardado = p.semaforo === undefined ? null : p.semaforo;
        cambiados++;
      }
      p.semaforo = r.semaforo;
      p.dias_restantes = r.dias_restantes;
      p.dias_vencido = r.dias_vencido;
      if (r.fecha_limite) p.fecha_limite = r.fecha_limite;
    }
    return cambiados;
  }

  return { UMBRAL_PROXIMA_DIAS, parseFechaLocal, ultimaPorFecha, calcularSemaforo, aplicarSemaforo };
});
