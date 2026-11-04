/**
 * semaforo.js
 * Única fuente de verdad del semáforo de adherencia HEARTS (cliente y servidor).
 * Reglas (sin cambios respecto de la norma ya usada por la aplicación):
 *   cita más reciente a más de 7 días -> green | de 0 a 7 días -> yellow | vencida -> red
 * Reglas añadidas tras la auditoría del padrón real:
 *   fallecido -> black (no cuenta como desertor)  |  fuente HOSIX -> purple  |  sin cita -> gray
 * Todas las fechas 'yyyy-mm-dd' se interpretan como FECHA LOCAL (no UTC), para evitar el desfase de 1 día.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SemaforoHearts = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  const DIA_MS = 86400000;
  const UMBRAL_PROXIMA_DIAS = 7;

  function inicioDia(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /** Convierte un valor a fecha local (medianoche). Devuelve null si no es una fecha válida. */
  function parseFechaLocal(value) {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : inicioDia(value);
    if (typeof value !== 'string' || value.trim() === '') return null;
    const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d.getMonth() === Number(m[2]) - 1 ? d : null;
    }
    const t = new Date(value);
    return isNaN(t.getTime()) ? null : inicioDia(t);
  }

  function aTexto(d) {
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
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

  /**
   * Calcula el semáforo de un paciente a la fecha indicada (por defecto, hoy).
   * Devuelve { semaforo, dias_restantes, dias_vencido, fecha_limite, motivo }.
   */
  function calcularSemaforo(patient, hoy) {
    const ref = inicioDia(hoy instanceof Date ? hoy : new Date());
    const p = patient || {};

    if (p.fallecido === true) {
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
    let semaforo = 'red';
    if (dias > UMBRAL_PROXIMA_DIAS) semaforo = 'green';
    else if (dias >= 0) semaforo = 'yellow';
    return {
      semaforo,
      dias_restantes: dias,
      dias_vencido: dias < 0 ? Math.abs(dias) : 0,
      fecha_limite: aTexto(fecha),
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
