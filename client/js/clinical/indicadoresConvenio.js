/**
 * indicadoresConvenio.js
 * Indicadores del convenio SIS–FISSAL–GORE Áncash 2025-2027 (Acta de compromisos 2026, fichas IP02, IP03 e IP04)
 * y de la Estrategia HEARTS. Módulo puro: recibe pacientes y devuelve numerador, denominador y porcentaje,
 * para que el tablero y las pruebas usen exactamente el mismo cálculo.
 *
 * Fuente de las definiciones: Convenio SIS–FISSAL–GORE Áncash (corpus S-04), Acta de compromisos 2026, fichas de
 * IP02, IP03 e IP04; Anexo 04 (CIE-10 de HTA y DM). El periodo de medición es enero a agosto de 2026.
 *
 * Límites declarados (el prototipo no tiene los registros del SIS):
 *  - "Atendido" = paciente con al menos un control con fecha dentro del periodo en los datos del prototipo.
 *  - Las presiones mensuales del padrón no traen día: dos controles cuentan si caen en meses distintos.
 *  - Un dato sin fecha no cuenta.
 *  - El control HEARTS y el telemonitoreo se miden sobre el año completo del periodo; IP02, IP03 e IP04, sobre enero a agosto.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.IndicadoresConvenio = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

  const PERIODO_2026 = { desde: '2026-01-01', hasta: '2026-08-31' };

  // Metas 2026 del Anexo 01 del Acta de compromisos (IP02 e IP03: solo I-3 e I-4; IP04: 50 %)
  const METAS = { ip02: 10, ip03: 10, ip04: 50 };

  const FUENTES = {
    ip02: 'Convenio SIS–GORE Áncash, Acta 2026, ficha IP02 (NTS 210, 6.2.5-e)',
    ip03: 'Convenio SIS–GORE Áncash, Acta 2026, ficha IP03 (NTS 210, 6.2.5-g-h)',
    ip04: 'Convenio SIS–GORE Áncash, Acta 2026, ficha IP04 (R.M. 031-2015/MINSA, 6.42)',
    hearts: 'Iniciativa HEARTS en las Américas (OPS/OMS); meta de control < 140/90 mmHg',
    telemonitoreo: 'NTS 235-MINSA/DGTI-2024 (telemonitoreo); registro HIS 99499.10 o FUA 300'
  };

  // Las cuatro definiciones en uso de «paciente hipertenso controlado» (todas con presión < 140/90 mmHg).
  // Una misma persona puede estar controlada con una definición y no con otra: cada reporte debe decir cuál usa.
  const DEFINICIONES_CONTROL = {
    hearts: { nombre: 'HEARTS', regla: 'La última medición del año está en meta.', fuente: 'Iniciativa HEARTS en las Américas (OPS/OMS)' },
    his: { nombre: 'Manual HIS', regla: 'Las tres últimas mediciones están en meta (se exigen al menos tres).', fuente: 'Manual de registro HIS 2025' },
    pp0018: { nombre: 'PP 0018 2026', regla: 'Cuatro de las seis últimas mediciones están en meta (se exigen al menos seis).', fuente: 'Definiciones operacionales del PP 0018 2026' },
    sis: { nombre: 'SIS, IP04', regla: 'Al menos dos controles de enero a agosto y una presión en meta.', fuente: 'Convenio SIS–GORE Áncash, Acta 2026, ficha IP04' }
  };

  // Anexo 04 del convenio: CIE-10 de hipertensión arterial. Deja fuera I15.0 (renovascular).
  const HTA_CODIGOS = new Set(['I110', 'I119', 'I120', 'I129', 'I130', 'I131', 'I132', 'I139', 'I151', 'I152', 'I158', 'I159']);

  function normalizarCodigo(c) {
    return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /** ¿Es un código de hipertensión del Anexo 04? (I10.X; I11 a I13 sin subcódigo cuentan como categoría) */
  function esHta(codigo) {
    const c = normalizarCodigo(codigo);
    if (!c) return false;
    if (c.startsWith('I10')) return true;
    if (c === 'I11' || c === 'I12' || c === 'I13') return true;
    return HTA_CODIGOS.has(c);
  }

  /** ¿Es un código de diabetes del Anexo 04? (E10, E11, E13 y E14; deja fuera E12 y O24) */
  function esDm(codigo) {
    return /^E1[0134]/.test(normalizarCodigo(codigo));
  }

  function codigosDe(p) {
    const lista = [];
    (p.diagnosticos || []).forEach(c => lista.push(c));
    (p.conditions || []).forEach(c => lista.push(c && (c.cie10_cod || c.codigo)));
    [p.cie10_hta, p.cie10_dm].forEach(t => {
      if (t) lista.push(String(t).split(/[–—-]/)[0].trim());
    });
    return lista.filter(Boolean);
  }

  function tieneHta(p) { return codigosDe(p).some(esHta); }
  function tieneDm(p) { return codigosDe(p).some(esDm); }

  function esFecha(s) { return /^\d{4}-\d{2}-\d{2}/.test(String(s || '')); }

  function enPeriodo(fecha, periodo) {
    if (!esFecha(fecha)) return false;
    const f = String(fecha).slice(0, 10);
    return f >= periodo.desde && f <= periodo.hasta;
  }

  function tieneValor(v) {
    return v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '-';
  }

  /**
   * Controles del paciente dentro del periodo, por mes (AAAA-MM), con la presión si la tiene.
   * Fuentes: presiones mensuales del padrón (año del periodo), observaciones fechadas, eventos de tipo "control"
   * y fecha del último control.
   */
  function controlesEnPeriodo(p, periodo) {
    const anio = periodo.desde.slice(0, 4);
    const porMes = new Map();
    const anotar = (mes, pas, pad) => {
      const previo = porMes.get(mes) || {};
      const lec = (Number.isFinite(pas) && Number.isFinite(pad)) ? { pas, pad } : null;
      porMes.set(mes, { pas: lec ? lec.pas : previo.pas, pad: lec ? lec.pad : previo.pad });
    };

    MESES.forEach((m, i) => {
      const mes = `${anio}-${String(i + 1).padStart(2, '0')}`;
      const pas = parseInt(p[`pas_${m}`], 10);
      const pad = parseInt(p[`pad_${m}`], 10);
      const dentro = enPeriodo(`${mes}-15`, periodo);
      if (dentro && Number.isFinite(pas) && Number.isFinite(pad)) anotar(mes, pas, pad);
    });

    (p.observations || []).forEach(o => {
      if (!o || !enPeriodo(o.fecha_registro, periodo)) return;
      anotar(String(o.fecha_registro).slice(0, 7), parseInt(o.pa_sistolica, 10), parseInt(o.pa_diastolica, 10));
    });

    (p._eventos || []).forEach(e => {
      if (e && e.tipo === 'control' && enPeriodo(e.fecha, periodo)) anotar(String(e.fecha).slice(0, 7), NaN, NaN);
    });

    if (enPeriodo(p.fecha_ultimo_control, periodo)) anotar(String(p.fecha_ultimo_control).slice(0, 7), NaN, NaN);

    return porMes;
  }

  /** ¿Se midió el examen (valor con fecha dentro del periodo)? Mira el padrón y las observaciones. */
  function examenEnPeriodo(p, campo, campoFecha, periodo) {
    if (tieneValor(p[campo]) && enPeriodo(p[campoFecha], periodo)) return true;
    return (p.observations || []).some(o => o && tieneValor(o[campo]) && enPeriodo(o.fecha_registro, periodo));
  }

  function activo(p) {
    return !(p.fallecido || String(p.estado_paciente || '').toLowerCase().startsWith('fallec'));
  }

  function pct(num, den) {
    return den > 0 ? Math.round((num / den) * 1000) / 10 : null;
  }

  function vacio() {
    return {
      ip02: { numerador: 0, denominador: 0 },
      ip03: { numerador: 0, denominador: 0 },
      ip04: { numerador: 0, denominador: 0 },
      hearts: { hta_padron: 0, dm_padron: 0, hta_con_medicion: 0, hta_en_meta: 0 },
      control_definiciones: {
        hearts: { numerador: 0, denominador: 0, no_evaluables: 0 },
        his: { numerador: 0, denominador: 0, no_evaluables: 0 },
        pp0018: { numerador: 0, denominador: 0, no_evaluables: 0 },
        sis: { numerador: 0, denominador: 0, no_evaluables: 0 }
      },
      telemonitoreo: { poblacion: 0, pacientes_atendidos: 0, atenciones: 0 }
    };
  }

  function acumular(acc, p, periodo) {
    const hta = tieneHta(p);
    const dm = tieneDm(p);
    if (hta) acc.hearts.hta_padron++;
    if (dm) acc.hearts.dm_padron++;

    const controles = controlesEnPeriodo(p, periodo);
    const atendido = controles.size > 0 ||
      examenEnPeriodo(p, 'hba1c', 'fecha_hba1c', periodo) ||
      examenEnPeriodo(p, 'creatinina', 'fecha_creatinina', periodo) ||
      examenEnPeriodo(p, 'albuminuria', 'fecha_albuminuria', periodo);

    if (dm && atendido) {
      acc.ip02.denominador++;
      acc.ip03.denominador++;
      if (examenEnPeriodo(p, 'hba1c', 'fecha_hba1c', periodo)) acc.ip02.numerador++;
      if (examenEnPeriodo(p, 'creatinina', 'fecha_creatinina', periodo) &&
          examenEnPeriodo(p, 'albuminuria', 'fecha_albuminuria', periodo)) acc.ip03.numerador++;
    }

    if (hta && atendido) {
      acc.ip04.denominador++;
      const lecturas = [...controles.values()].filter(c => Number.isFinite(c.pas) && Number.isFinite(c.pad));
      if (controles.size >= 2 && lecturas.some(c => c.pas < 140 && c.pad < 90)) acc.ip04.numerador++;
      acc.control_definiciones.sis.denominador++;
      if (controles.size >= 2 && lecturas.some(c => c.pas < 140 && c.pad < 90)) acc.control_definiciones.sis.numerador++;
    }

    // HEARTS: control = última medición de presión en meta (< 140/90), sobre hipertensos con alguna medición en el año
    const anual = { desde: `${periodo.desde.slice(0, 4)}-01-01`, hasta: `${periodo.desde.slice(0, 4)}-12-31` };
    if (hta) {
      const delAnio = controlesEnPeriodo(p, anual);
      const meses = [...delAnio.keys()].filter(m => Number.isFinite((delAnio.get(m) || {}).pas)).sort();
      if (meses.length > 0) {
        const ult = delAnio.get(meses[meses.length - 1]);
        acc.hearts.hta_con_medicion++;
        if (ult.pas < 140 && ult.pad < 90) acc.hearts.hta_en_meta++;

        // Las cuatro definiciones, con las mediciones del año en orden (la más reciente al final)
        const enMeta = meses.map(m => delAnio.get(m).pas < 140 && delAnio.get(m).pad < 90);
        const cd = acc.control_definiciones;
        cd.hearts.denominador++;
        if (enMeta[enMeta.length - 1]) cd.hearts.numerador++;

        if (enMeta.length >= 3) {
          cd.his.denominador++;
          if (enMeta.slice(-3).every(Boolean)) cd.his.numerador++;
        } else {
          cd.his.no_evaluables++;
        }

        if (enMeta.length >= 6) {
          cd.pp0018.denominador++;
          if (enMeta.slice(-6).filter(Boolean).length >= 4) cd.pp0018.numerador++;
        } else {
          cd.pp0018.no_evaluables++;
        }
      }
    }

    // Telemonitoreo (NTS 235): atenciones por telemonitoreo en el año entre la población con HTA o DM
    if (hta || dm) {
      acc.telemonitoreo.poblacion++;
      const tele = (p._eventos || []).filter(e => e && e.tipo === 'telemonitoreo' && enPeriodo(e.fecha, anual));
      if (tele.length > 0) {
        acc.telemonitoreo.pacientes_atendidos++;
        acc.telemonitoreo.atenciones += tele.length;
      }
    }
  }

  function aplicarPorcentajes(acc, categoria, esperados) {
    const esPrimerNivelIp = /^I-?[34]$/i.test(String(categoria || '').trim());
    const arma = (clave, metaAplica) => {
      const r = acc[clave];
      r.porcentaje = pct(r.numerador, r.denominador);
      r.meta = metaAplica ? METAS[clave] : null;
      r.modo = metaAplica ? 'meta' : 'seguimiento';
      r.fuente = FUENTES[clave];
      return r;
    };
    // IP02 e IP03 se miden solo en I-3 e I-4; en el hospital (o sin categoría) son seguimiento, no meta
    arma('ip02', esPrimerNivelIp);
    arma('ip03', esPrimerNivelIp);
    arma('ip04', true);

    const h = acc.hearts;
    h.control_porcentaje = pct(h.hta_en_meta, h.hta_con_medicion);
    h.fuente = FUENTES.hearts;
    const esp = esperados || {};
    h.cobertura_hta = (esp.hta > 0) ? { padron: h.hta_padron, esperados: esp.hta, porcentaje: pct(h.hta_padron, esp.hta) } : { padron: h.hta_padron, esperados: null, porcentaje: null };
    h.cobertura_dm = (esp.dm > 0) ? { padron: h.dm_padron, esperados: esp.dm, porcentaje: pct(h.dm_padron, esp.dm) } : { padron: h.dm_padron, esperados: null, porcentaje: null };

    for (const clave of Object.keys(DEFINICIONES_CONTROL)) {
      const d = acc.control_definiciones[clave];
      d.porcentaje = pct(d.numerador, d.denominador);
      Object.assign(d, DEFINICIONES_CONTROL[clave]);
    }

    const t = acc.telemonitoreo;
    t.porcentaje = pct(t.pacientes_atendidos, t.poblacion);
    t.fuente = FUENTES.telemonitoreo;
    return acc;
  }

  /**
   * @param {Array} pacientes  pacientes (con `_eventos` opcional: [{tipo, fecha}])
   * @param {Object} opciones  { periodo:{desde,hasta}, esperados:{hta,dm}, categoriaDe:(paciente)=>'I-3' }
   * @returns {{periodo, total, por_establecimiento: Object}}
   */
  function calcular(pacientes, opciones = {}) {
    const periodo = opciones.periodo || PERIODO_2026;
    const categoriaDe = opciones.categoriaDe || (() => null);
    const total = vacio();
    const grupos = new Map();

    for (const p of (pacientes || [])) {
      if (!p || !activo(p)) continue;
      const clave = String(p.puerta_entrada_id || p.es_puerta_entrada_id || 'sin_establecimiento');
      if (!grupos.has(clave)) grupos.set(clave, { acc: vacio(), nombre: p.puerta_entrada || clave, categoria: categoriaDe(p) });
      acumular(grupos.get(clave).acc, p, periodo);
      acumular(total, p, periodo);
    }

    const porEst = {};
    for (const [clave, g] of grupos) {
      porEst[clave] = Object.assign({ establecimiento_id: clave, nombre: g.nombre, categoria: g.categoria }, aplicarPorcentajes(g.acc, g.categoria, null));
    }

    // El total del hospital y los I-3/I-4 juntos: IP02 e IP03 son meta solo si todos los pacientes son de I-3 o I-4
    const todosPrimerNivel = grupos.size > 0 && [...grupos.values()].every(g => /^I-?[34]$/i.test(String(g.categoria || '').trim()));
    return {
      periodo,
      metas: METAS,
      total: aplicarPorcentajes(total, todosPrimerNivel ? 'I-3' : null, opciones.esperados),
      por_establecimiento: porEst
    };
  }

  return { calcular, esHta, esDm, tieneHta, tieneDm, controlesEnPeriodo, PERIODO_2026, METAS, FUENTES, DEFINICIONES_CONTROL };
});
