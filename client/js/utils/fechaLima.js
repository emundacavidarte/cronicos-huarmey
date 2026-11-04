/**
 * fechaLima.js
 * La fecha de hoy en hora de Lima (UTC-5), como AAAA-MM-DD. `new Date().toISOString()` da la fecha en UTC y,
 * pasadas las 7 p. m. en Perú, ya es "mañana". Se usa en el servidor y en el navegador.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.FechaLima = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {

  const formato = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' });

  /** Fecha de Lima de un instante dado (por defecto, ahora), como AAAA-MM-DD. */
  function deInstante(instante) {
    return formato.format(instante instanceof Date ? instante : new Date());
  }

  /** Hoy en Lima; `dias` desplaza la fecha (por ejemplo 3 para «dentro de tres días»). */
  function hoy(dias = 0) {
    const base = deInstante(new Date());
    if (!dias) return base;
    const [a, m, d] = base.split('-').map(Number);
    const f = new Date(Date.UTC(a, m - 1, d + dias, 12, 0, 0));
    return f.toISOString().slice(0, 10);
  }

  /**
   * ¿Es una fecha real del calendario (AAAA-MM-DD)? Rechaza 2026-02-31, que JavaScript corre al 3 de marzo.
   */
  function esFechaReal(texto) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto === undefined || texto === null ? '' : texto));
    if (!m) return false;
    const a = Number(m[1]); const mes = Number(m[2]); const d = Number(m[3]);
    const f = new Date(Date.UTC(a, mes - 1, d));
    return f.getUTCFullYear() === a && f.getUTCMonth() === mes - 1 && f.getUTCDate() === d;
  }

  return { hoy, deInstante, esFechaReal };
});
