/**
 * padronCalculadora.js
 * Motor Clínico de Cálculo Automático para el Padrón Estandarizado
 * Genera en tiempo real las variables clínicas normativas (IMC, Nutrición,
 * TFGe CKD-EPI 2021 y su Categoría de TFGe, Metas HEARTS, Control de PA, IP04 y Alertas de Tamizaje).
 *
 * Fase 3 (T3-02, K3-07, K3-09): la meta de PA, los diagnósticos, el sexo, las fechas y la vigencia de los exámenes
 * salen de reglasClinicas.js (ReglasClinicas, que se carga antes). No se supone ningún dato que no esté registrado:
 * sin fecha de nacimiento o sin sexo reconocible no hay TFGe; sin meses de medicación no hay «medicación hasta».
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./reglasClinicas'));
  } else {
    root.PadronCalculadora = factory(root.ReglasClinicas);
  }
})(typeof window !== 'undefined' ? window : this, function (R) {
  if (!R) throw new Error('Reglas clínicas no cargadas (reglasClinicas.js debe cargarse antes que padronCalculadora.js)');

  const MESES_CODIGOS = ['dic', 'nov', 'oct', 'set', 'ago', 'jul', 'jun', 'may', 'abr', 'mar', 'feb', 'ene'];

  /**
   * Calcula la edad en años cumplidos
   */
  function calcularEdad(fechaNac, fechaRef = new Date()) {
    if (!fechaNac) return null;
    // AAAA-MM-DD se lee como fecha LOCAL: new Date('1966-12-25') es medianoche UTC y en Lima cae el 24 (C-06)
    const nac = R.parseFechaLocal(fechaNac);
    if (!nac) return null;
    let edad = fechaRef.getFullYear() - nac.getFullYear();
    const m = fechaRef.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && fechaRef.getDate() < nac.getDate())) {
      edad--;
    }
    return edad >= 0 && edad <= 125 ? edad : null;
  }

  /**
   * Antropometría: IMC y Valoración Nutricional
   */
  function calcularImc(pesoKg, tallaM) {
    const peso = parseFloat(pesoKg);
    const talla = parseFloat(tallaM);
    if (!peso || !talla || peso <= 0 || talla <= 0) {
      return { imc: null, valoracion: 'Sin dato' };
    }
    // Si la talla vino en centímetros (> 3 metros), convertir a metros
    const t = talla > 3 ? talla / 100 : talla;
    const imc = parseFloat((peso / (t * t)).toFixed(1));

    let valoracion = 'Normal';
    if (imc < 18.5) valoracion = 'Bajo peso (< 18.5)';
    else if (imc < 25.0) valoracion = 'Normal (18.5 – 24.9)';
    else if (imc < 30.0) valoracion = 'Sobrepeso (25.0 – 29.9)';
    else if (imc < 35.0) valoracion = 'Obesidad Grado I (30.0 – 34.9)';
    else if (imc < 40.0) valoracion = 'Obesidad Grado II (35.0 – 39.9)';
    else valoracion = 'Obesidad Grado III (≥ 40.0)';

    return { imc, valoracion };
  }

  /**
   * Tasa de Filtración Glomerular Estimada (TFGe) - Fórmula Oficial CKD-EPI 2021.
   * Devuelve la TFGe y su CATEGORÍA de TFGe (G1 a G5). No es un estadio de ERC: ese exige persistencia por más de
   * 3 meses y albuminuria (Q18 de las preguntas a la licenciada). Sin edad o sin sexo reconocible no se calcula nada:
   * antes se suponía 50 años y sexo masculino (K3-09).
   * El campo `estadio` conserva su nombre por compatibilidad.
   */
  function calcularTfge(creatininaMgDl, edadAnios, sexo) {
    const cr = parseFloat(creatininaMgDl);
    const edad = parseInt(edadAnios, 10);
    const sx = R.normalizarSexo(sexo); // acepta M/F (HOSIX, FHIR, semilla) y Masculino/Femenino (Excel, formulario)
    if (!cr || !edad || cr <= 0 || edad <= 0 || !sx) {
      return { tfge: null, estadio: 'Sin dato' };
    }

    const esMujer = sx === 'Femenino';
    const kappa = esMujer ? 0.7 : 0.9;
    const alpha = esMujer ? -0.241 : -0.302;
    const factorMujer = esMujer ? 1.012 : 1.0;

    const minRatio = Math.min(cr / kappa, 1);
    const maxRatio = Math.max(cr / kappa, 1);

    const tfge = Math.round(
      142 *
      Math.pow(minRatio, alpha) *
      Math.pow(maxRatio, -1.200) *
      Math.pow(0.9938, edad) *
      factorMujer
    );

    let categoria;
    if (tfge >= 90) categoria = 'G1 (Normal o elevado, ≥ 90)';
    else if (tfge >= 60) categoria = 'G2 (Levemente disminuido, 60–89)';
    else if (tfge >= 45) categoria = 'G3a (Disminución leve a moderada, 45–59)';
    else if (tfge >= 30) categoria = 'G3b (Disminución moderada a grave, 30–44)';
    else if (tfge >= 15) categoria = 'G4 (Disminución grave, 15–29)';
    else categoria = 'G5 (Falla renal terminal, < 15)';

    return { tfge, estadio: categoria };
  }

  /**
   * Evaluación de Presión Arterial (Última medición, meta y control longitudinal).
   * La meta del paciente sale de ReglasClinicas.metaPA (sistólica < 130 con DM, ERC, ECV o riesgo CV >= 10 %; si no, < 140/90):
   * la misma que usa el motor HEARTS, para que ficha y motor no discrepen (K3-07).
   */
  function evaluarPresionArterial(p, edad) {
    // 1. Obtener última PAS y PAD registradas
    let ultimaPas = null;
    let ultimaPad = null;
    let mesUltima = null;
    let pasHistory = [];

    for (const m of MESES_CODIGOS) {
      const pas = parseInt(p[`pas_${m}`], 10);
      const pad = parseInt(p[`pad_${m}`], 10);
      if (!isNaN(pas) && !isNaN(pad)) {
        if (ultimaPas === null) {
          ultimaPas = pas;
          ultimaPad = pad;
          mesUltima = m;
        }
        pasHistory.push({ mes: m, pas, pad });
      }
    }

    // 2. Meta de PA del paciente (única fuente: ReglasClinicas)
    const meta = R.metaPA(R.perfilClinico(p));
    const targetPas = meta.sistolica;
    const targetPad = meta.diastolica;
    const metaTexto = meta.texto;

    // 3. PA en meta en la última medición
    const enMeta = R.paEnMeta(ultimaPas, ultimaPad, meta);
    const paEnMeta = enMeta === null ? 'Sin datos' : (enMeta ? 'Sí' : 'No');

    // 4. Controlado y estable (las REGLAS.CONTROLES_PARA_ESTABLE últimas PA en meta)
    const n = R.REGLAS.CONTROLES_PARA_ESTABLE;
    let controladoEstable = 'No';
    if (pasHistory.length >= n) {
      const ultimas = pasHistory.slice(0, n);
      const todasEnMeta = ultimas.every(h => h.pas < targetPas && h.pad < targetPad);
      controladoEstable = todasEnMeta ? 'Sí' : 'No';
    } else if (pasHistory.length > 0 && paEnMeta === 'Sí') {
      controladoEstable = 'Sí (Parcial)';
    }

    // 5. Cumple indicador de desempeño IP04 (SIS / MINSA)
    // Ficha IP04 del convenio: al menos dos controles de enero a agosto y una presión < 140/90 mmHg en alguno
    // (no es la meta clínica del paciente ni la última medición; el indicador usa REGLAS.META_PA fija)
    const metaIp04 = R.REGLAS.META_PA;
    const delPeriodo = pasHistory.filter(h => ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago'].includes(h.mes));
    const cumpleIp04 = (delPeriodo.length >= 2 && delPeriodo.some(h => h.pas < metaIp04.sistolica && h.pad < metaIp04.diastolica)) ? 'Sí' : 'No';

    // 6. Conteo de controles en el año
    const controlesEnAnio = pasHistory.length;

    return {
      ultimaPas,
      ultimaPad,
      mesUltima,
      metaTexto,
      targetPas,
      targetPad,
      paEnMeta,
      controladoEstable,
      cumpleIp04,
      controlesEnAnio
    };
  }

  /**
   * Meta de HbA1c y Colesterol LDL
   */
  function evaluarMetabolico(p, altoRiesgoCv) {
    const hba1c = parseFloat(p.hba1c);
    let hba1cEnMeta = 'Sin dato';
    if (!isNaN(hba1c)) {
      hba1cEnMeta = (hba1c < R.REGLAS.HBA1C_META) ? 'Sí' : 'No';
    }

    const ldl = parseInt(p.colesterol_ldl, 10);
    let ldlEnMeta = 'Sin dato';
    if (!isNaN(ldl)) {
      const corteLdl = altoRiesgoCv ? R.REGLAS.LDL_META.altoRiesgo : R.REGLAS.LDL_META.otros;
      ldlEnMeta = (ldl < corteLdl) ? 'Sí' : 'No';
    }

    return { hba1cEnMeta, ldlEnMeta };
  }

  /**
   * Cálculo de Días de Atraso y Estado de Cita (fechas locales: una cita de hoy es amarilla, no roja; T3-01)
   * @param {string} proximaCitaStr AAAA-MM-DD
   * @param {Date} [hoy] fecha de referencia (por defecto, hoy)
   */
  function evaluarCita(proximaCitaStr, hoy) {
    if (!proximaCitaStr) {
      return { diasAtraso: 0, estadoCita: 'Sin cita programada', semaforo: 'gris' };
    }
    const diffDias = R.diasHasta(proximaCitaStr, hoy);
    if (diffDias === null) {
      return { diasAtraso: 0, estadoCita: 'Fecha inválida', semaforo: 'gris' };
    }

    if (diffDias < 0) {
      const diasVencido = Math.abs(diffDias);
      return {
        diasAtraso: diasVencido,
        estadoCita: `Vencida hace ${diasVencido} día(s)`,
        semaforo: 'rojo'
      };
    } else if (diffDias <= R.REGLAS.UMBRAL_PROXIMA_DIAS) {
      return {
        diasAtraso: 0,
        estadoCita: diffDias === 0 ? 'Cita hoy' : `En ${diffDias} día(s)`,
        semaforo: 'amarillo'
      };
    } else {
      return {
        diasAtraso: 0,
        estadoCita: `Programada en ${diffDias} días`,
        semaforo: 'verde'
      };
    }
  }

  /**
   * K3-06 en la ficha: si la cita ya pasó y el último control es de esa fecha o posterior, el paciente asistió
   * (misma regla que semaforo.js). Devuelve el estado de la cita o null si no aplica.
   */
  function citaCumplida(p, hoy) {
    if (!R.REGLAS.ASISTENCIA_CIERRA_CITA) return null;
    const cita = R.parseFechaLocal(p.proxima_cita);
    const control = R.parseFechaLocal(p.fecha_ultimo_control);
    if (!cita || !control) return null;
    const dias = R.diasHasta(p.proxima_cita, hoy);
    if (dias === null || dias >= 0 || control.getTime() < cita.getTime()) return null;
    const dd = (n) => String(n).padStart(2, '0');
    return {
      diasAtraso: 0,
      estadoCita: `Cita cumplida (control del ${dd(control.getDate())}/${dd(control.getMonth() + 1)}/${control.getFullYear()}); sin próxima cita`,
      semaforo: 'gris'
    };
  }

  /**
   * Detección de tamizajes y exámenes pendientes (Columna "Qué le falta").
   * Cada examen se mide por su FECHA y la vigencia de REGLAS.VIGENCIA_EXAMEN_MESES (K3-09): sin resultado → pendiente;
   * con resultado sin fecha → «sin fecha»; con fecha pasada la vigencia → «vencido/a». «Al día» solo si todo está vigente.
   */
  function detectarFaltantes(p, edad, citaInfo, hoy) {
    const pendientes = [];
    const perfil = R.perfilClinico(p);
    const V = R.REGLAS.VIGENCIA_EXAMEN_MESES;

    const valorLipidos = R.tieneValor(p.colesterol_ldl) ? p.colesterol_ldl : p.colesterol_total;
    const examenes = [
      { soloDm: true, base: 'HbA1c', femenino: true, valor: p.hba1c, fecha: p.fecha_hba1c, meses: V.hba1c },
      // el examen del pie se registra solo con su fecha: la fecha es a la vez el resultado
      { soloDm: true, base: 'Examen de pies', femenino: false, valor: p.fecha_evaluacion_pie, fecha: p.fecha_evaluacion_pie, meses: V.pie },
      { soloDm: false, base: 'Creatinina / TFGe', femenino: true, valor: p.creatinina, fecha: p.fecha_creatinina, meses: V.creatinina },
      { soloDm: false, base: 'Tamizaje Albuminuria (RAC)', femenino: false, valor: p.albuminuria, fecha: p.fecha_albuminuria, meses: V.albuminuria },
      { soloDm: false, base: 'Perfil lipídico', femenino: false, valor: valorLipidos, fecha: p.fecha_perfil_lipidico, meses: V.lipidos }
    ];
    for (const e of examenes) {
      if (e.soloDm && !perfil.dm) continue;
      const estado = R.vigenciaExamen(e.valor, e.fecha, e.meses, hoy);
      if (estado === 'sin_dato') pendientes.push(e.base);
      else if (estado === 'sin_fecha') pendientes.push(`${e.base} sin fecha`);
      else if (estado === 'vencido') pendientes.push(`${e.base} ${e.femenino ? 'vencida' : 'vencido'}`);
    }
    if (citaInfo.diasAtraso > 0) {
      pendientes.push(`Cita médica vencida (${citaInfo.diasAtraso}d)`);
    }

    return pendientes.length > 0 ? pendientes.join(' · ') : 'Al día con sus controles y tamizajes';
  }

  /**
   * Cálculo de fecha de medicación hasta = último control + meses de medicación × 30 días.
   * Sin meses de medicación válidos (entero positivo) no hay fecha: antes se suponía 1 mes (K3-09).
   */
  function calcularMedacionHasta(fechaUltimoControl, mesesMed) {
    if (!R.tieneValor(fechaUltimoControl) || !R.parseFechaLocal(fechaUltimoControl)) return 'Sin fecha de entrega';
    const texto = String(mesesMed === undefined || mesesMed === null ? '' : mesesMed).trim();
    if (!/^\d+$/.test(texto)) return 'Sin fecha de entrega';
    const meses = parseInt(texto, 10);
    if (meses <= 0) return 'Sin fecha de entrega';
    return R.sumarDias(fechaUltimoControl, meses * 30) || 'Sin fecha de entrega';
  }

  /**
   * Alerta sobre el documento según su tipo (T3-06): DNI = 8 dígitos; carné de extranjería y pasaporte = 6 a 15 letras o
   * dígitos. Sin tipo se infiere: 8 dígitos = DNI. Devuelve '' si el documento es conforme.
   */
  function alertaDocumento(p) {
    const tipo = String(p.tipo_documento === undefined || p.tipo_documento === null ? '' : p.tipo_documento).trim().toUpperCase();
    const nro = String(p.nro_documento === undefined || p.nro_documento === null ? '' : p.nro_documento).trim();
    if (tipo.startsWith('SIN')) return 'Sin documento: no se registran pacientes sin documento';
    if (!tipo || tipo === 'DNI') {
      return nro.replace(/\D/g, '').length === 8 ? '' : 'DNI no tiene 8 dígitos';
    }
    if (!nro) return 'Falta número de documento';
    return /^[A-Za-z0-9]{6,15}$/.test(nro.replace(/[^A-Za-z0-9]/g, '')) ? '' : 'Carné de extranjería o pasaporte no tiene de 6 a 15 letras o dígitos';
  }

  /**
   * Función Maestra: Calcula en tiempo real las variables de la ficha
   * @param {Object} patient fila del padrón (columnas v4)
   * @param {Date} [hoy] fecha de referencia (por defecto, hoy); solo para pruebas
   */
  function calcularPadron(patient, hoy) {
    const p = patient || {};
    const ref = hoy instanceof Date ? hoy : new Date();
    const edad = calcularEdad(p.fecha_nacimiento, ref);
    const { imc, valoracion: valoracionNutricional } = calcularImc(p.peso, p.talla);

    // Riesgo Cardiovascular (diagnósticos por ReglasClinicas: «-», «No» y «Ninguno» no cuentan)
    const perfil = R.perfilClinico(p);
    const riesgoNum = perfil.riesgoPorc === null ? NaN : perfil.riesgoPorc;

    // Sin riesgo numérico ni condición de alto riesgo no se sabe: «Sin dato», no «Bajo» (K3-09)
    let nivelRiesgoCv = 'Sin dato';
    let altoRiesgoCv = 'Sin dato';

    const corteRiesgo = R.REGLAS.RIESGO_CV_CORTES;
    if (!isNaN(riesgoNum)) {
      if (riesgoNum >= corteRiesgo.muyAlto) { nivelRiesgoCv = 'Muy Alto (≥ 20%)'; altoRiesgoCv = 'Sí'; }
      else if (riesgoNum >= corteRiesgo.alto) { nivelRiesgoCv = 'Alto (10–19%)'; altoRiesgoCv = 'Sí'; }
      else if (riesgoNum >= corteRiesgo.moderado) { nivelRiesgoCv = 'Moderado (5–9%)'; altoRiesgoCv = 'No'; }
      else { nivelRiesgoCv = 'Bajo (< 5%)'; altoRiesgoCv = 'No'; }
    } else if (perfil.ecv || perfil.erc) {
      nivelRiesgoCv = 'Muy Alto (Criterio clínico ECV/ERC)';
      altoRiesgoCv = 'Sí';
    } else if (perfil.dm) {
      nivelRiesgoCv = 'Alto (Diabetes Mellitus)';
      altoRiesgoCv = 'Sí';
    }

    // Un diabético, con ERC o con ECV es de alto riesgo aunque su riesgo numérico sea bajo: misma regla que la meta de PA
    // (antes la etiqueta decía «No» y la meta de PA usaba la de alto riesgo para el mismo paciente).
    if (R.esAltoRiesgo(perfil)) altoRiesgoCv = 'Sí';

    // Presión Arterial
    const evalPa = evaluarPresionArterial(p, edad);

    // Laboratorio y Metabolismo: sin edad (fecha de nacimiento) o sin sexo reconocible no hay TFGe
    const { tfge, estadio: estadioErc } = calcularTfge(p.creatinina, edad, p.sexo);
    const { hba1cEnMeta, ldlEnMeta } = evaluarMetabolico(p, altoRiesgoCv === 'Sí');

    // Cita y Seguimiento
    const citaInfo = citaCumplida(p, ref) || evaluarCita(p.proxima_cita, ref);
    const queLeFalta = detectarFaltantes(p, edad, citaInfo, ref);
    const medicacionHasta = calcularMedacionHasta(p.fecha_ultimo_control, p.meses_medicacion);

    // Distrito
    const sec = String(p.sector || '');
    let distrito = 'Huarmey';
    if (sec.includes('Culebras')) distrito = 'Culebras';
    else if (sec.includes('Huayán')) distrito = 'Huayán';
    else if (sec.includes('Malvas')) distrito = 'Malvas';
    else if (sec.includes('Cochapetí')) distrito = 'Cochapetí';

    // Telemonitoreo
    const tel = String(p.telefono || '').replace(/\D/g, '');
    const puedeTelemonitoreo = tel.length >= 9 ? 'Sí' : 'No (Sin celular válido)';

    // Alerta del dato
    const alertas = [];
    const alertaDoc = alertaDocumento(p);
    if (alertaDoc) alertas.push(alertaDoc);
    if (!p.apellidos_nombres) alertas.push('Falta nombres');
    if (!p.direccion) alertas.push('Falta dirección');
    if (!p.establecimiento_adscripcion) alertas.push('Falta EESS');
    const alertaDelDato = alertas.length > 0 ? alertas.join('; ') : 'Dato conforme';

    // Estado HEARTS (fallecido por la bandera o por el estado «Fallecido»)
    let semaforo = citaInfo.semaforo;
    if (R.esFallecido(p)) {
      semaforo = 'negro';
    }

    return {
      edad_anios: edad,
      imc,
      valoracion_nutricional: valoracionNutricional,
      nivel_riesgo_cv: nivelRiesgoCv,
      alto_riesgo_cv: altoRiesgoCv,
      meta_presion: evalPa.metaTexto,
      ultima_pas: evalPa.ultimaPas,
      ultima_pad: evalPa.ultimaPad,
      mes_ultima_pa: evalPa.mesUltima,
      pa_en_meta: evalPa.paEnMeta,
      controlado_estable: evalPa.controladoEstable,
      cumple_ip04: evalPa.cumpleIp04,
      hba1c_en_meta: hba1cEnMeta,
      tfge,
      estadio_erc: estadioErc,
      ldl_en_meta: ldlEnMeta,
      dias_atraso: citaInfo.diasAtraso,
      estado_cita: citaInfo.estadoCita,
      que_le_falta: queLeFalta,
      alerta_del_dato: alertaDelDato,
      distrito_residencia: distrito,
      controles_en_el_anio: evalPa.controlesEnAnio,
      medicacion_hasta: medicacionHasta,
      puede_telemonitoreo: puedeTelemonitoreo,
      semaforo_hearts: semaforo
    };
  }

  return {
    calcularPadron,
    calcularEdad,
    calcularImc,
    calcularTfge,
    evaluarPresionArterial,
    evaluarCita,
    detectarFaltantes,
    calcularMedacionHasta
  };
});
