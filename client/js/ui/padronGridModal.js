/**
 * padronGridModal.js
 * Editor y Auditor Interactivo de Hoja de Cálculo en Pantalla (Data Grid)
 * Permite visualizar el Excel subido, resalta inconsistencias directamente en las celdas,
 * permite la corrección en caliente y habilita la carga solo cuando está al 100% válido.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('../data/padronSchema'), require('../data/padronExcelParser'));
  } else {
    root.PadronGridModal = factory(root.PadronSchema, root.PadronExcelParser);
  }
})(typeof window !== 'undefined' ? window : this, function (schema, parser) {

    // Los valores que vienen de un Excel o de la API nunca se escriben tal cual en la página
  const esc = (v) => String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /** Código RENIPRESS dentro de un texto como «C. S. La Victoria (00001744, I-3)»; null si no lo trae. */
  const codigoRenipress = (texto) => {
    const m = /\((\d{8})\b/.exec(String(texto === undefined || texto === null ? '' : texto));
    return m ? m[1] : null;
  };

  class PadronGridModal {
    constructor() {
      this.patients = [];
      this.validationResult = null;
      this.filterOnlyErrors = false;
      this.searchQuery = '';
      this.selectedRowIndex = null;
      this.currentFileName = 'Padron_Estandarizado.xlsx';
      this.dom = {};
      this.isInitialized = false;
    }

    init() {
      if (this.isInitialized) return;
      this.buildModalDOM();
      this.attachEvents();
      this.isInitialized = true;
    }

    buildModalDOM() {
      let modal = document.getElementById('modal-padron-grid');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-padron-grid';
        modal.className = 'padron-modal-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = `
          <div class="padron-modal-box">
            <!-- 1. Cabecera -->
            <div class="padron-modal-header">
              <div class="padron-header-left">
                <span class="padron-title-icon">${window.AppIcons ? window.AppIcons.excel(24, '#1E8E3E') : '📊'}</span>
                <div>
                  <h2 class="padron-title">AUDITORÍA Y CORRECCIÓN DE PADRÓN ESTANDARIZADO</h2>
                  <div class="padron-subtitle" id="padron-file-info">Archivo: Cargando...</div>
                </div>
              </div>
              <div class="padron-header-right">
                <div class="padron-score-badge" id="padron-score-badge">0% Válido</div>
                <button type="button" class="btn-close-accessible" id="padron-btn-cerrar" title="Cerrar modal">✕</button>
              </div>
            </div>

            <!-- 2. Barra de Herramientas y Filtros -->
            <div class="padron-toolbar">
              <div class="padron-toolbar-filters">
                <button type="button" class="padron-tool-btn active" id="padron-filter-all">
                  Ver todos (<span id="padron-count-all">0</span>)
                </button>
                <button type="button" class="padron-tool-btn" id="padron-filter-errors" style="display:flex; align-items:center; gap:6px;">
                  ${window.AppIcons ? window.AppIcons.alertTriangle(14, '#D93025') : '!'} Solo con inconsistencias (<span id="padron-count-errors">0</span>)
                </button>
                <div class="padron-search-box">
                  <span>${window.AppIcons ? window.AppIcons.search(14, '#5F6368') : ''}</span>
                  <input type="text" id="padron-search-input" placeholder="Buscar por DNI, paciente o dirección..." spellcheck="false">
                </div>
              </div>
              <div class="padron-toolbar-actions">
                <button type="button" class="padron-action-btn" id="padron-btn-autofill-eess" title="Asigna Hospital Huarmey a los campos vacíos de EESS" style="display:none;">
                  ${window.AppIcons ? window.AppIcons.hospital(14, '#1A73E8') : ''} Asignar Hospital Huarmey a EESS vacíos
                </button>
                <button type="button" class="padron-action-btn" id="padron-btn-add-row" title="Agregar una nueva fila de paciente" style="display:flex; align-items:center; gap:6px;">
                  ${window.AppIcons ? window.AppIcons.plus(14, '#FFFFFF') : '+'} Agregar Fila
                </button>
              </div>
            </div>

            <!-- 2.5 Panel de Navegación de Inconsistencias (Clic para saltar a celda) -->
            <div class="padron-errors-panel" id="padron-errors-panel" style="display:none;">
              <div class="padron-errors-panel-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <div style="font-weight:700; color:#b91c1c; font-size:12px; display:flex; align-items:center; gap:6px;">
                  <span>${window.AppIcons ? window.AppIcons.alertTriangle(14, '#D93025') : '!'} Inconsistencias Detectadas:</span>
                  <span class="pill-row-num" id="padron-errors-pills-count">0</span>
                  <span style="font-weight:normal; color:#64748b; font-size:11.5px; margin-left:8px;">Haga clic en cualquiera para saltar y corregir directamente en la celda:</span>
                </div>
              </div>
              <div class="padron-errors-pills-wrap" id="padron-errors-pills-wrap"></div>
            </div>

            <!-- 3. Contenedor de la Hoja de Cálculo Interactiva -->
            <div class="padron-grid-wrapper" id="padron-grid-wrapper">
              <table class="padron-grid-table" id="padron-grid-table">
                <thead id="padron-grid-thead"></thead>
                <tbody id="padron-grid-tbody"></tbody>
              </table>
              <div class="padron-empty-msg" id="padron-empty-msg" style="display:none;">
                No hay filas que coincidan con el filtro seleccionado.
              </div>
            </div>

            <!-- 4. Pie con Estado y Botón de Carga -->
            <div class="padron-modal-footer">
              <div class="padron-status-msg" id="padron-status-msg">
                Iniciando validación...
              </div>
              <div class="padron-footer-buttons">
                <button type="button" class="padron-btn-cancel" id="padron-btn-cancelar">
                  Cancelar
                </button>
                <button type="button" class="padron-btn-submit disabled" id="padron-btn-cargar" disabled>
                  ⛔ Corrija las inconsistencias para cargar
                </button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
      }

      this.dom = {
        modal,
        fileInfo: document.getElementById('padron-file-info'),
        scoreBadge: document.getElementById('padron-score-badge'),
        btnCerrar: document.getElementById('padron-btn-cerrar'),
        filterAll: document.getElementById('padron-filter-all'),
        filterErrors: document.getElementById('padron-filter-errors'),
        countAll: document.getElementById('padron-count-all'),
        countErrors: document.getElementById('padron-count-errors'),
        searchInput: document.getElementById('padron-search-input'),
        btnAutofillEess: document.getElementById('padron-btn-autofill-eess'),
        btnAddRow: document.getElementById('padron-btn-add-row'),
        errorsPanel: document.getElementById('padron-errors-panel'),
        errorsPillsCount: document.getElementById('padron-errors-pills-count'),
        errorsPillsWrap: document.getElementById('padron-errors-pills-wrap'),
        gridWrapper: document.getElementById('padron-grid-wrapper'),
        thead: document.getElementById('padron-grid-thead'),
        tbody: document.getElementById('padron-grid-tbody'),
        emptyMsg: document.getElementById('padron-empty-msg'),
        statusMsg: document.getElementById('padron-status-msg'),
        btnCancelar: document.getElementById('padron-btn-cancelar'),
        btnCargar: document.getElementById('padron-btn-cargar')
      };
    }

    attachEvents() {
      this.dom.btnCerrar.addEventListener('click', () => this.close());
      this.dom.btnCancelar.addEventListener('click', () => this.close());

      this.dom.filterAll.addEventListener('click', () => {
        this.filterOnlyErrors = false;
        this.dom.filterAll.classList.add('active');
        this.dom.filterErrors.classList.remove('active');
        this.renderTableRows();
      });

      this.dom.filterErrors.addEventListener('click', () => {
        this.filterOnlyErrors = true;
        this.dom.filterErrors.classList.add('active');
        this.dom.filterAll.classList.remove('active');
        this.renderTableRows();

        // Si hay inconsistencias, saltar automáticamente a la primera celda con error
        if (this.validationResult && this.validationResult.totalErrors > 0) {
          for (let r = 0; r < this.patients.length; r++) {
            const rowRes = this.validationResult.rowResults[r];
            if (rowRes && !rowRes.isValid && rowRes.errors) {
              const firstKey = Object.keys(rowRes.errors)[0];
              if (firstKey) {
                setTimeout(() => this.jumpToCell(r, firstKey), 100);
                break;
              }
            }
          }
        }
      });

      this.dom.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderTableRows();
      });

      this.dom.btnAutofillEess.addEventListener('click', () => this.autofillEmptyEess());
      this.dom.btnAddRow.addEventListener('click', () => this.addNewRow());

      this.dom.btnCargar.addEventListener('click', () => this.commitUpload());

      // Manejo de teclado global (Escape cierra modal)
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.dom.modal.classList.contains('active')) {
          this.close();
        }
      });
    }

    /**
     * Abre el modal o dispara el selector de archivo si aún no hay pacientes cargados
     */
    open() {
      this.init();
      if (this.patients && this.patients.length > 0) {
        this.dom.modal.classList.add('active');
        return;
      }
      const fileInput = document.getElementById('hosix-file-input');
      if (fileInput) {
        fileInput.value = '';
        fileInput.click();
      } else {
        this.dom.modal.classList.add('active');
      }
    }

    /**
     * Abre el modal cargando un archivo Excel o ArrayBuffer
     */
    async openWithFile(file) {
      this.init();
      this.currentFileName = file.name || 'Padron_Estandarizado_Huarmey.xlsx';
      this.dom.fileInfo.textContent = `Archivo: ${this.currentFileName} (Procesando...)`;
      this.dom.modal.classList.add('active');

      try {
        const parsed = await parser.parseWorkbook(file);
        this.patients = parsed.patients;
        this.precargarConsentimiento();
        this.dom.fileInfo.textContent = `Archivo: ${this.currentFileName} · Hoja: "${parsed.sheetName}" · ${this.patients.length} pacientes` +
          (this.consentimientosPrecargados ? ` · ${this.consentimientosPrecargados} con consentimiento ya registrado (precargado)` : '');

        this.validateAndUpdate();
        this.renderTableHeaders();
        this.renderTableRows();
      } catch (err) {
        console.error('Error al leer el archivo Excel:', err);
        alert('Error al leer el archivo Excel: ' + err.message);
        this.close();
      }
    }

    close() {
      if (this.dom.modal) {
        this.dom.modal.classList.remove('active');
      }
    }

    /**
     * Precarga el consentimiento: si la fila viene sin respuesta y el paciente ya lo tiene registrado en el sistema,
     * se toma ese valor (se pregunta una sola vez). Lo que el archivo trae escrito no se pisa.
     */
    precargarConsentimiento() {
      this.consentimientosPrecargados = 0;
      if (!window.app || typeof window.app.findPatient !== 'function') return;
      for (const r of this.patients) {
        if (String(r.consentimiento || '').trim()) continue;
        const dni = String(r.nro_documento || '').replace(/\D/g, '');
        const existente = dni ? window.app.findPatient(dni) : null;
        if (existente && (existente.consentimiento === 'Sí, firmado' || existente.consentimiento === 'No')) {
          r.consentimiento = existente.consentimiento;
          this.consentimientosPrecargados++;
        }
      }
    }

    /**
     * Ejecuta la validación completa sobre todas las filas
     */
    validateAndUpdate() {
      this.validationResult = schema.validateBatch(this.patients);
      const res = this.validationResult;

      // Actualizar contadores
      this.dom.countAll.textContent = res.totalRows;
      this.dom.countErrors.textContent = res.rowsWithErrors;

      // Actualizar Badge de Score
      this.dom.scoreBadge.textContent = `${res.percent}% Válido`;
      this.dom.scoreBadge.className = 'padron-score-badge ' + (res.percent === 100 ? 'score-100' : (res.percent >= 80 ? 'score-warn' : 'score-err'));

      // Actualizar Botón de Carga y Mensaje de Estado
      if (res.totalErrors === 0 && res.totalRows > 0) {
        this.dom.statusMsg.innerHTML = `🎉 <strong>¡Padrón 100% Válido!</strong> Todos los ${res.totalRows} pacientes cumplen con los estándares de calidad y listas oficiales.`;
        this.dom.btnCargar.disabled = false;
        this.dom.btnCargar.className = 'padron-btn-submit enabled';
        this.dom.btnCargar.innerHTML = `✅ Cargar y Georreferenciar ${res.totalRows} Pacientes al Sistema`;
      } else {
        this.dom.statusMsg.innerHTML = `⚠️ Se detectaron <strong>${res.totalErrors} inconsistencias</strong> en <strong>${res.rowsWithErrors} pacientes</strong>. Haga clic sobre las celdas rojas o las tarjetas de arriba para corregirlas.`;
        this.dom.btnCargar.disabled = true;
        this.dom.btnCargar.className = 'padron-btn-submit disabled';
        this.dom.btnCargar.innerHTML = `⛔ Corrija ${res.totalErrors} celdas observadas (${res.percent}% completado)`;
      }

      // Contar celdas vacías de EESS para mostrar u ocultar el botón de autoasignación
      let emptyEessCount = 0;
      this.patients.forEach(p => {
        if (!p.establecimiento_adscripcion || !String(p.establecimiento_adscripcion).trim()) emptyEessCount++;
        if (!p.establecimiento_control || !String(p.establecimiento_control).trim()) emptyEessCount++;
      });
      if (emptyEessCount > 0) {
        this.dom.btnAutofillEess.style.display = 'inline-flex';
        this.dom.btnAutofillEess.innerHTML = `⚡ Asignar Hospital Huarmey (${emptyEessCount} vacíos)`;
      } else {
        this.dom.btnAutofillEess.style.display = 'none';
      }

      // Actualizar el Panel de Inconsistencias (Píldoras de navegación rápida)
      this.renderErrorsPanel();
    }

    /**
     * Renderiza las píldoras de inconsistencias interactivas para navegación con 1 clic
     */
    renderErrorsPanel() {
      if (!this.dom.errorsPanel || !this.dom.errorsPillsWrap) return;
      const res = this.validationResult;
      if (!res || res.totalErrors === 0) {
        this.dom.errorsPanel.style.display = 'none';
        this.dom.errorsPillsWrap.innerHTML = '';
        return;
      }

      this.dom.errorsPanel.style.display = 'block';
      if (this.dom.errorsPillsCount) {
        this.dom.errorsPillsCount.textContent = res.totalErrors;
      }

      const pillsHtml = [];
      res.rowResults.forEach((rowRes, rIdx) => {
        if (!rowRes.isValid && rowRes.errors) {
          const patient = this.patients[rIdx];
          const dni = patient.nro_documento || 'Sin DNI';
          Object.entries(rowRes.errors).forEach(([colKey, errMsg]) => {
            const colDef = schema.COLUMNAS_MAP.get(colKey);
            const colLabel = colDef ? colDef.label : colKey;
            pillsHtml.push(`
              <button type="button" class="padron-error-pill" data-row-idx="${rIdx}" data-key="${colKey}" title="Fila ${rIdx + 1} (${esc(dni)}) · ${esc(colLabel)}: ${esc(errMsg)}">
                <span class="pill-row-num">Fila ${rIdx + 1} (${esc(dni)})</span>
                <span class="pill-col-name">${esc(colLabel)}:</span>
                <span class="pill-err-text">${esc(errMsg)}</span>
                <span class="pill-jump-icon">➔ Corregir</span>
              </button>
            `);
          });
        }
      });

      this.dom.errorsPillsWrap.innerHTML = pillsHtml.join('');

      // Asociar clic a cada píldora para salto y edición inmediata
      const pillBtns = this.dom.errorsPillsWrap.querySelectorAll('.padron-error-pill');
      pillBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const rIdx = parseInt(btn.getAttribute('data-row-idx'), 10);
          const colKey = btn.getAttribute('data-key');
          this.jumpToCell(rIdx, colKey);
        });
      });
    }

    /**
     * Salto directo y foco animado a una celda observada
     */
    jumpToCell(rowIdx, colKey) {
      // 1. Si hay filtro de búsqueda activo y la fila no está visible, limpiar búsqueda
      if (this.searchQuery) {
        this.searchQuery = '';
        this.dom.searchInput.value = '';
        this.renderTableRows();
      }

      // 2. Si la fila no está visible por el filtro de errores, restaurar vista completa
      let targetRow = this.dom.tbody.querySelector(`tr[data-row-index="${rowIdx}"]`);
      if (!targetRow) {
        this.filterOnlyErrors = false;
        this.dom.filterAll.classList.add('active');
        this.dom.filterErrors.classList.remove('active');
        this.renderTableRows();
      }

      // 3. Buscar la celda específica en el DOM
      const cell = this.dom.tbody.querySelector(`td[data-row-idx="${rowIdx}"][data-key="${colKey}"]`);
      if (cell) {
        // Desplazar suavemente a la celda tanto horizontal como verticalmente
        cell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

        // Activar animación visual de pulso
        cell.classList.remove('cell-pulse');
        void cell.offsetWidth; // reiniciar animación CSS
        cell.classList.add('cell-pulse');

        setTimeout(() => {
          cell.classList.remove('cell-pulse');
        }, 2500);

        // Iniciar edición automáticamente para que el usuario ingrese el dato de inmediato
        setTimeout(() => {
          if (!cell.classList.contains('editing')) {
            this.startCellEdit(cell);
          }
        }, 300);
      }
    }

    /**
     * Renderiza las cabeceras fijas organizadas por bloques pastel
     */
    renderTableHeaders() {
      // 1. Fila de Bloques Temáticos
      let trBloques = '<tr>';
      trBloques += '<th class="th-freeze-col th-col-num" rowspan="2">#</th>';
      trBloques += '<th class="th-freeze-col th-col-dni" rowspan="2">DNI / Documento</th>';
      trBloques += '<th class="th-freeze-col th-col-nombre" rowspan="2">Apellidos y Nombres</th>';
      trBloques += '<th class="th-col-action" rowspan="2">Acción</th>';

      // Agrupar columnas por bloque
      const bloquesList = Object.keys(schema.BLOQUES);
      bloquesList.forEach(bCode => {
        const bInfo = schema.BLOQUES[bCode];
        const colsInBlock = schema.COLUMNAS.filter(c => c.bloque === bCode && !c.freeze);
        if (colsInBlock.length > 0) {
          trBloques += `<th colspan="${colsInBlock.length}" style="background:${bInfo.franja}; color:${bInfo.texto}; font-weight:800; text-align:center; border:1px solid #cbd5e1; font-size:11px; padding:4px 6px;">
            ${bInfo.nombre}
          </th>`;
        }
      });
      trBloques += '</tr>';

      // 2. Fila de Nombres de Columnas
      let trCols = '<tr>';
      bloquesList.forEach(bCode => {
        const bInfo = schema.BLOQUES[bCode];
        const colsInBlock = schema.COLUMNAS.filter(c => c.bloque === bCode && !c.freeze);
        colsInBlock.forEach(col => {
          trCols += `<th style="background:${bInfo.fondo}; color:${bInfo.texto}; border:1px solid #cbd5e1; padding:6px 8px; font-size:11px; white-space:nowrap;" title="${col.desc || col.label}">
            ${col.label}${col.required ? ' <span style="color:#dc2626;">*</span>' : ''}
          </th>`;
        });
      });
      trCols += '</tr>';

      this.dom.thead.innerHTML = trBloques + trCols;
    }

    /**
     * Renderiza las filas de pacientes en el cuerpo de la tabla
     */
    renderTableRows() {
      if (!this.patients || this.patients.length === 0) {
        this.dom.tbody.innerHTML = '';
        this.dom.emptyMsg.style.display = 'block';
        return;
      }

      const res = this.validationResult;
      const htmlRows = [];
      let visibleCount = 0;

      for (let rIdx = 0; rIdx < this.patients.length; rIdx++) {
        const row = this.patients[rIdx];
        const rowRes = res.rowResults[rIdx] || { isValid: true, errors: {} };

        // Filtro: Solo con errores
        if (this.filterOnlyErrors && rowRes.isValid) {
          continue;
        }

        // Filtro de búsqueda
        if (this.searchQuery) {
          const str = `${row.nro_documento || ''} ${row.apellidos_nombres || ''} ${row.direccion || ''}`.toLowerCase();
          if (!str.includes(this.searchQuery)) {
            continue;
          }
        }

        visibleCount++;

        // Construir celdas fijas
        let rowHtml = `<tr data-row-index="${rIdx}" class="${!rowRes.isValid ? 'row-has-errors' : ''}">`;

        // 1. # de Fila
        rowHtml += `<td class="td-freeze-col td-col-num">${rIdx + 1}</td>`;

        // 2. DNI (Freeze)
        const dniErr = rowRes.errors['nro_documento'];
        const iconCellErr = window.AppIcons ? window.AppIcons.alertTriangle(11, '#D93025') : '!';

        rowHtml += `<td class="td-freeze-col td-col-dni editable-cell ${dniErr ? 'cell-error' : ''}" data-key="nro_documento" data-row-idx="${rIdx}" title="${esc(dniErr || 'Haga clic para editar')}">
          ${esc(row.nro_documento) || '<span class="cell-empty">Sin DNI</span>'}
          ${dniErr ? `<span class="cell-error-icon">${iconCellErr}</span>` : ''}
        </td>`;

        // 3. Nombres (Freeze)
        const nomErr = rowRes.errors['apellidos_nombres'];
        rowHtml += `<td class="td-freeze-col td-col-nombre editable-cell ${nomErr ? 'cell-error' : ''}" data-key="apellidos_nombres" data-row-idx="${rIdx}" title="${esc(nomErr || 'Haga clic para editar')}">
          ${esc(row.apellidos_nombres) || '<span class="cell-empty">Sin Nombres</span>'}
          ${nomErr ? `<span class="cell-error-icon">${iconCellErr}</span>` : ''}
        </td>`;

        // 4. Acción (Eliminar fila)
        rowHtml += `<td class="td-col-action">
          <button type="button" class="btn-del-row" data-row-idx="${rIdx}" title="Eliminar fila de este paciente" style="color:#b91c1c; font-weight:700;">✕</button>
        </td>`;

        // 5. Resto de columnas
        schema.COLUMNAS.forEach(col => {
          if (col.freeze) return; // Ya renderizadas en congeladas
          const val = row[col.key] !== undefined && row[col.key] !== null ? row[col.key] : '';
          const err = rowRes.errors[col.key];

          let displayVal = esc(val);
          if (displayVal === '') {
            displayVal = '<span class="cell-empty">—</span>';
          }

          rowHtml += `<td class="editable-cell ${err ? 'cell-error' : ''}" data-key="${col.key}" data-row-idx="${rIdx}" title="${esc(err || 'Haga clic para editar')}">
            <span class="cell-val">${displayVal}</span>
            ${err ? `<span class="cell-error-icon">${iconCellErr}</span>` : ''}
          </td>`;
        });

        rowHtml += '</tr>';
        htmlRows.push(rowHtml);
      }

      this.dom.tbody.innerHTML = htmlRows.join('');
      this.dom.emptyMsg.style.display = visibleCount === 0 ? 'block' : 'none';

      this.attachCellEditingEvents();
    }

    /**
     * Asocia eventos para la edición interactiva celda por celda
     */
    attachCellEditingEvents() {
      const cells = this.dom.tbody.querySelectorAll('.editable-cell');
      cells.forEach(cell => {
        cell.addEventListener('click', (e) => {
          if (cell.classList.contains('editing')) return;
          this.startCellEdit(cell);
        });
      });

      const delBtns = this.dom.tbody.querySelectorAll('.btn-del-row');
      delBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const rIdx = parseInt(btn.getAttribute('data-row-idx'), 10);
          if (confirm(`¿Eliminar la fila #${rIdx + 1} (${this.patients[rIdx]?.apellidos_nombres || 'Paciente'})?`)) {
            this.patients.splice(rIdx, 1);
            this.validateAndUpdate();
            this.renderTableRows();
          }
        });
      });
    }

    /**
     * Inicia la edición en línea en la celda
     */
    startCellEdit(cell) {
      const rowIdx = parseInt(cell.getAttribute('data-row-idx'), 10);
      const key = cell.getAttribute('data-key');
      const colDef = schema.COLUMNAS_MAP.get(key);
      const row = this.patients[rowIdx];
      const currentVal = row[key] !== undefined && row[key] !== null ? row[key] : '';

      cell.classList.add('editing');
      const oldHtml = cell.innerHTML;

      let inputEl;

      if (colDef && colDef.tipo === 'select' && Array.isArray(colDef.opciones)) {
        inputEl = document.createElement('select');
        inputEl.className = 'grid-inline-select';

        const optEmpty = document.createElement('option');
        optEmpty.value = '';
        optEmpty.textContent = '-- Seleccione --';
        inputEl.appendChild(optEmpty);

        colDef.opciones.forEach(op => {
          const opt = document.createElement('option');
          opt.value = op;
          opt.textContent = op;
          if (op.toLowerCase() === String(currentVal).toLowerCase()) {
            opt.selected = true;
          }
          inputEl.appendChild(opt);
        });
      } else if (colDef && colDef.tipo === 'date') {
        inputEl = document.createElement('input');
        inputEl.type = 'date';
        inputEl.className = 'grid-inline-input';
        inputEl.value = currentVal;
      } else if (colDef && colDef.tipo === 'number') {
        inputEl = document.createElement('input');
        inputEl.type = 'number';
        if (colDef.min !== undefined) inputEl.min = colDef.min;
        if (colDef.max !== undefined) inputEl.max = colDef.max;
        if (colDef.step !== undefined) inputEl.step = colDef.step;
        inputEl.className = 'grid-inline-input';
        inputEl.value = currentVal;
      } else {
        inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.className = 'grid-inline-input';
        inputEl.value = currentVal;
      }

      cell.innerHTML = '';
      cell.appendChild(inputEl);
      inputEl.focus();

      const commitChange = () => {
        if (!cell.classList.contains('editing')) return;
        const newVal = inputEl.value.trim();
        row[key] = newVal;
        cell.classList.remove('editing');

        // Re-validar dataset
        this.validateAndUpdate();
        this.renderTableRows();
      };

      inputEl.addEventListener('blur', commitChange);
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          inputEl.blur();
        } else if (e.key === 'Escape') {
          cell.classList.remove('editing');
          cell.innerHTML = oldHtml;
        }
      });
    }

    /**
     * Autocompleta automáticamente el Hospital Huarmey en campos de EESS vacíos
     */
    autofillEmptyEess() {
      const eessDef = "Hospital de Apoyo Huarmey (00001741, II-1)";
      let count = 0;
      this.patients.forEach(p => {
        if (!p.establecimiento_adscripcion || !String(p.establecimiento_adscripcion).trim()) {
          p.establecimiento_adscripcion = eessDef;
          count++;
        }
        if (!p.establecimiento_control || !String(p.establecimiento_control).trim()) {
          p.establecimiento_control = eessDef;
          count++;
        }
      });
      this.validateAndUpdate();
      this.renderTableRows();
      alert(`Se completaron ${count} celdas de establecimiento con "${eessDef}".`);
    }

    /**
     * Agrega una fila vacía para registrar un nuevo paciente
     */
    addNewRow() {
      const newPatient = {
        _excelRowNumber: this.patients.length + 1,
        tipo_documento: 'DNI',
        nro_documento: '',
        apellidos_nombres: '',
        sexo: 'Femenino',
        fecha_nacimiento: '',
        seguro_salud: 'SIS',
        sector: 'Sector I – Centro',
        direccion: 'Huarmey',
        establecimiento_adscripcion: 'Hospital de Apoyo Huarmey (00001741, II-1)',
        establecimiento_control: 'Hospital de Apoyo Huarmey (00001741, II-1)',
        estado_paciente: 'Activo',
        consentimiento: ''
      };
      this.patients.unshift(newPatient);
      this.validateAndUpdate();
      this.renderTableRows();
      this.dom.gridWrapper.scrollTop = 0;
    }

    /**
     * Confirma la carga definitiva al 100% y geocodifica sobre Huarmey
     */
    async commitUpload() {
      if (this.validationResult.totalErrors > 0) {
        alert('No se puede cargar: aún existen celdas con inconsistencias.');
        return;
      }

      const textoBotonCargar = this.dom.btnCargar.textContent;
      this.dom.btnCargar.disabled = true;
      this.dom.btnCargar.textContent = '⏳ Geocodificando y persistiendo en el sistema...';

      try {
        const geocoder = window.AncashGeocoder || { geocode: (addr) => ({ lat: -10.04780, lng: -78.15480, sector: 'Sector I - Centro', matched: true }) };
        const hearts = window.HeartsEngine || { evaluatePatient: () => ({ semaforo: 'green', estado_control: 'Controlado' }) };

        // 1. Transformar filas limpias en pacientes con recursos clínicos FHIR y coordenadas
        const esquema = window.PadronSchema;
        // Id estable de un paciente sin documento: huella de nombre, fecha de nacimiento y sexo (reimportar no lo duplica)
        const huellaSinDocumento = r => {
          const base = [r.apellidos_nombres, r.fecha_nacimiento, r.sexo].map(v => String(v || '').trim().toUpperCase()).join('|');
          let h = 0x811c9dc5;
          for (let i = 0; i < base.length; i++) { h ^= base.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
          return 'pac-sd-' + h.toString(16).padStart(8, '0');
        };
        const calcEdad = window.PadronCalculadora && window.PadronCalculadora.calcularEdad;
        const processedPatients = this.patients.map((r, idx) => {
          // DNI solo dígitos; carné de extranjería y pasaporte conservan sus letras; «Sin documento» no lleva número
          const dni = esquema && esquema.documentoNormalizado ? esquema.documentoNormalizado(r) : String(r.nro_documento || '').replace(/\D/g, '');
          const sinDocumento = esquema && esquema.tipoDocumento ? esquema.tipoDocumento(r) === 'SIN' : false;
          const direccion = r.direccion || '';
          const geo = geocoder.geocode(direccion || 'Huarmey');

          // Buscar última PAS y PAD registradas en el año
          let pas = null, pad = null;
          const meses = ['dic', 'nov', 'oct', 'set', 'ago', 'jul', 'jun', 'may', 'abr', 'mar', 'feb', 'ene'];
          for (const m of meses) {
            if (r[`pas_${m}`]) { pas = parseInt(r[`pas_${m}`], 10); }
            if (r[`pad_${m}`]) { pad = parseInt(r[`pad_${m}`], 10); }
            if (pas && pad) break;
          }

          const hba1c = r.hba1c ? parseFloat(r.hba1c) : null;
          const glucosa = r.glucosa ? parseInt(r.glucosa, 10) : null;
          // Sin fecha real del control no se crea ninguna atención (antes se ponía la de hoy)
          const fechaUltima = r.fecha_ultimo_control || '';
          const fechaProxima = r.proxima_cita || null;

          const pObj = {
            id: sinDocumento ? huellaSinDocumento(r) : `pac-00001741-${dni}`,
            dni,
            tipo_documento: r.tipo_documento || 'DNI',
            historia_clinica: r.historia_clinica || '',
            apellidos_nombres: String(r.apellidos_nombres || '').toUpperCase(),
            sexo: r.sexo || '',
            fecha_nacimiento: r.fecha_nacimiento || '',
            seguro: r.seguro_salud || '',
            telefono: r.telefono || '',
            direccion,
            sector_sanitario: r.sector || geo.sector || 'Sector I – Centro',
            distrito: r.sector && r.sector.includes('Culebras') ? 'Culebras' : (r.sector && r.sector.includes('Huayán') ? 'Huayán' : 'Huarmey'),
            establecimiento_adscripcion: r.establecimiento_adscripcion || 'Hospital de Apoyo Huarmey (00001741, II-1)',
            puerta_entrada_id: codigoRenipress(r.establecimiento_control) || undefined,
            establecimiento_control: r.establecimiento_control || '',
            puerta_entrada: r.establecimiento_control || '',
            latitud: geo.lat,
            longitud: geo.lng,
            conditions: [],
            observations: (fechaUltima && (pas || pad || hba1c || glucosa)) ? [
              {
                fecha_registro: fechaUltima,
                pa_sistolica: pas,
                pa_diastolica: pad,
                hba1c: hba1c,
                glucosa: glucosa,
                estado_control: (pas >= 140 || pad >= 90) ? 'No Controlado' : 'Controlado'
              }
            ] : [],
            appointments: fechaProxima ? [{ fecha_cita: fechaProxima, estado: 'booked' }] : []
          };

          if (r.cie10_hta) {
            pObj.conditions.push({ cie10_cod: r.cie10_hta.split('–')[0].trim(), diagnostico: 'Hipertensión Arterial' });
          }
          if (r.cie10_dm) {
            pObj.conditions.push({ cie10_cod: r.cie10_dm.split('–')[0].trim(), diagnostico: 'Diabetes Mellitus Tipo 2' });
          }
          if (r.cie10_erc) {
            pObj.conditions.push({ cie10_cod: r.cie10_erc.split('–')[0].trim(), diagnostico: 'Enfermedad Renal Crónica' });
          }

          // Se conservan todas las columnas del padrón v4 que vienen en la fila (fechas de examen, presiones por mes, etc.),
          // para que lo que se carga sea lo mismo que luego se exporta y se mide en el tablero.
          const camposV4 = {};
          schema.COLUMNAS.forEach(col => {
            const v = r[col.key];
            if (v !== undefined && v !== null && String(v).trim() !== '') camposV4[col.key] = v;
          });

          // Evaluación de semáforo HEARTS
          const evalRes = hearts.evaluatePatient(pObj);
          return {
            ...camposV4,
            ...pObj,
            ...evalRes,
            pa_sistolica: pas,
            pa_diastolica: pad,
            hba1c: hba1c,
            glucosa: glucosa,
            diagnosticos: pObj.conditions.map(c => c.cie10_cod),
            sector: pObj.sector_sanitario,
            // C-06: edad cumplida a hoy (antes: año actual menos año de nacimiento)
            edad: (r.fecha_nacimiento && calcEdad) ? calcEdad(r.fecha_nacimiento) : (r.edad ? parseInt(r.edad, 10) : null),
            estado_paciente: r.estado_paciente || 'Activo',
            tratamiento_hta: r.tratamiento_hta || '',
            tratamiento_dm: r.tratamiento_dm || '',
            consentimiento: r.consentimiento || ''
          };
        });

        // C-08: avisar ANTES de cargar si hay documentos que ya están en el padrón (sus datos se actualizarán)
        const existentes = processedPatients.filter(p => p.dni && window.app && window.app.patientMap && window.app.patientMap.has(String(p.dni)));
        if (existentes.length > 0) {
          const muestra = existentes.slice(0, 5).map(p => `${p.dni} ${p.apellidos_nombres}`).join('\n');
          const resto = existentes.length > 5 ? `\n… y ${existentes.length - 5} más` : '';
          const seguir = window.confirm(`${existentes.length} paciente(s) del archivo ya están en el padrón:\n${muestra}${resto}\n\nSus datos se ACTUALIZARÁN con los del archivo (los diagnósticos previos se conservan). ¿Continuar?`);
          if (!seguir) {
            this.dom.btnCargar.disabled = false;
            this.dom.btnCargar.textContent = textoBotonCargar;
            return;
          }
        }
        // C-07: pacientes cuya dirección no se pudo ubicar en el mapa
        const sinUbicar = processedPatients.filter(p => p.latitud === null || p.latitud === undefined || p.longitud === null || p.longitud === undefined);

        // 2. Persistir en Backend a través de la API
        let savedInBackend = false;
        let backendErrorMsg = '';
        if (window.app && window.app.session && window.app.session.authFetch) {
          try {
            const resp = await window.app.session.authFetch('/api/padron/importar-lote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ patients: processedPatients })
            });
            if (resp && resp.ok) {
              savedInBackend = true;
            } else if (resp) {
              const errData = await resp.json().catch(() => ({}));
              backendErrorMsg = (errData.issue && errData.issue[0] && errData.issue[0].diagnostics) || errData.error || `HTTP ${resp.status}`;
            }
          } catch (e) {
            console.warn('No se pudo persistir en backend REST, usando memoria local:', e);
            backendErrorMsg = e.message;
          }
        }

        // 3. Sincronizar en la Aplicación (combinando con existentes)
        if (window.app) {
          if (typeof window.app.upsertPatients === 'function') {
            window.app.upsertPatients(processedPatients);
          } else {
            window.app.setPatients(processedPatients);
          }
          window.app.render();

          if (savedInBackend) {
            window.app.showToast(`🎉 ¡Ingesta Exitosa! Se sincronizaron y guardaron ${processedPatients.length} pacientes en el servidor.`, 'success', 6000);
            if (sinUbicar.length > 0) {
              window.app.showToast(`⚠️ ${sinUbicar.length} paciente(s) no se pudieron ubicar en el mapa por su dirección (no aparecen como pin): ${sinUbicar.slice(0, 3).map(p => p.apellidos_nombres).join(', ')}${sinUbicar.length > 3 ? '…' : ''}. Revise la dirección en su ficha.`, 'warning', 9000);
            }
          } else if (backendErrorMsg) {
            window.app.showToast(`⚠️ Pacientes cargados en pantalla, pero el servidor reportó: ${backendErrorMsg}`, 'warning', 7000);
          } else {
            window.app.showToast(`🎉 Se cargaron y georreferenciaron ${processedPatients.length} pacientes en memoria local.`, 'info', 5000);
          }
        }

        this.close();
      } catch (err) {
        alert('Error al consolidar la carga: ' + err.message);
        this.dom.btnCargar.disabled = false;
        this.dom.btnCargar.textContent = 'Intentar Cargar Nuevamente';
      }
    }
  }

  return new PadronGridModal();
});
