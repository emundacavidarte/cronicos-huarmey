/**
 * padronCalculadora.js
 * Motor Clínico de Cálculo Automático para el Padrón Estandarizado
 * Genera en tiempo real las 22 variables clínicas normativas (IMC, Nutrición,
 * TFGe CKD-EPI 2021, Estadio ERC, Metas HEARTS, Control de PA, IP04 y Alertas de Tamizaje).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PadronCalculadora = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {

  const MESES_CODIGOS = ['dic', 'nov', 'oct', 'set', 'ago', 'jul', 'jun', 'may', 'abr', 'mar', 'feb', 'ene'];

  /**
   * Calcula la edad en años cumplidos
   */
  function calcularEdad(fechaNac, fechaRef = new Date()) {
    if (!fechaNac) return null;
    // AAAA-MM-DD se lee como fecha LOCAL: new Date('1966-12-25') es medianoche UTC y en Lima cae el 24 (C-06)
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fechaNac));
    const nac = iso ? new Date(+iso[1], +iso[2] - 1, +iso[3]) : new Date(fechaNac);
    if (isNaN(nac.getTime())) return null;
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
   * Tasa de Filtración Glomerular Estimada (TFGe) - Fórmula Oficial CKD-EPI 2021
   */
  function calcularTfge(creatininaMgDl, edadAnios, sexo) {
    const cr = parseFloat(creatininaMgDl);
    const edad = parseInt(edadAnios, 10);
    if (!cr || !edad || cr <= 0 || edad <= 0) {
      return { tfge: null, estadio: 'Sin dato' };
    }

    const esMujer = String(sexo || '').toLowerCase().startsWith('f');
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

    let estadio = 'G1 (Normal o elevado)';
    if (tfge >= 90) estadio = 'G1 (Normal o elevado, ≥ 90)';
    else if (tfge >= 60) estadio = 'G2 (Levemente disminuido, 60–89)';
    else if (tfge >= 45) estadio = 'G3a (Disminución leve a moderada, 45–59)';
    else if (tfge >= 30) estadio = 'G3b (Disminución moderada a grave, 30–44)';
    else if (tfge >= 15) estadio = 'G4 (Disminución grave, 15–29)';
    else estadio = 'G5 (Falla renal terminal, < 15)';

    return { tfge, estadio };
  }

  /**
   * Evaluación de Presión Arterial (Última medición, meta y control longitudinal)
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

    // 2. Determinar Meta de PA según Guía HEARTS / MINSA
    const tieneDm = !!p.cie10_dm;
    const tieneErc = !!p.cie10_erc;
    const tieneEcv = String(p.enfermedad_cardiovascular || '').toLowerCase().startsWith('sí');
    const esMayor = edad >= 65;

    let targetPas = 140;
    let targetPad = 90;
    let metaTexto = '< 140/90 mmHg';

    if (tieneDm || tieneErc || tieneEcv) {
      targetPas = 130;
      targetPad = 80;
      metaTexto = '< 130/80 mmHg (por DM/ERC/ECV)';
    } else if (esMayor) {
      metaTexto = '< 140/90 mmHg';
    }

    // 3. PA en meta en la última medición
    let paEnMeta = 'Sin datos';
    if (ultimaPas !== null && ultimaPad !== null) {
      paEnMeta = (ultimaPas < targetPas && ultimaPad < targetPad) ? 'Sí' : 'No';
    }

    // 4. Controlado y estable (3 últimas PA en meta)
    let controladoEstable = 'No';
    if (pasHistory.length >= 3) {
      const ultimas3 = pasHistory.slice(0, 3);
      const todasEnMeta = ultimas3.every(h => h.pas < targetPas && h.pad < targetPad);
      controladoEstable = todasEnMeta ? 'Sí' : 'No';
    } else if (pasHistory.length > 0 && paEnMeta === 'Sí') {
      controladoEstable = 'Sí (Parcial)';
    }

    // 5. Cumple indicador de desempeño IP04 (SIS / MINSA)
    // Ficha IP04 del convenio: al menos dos controles de enero a agosto y una presión < 140/90 mmHg en alguno
    // (no es la meta clínica del paciente ni la última medición)
    const delPeriodo = pasHistory.filter(h => ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago'].includes(h.mes));
    const cumpleIp04 = (delPeriodo.length >= 2 && delPeriodo.some(h => h.pas < 140 && h.pad < 90)) ? 'Sí' : 'No';

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
      hba1cEnMeta = (hba1c < 7.0) ? 'Sí' : 'No';
    }

    const ldl = parseInt(p.colesterol_ldl, 10);
    let ldlEnMeta = 'Sin dato';
    if (!isNaN(ldl)) {
      const corteLdl = altoRiesgoCv ? 70 : 100;
      ldlEnMeta = (ldl < corteLdl) ? 'Sí' : 'No';
    }

    return { hba1cEnMeta, ldlEnMeta };
  }

  /**
   * Cálculo de Días de Atraso y Estado de Cita
   */
  function evaluarCita(proximaCitaStr) {
    if (!proximaCitaStr) {
      return { diasAtraso: 0, estadoCita: 'Sin cita programada', semaforo: 'gris' };
    }
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const cita = new Date(proximaCitaStr);
    cita.setHours(0, 0, 0, 0);

    if (isNaN(cita.getTime())) {
      return { diasAtraso: 0, estadoCita: 'Fecha inválida', semaforo: 'gris' };
    }

    const diffMs = cita.getTime() - hoy.getTime();
    const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDias < 0) {
      const diasVencido = Math.abs(diffDias);
      return {
        diasAtraso: diasVencido,
        estadoCita: `Vencida hace ${diasVencido} día(s)`,
        semaforo: 'rojo'
      };
    } else if (diffDias <= 7) {
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
   * Detección de tamizajes y exámenes pendientes (Columna "Qué le falta")
   */
  function detectarFaltantes(p, edad, citaInfo) {
    const pendientes = [];
    const esDiabetico = !!p.cie10_dm;
    const esHipertenso = !!p.cie10_hta;

    if (esDiabetico && !p.hba1c) {
      pendientes.push('HbA1c anual');
    }
    if (esDiabetico && !p.fecha_evaluacion_pie) {
      pendientes.push('Examen de pies');
    }
    if (!p.creatinina) {
      pendientes.push('Creatinina / TFGe');
    }
    if (!p.albuminuria) {
      pendientes.push('Tamizaje Albuminuria (RAC)');
    }
    if (!p.colesterol_ldl && !p.colesterol_total) {
      pendientes.push('Perfil lipídico');
    }
    if (citaInfo.diasAtraso > 0) {
      pendientes.push(`Cita médica vencida (${citaInfo.diasAtraso}d)`);
    }

    return pendientes.length > 0 ? pendientes.join(' · ') : 'Al día con sus controles y tamizajes';
  }

  /**
   * Cálculo de fecha de medicación hasta
   */
  function calcularMedacionHasta(fechaUltimoControl, mesesMed) {
    if (!fechaUltimoControl) return 'Sin fecha de entrega';
    const d = new Date(fechaUltimoControl);
    if (isNaN(d.getTime())) return 'Sin fecha de entrega';
    const meses = parseInt(mesesMed, 10) || 1;
    d.setDate(d.getDate() + (meses * 30));
    return d.toISOString().split('T')[0];
  }

  /**
   * Función Maestra: Calcula en tiempo real las 22 variables
   */
  function calcularPadron(patient) {
    const p = patient || {};
    const edad = calcularEdad(p.fecha_nacimiento);
    const { imc, valoracion: valoracionNutricional } = calcularImc(p.peso, p.talla);

    // Riesgo Cardiovascular
    const riesgoNum = parseFloat(p.riesgo_cv_porcentaje);
    const tieneEcv = String(p.enfermedad_cardiovascular || '').toLowerCase().startsWith('sí');
    const tieneErc = !!p.cie10_erc;
    const tieneDm = !!p.cie10_dm;

    let nivelRiesgoCv = 'Bajo (< 5%)';
    let altoRiesgoCv = 'No';

    if (!isNaN(riesgoNum)) {
      if (riesgoNum >= 20) { nivelRiesgoCv = 'Muy Alto (≥ 20%)'; altoRiesgoCv = 'Sí'; }
      else if (riesgoNum >= 10) { nivelRiesgoCv = 'Alto (10–19%)'; altoRiesgoCv = 'Sí'; }
      else if (riesgoNum >= 5) { nivelRiesgoCv = 'Moderado (5–9%)'; altoRiesgoCv = 'No'; }
      else { nivelRiesgoCv = 'Bajo (< 5%)'; altoRiesgoCv = 'No'; }
    } else if (tieneEcv || tieneErc) {
      nivelRiesgoCv = 'Muy Alto (Criterio clínico ECV/ERC)';
      altoRiesgoCv = 'Sí';
    } else if (tieneDm) {
      nivelRiesgoCv = 'Alto (Diabetes Mellitus)';
      altoRiesgoCv = 'Sí';
    }

    // Presión Arterial
    const evalPa = evaluarPresionArterial(p, edad || 50);

    // Laboratorio y Metabolismo
    const { tfge, estadio: estadioErc } = calcularTfge(p.creatinina, edad || 50, p.sexo);
    const { hba1cEnMeta, ldlEnMeta } = evaluarMetabolico(p, altoRiesgoCv === 'Sí');

    // Cita y Seguimiento
    const citaInfo = evaluarCita(p.proxima_cita);
    const queLeFalta = detectarFaltantes(p, edad, citaInfo);
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
    if (!p.nro_documento || String(p.nro_documento).replace(/\D/g, '').length !== 8) alertas.push('DNI no tiene 8 dígitos');
    if (!p.apellidos_nombres) alertas.push('Falta nombres');
    if (!p.direccion) alertas.push('Falta dirección');
    if (!p.establecimiento_adscripcion) alertas.push('Falta EESS');
    const alertaDelDato = alertas.length > 0 ? alertas.join('; ') : 'Dato conforme';

    // Estado HEARTS
    let semaforo = citaInfo.semaforo;
    if (p.estado_paciente === 'Fallecido') {
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
    detectarFaltantes
  };
});
