/**
 * reglasClinicas.js
 * ÚNICO lugar de las reglas clínicas del programa de crónicos (cliente y servidor).
 * Fase 3 (K3-01 a K3-09, T3-02): antes cada módulo tenía su copia (semaforo.js, heartsEngine.js, padronCalculadora.js,
 * el Registro Clínico, el servidor) y una misma persona salía «controlada» en uno y «no controlada» en otro.
 *
 * Los valores de REGLAS son los DEFAULT elegidos al corregir la Fase 3, porque la licenciada de crónicos aún no
 * respondió. Son los más seguros y reversibles: cambiar una pregunta = cambiar una constante de aquí, sin tocar
 * ningún otro archivo. Cada constante dice qué pregunta de `docs/produccion/F3_cliente_clinica.md` (sección 7) la decide.
 * Fuentes: guía interna docs/GUIA_NORMA_HEARTS.md; vía HEARTS, PP 0018 2026 y manual HIS 2025 (skill de dominio,
 * corte 12-oct-2026). El texto íntegro de las normas no se consultó [PENDIENTE: corpus no conectado].
 *
 * Funciones puras, sin DOM ni red. Las fechas AAAA-MM-DD son FECHAS LOCALES (nunca UTC: en Lima corre un día).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ReglasClinicas = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {

  const SIN_DATOS = 'Sin Datos de Control en Padrón'; // etiqueta que ya existía en heartsEngine.js

  const REGLAS = Object.freeze({
    // P4: meta de PA para todos (vía HEARTS, PP 0018, manual HIS e IP04: < 140/90)
    META_PA: Object.freeze({ sistolica: 140, diastolica: 90 }),
    // P4-P6: meta en alto riesgo (DM, ERC, ECV o riesgo CV >= RIESGO_CV_ALTO_PORC). La vía HEARTS fija SOLO la sistólica < 130 y no
    // una diastólica distinta de la general (< 90). La guía interna decía < 130/80 (06/11/2026: se alineó con la vía).
    // [PENDIENTE: confirmar con el texto íntegro de la vía HEARTS; si exige < 80, es cambiar este 90.]
    META_PA_ALTO_RIESGO: Object.freeze({ sistolica: 130, diastolica: 90 }),
    RIESGO_CV_ALTO_PORC: 10,
    // P6: cortes de nivel de riesgo CV (< 5 bajo, 5-9 moderado, 10-19 alto, >= 20 muy alto) y metas de LDL (mg/dL).
    // La guía interna y la vía no los traen: están como los tenía el sistema, pendientes de la tabla que use el programa.
    RIESGO_CV_CORTES: Object.freeze({ moderado: 5, alto: 10, muyAlto: 20 }),
    LDL_META: Object.freeze({ altoRiesgo: 70, otros: 100 }),
    // P7: HbA1c < 7 % (vía HEARTS). La guía interna decía <= 7,0: hay que corregir la guía o confirmar.
    HBA1C_META: 7.0,
    // P7: glucemia 70-130 (PP 0018 2026). Con HbA1c y glucemia a la vez se exigen AMBAS (más estricto que el «o» del PP 0018).
    GLUCOSA_RANGO: Object.freeze({ min: 70, max: 130 }),
    // P8-P12: intervalo entre controles (guía §2 y manual HIS: mensual hasta la meta, trimestral con tres controles en meta)
    DIAS_NO_CONTROLADO: 30,
    DIAS_CONTROLADO: 90,
    CONTROLES_PARA_ESTABLE: 3,
    // P11: el semáforo amarillo va de 0 a 7 días (la guía §3 no define el día 0)
    UMBRAL_PROXIMA_DIAS: 7,
    // P10: una cita a la que el paciente asistió (control registrado en la fecha de la cita o después) deja de contar
    // como «vencida»: pasa a «sin próxima cita» (gris) hasta que se programe otra.
    ASISTENCIA_CIERRA_CITA: true,
    // P17: vigencia de cada examen, en meses. La vía pide HbA1c cada 6 meses; el sistema decía «anual».
    VIGENCIA_EXAMEN_MESES: Object.freeze({ hba1c: 12, creatinina: 12, albuminuria: 12, lipidos: 12, pie: 12 })
  });

  // ---------- fechas locales ----------
  function parseFechaLocal(valor) {
    if (valor instanceof Date) return isNaN(valor.getTime()) ? null : new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
    if (typeof valor !== 'string' || valor.trim() === '') return null;
    const m = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d.getMonth() === Number(m[2]) - 1 ? d : null; // rechaza 2026-02-30
    }
    const t = new Date(valor);
    return isNaN(t.getTime()) ? null : new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }

  function aTexto(d) {
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function inicioDia(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  /** Suma días a una fecha AAAA-MM-DD (local) y devuelve AAAA-MM-DD; null si la fecha no es válida. */
  function sumarDias(fechaTxt, dias) {
    const d = parseFechaLocal(fechaTxt);
    if (!d) return null;
    d.setDate(d.getDate() + Number(dias));
    return aTexto(d);
  }

  /** Días enteros desde `hoy` hasta la fecha (negativo = ya pasó). null si la fecha no es válida. */
  function diasHasta(fechaTxt, hoy) {
    const f = parseFechaLocal(fechaTxt);
    if (!f) return null;
    const ref = inicioDia(hoy instanceof Date ? hoy : new Date());
    return Math.round((f.getTime() - ref.getTime()) / 86400000);
  }

  // ---------- diagnósticos (K3-08, K3-09, P3-09) ----------
  function extraerCodigo(x) {
    const m = /^\s*([A-Za-z]\d{2}(?:\.[0-9Xx]+)?)/.exec(String(x == null ? '' : x));
    return m ? m[1].toUpperCase() : '';
  }
  function sinTildes(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  /** ¿Es hipertensión? Acepta un código (I10 a I15) o un texto. «-», «No», «Ninguno» y vacío NO cuentan. */
  function esHta(x) {
    const c = extraerCodigo(x);
    return c ? /^I1[0-5]/.test(c) : sinTildes(x).includes('hipertens');
  }
  /** ¿Es diabetes? E10 a E14, o un texto con «diabet» (P14: la DM1 entra mientras la licenciada no diga otra cosa). */
  function esDm(x) {
    const c = extraerCodigo(x);
    return c ? /^E1[0-4]/.test(c) : sinTildes(x).includes('diabet');
  }
  function esErc(x) {
    const c = extraerCodigo(x);
    return c ? /^N1[89]/.test(c) : sinTildes(x).includes('renal');
  }

  /** Rótulo según el CÓDIGO (antes todo E1x se rotulaba «Diabetes Mellitus Tipo 2» y N18, también). '' si no se conoce. */
  function rotuloCie10(codigo) {
    const c = extraerCodigo(codigo);
    if (!c) return '';
    if (/^I1[0-5]/.test(c)) return 'Hipertensión Arterial';
    if (/^E10/.test(c)) return 'Diabetes Mellitus Tipo 1';
    if (/^E11/.test(c)) return 'Diabetes Mellitus Tipo 2';
    if (/^E12/.test(c)) return 'Diabetes Mellitus asociada a desnutrición';
    if (/^E13/.test(c)) return 'Otras Diabetes Mellitus especificadas';
    if (/^E14/.test(c)) return 'Diabetes Mellitus no especificada';
    if (/^N18/.test(c)) return 'Enfermedad Renal Crónica';
    if (/^E78/.test(c)) return 'Dislipidemia';
    return '';
  }

  /** Banderas clínicas de un paciente, sea cual sea la forma del registro (padrón v4, FHIR/HOSIX o formulario). */
  function perfilClinico(p) {
    const q = p || {};
    const codigos = [];
    (Array.isArray(q.diagnosticos) ? q.diagnosticos : []).forEach(c => codigos.push(c));
    (Array.isArray(q.conditions) ? q.conditions : []).forEach(c => { if (c) { codigos.push(c.cie10_cod); if (!extraerCodigo(c.cie10_cod)) codigos.push(c.diagnostico); } });
    [q.cie10_hta, q.cie10_dm, q.cie10_erc].forEach(c => codigos.push(c));
    const lista = codigos.filter(c => c !== undefined && c !== null && String(c).trim() !== '');
    const riesgo = parseFloat(q.riesgo_cv_porcentaje);
    return {
      hta: lista.some(esHta),
      dm: lista.some(esDm),
      erc: lista.some(esErc),
      ecv: /^s[ií]/i.test(String(q.enfermedad_cardiovascular == null ? '' : q.enfermedad_cardiovascular).trim()),
      riesgoPorc: Number.isFinite(riesgo) ? riesgo : null
    };
  }

  // ---------- estado del paciente (K3-02) ----------
  /** Fallecido por la bandera o por el estado «Fallecido» (la interfaz solo envía el estado; antes seguía como desertor). */
  function esFallecido(p) {
    if (!p) return false;
    return p.fallecido === true || /^fallec/i.test(String(p.estado_paciente == null ? '' : p.estado_paciente).trim());
  }

  /** «M» / «F» (HOSIX, FHIR, semilla) y «Masculino» / «Femenino» (Excel, formulario) → «Masculino» | «Femenino» | '' (P3-07). */
  function normalizarSexo(s) {
    const v = sinTildes(s).trim();
    if (v === 'm' || v === 'masculino' || v === 'hombre' || v === 'varon') return 'Masculino';
    if (v === 'f' || v === 'femenino' || v === 'mujer') return 'Femenino';
    return '';
  }

  // ---------- metas y estado de control (K3-01, K3-05, K3-07) ----------
  function esAltoRiesgo(perfil) {
    return !!(perfil && (perfil.dm || perfil.erc || perfil.ecv || (perfil.riesgoPorc !== null && perfil.riesgoPorc >= REGLAS.RIESGO_CV_ALTO_PORC)));
  }

  /** Meta de PA del PACIENTE (ficha, formulario y motor). El indicador del convenio usa META_PA fija (IP04). */
  function metaPA(perfil) {
    const alto = esAltoRiesgo(perfil);
    const m = alto ? REGLAS.META_PA_ALTO_RIESGO : REGLAS.META_PA;
    let texto = `< ${m.sistolica}/${m.diastolica} mmHg`;
    if (alto) {
      const porCondicion = perfil.dm || perfil.erc || perfil.ecv;
      texto += porCondicion ? ' (por DM/ERC/ECV)' : ` (por riesgo CV ≥ ${REGLAS.RIESGO_CV_ALTO_PORC} %)`;
    }
    return { sistolica: m.sistolica, diastolica: m.diastolica, altoRiesgo: alto, texto };
  }

  function num(v) { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; }

  /** true / false / null (sin datos): ¿la PA está en meta? */
  function paEnMeta(pas, pad, meta) {
    const s = num(pas), d = num(pad);
    if (s === null || d === null) return null;
    return s < meta.sistolica && d < meta.diastolica;
  }

  /**
   * Estado de control a partir de las MEDICIONES (nunca de una etiqueta guardada ni de «no hay presión»).
   * @param {{pas,pad,hba1c,glucosa}} med   la medición más reciente
   * @param {{hta,dm,erc,ecv,riesgoPorc}} perfil
   * @returns {'Controlado'|'No Controlado'|'Sin Datos de Control en Padrón'}
   */
  function estadoControl(med, perfil) {
    const m = med || {};
    const pas = num(m.pas), pad = num(m.pad), hb = num(m.hba1c), glu = num(m.glucosa);
    const hayPA = pas !== null && pad !== null;
    if (!hayPA && hb === null && glu === null) return SIN_DATOS;
    const pf = perfil || {};
    const meta = metaPA(pf);
    const paOk = hayPA ? (pas < meta.sistolica && pad < meta.diastolica) : !pf.hta;
    let glOk = true;
    if (pf.dm) {
      const gluOk = glu !== null && glu >= REGLAS.GLUCOSA_RANGO.min && glu <= REGLAS.GLUCOSA_RANGO.max;
      if (hb !== null && glu !== null) glOk = hb < REGLAS.HBA1C_META && gluOk;
      else if (hb !== null) glOk = hb < REGLAS.HBA1C_META;
      else if (glu !== null) glOk = gluOk;
      else glOk = false; // diabético sin dato glucémico: no se puede dar por controlado
    }
    return paOk && glOk ? 'Controlado' : 'No Controlado';
  }

  /** Intervalo entre controles: 30 días, o 90 solo si está controlado Y estable (3 controles en meta; guía §2 y manual HIS). */
  function frecuenciaDias(estado, estable) {
    return estado === 'Controlado' && estable ? REGLAS.DIAS_CONTROLADO : REGLAS.DIAS_NO_CONTROLADO;
  }

  /** ¿La próxima cita excede el intervalo permitido? (K3-04: antes nadie lo comprobaba). Devuelve null si no se puede saber. */
  function citaExcedeIntervalo(fechaControl, fechaCita, frecuencia) {
    const a = parseFechaLocal(fechaControl), b = parseFechaLocal(fechaCita);
    if (!a || !b) return null;
    const dias = Math.round((b.getTime() - a.getTime()) / 86400000);
    return { dias, excede: dias > frecuencia, maximo: frecuencia };
  }

  // ---------- exámenes (K3-09) ----------
  function sumarMeses(d, n) {
    const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const ult = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
    r.setDate(Math.min(d.getDate(), ult));
    return r;
  }
  function tieneValor(v) { return v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '-'; }

  /** 'sin_dato' | 'sin_fecha' | 'vigente' | 'vencido'. Antes bastaba con que existiera un valor, aunque fuera de hace 4 años. */
  function vigenciaExamen(valor, fechaTxt, meses, hoy) {
    if (!tieneValor(valor)) return 'sin_dato';
    const f = parseFechaLocal(fechaTxt);
    if (!f) return 'sin_fecha';
    const ref = inicioDia(hoy instanceof Date ? hoy : new Date());
    return sumarMeses(f, meses) >= ref ? 'vigente' : 'vencido';
  }

  return {
    REGLAS, SIN_DATOS,
    parseFechaLocal, aTexto, sumarDias, diasHasta,
    extraerCodigo, esHta, esDm, esErc, rotuloCie10, perfilClinico,
    esFallecido, normalizarSexo,
    esAltoRiesgo, metaPA, paEnMeta, estadoControl, frecuenciaDias, citaExcedeIntervalo,
    vigenciaExamen, tieneValor
  };
});
