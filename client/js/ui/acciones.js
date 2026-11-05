/**
 * acciones.js
 * Reemplaza los manejadores en línea (onclick="…", onchange="…") por atributos de datos y un solo listener
 * delegado (F2-17): así la CSP puede prohibir scripts en línea ('unsafe-inline' fuera de script-src) y un XSS
 * que logre insertar HTML ya no ejecuta código.
 *
 *   <button data-accion="switchView" data-arg="mapa">           → clic
 *   <select data-cambio="selectRis">                             → cambio (recibe el valor del control)
 *   <input type="checkbox" data-cambio="capa" data-capa="pacientes">
 *
 * Solo se ejecutan las acciones de las listas de abajo (nunca un nombre arbitrario de window.app).
 * Los listeners van en fase de CAPTURA: Leaflet detiene la propagación de los clics dentro de sus popups.
 */
(function () {
  'use strict';

  const app = () => window.app;
  const mapa = () => (window.app && window.app.mapManager) || null;
  const bool = v => (v === 'true' ? true : (v === 'false' ? false : undefined));
  const quitarClase = (id, clase) => { const el = document.getElementById(id); if (el) el.classList.remove(clase); };
  const cerrarFicha = () => quitarClase('modal-patient-detail', 'active');
  const marcarNavMovil = el => {
    if (!el.parentElement) return;
    el.parentElement.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
  };
  const llamar = metodo => (el, arg) => { if (typeof app()[metodo] === 'function') app()[metodo](arg); };
  const llamarSinArg = metodo => () => { if (typeof app()[metodo] === 'function') app()[metodo](); };

  const CLIC = {
    toggleNavRail: llamarSinArg('toggleNavRail'),
    irAlInicio: () => { app().switchView('mapa'); if (mapa()) mapa().home(); },
    abrirRegistroClinico: llamarSinArg('abrirRegistroClinico'),
    switchView: llamar('switchView'),
    abrirModalPadronGrid: llamarSinArg('abrirModalPadronGrid'),
    clicEn: (el, arg) => { const destino = document.getElementById(arg); if (destino) destino.click(); },
    toggleHeartsPanel: (el, arg) => app().toggleHeartsPanel(bool(arg)),
    toggleLeftSidebar: (el, arg) => app().toggleLeftSidebar(bool(arg)),
    mapaInicio: () => { if (mapa()) mapa().home(); },
    mapaAcercar: () => { if (mapa()) mapa().zoomIn(); },
    mapaAlejar: () => { if (mapa()) mapa().zoomOut(); },
    switchHeartsTab: llamar('switchHeartsTab'),
    exportarPadronExcel: llamarSinArg('exportarPadronExcel'),
    renderDashboard: llamarSinArg('renderDashboard'),
    loadIndicadoresConvenio: llamarSinArg('loadIndicadoresConvenio'),
    confirmarPreCita: llamarSinArg('confirmarPreCita'),
    cerrarModalConsentimiento: llamarSinArg('cerrarModalConsentimiento'),
    registrarConsentimiento: llamar('registrarConsentimiento'),
    navMovil: (el, arg) => {
      if (arg === 'mapa') app().closeAllDrawers();
      else if (arg === 'pacientes' || arg === 'ingesta') { app().toggleHeartsPanel(true); app().switchHeartsTab(arg); }
      else if (arg === 'capas') app().toggleLeftSidebar(true);
      marcarNavMovil(el);
    },
    cerrarModal: (el, arg) => quitarClase(arg, 'active'),
    quitarElemento: (el, arg) => { const destino = document.getElementById(arg); if (destino) destino.remove(); },
    verEnMapa: () => { app().switchView('mapa'); app().toggleHeartsPanel(true); },
    filtrarPorPuerta: llamar('filtrarPorPuerta'),
    openPatientDetail: llamar('openPatientDetail'),
    centrarPaciente: llamar('centrarPaciente'),
    enviarWhatsApp: llamar('enviarWhatsApp'),
    fichaUbicar: (el, arg) => { cerrarFicha(); app().centrarPaciente(arg); },
    fichaRegistrar: (el, arg) => { cerrarFicha(); if (window.RegistroClinicoModal) window.RegistroClinicoModal.open(arg); },
    fichaPreCita: (el, arg) => { cerrarFicha(); app().abrirModalPreCita(arg); },
    selectRis: llamar('selectRis'),
    selectZona: llamar('selectZona'),
    seleccionarHospitalReferencia: llamar('seleccionarHospitalReferencia'),
    trazarReferenciaHaciaHospital: llamar('trazarReferenciaHaciaHospital')
  };

  const CAMBIO = {
    setBaseMapGlobal: el => app().setBaseMapGlobal(el.value),
    selectRis: el => app().selectRis(el.value),
    selectZona: el => app().selectZona(el.value),
    selectPuertaEntrada: el => app().selectPuertaEntrada(el.value),
    seleccionarHospitalReferencia: el => app().seleccionarHospitalReferencia(el.value),
    capa: el => {
      const mm = mapa();
      const capa = mm && mm.layers && mm.layers[el.getAttribute('data-capa')];
      if (!capa) return;
      if (el.checked) capa.addTo(mm.map); else capa.remove();
    }
  };

  function delegar(tabla, atributo) {
    return ev => {
      const el = ev.target && ev.target.closest ? ev.target.closest('[' + atributo + ']') : null;
      if (!el || !window.app) return;
      const nombre = el.getAttribute(atributo);
      if (!Object.prototype.hasOwnProperty.call(tabla, nombre)) return;
      if (el.disabled) return;
      tabla[nombre](el, el.getAttribute('data-arg'), ev);
    };
  }

  document.addEventListener('click', delegar(CLIC, 'data-accion'), true);
  document.addEventListener('change', delegar(CAMBIO, 'data-cambio'), true);

  // Para las pruebas: lista de acciones conocidas
  window.AccionesUi = { clic: Object.keys(CLIC), cambio: Object.keys(CAMBIO) };
})();
