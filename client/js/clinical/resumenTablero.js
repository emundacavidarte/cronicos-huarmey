/**
 * resumenTablero.js
 * Números del tablero y de la barra de indicadores, calculados igual en el servidor y en el navegador.
 * - El ADMIN y el COORDINADOR los calculan en el navegador con su lista de pacientes.
 * - El DIRECTOR no recibe pacientes: el servidor le envía este mismo resumen ya agregado (F-3).
 * Los fallecidos no cuentan como población activa ni en las patologías ni por establecimiento (O-3).
 * Cada paciente debe traer su semáforo ya calculado (campo `semaforo`).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ResumenTablero = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {

  /** Estado de un paciente para los conteos: black, purple, green, yellow, red o gray (sin cita). */
  function estado(p) {
    if (p.fallecido || p.semaforo === 'black') return 'black';
    if (p.semaforo === 'purple' || p.fuente === 'HOSIX') return 'purple';
    if (p.semaforo === 'green' || p.semaforo === 'yellow' || p.semaforo === 'red') return p.semaforo;
    return 'gray';
  }

  const PATOLOGIAS = [
    { clave: 'hta', patron: 'I1' },
    { clave: 'dm', patron: 'E1' },
    { clave: 'erc', patron: 'N18' },
    { clave: 'dislipidemia', patron: 'E78' },
    { clave: 'obesidad', patron: 'E66' }
  ];

  function presion(p) {
    const obs = (Array.isArray(p.observations) && p.observations.length > 0) ? p.observations[0] : null;
    const pas = Number(p.pa_sistolica != null ? p.pa_sistolica : (obs ? obs.pa_sistolica : null));
    const pad = Number(p.pa_diastolica != null ? p.pa_diastolica : (obs ? obs.pa_diastolica : null));
    const valida = !isNaN(pas) && !isNaN(pad) && pas > 0 && pad > 0;
    return { valida, controlada: valida && pas < 140 && pad < 90 };
  }

  /**
   * @param {Array} pacientes lista con `semaforo` ya calculado
   * @param {Array} catalogo establecimientos ({ cod_renipress, nombre, categoria }) para nombrar las IPRESS
   */
  function calcular(pacientes, catalogo) {
    const lista = Array.isArray(pacientes) ? pacientes : [];
    const cat = Array.isArray(catalogo) ? catalogo : [];
    const r = {
      total_registros: lista.length,
      activos: 0,
      semaforo: { green: 0, yellow: 0, red: 0, purple: 0, gray: 0, black: 0 },
      presion: { con_medicion: 0, controlados: 0 },
      patologias: { hta: 0, dm: 0, erc: 0, dislipidemia: 0, obesidad: 0 },
      ipress: []
    };
    const porIpress = new Map();

    for (const p of lista) {
      const e = estado(p);
      r.semaforo[e]++;
      if (e === 'black') continue;
      r.activos++;

      const pa = presion(p);
      if (pa.valida) r.presion.con_medicion++;
      if (pa.controlada) r.presion.controlados++;

      const diags = ((p.diagnosticos || []).concat((p.conditions || []).map(c => (c && c.cie10_cod) || ''))).join(' ');
      PATOLOGIAS.forEach(x => { if (diags.includes(x.patron)) r.patologias[x.clave]++; });

      const nombre = p.puerta_entrada || p.establecimiento_adscripcion || 'Hospital de Apoyo Huarmey';
      const clave = p.puerta_entrada_id || nombre;
      if (!porIpress.has(clave)) {
        // La categoría sale del catálogo oficial por código RENIPRESS, no del nombre
        const est = cat.find(x => x.cod_renipress === p.puerta_entrada_id);
        porIpress.set(clave, { nombre: est && est.nombre ? est.nombre : nombre, categoria: est ? est.categoria : null, total: 0, controlados: 0, con_medicion: 0, desercion: 0 });
      }
      const fila = porIpress.get(clave);
      fila.total++;
      if (pa.valida) fila.con_medicion++;
      if (pa.controlada) fila.controlados++;
      if (e === 'red') fila.desercion++;
    }

    r.ipress = Array.from(porIpress.values()).sort((a, b) => b.total - a.total);
    return r;
  }

  return { calcular, estado };
});
