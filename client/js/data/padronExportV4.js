/**
 * padronExportV4.js
 * Exporta el padrón con el mismo formato del Excel de llenado v4 (el que se importa): hojas Instrucciones, Padrón
 * y Listas; los mismos encabezados, bloques y orden de las 100 columnas (N.º, 76 que se escriben y 23 calculadas);
 * encabezados en la fila 7 y pacientes desde la fila 8; las columnas calculadas con sus fórmulas, que Excel calcula
 * al abrir el archivo. Lo que se exporta se vuelve a importar sin cambios (ida y vuelta).
 *
 * Límite del programa que escribe el Excel (SheetJS libre): no escribe colores de bloque, listas desplegables
 * ni inmovilizar paneles. Estructura, valores y fórmulas sí coinciden con la propuesta.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./padronPlantillaV4.js'), require('./padronSchema.js'), require('./padronExcelParser.js'));
  } else {
    root.PadronExportV4 = factory(root.PadronPlantillaV4, root.PadronSchema, root.PadronExcelParser);
  }
})(typeof window !== 'undefined' ? window : this, function (plantilla, schema, parser) {

  const HTA_TEXTO = 'I10.X – Hipertensión esencial (primaria)';
  const DM_TEXTO = 'E11.9 – Diabetes mellitus tipo 2 sin mención de complicación';
  const DISLIP_TEXTO = 'E78.5 – Hiperlipidemia no especificada';
  const ERC_TEXTO = 'N18.9 – Enfermedad renal crónica, no especificada';

  function codigosDe(p) {
    return (p.diagnosticos || []).concat((p.conditions || []).map(c => c && c.cie10_cod)).filter(Boolean).map(c => String(c).toUpperCase());
  }

  function tiene(valor) {
    return valor !== undefined && valor !== null && String(valor).trim() !== '';
  }

  /** Valor de la columna `key` para el paciente `p`, con los nombres que usa el sistema como respaldo. */
  function valorDe(p, key) {
    const obs = (Array.isArray(p.observations) && p.observations.length > 0) ? p.observations[0] : null;
    const cita = (Array.isArray(p.appointments) && p.appointments.length > 0) ? p.appointments[0] : null;
    const cods = codigosDe(p);
    switch (key) {
      case 'tipo_documento': return p.tipo_documento || 'DNI';
      case 'nro_documento': return p.nro_documento || p.dni || '';
      case 'seguro_salud': return p.seguro_salud || p.seguro || p.financiador || '';
      case 'sector': return p.sector || p.sector_sanitario || '';
      case 'establecimiento_control': return p.establecimiento_control || p.puerta_entrada || '';
      case 'cie10_hta': return tiene(p.cie10_hta) ? p.cie10_hta : (cods.some(c => c.startsWith('I10')) ? HTA_TEXTO : '');
      case 'cie10_dm': return tiene(p.cie10_dm) ? p.cie10_dm : (cods.some(c => /^E1[0134]/.test(c)) ? DM_TEXTO : '');
      case 'cie10_dislipidemia': return tiene(p.cie10_dislipidemia) ? p.cie10_dislipidemia : (cods.some(c => c.startsWith('E78')) ? DISLIP_TEXTO : '');
      case 'cie10_erc': return tiene(p.cie10_erc) ? p.cie10_erc : (cods.some(c => c.startsWith('N18')) ? ERC_TEXTO : '');
      case 'fecha_ultimo_control': return tiene(p.fecha_ultimo_control) ? p.fecha_ultimo_control : (obs ? obs.fecha_registro : '');
      case 'proxima_cita': return tiene(p.proxima_cita) ? p.proxima_cita : (cita ? cita.fecha_cita : '');
      case 'hba1c': return tiene(p.hba1c) ? p.hba1c : (obs && tiene(obs.hba1c) ? obs.hba1c : '');
      case 'glucosa': return tiene(p.glucosa) ? p.glucosa : (obs && tiene(obs.glucosa) ? obs.glucosa : '');
      case 'estado_paciente': return p.fallecido ? 'Fallecido' : (p.estado_paciente || 'Activo');
      default: return tiene(p[key]) ? p[key] : '';
    }
  }

  function aFecha(valor) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor));
    if (!m) return null;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  }

  /** Celda tipada según la columna: fecha real, número o texto (para que las fórmulas de Excel funcionen). */
  function celdaDe(valor, col) {
    if (!tiene(valor)) return null;
    if (col && col.tipo === 'date') {
      const f = aFecha(valor);
      return f ? { t: 'd', v: f, z: 'dd/mm/yyyy' } : String(valor);
    }
    if (col && col.tipo === 'number') {
      const n = Number(String(valor).replace(',', '.'));
      return Number.isFinite(n) ? n : String(valor);
    }
    return String(valor);
  }

  /** Lleva la fórmula de la fila 8 de la plantilla a la fila `fila`; el rango fijo de la plantilla termina en `ultima`. */
  function adaptarFormula(formula, fila, ultima) {
    let f = String(formula).replace(/^=/, '');
    f = f.replace(/(\$?[A-Z]{1,3})(\$?)8(?!\d)/g, (m, col, abs) => (abs ? m : `${col}${fila}`));
    f = f.replace(new RegExp(`\\$${plantilla.ultimaFilaEjemplo}(?!\\d)`, 'g'), `$${ultima}`);
    return f;
  }

  /** Clave del esquema que recibe cada encabezado de la plantilla (null si es calculada o el N.º). */
  function clavesPorColumna() {
    return plantilla.cabeceras.map((h, i) => (plantilla.formulas[i] ? null : (parser.matchHeader ? parser.matchHeader(h) : null)));
  }

  /**
   * Arma el libro con el formato del padrón v4.
   * @param {Object} XLSX  SheetJS
   * @param {Array} pacientes
   * @param {Object} opciones { fechaCorte: Date }
   */
  function construirLibro(XLSX, pacientes, opciones = {}) {
    const n = plantilla.columnas;
    const filaCab = plantilla.filaCabecera;
    const filaIni = plantilla.filaPrimerDato;
    const lista = pacientes || [];
    const ultima = Math.max(filaIni, filaIni + lista.length - 1);
    const claves = clavesPorColumna();
    const hoy = opciones.fechaCorte || new Date();

    const ws = {};
    const ref = (r, c) => XLSX.utils.encode_cell({ r: r - 1, c: c - 1 });

    // Filas 1 a 4: títulos y leyendas (se omite la leyenda de la fila de ejemplo, que aquí no existe)
    for (const t of plantilla.titulos) {
      if (/^Fila de ejemplo/i.test(t.texto)) continue;
      ws[ref(t.fila, t.col)] = { t: 's', v: t.texto };
    }
    const colFecha = XLSX.utils.decode_cell(plantilla.celdaFechaCorte);
    ws[ref(colFecha.r + 1, colFecha.c + 1)] = { t: 'd', v: new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12, 0, 0)), z: 'dd/mm/yyyy' };

    // Fila 6: bloques; fila 7: encabezados
    const merges = [];
    for (const b of plantilla.bloques) {
      ws[ref(6, b.col)] = { t: 's', v: b.nombre };
      if (b.rango) merges.push(XLSX.utils.decode_range(b.rango));
    }
    plantilla.cabeceras.forEach((h, i) => { ws[ref(filaCab, i + 1)] = { t: 's', v: h }; });

    // Pacientes desde la fila 8
    lista.forEach((p, idx) => {
      const fila = filaIni + idx;
      for (let c = 1; c <= n; c++) {
        const formula = plantilla.formulas[c - 1];
        if (formula) {
          ws[ref(fila, c)] = { t: 's', f: adaptarFormula(formula, fila, ultima) };
          continue;
        }
        const key = claves[c - 1];
        if (!key) continue;
        const celda = celdaDe(valorDe(p, key), schema.COLUMNAS_MAP.get(key));
        if (celda === null) continue;
        ws[ref(fila, c)] = (typeof celda === 'object') ? celda : (typeof celda === 'number' ? { t: 'n', v: celda } : { t: 's', v: celda });
      }
    });

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ultima - 1, c: n - 1 } });
    if (merges.length) ws['!merges'] = merges;
    ws['!cols'] = plantilla.anchos.map(w => (w ? { wch: w } : {}));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(plantilla.instrucciones.map(f => f.map(v => (v === null ? '' : v)))), 'Instrucciones');
    XLSX.utils.book_append_sheet(wb, ws, 'Padrón');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(plantilla.listas.map(f => f.map(v => (v === null ? '' : v)))), 'Listas');
    wb.Workbook = { CalcPr: { fullCalcOnLoad: true } };
    return wb;
  }

  return { construirLibro, adaptarFormula, valorDe, clavesPorColumna };
});
