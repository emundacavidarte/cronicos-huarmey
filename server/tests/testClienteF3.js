/**
 * testClienteF3.js
 * Correcciones del cliente de la Fase 3 (agente C: seguridad y sesión): C3-01 a C3-06, K3-03, K3-04/K3-06 (textos de la
 * ficha), T3-05 (la cuadrícula falla cerrada), la importación HOSIX con filas observadas y recargarPacientes (P3-05).
 *
 * Sin servidor ni navegador. Se carga el código REAL del cliente (main.js, mapManager.js, acciones.js, padronGridModal.js)
 * en un contexto `vm` con un DOM mínimo y se ejecuta; lo que no se puede ejecutar así (CSS, marcado) se lee del archivo.
 * Datos inventados (DNI 96…). Ejecutar: node server/tests/testClienteF3.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', '..', 'client');
const leer = rel => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const fechaLima = require(path.join(RAIZ, 'js', 'utils', 'fechaLima.js'));
const reglas = require(path.join(RAIZ, 'js', 'clinical', 'reglasClinicas.js'));
const AuthSession = require(path.join(RAIZ, 'js', 'auth', 'session.js'));
const schema = require(path.join(RAIZ, 'js', 'data', 'padronSchema.js'));

let passed = 0;
let failed = 0;

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  OK    ' + name);
  } catch (e) {
    failed++;
    console.log('  FALLA ' + name + '\n        ' + String(e && e.message ? e.message : e).split('\n').join('\n        '));
  }
}

// ---------------------------------------------------------------------------------------------
// DOM mínimo (solo lo que usan las funciones que se prueban)
// ---------------------------------------------------------------------------------------------
function elemento(tag) {
  const clases = new Set();
  const el = {
    tagName: String(tag || 'div').toUpperCase(), style: {}, children: [], innerHTML: '', textContent: '', className: '', id: '', dataset: {}, attrs: {},
    value: '', disabled: false, clics: 0, removido: false,
    classList: {
      add: c => clases.add(c), remove: c => clases.delete(c), contains: c => clases.has(c),
      toggle: (c, f) => { if (f === undefined ? !clases.has(c) : f) clases.add(c); else clases.delete(c); }
    },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    appendChild(c) { this.children.push(c); return c; },
    remove() { this.removido = true; },
    click() { this.clics++; },
    addEventListener() {}, removeEventListener() {}, focus() {}, toggleAttribute() {}, scrollIntoView() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }, contains() { return false; }
  };
  return el;
}

function documentoFalso() {
  const registro = new Map();
  const doc = {
    body: elemento('body'),
    createElement: tag => elemento(tag),
    createDocumentFragment: () => elemento('fragment'),
    createTextNode: t => ({ textContent: t }),
    getElementById: id => registro.get(id) || null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    registrar(id, el) { const e = el || elemento('div'); e.id = id; registro.set(id, e); return e; }
  };
  return doc;
}

const NOTIFICADOR_SI = { estadoConsentimiento: () => 'si', generarEnlace: () => 'https://wa.me/51943111222?text=x' };

/** Carga main.js (class App) en un contexto aislado. Devuelve { sb, App, doc }. */
function cargarMain(extra) {
  const doc = documentoFalso();
  class FileReaderFalso { readAsText(f) { this.onload({ target: { result: f.__texto } }); } }
  const sb = {
    console: { log() {}, info() {}, warn() {}, error() {} }, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, Date, Math, JSON, Intl, URL, Blob: class {},
    FileReader: FileReaderFalso, navigator: {}, innerWidth: 1366, addEventListener() {}
  };
  sb.window = sb;
  sb.document = doc;
  sb.FechaLima = fechaLima;
  sb.ReglasClinicas = reglas;
  sb.AuthSession = AuthSession;
  sb.WhatsappNotifier = NOTIFICADOR_SI;
  Object.assign(sb, extra || {});
  vm.createContext(sb);
  vm.runInContext(leer('js/main.js') + '\n;window.__App = App;', sb, { filename: 'main.js' });
  return { sb, App: sb.__App, doc };
}

/** Una instancia de App lista para probar, con la sesión de un usuario y avisos capturados. */
function nuevaApp(extra, rol) {
  const { sb, App, doc } = cargarMain(extra);
  const app = new App();
  app.session = { getUser: () => ({ username: 'prueba', role: rol || 'ADMIN' }), getToken: () => 'T1', isLoggedIn: () => true, authFetch: async () => { throw new Error('sin red'); } };
  app.avisos = [];
  app.showToast = (m, t) => { app.avisos.push({ m: String(m), t }); };
  app.mapManager = { renderPatients() {}, flyTo() {}, layers: { pacientes: { clearLayers() {} } }, map: { closePopup() {}, removeLayer() {} }, searchPin: null };
  return { app, sb, doc };
}

const H = 'Hospital de Apoyo Huarmey (00001741, II-1)';
const HOY = fechaLima.hoy();
const mas = n => fechaLima.hoy(n);
const dmy = iso => iso.split('-').reverse().join('/');

function paciente(extra) {
  return Object.assign({
    id: 'pac-t3-1', dni: '96000001', apellidos_nombres: 'PACIENTE UNO PRUEBA', sexo: 'F', edad: 60, fecha_nacimiento: '1966-01-02', telefono: '943111222',
    direccion: 'Jr. Bolognesi 250', sector_sanitario: 'Sector 01', puerta_entrada: 'Hospital de Apoyo Huarmey', estado_control: 'No Controlado',
    semaforo: 'green', dias_restantes: 40, dias_vencido: 0, fecha_limite: mas(40), fecha_ultimo_control: mas(-10), pa_sistolica: 150, pa_diastolica: 95,
    hba1c: 8, glucosa: 150, consentimiento: 'Sí, firmado', diagnosticos: ['I10'], conditions: [{ cie10_cod: 'I10', diagnostico: 'Hipertensión Arterial' }],
    observations: [], appointments: [{ fecha_cita: mas(40), estado: 'booked' }]
  }, extra || {});
}

// ---------------------------------------------------------------------------------------------
// Carga hostil (la misma de A2): si llega como ELEMENTO, en el HTML aparece «<u id="xss_…">» sin escapar
// ---------------------------------------------------------------------------------------------
const idDe = k => k.replace(/[^A-Za-z0-9_]/g, '_');
const PAY = k => `"'><u id="xss_${idDe(k)}">ZZ</u>`;
const CRUDO = /<u id="xss_/;
const TOP = ['direccion', 'historia_clinica', 'telefono', 'sector_sanitario', 'sector', 'financiador', 'seguro_salud', 'seguro', 'tipo_documento',
  'establecimiento_adscripcion', 'establecimiento_control', 'puerta_entrada', 'estado_control', 'diagnostico_nutricional', 'riesgo_cv', 'dano_organo_blanco',
  'otras_patologias', 'tratamiento_hta', 'tratamiento_dm', 'estado_empadronamiento', 'observacion', 'observaciones', 'nota_duplicado_padron', 'hba1c_texto',
  'peso', 'talla', 'imc', 'pab', 'creatinina', 'microalbumina', 'depuracion_creatinina', 'colesterol_total', 'colesterol_ldl', 'colesterol_hdl', 'trigliceridos',
  'edad', 'frecuencia_hearts', 'fila_excel', 'dias_restantes', 'dias_vencido', 'fecha_examenes', 'fecha_estado', 'fecha_limite', 'fecha_nacimiento',
  'consentimiento_fecha', 'pas_ene', 'pad_ene', 'pas_oct', 'pad_oct', 'glucosa', 'hba1c', 'pa_sistolica', 'pa_diastolica', 'estatina', 'aspirina_aas',
  'meses_medicacion', 'estado_paciente', 'semaforo', 'sexo', 'apellidos_nombres', 'dni', 'consentimiento', 'actualizado_por', 'dx_confirmado',
  'enfermedad_cardiovascular', 'controlado_estable'];
const NESTED = ['conditions.cie10_cod', 'conditions.diagnostico', 'diagnosticos.0', 'observations.estado_control', 'appointments.estado'];

function conCarga(p, k) {
  const carga = PAY(k);
  const [a, b] = k.split('.');
  if (b === undefined) { p[a] = carga; return p; }
  if (a === 'diagnosticos') { p.diagnosticos = [carga]; return p; }
  const base = (p[a] && p[a][0]) || {};
  p[a] = [Object.assign({}, base, { [b]: carga })];
  return p;
}

function htmlDeFicha(app, doc, p) {
  doc.body.children.length = 0;
  app.patientMap.clear();
  app.patientMap.set(String(p.id), p);
  app.openPatientDetail(p.id);
  const modal = doc.body.children[0];
  assert.ok(modal, 'la ficha no se pintó');
  return modal.innerHTML;
}

const VARIANTES = {
  'verde (cita lejana)': {},
  'amarillo (cita próxima)': { semaforo: 'yellow', dias_restantes: 3, fecha_limite: mas(3) },
  'rojo (cita vencida)': { semaforo: 'red', dias_restantes: -5, dias_vencido: 5, fecha_limite: mas(-5) },
  'fallecido': { fallecido: true, semaforo: 'black', estado_paciente: 'Fallecido' }
};

// ---------------------------------------------------------------------------------------------
// Lectura estática de usos de acciones.js
// ---------------------------------------------------------------------------------------------
function archivosJs(dir, acc) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) archivosJs(f, acc); else if (f.endsWith('.js')) acc.push(f);
  });
  return acc;
}
const ACCIONES_JS = path.join(RAIZ, 'js', 'ui', 'acciones.js');
const FUENTES_MARCADO = [path.join(RAIZ, 'index.html')].concat(archivosJs(path.join(RAIZ, 'js'), []).filter(f => f !== ACCIONES_JS));

function usosDeAccion(nombres) {
  const usos = [];
  for (const f of FUENTES_MARCADO) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.matchAll(/data-accion=["']([A-Za-z0-9_]+)["']/g)) {
      if (!nombres.includes(m[1])) continue;
      const ini = t.lastIndexOf('<', m.index);
      const fin = t.indexOf('>', m.index);
      const etiqueta = t.slice(ini, fin + 1);
      const arg = /data-arg=["']([^"']*)["']/.exec(etiqueta);
      usos.push({ archivo: path.relative(RAIZ, f), accion: m[1], arg: arg ? arg[1] : null });
    }
  }
  return usos;
}

function cargarAcciones() {
  const registrados = [];
  const doc = documentoFalso();
  doc.addEventListener = (tipo, f, captura) => registrados.push({ tipo, f, captura });
  const sb = { console, document: doc, app: { switchView() {}, toggleHeartsPanel() {} } };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(ACCIONES_JS, 'utf8'), sb, { filename: 'acciones.js' });
  const clic = registrados.find(r => r.tipo === 'click');
  const cambio = registrados.find(r => r.tipo === 'change');
  return { sb, doc, clic: clic && clic.f, cambio: cambio && cambio.f, capturaClic: clic && clic.captura };
}
function dispararClic(manejador, accion, arg) {
  const el = elemento('button');
  el.attrs['data-accion'] = accion;
  if (arg !== undefined) el.attrs['data-arg'] = arg;
  manejador({ target: { closest: () => el } });
}

// ---------------------------------------------------------------------------------------------
// CSS: z-index de una regla (se toma la última declaración de la regla con ese selector exacto)
// ---------------------------------------------------------------------------------------------
function zDe(archivoCss, selector) {
  const css = leer(path.join('css', archivoCss)).replace(/\/\*[\s\S]*?\*\//g, '');
  let z = null;
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectores = m[1].split(',').map(s => s.trim());
    if (!selectores.includes(selector)) continue;
    const d = [...m[2].matchAll(/z-index\s*:\s*(\d+)/g)];
    if (d.length) z = Number(d[d.length - 1][1]);
  }
  assert.notStrictEqual(z, null, `no se halló z-index para ${selector} en ${archivoCss}`);
  return z;
}

// ---------------------------------------------------------------------------------------------
// PadronGridModal con un DOM falso
// ---------------------------------------------------------------------------------------------
const PGM = require(path.join(RAIZ, 'js', 'ui', 'padronGridModal.js'));
const parserExcel = require(path.join(RAIZ, 'js', 'data', 'padronExcelParser.js'));

function nuevaCuadricula() {
  const m = new PGM.constructor();
  const modal = elemento('div');
  m.dom = {
    modal, fileInfo: elemento('div'), scoreBadge: elemento('div'), countAll: elemento('span'), countErrors: elemento('span'), searchInput: elemento('input'),
    btnAutofillEess: elemento('button'), errorsPanel: elemento('div'), errorsPillsCount: elemento('span'), errorsPillsWrap: elemento('div'),
    gridWrapper: elemento('div'), thead: elemento('thead'), tbody: elemento('tbody'), emptyMsg: elemento('div'), statusMsg: elemento('div'),
    btnCargar: elemento('button'), filterAll: elemento('button'), filterErrors: elemento('button')
  };
  m.isInitialized = true;
  return m;
}

function filaValida(extra) {
  return Object.assign({
    tipo_documento: 'DNI', nro_documento: '96000001', apellidos_nombres: 'Paciente Uno Prueba', sexo: 'Femenino', fecha_nacimiento: '1966-05-10',
    seguro_salud: 'SIS', sector: 'Sector I – Centro', direccion: 'Jr. Bolognesi 250', establecimiento_adscripcion: H, establecimiento_control: H,
    estado_paciente: 'Activo', consentimiento: '', cie10_hta: 'I10 – Hipertensión', fecha_ultimo_control: '2026-10-20', pas_oct: '150', pad_oct: '95',
    proxima_cita: '2026-12-01'
  }, extra || {});
}

/** Entorno de window para commitUpload. `resp` es lo que devuelve authFetch (o una función que lanza). */
function entornoCarga(resp, quitar) {
  const llamadas = { fetch: [], upsert: [], set: [], render: 0, toasts: [] };
  const app = {
    patientMap: new Map(),
    session: { authFetch: async (url, init) => { llamadas.fetch.push({ url, init }); if (typeof resp === 'function') return resp(); return resp; } },
    upsertPatients: l => llamadas.upsert.push(l),
    setPatients: l => llamadas.set.push(l),
    render: () => { llamadas.render++; },
    showToast: (m, t) => llamadas.toasts.push({ m: String(m), t })
  };
  const win = {
    app, confirm: () => true, PadronSchema: schema, PadronCalculadora: { calcularEdad: () => 59 }, ReglasClinicas: reglas,
    AncashGeocoder: { geocode: () => ({ lat: -10.0478, lng: -78.1548, sector: 'Sector I – Centro', matched: true }) },
    HeartsEngine: { evaluatePatient: () => ({ semaforo: 'green', estado_control: 'Controlado' }) }
  };
  (quitar || []).forEach(k => delete win[k]);
  return { win, llamadas };
}

async function conWindow(win, fn) {
  const previo = global.window;
  global.window = win;
  try { return await fn(); } finally { if (previo === undefined) delete global.window; else global.window = previo; }
}

// ---------------------------------------------------------------------------------------------
// mapManager.js en un contexto aislado
// ---------------------------------------------------------------------------------------------
function cargarMapManager() {
  const capturas = { tooltips: [], popups: [], iconos: [] };
  const sb = { console, setTimeout: () => 0, Date, Intl };
  sb.window = sb;
  sb.document = documentoFalso();
  sb.ReglasClinicas = reglas;
  sb.L = {
    divIcon: o => { capturas.iconos.push(o); return o; },
    marker: (ll, o) => ({ icon: o && o.icon, bindTooltip(h) { capturas.tooltips.push(h); }, bindPopup(f) { capturas.popups.push(f); }, addTo() { return this; } }),
    circleMarker: () => ({ bindTooltip(h) { capturas.tooltips.push(h); }, bindPopup() {}, addTo() { return this; } })
  };
  vm.createContext(sb);
  vm.runInContext(leer('js/map/mapManager.js') + '\n;window.__MM = MapManager;', sb, { filename: 'mapManager.js' });
  const mm = Object.create(sb.__MM.prototype);
  mm.layers = { pacientes: { clearLayers() {}, addLayer() {} } };
  mm.map = { removeLayer() {} };
  return { mm, sb, capturas };
}

// =============================================================================================
async function main() {
  console.log('Cliente de la Fase 3: seguridad, sesión y textos de la ficha\n');

  // ------------------------------------------------------------------ C3-01 / C3-03 / C3-04
  await step('C3-01 la nota de trazabilidad (nota_duplicado_padron) se pinta como texto, no como HTML', () => {
    const { app, doc } = nuevaApp();
    const html = htmlDeFicha(app, doc, paciente({ nota_duplicado_padron: PAY('nota') }));
    assert.ok(!CRUDO.test(html), 'la nota llegó como elemento en la ficha');
    assert.ok(html.includes('&lt;u id=&quot;xss_nota'), 'el texto de la nota debe verse escapado');
    assert.ok(/Trazabilidad/.test(html), 'la nota sigue apareciendo en la ficha');
  });

  await step('C3-01/03 ficha: ningún campo del paciente (edad, fecha_*, frecuencia, presiones…) llega como elemento, en las cuatro variantes', () => {
    const { app, doc } = nuevaApp();
    const hallados = [];
    for (const [nombre, extra] of Object.entries(VARIANTES)) {
      for (const k of TOP.concat(NESTED)) {
        const p = conCarga(paciente(extra), k);
        if (k !== 'id') p.id = 'pac-t3-1';
        let html;
        try { html = htmlDeFicha(app, doc, p); } catch (e) { continue; /* un tipo inesperado que corta la ficha no inyecta nada */ }
        if (CRUDO.test(html)) hallados.push(`${k} [${nombre}]`);
      }
    }
    assert.deepStrictEqual(hallados, [], 'campos que llegan sin escape a la ficha');
  });

  await step('C3-03 tarjeta de la lista: ningún campo llega como elemento (edad se escapa)', () => {
    const { app, doc } = nuevaApp();
    const hallados = [];
    for (const k of TOP.concat(NESTED)) {
      const p = conCarga(paciente(), k);
      p.id = 'pac-t3-1';
      doc.body.children.length = 0;
      const lista = doc.registrar('patient-list');
      lista.children.length = 0;
      try { app.renderPatientList([p]); } catch (e) { continue; }
      const fragmento = lista.children[0];
      const tarjeta = fragmento && fragmento.children[0];
      if (tarjeta && CRUDO.test(tarjeta.innerHTML)) hallados.push(k);
    }
    assert.deepStrictEqual(hallados, []);
  });

  await step('C3-03 popup y tooltip del mapa: ningún campo llega como elemento (frecuencia_hearts y edad se escapan)', () => {
    const { mm, capturas } = cargarMapManager();
    const hallados = [];
    for (const k of TOP.concat(NESTED)) {
      const p = conCarga(paciente(), k);
      p.id = 'pac-t3-1';
      let html = '';
      try {
        html = mm.buildPatientPopupHtml(p, '#16A34A', false);
        capturas.tooltips.length = 0;
        mm.renderPatients([p]);
        html += capturas.tooltips.join('');
      } catch (e) { continue; }
      if (CRUDO.test(html)) hallados.push(k);
    }
    assert.deepStrictEqual(hallados, []);
  });

  await step('C3-04 el pin de búsqueda del mapa no interpreta como HTML lo que escribe el usuario', () => {
    const { mm, capturas } = cargarMapManager();
    mm.mostrarPinBusqueda(-10.05, -78.15, PAY('busqueda').toUpperCase().replace('XSS_', 'xss_'));
    const html = capturas.iconos.map(i => i.html).join('');
    assert.ok(!/<U ID="XSS_|<u id="xss_/i.test(html), 'el texto buscado llegó como elemento');
    mm.mostrarPinBusqueda(-10.05, -78.15, 'JR. BOLOGNESI 250');
    assert.ok(capturas.iconos[capturas.iconos.length - 1].html.includes('JR. BOLOGNESI 250'), 'un texto normal se sigue viendo');
  });

  await step('C3-03 línea de tiempo de eventos: ningún campo llega como elemento', () => {
    const { app } = nuevaApp();
    const ev = {};
    for (const k of ['tipo', 'estado', 'detalle', 'establecimiento', 'destino_establecimiento', 'registrado_por', 'rol_registrante', 'fecha']) ev[k] = PAY(k);
    const html = app.renderEventosHtml([ev]);
    assert.ok(!CRUDO.test(html));
  });

  // ------------------------------------------------------------------ C3-01 lista cerrada de ids en acciones.js
  await step('C3-01 acciones.js expone la lista cerrada de ids de clicEn, quitarElemento y cerrarModal', () => {
    const { sb } = cargarAcciones();
    const ids = sb.AccionesUi && sb.AccionesUi.ids;
    assert.ok(ids && typeof ids === 'object', 'AccionesUi.ids no existe');
    assert.deepStrictEqual(Object.keys(ids).sort(), ['cerrarModal', 'clicEn', 'quitarElemento']);
    for (const k of Object.keys(ids)) assert.ok(Array.isArray(ids[k]) && ids[k].length > 0, k + ' sin ids');
  });

  await step('C3-01 TODO id que usan index.html y las plantillas en esas tres acciones está en la lista (y ninguno es dinámico)', () => {
    const { sb } = cargarAcciones();
    const ids = sb.AccionesUi.ids;
    const usos = usosDeAccion(['clicEn', 'quitarElemento', 'cerrarModal']);
    assert.ok(usos.length >= 7, 'se esperaban al menos 7 usos y se hallaron ' + usos.length);
    const fuera = usos.filter(u => u.arg === null || /\$\{/.test(u.arg) || !(ids[u.accion] || []).includes(u.arg));
    assert.deepStrictEqual(fuera.map(u => `${u.archivo}: ${u.accion}(${u.arg})`), []);
  });

  await step('C3-01 la lista no tiene ids huérfanos: cada id se usa y existe en el marcado', () => {
    const { sb } = cargarAcciones();
    const ids = sb.AccionesUi.ids;
    const usos = usosDeAccion(Object.keys(ids));
    const textoFuentes = FUENTES_MARCADO.map(f => fs.readFileSync(f, 'utf8')).join('\n');
    const huerfanos = [];
    for (const [accion, lista] of Object.entries(ids)) {
      for (const id of lista) {
        if (!usos.some(u => u.accion === accion && u.arg === id)) huerfanos.push(`${accion}:${id} (sin uso)`);
        const definido = new RegExp(`id=["']${id}["']|\\.id\\s*=\\s*["']${id}["']`).test(textoFuentes);
        if (!definido) huerfanos.push(`${accion}:${id} (nadie crea ese id)`);
      }
    }
    assert.deepStrictEqual(huerfanos, []);
  });

  await step('C3-01 un botón inyectado con un id fuera de la lista no actúa (clicEn, quitarElemento, cerrarModal)', () => {
    const { doc, clic } = cargarAcciones();
    assert.ok(typeof clic === 'function', 'acciones.js no registró el listener de clic');
    const logout = doc.registrar('btn-logout');
    const acceso = doc.registrar('login-overlay'); acceso.classList.add('active');
    const otro = doc.registrar('modal-registro-clinico'); otro.classList.add('active');
    dispararClic(clic, 'clicEn', 'btn-logout');
    dispararClic(clic, 'quitarElemento', 'login-overlay');
    dispararClic(clic, 'cerrarModal', 'login-overlay');
    dispararClic(clic, 'cerrarModal', 'modal-registro-clinico');
    dispararClic(clic, 'quitarElemento', 'btn-logout');
    assert.strictEqual(logout.clics, 0, 'clicEn hizo clic en #btn-logout');
    assert.strictEqual(logout.removido, false, 'quitarElemento quitó #btn-logout');
    assert.strictEqual(acceso.removido, false, 'quitarElemento quitó la pantalla de acceso');
    assert.ok(acceso.classList.contains('active'), 'cerrarModal cerró la pantalla de acceso');
    assert.ok(otro.classList.contains('active'), 'cerrarModal cerró otro modal');
  });

  await step('C3-01 los ids de la lista siguen funcionando (btn-usuarios, reference-inspector-card, modal-precita, modal-patient-detail)', () => {
    const { doc, clic, capturaClic } = cargarAcciones();
    assert.strictEqual(capturaClic, true, 'el listener debe ir en fase de captura (Leaflet detiene la propagación en sus popups)');
    const usuarios = doc.registrar('btn-usuarios');
    const tarjeta = doc.registrar('reference-inspector-card');
    const pre = doc.registrar('modal-precita'); pre.classList.add('active');
    const ficha = doc.registrar('modal-patient-detail'); ficha.classList.add('active');
    dispararClic(clic, 'clicEn', 'btn-usuarios');
    dispararClic(clic, 'quitarElemento', 'reference-inspector-card');
    dispararClic(clic, 'cerrarModal', 'modal-precita');
    dispararClic(clic, 'cerrarModal', 'modal-patient-detail');
    assert.strictEqual(usuarios.clics, 1);
    assert.strictEqual(tarjeta.removido, true);
    assert.strictEqual(pre.classList.contains('active'), false);
    assert.strictEqual(ficha.classList.contains('active'), false);
  });

  await step('C3-01 las acciones y cambios que usan la página y las plantillas son exactamente los de las listas de acciones.js', () => {
    const { sb } = cargarAcciones();
    const usadasClic = new Set(); const usadasCambio = new Set();
    for (const f of FUENTES_MARCADO) {
      const t = fs.readFileSync(f, 'utf8');
      for (const m of t.matchAll(/data-accion=["']([A-Za-z0-9_]+)["']/g)) usadasClic.add(m[1]);
      for (const m of t.matchAll(/data-cambio=["']([A-Za-z0-9_]+)["']/g)) usadasCambio.add(m[1]);
    }
    const registradasClic = Array.from(sb.AccionesUi.clic); // copias del contexto vm: deepStrictEqual compara prototipos
    const registradasCambio = Array.from(sb.AccionesUi.cambio);
    const sinLista = [...usadasClic].filter(a => !registradasClic.includes(a)).map(a => 'clic:' + a)
      .concat([...usadasCambio].filter(a => !registradasCambio.includes(a)).map(a => 'cambio:' + a));
    const sinUso = registradasClic.filter(a => !usadasClic.has(a)).map(a => 'clic:' + a)
      .concat(registradasCambio.filter(a => !usadasCambio.has(a)).map(a => 'cambio:' + a));
    assert.deepStrictEqual(sinLista, [], 'usadas pero no registradas');
    assert.deepStrictEqual(sinUso, [], 'registradas pero sin uso');
  });

  // ------------------------------------------------------------------ C3-02
  await step('C3-02 PadronGridModal.reiniciar() cierra la cuadrícula, vacía las filas y limpia el DOM', () => {
    const m = nuevaCuadricula();
    m.patients = [filaValida(), filaValida({ nro_documento: '96000002' })];
    m.validationResult = { totalErrors: 0 };
    m.dom.modal.classList.add('active');
    m.dom.tbody.innerHTML = '<tr><td>96000001</td></tr>';
    m.dom.thead.innerHTML = '<tr><th>x</th></tr>';
    m.dom.errorsPillsWrap.innerHTML = '<button>pill</button>';
    m.dom.fileInfo.textContent = 'Archivo: padron_de_otro_usuario.xlsx';
    m.dom.searchInput.value = '96000001';
    m.searchQuery = '96000001';
    assert.strictEqual(typeof m.reiniciar, 'function', 'reiniciar() no existe');
    m.reiniciar();
    assert.strictEqual(m.patients.length, 0);
    assert.strictEqual(m.dom.modal.classList.contains('active'), false, 'sigue abierta');
    assert.strictEqual(m.dom.tbody.innerHTML, '', 'quedan filas en el DOM');
    assert.strictEqual(m.dom.errorsPillsWrap.innerHTML, '');
    assert.ok(!/padron_de_otro_usuario/.test(m.dom.fileInfo.textContent), 'queda el nombre del archivo anterior');
    assert.strictEqual(m.dom.searchInput.value, '');
    assert.strictEqual(m.validationResult, null);
  });

  await step('C3-02 reiniciar() sin haber abierto nunca la cuadrícula no falla', () => {
    const m = new PGM.constructor();
    assert.doesNotThrow(() => m.reiniciar());
    assert.deepStrictEqual(m.patients, []);
  });

  await step('C3-02 un archivo que aún se está leyendo no reabre la cuadrícula si la sesión se cerró mientras tanto', async () => {
    const m = nuevaCuadricula();
    m.renderTableHeaders = () => {}; m.renderTableRows = () => {}; m.validateAndUpdate = () => {}; m.precargarConsentimiento = () => {};
    let liberar;
    const original = parserExcel.parseWorkbook;
    parserExcel.parseWorkbook = () => new Promise(r => { liberar = () => r({ patients: [filaValida()], sheetName: 'Padrón' }); });
    try {
      const abierta = m.openWithFile({ name: 'otro.xlsx' });
      assert.ok(m.dom.modal.classList.contains('active'));
      assert.strictEqual(typeof m.reiniciar, 'function', 'reiniciar() no existe');
      m.reiniciar();
      liberar();
      await abierta;
      assert.deepStrictEqual(m.patients, [], 'las filas del archivo llegaron después de cerrar la sesión');
      assert.strictEqual(m.dom.modal.classList.contains('active'), false, 'la cuadrícula se reabrió');
    } finally { parserExcel.parseWorkbook = original; }
  });

  await step('C3-02 limpiarSesion() reinicia la cuadrícula del padrón y el Registro Clínico (cierre, vencimiento e inactividad pasan por aquí)', () => {
    const llamadas = [];
    const { app } = nuevaApp({
      PadronGridModal: { patients: [1], reiniciar() { llamadas.push('padron'); } },
      RegistroClinicoModal: { reiniciar() { llamadas.push('registro'); } }
    });
    app.limpiarSesion();
    assert.deepStrictEqual(llamadas.sort(), ['padron', 'registro']);
  });

  await step('C3-02 limpiarSesion() no falla si el Registro Clínico aún no tiene reiniciar() ni la cuadrícula está cargada', () => {
    const a = nuevaApp({ RegistroClinicoModal: {}, PadronGridModal: undefined });
    assert.doesNotThrow(() => a.app.limpiarSesion());
    const b = nuevaApp({ RegistroClinicoModal: undefined, PadronGridModal: { reiniciar() { throw new Error('falla interna'); } } });
    assert.doesNotThrow(() => b.app.limpiarSesion(), 'un fallo al reiniciar una ventana no debe impedir cerrar la sesión');
  });

  await step('C3-02 todas las rutas que vuelven al acceso pasan por limpiarSesion (salir, vencer, inactividad, sesión no verificada)', () => {
    const t = leer('js/auth/authUi.js');
    const rutas = [/function salir\(\)\s*\{[^}]*app\.limpiarSesion\(\)/, /function alVencer\(\)\s*\{[^}]*app\.limpiarSesion\(\)/,
      /Sesión cerrada por inactividad/, /No se pudo verificar su sesión/];
    assert.ok(rutas[0].test(t), 'salir()');
    assert.ok(rutas[1].test(t), 'alVencer()');
    const inact = t.slice(t.indexOf('ultimaActividad > minutos'), t.indexOf('Sesión cerrada por inactividad'));
    assert.ok(/app\.limpiarSesion\(\)/.test(inact), 'inactividad');
    const noVer = t.slice(t.indexOf('session.logout();', t.indexOf('const u = await session.restore()')), t.indexOf('No se pudo verificar su sesión'));
    assert.ok(/app\.limpiarSesion\(\)/.test(noVer), 'sesión no verificada');
  });

  await step('C3-02 la pantalla de acceso queda por encima de cualquier modal y los avisos por encima de la cuadrícula', () => {
    const acceso = zDe('components.css', '.login-overlay');
    const modales = {
      'modal (ficha, pre-cita)': zDe('components.css', '.modal-overlay'),
      'consentimiento': zDe('components.css', '#modal-consentimiento'),
      'cuadrícula del padrón': zDe('padron-grid.css', '.padron-modal-overlay'),
      'registro clínico': zDe('registro-clinico.css', '.reg-modal-overlay')
    };
    const aviso = zDe('georis-theme.css', '.toast-container');
    for (const [n, z] of Object.entries(modales)) assert.ok(acceso > z, `el acceso (${acceso}) no supera a ${n} (${z})`);
    assert.ok(aviso > modales['cuadrícula del padrón'] && aviso > modales['modal (ficha, pre-cita)'], `los avisos (${aviso}) quedan tapados por un modal`);
    assert.ok(acceso > aviso, `el acceso (${acceso}) debe quedar por encima de los avisos (${aviso})`);
  });

  // ------------------------------------------------------------------ C3-06 y T3-05 (cuadrícula del padrón)
  await step('C3-06 si el servidor rechaza el lote: no se agregan pacientes a la memoria, no se dice «cargados», se muestra el motivo y las filas quedan', async () => {
    const { win, llamadas } = entornoCarga({ ok: false, status: 400, json: async () => ({ resourceType: 'OperationOutcome', issue: [{ diagnostics: 'Fila 1: el documento 96000001 pertenece a otra red.' }] }) });
    const m = nuevaCuadricula();
    m.patients = [filaValida()];
    m.validationResult = { totalErrors: 0, totalRows: 1 };
    m.dom.modal.classList.add('active');
    await conWindow(win, () => m.commitUpload());
    assert.strictEqual(llamadas.fetch.length, 1, 'debía intentar guardar una vez');
    assert.strictEqual(llamadas.upsert.length + llamadas.set.length, 0, 'se agregaron pacientes a la memoria sin que el servidor los guardara');
    assert.ok(llamadas.toasts.some(t => /pertenece a otra red/.test(t.m)), 'no se mostró el motivo del servidor: ' + JSON.stringify(llamadas.toasts));
    assert.ok(!llamadas.toasts.some(t => /cargad|exitosa|sincroniz/i.test(t.m)), 'se avisó que se cargó: ' + JSON.stringify(llamadas.toasts));
    assert.strictEqual(m.dom.modal.classList.contains('active'), true, 'se cerró la cuadrícula: el usuario pierde las filas por corregir');
    assert.strictEqual(m.patients.length, 1, 'las filas desaparecieron de la cuadrícula');
    assert.strictEqual(m.dom.btnCargar.disabled, false, 'el botón de cargar debe quedar disponible');
  });

  await step('C3-06 si el servidor no responde (error de red): tampoco se agrega nada a la memoria ni se dice «cargados»', async () => {
    const { win, llamadas } = entornoCarga(() => { throw new Error('Failed to fetch'); });
    const m = nuevaCuadricula();
    m.patients = [filaValida()];
    m.validationResult = { totalErrors: 0, totalRows: 1 };
    m.dom.modal.classList.add('active');
    const warn = console.warn; console.warn = () => {};
    try { await conWindow(win, () => m.commitUpload()); } finally { console.warn = warn; }
    assert.strictEqual(llamadas.upsert.length + llamadas.set.length, 0);
    assert.ok(!llamadas.toasts.some(t => /cargad|exitosa/i.test(t.m)), JSON.stringify(llamadas.toasts));
    assert.ok(llamadas.toasts.some(t => /Failed to fetch|servidor/i.test(t.m)), JSON.stringify(llamadas.toasts));
    assert.strictEqual(m.dom.modal.classList.contains('active'), true);
    assert.strictEqual(m.patients.length, 1);
  });

  await step('C3-06 control positivo: si el servidor guarda, los pacientes entran a la memoria y se cierra la cuadrícula', async () => {
    const { win, llamadas } = entornoCarga({ ok: true, status: 200, json: async () => ({}) });
    const m = nuevaCuadricula();
    m.patients = [filaValida()];
    m.validationResult = { totalErrors: 0, totalRows: 1 };
    m.dom.modal.classList.add('active');
    await conWindow(win, () => m.commitUpload());
    assert.strictEqual(llamadas.upsert.length, 1);
    assert.strictEqual(llamadas.upsert[0].length, 1);
    assert.strictEqual(m.dom.modal.classList.contains('active'), false);
    assert.ok(llamadas.toasts.some(t => t.t === 'success'));
  });

  await step('T3-05 sin geocodificador la carga se detiene con un mensaje visible y no se guarda nada', async () => {
    const { win, llamadas } = entornoCarga({ ok: true, status: 200, json: async () => ({}) }, ['AncashGeocoder']);
    const m = nuevaCuadricula();
    m.patients = [filaValida()];
    m.validationResult = { totalErrors: 0, totalRows: 1 };
    await conWindow(win, () => m.commitUpload());
    assert.strictEqual(llamadas.fetch.length, 0, 'se intentó guardar con coordenadas inventadas');
    assert.strictEqual(llamadas.upsert.length + llamadas.set.length, 0);
    assert.ok(llamadas.toasts.some(t => /geocodificador/i.test(t.m) && /recargue la página/i.test(t.m)), JSON.stringify(llamadas.toasts));
    assert.strictEqual(m.dom.btnCargar.disabled, false);
  });

  await step('T3-05 sin motor clínico (HeartsEngine) la carga se detiene con un mensaje visible y no se guarda nada', async () => {
    const { win, llamadas } = entornoCarga({ ok: true, status: 200, json: async () => ({}) }, ['HeartsEngine']);
    const m = nuevaCuadricula();
    m.patients = [filaValida()];
    m.validationResult = { totalErrors: 0, totalRows: 1 };
    await conWindow(win, () => m.commitUpload());
    assert.strictEqual(llamadas.fetch.length, 0, 'se intentó guardar con «verde / Controlado» por omisión');
    assert.ok(llamadas.toasts.some(t => /motor clínico/i.test(t.m) && /recargue la página/i.test(t.m)), JSON.stringify(llamadas.toasts));
  });

  await step('K3-01 (cuadrícula) una HbA1c de 11 % con presión normal no se guarda como «Controlado» en la atención del lote', async () => {
    const { win, llamadas } = entornoCarga({ ok: true, status: 200, json: async () => ({}) });
    const m = nuevaCuadricula();
    m.patients = [filaValida({ cie10_dm: 'E11 – Diabetes mellitus', pas_oct: '120', pad_oct: '70', hba1c: '11' })];
    m.validationResult = { totalErrors: 0, totalRows: 1 };
    await conWindow(win, () => m.commitUpload());
    assert.strictEqual(llamadas.fetch.length, 1);
    const enviado = JSON.parse(llamadas.fetch[0].init.body).patients[0];
    assert.ok(enviado.observations.length === 1, 'se esperaba una atención');
    assert.notStrictEqual(enviado.observations[0].estado_control, 'Controlado', 'HbA1c 11 % guardada como Controlado');
  });

  // ------------------------------------------------------------------ K3-03 aviso de WhatsApp
  function ejecutarWhatsApp(p, notificador) {
    const abiertos = [];
    const enlaces = [];
    const n = notificador || {
      estadoConsentimiento: () => 'si',
      generarEnlace: (pac, fecha) => { enlaces.push(fecha); return 'https://wa.me/51943111222?fecha=' + encodeURIComponent(fecha); }
    };
    const { app, sb } = nuevaApp({ WhatsappNotifier: n });
    sb.open = (u) => { abiertos.push(u); return null; };
    app.patientMap.set(String(p.id), p);
    app.enviarWhatsApp(p.id);
    return { app, abiertos, enlaces };
  }

  await step('K3-03 el aviso lleva la fecha de la PRÓXIMA CITA real (dd/mm/aaaa), no «hoy + 3 días»', () => {
    const cita = mas(27);
    const r = ejecutarWhatsApp(paciente({ appointments: [{ fecha_cita: cita }], fecha_limite: cita }));
    assert.deepStrictEqual(r.enlaces, [dmy(cita)]);
    assert.strictEqual(r.abiertos.length, 1);
    const hoyMas3 = dmy(mas(3));
    assert.notStrictEqual(r.enlaces[0], hoyMas3);
  });

  await step('K3-03 con varias citas se usa la mayor fecha que sea de hoy en adelante (las vencidas no cuentan)', () => {
    const r = ejecutarWhatsApp(paciente({ appointments: [{ fecha_cita: mas(-40) }, { fecha_cita: mas(15) }, { fecha_cita: mas(45) }, { fecha_cita: mas(-3) }] }));
    assert.deepStrictEqual(r.enlaces, [dmy(mas(45))]);
  });

  await step('K3-03 una cita de HOY (en hora de Lima) todavía es la próxima cita', () => {
    const r = ejecutarWhatsApp(paciente({ appointments: [{ fecha_cita: HOY }] }));
    assert.deepStrictEqual(r.enlaces, [dmy(HOY)]);
  });

  await step('K3-03 sin appointments se usa proxima_cita del padrón', () => {
    const r = ejecutarWhatsApp(paciente({ appointments: [], proxima_cita: mas(12) }));
    assert.deepStrictEqual(r.enlaces, [dmy(mas(12))]);
  });

  await step('K3-03 sin próxima cita (solo citas pasadas): aviso al usuario, no se arma el enlace y no se abre WhatsApp', () => {
    const r = ejecutarWhatsApp(paciente({ appointments: [{ fecha_cita: mas(-20) }], proxima_cita: mas(-2) }));
    assert.strictEqual(r.abiertos.length, 0, 'se abrió WhatsApp sin cita');
    assert.strictEqual(r.enlaces.length, 0, 'se armó un enlace sin cita');
    assert.ok(r.app.avisos.some(a => /no tiene próxima cita programada/i.test(a.m) && /genere primero la pre-cita/i.test(a.m)), JSON.stringify(r.app.avisos));
  });

  await step('K3-03 sin ninguna cita registrada: el mismo aviso y ningún enlace', () => {
    const r = ejecutarWhatsApp(paciente({ appointments: [], proxima_cita: undefined }));
    assert.strictEqual(r.abiertos.length, 0);
    assert.strictEqual(r.enlaces.length, 0);
    assert.ok(r.app.avisos.some(a => /próxima cita programada/i.test(a.m)));
  });

  await step('K3-03 un paciente fallecido (solo con estado_paciente «Fallecido») no recibe aviso', () => {
    const r = ejecutarWhatsApp(paciente({ estado_paciente: 'Fallecido', fallecido: false }));
    assert.strictEqual(r.abiertos.length, 0);
    assert.strictEqual(r.enlaces.length, 0);
    assert.ok(r.app.avisos.length >= 1 && /fallecid/i.test(r.app.avisos[0].m), JSON.stringify(r.app.avisos));
  });

  await step('K3-03 la fecha del aviso no sale de toLocaleDateString ni de new Date() del navegador', () => {
    const t = leer('js/main.js');
    const cuerpo = t.slice(t.indexOf('  enviarWhatsApp('), t.indexOf('  sendWhatsAppDirect('));
    assert.ok(cuerpo.length > 100);
    assert.ok(!/toLocaleDateString|new Date\(|setDate\(/.test(cuerpo), 'enviarWhatsApp todavía arma la fecha con el reloj del navegador');
    assert.ok(/ReglasClinicas/.test(t), 'main.js debe usar ReglasClinicas');
  });

  await step('K3-03 sin consentimiento el aviso sigue pidiendo el consentimiento (no se rompió el orden)', () => {
    const abierto = [];
    const n = { estadoConsentimiento: () => 'sin_registrar', generarEnlace: () => { throw new Error('no debe generarse'); } };
    const { app } = nuevaApp({ WhatsappNotifier: n });
    const p = paciente();
    app.patientMap.set(p.id, p);
    app.abrirModalConsentimiento = pac => abierto.push(pac.id);
    app.enviarWhatsApp(p.id);
    assert.deepStrictEqual(abierto, [p.id]);
  });

  // ------------------------------------------------------------------ K3-06 / K3-04 textos de la ficha
  await step('K3-06 un paciente en verde ya no dice «en meta terapéutica»: dice «Próximo control dentro del plazo»', () => {
    const { app, doc } = nuevaApp();
    const html = htmlDeFicha(app, doc, paciente());
    assert.ok(!/en meta terap/i.test(html), 'sigue diciendo «en meta terapéutica»');
    assert.ok(/Próximo control dentro del plazo/.test(html), 'falta «Próximo control dentro del plazo»');
  });

  await step('K3-04 el intervalo por omisión sale de ReglasClinicas.frecuenciaDias: 30 días no controlado, 90 solo controlado y estable', () => {
    const { app, doc } = nuevaApp();
    const noCtrl = htmlDeFicha(app, doc, paciente({ estado_control: 'No Controlado' }));
    assert.ok(/Cada 30 días/.test(noCtrl), 'no controlado debe mostrar «Cada 30 días»');
    assert.ok(!/cada 90 días|Cada 90 días/.test(noCtrl), 'no controlado muestra 90');
    const ctrlNoEstable = htmlDeFicha(app, doc, paciente({ estado_control: 'Controlado' }));
    assert.ok(/ontrol cada 30 días/.test(ctrlNoEstable), 'controlado sin estabilidad debe seguir en 30 (conducta)');
    assert.ok(/Cada 30 días/.test(ctrlNoEstable), 'controlado sin estabilidad debe seguir en 30 (periodicidad)');
    const ctrlEstable = htmlDeFicha(app, doc, paciente({ estado_control: 'Controlado', controlado_estable: 'Sí' }));
    assert.ok(/ontrol cada 90 días/.test(ctrlEstable), 'controlado y estable debe ser 90 (conducta)');
    assert.ok(/Cada 90 días/.test(ctrlEstable), 'controlado y estable debe ser 90 (periodicidad)');
  });

  await step('K3-04 el popup del mapa usa el mismo intervalo que la ficha (guardado o el de la regla) y no muestra ninguno sin estado de control', () => {
    const { mm } = cargarMapManager();
    const pop = p => mm.buildPatientPopupHtml(paciente(p), '#16A34A', false);
    assert.ok(/No Controlado \(Cada 30d\)/.test(pop({ estado_control: 'No Controlado', frecuencia_hearts: undefined })), 'no controlado sin frecuencia guardada');
    assert.ok(/Controlado \(Cada 30d\)/.test(pop({ estado_control: 'Controlado', frecuencia_hearts: undefined })), 'controlado sin estabilidad');
    assert.ok(/Controlado \(Cada 90d\)/.test(pop({ estado_control: 'Controlado', controlado_estable: 'Sí', frecuencia_hearts: undefined })), 'controlado y estable');
    assert.ok(/No Controlado \(Cada 60d\)/.test(pop({ estado_control: 'No Controlado', frecuencia_hearts: 60 })), 'el guardado manda');
    assert.ok(!/\(Cada \d+d\)/.test(pop({ estado_control: 'Sin Datos de Control en Padrón', frecuencia_hearts: undefined })), 'sin estado conocido no se inventa un intervalo');
  });

  await step('K3-04 si el paciente ya trae frecuencia_hearts, la ficha muestra esa y no la de por omisión', () => {
    const { app, doc } = nuevaApp();
    const html = htmlDeFicha(app, doc, paciente({ estado_control: 'Controlado', frecuencia_hearts: 60 }));
    assert.ok(/Cada 60 días/.test(html) && /ontrol cada 60 días/.test(html));
  });

  await step('K3-04 el código no deja números fijos de intervalo (|| 90, «Cada 30 días») en la ficha ni en el popup', () => {
    const t = leer('js/main.js');
    assert.ok(!/frecuencia_hearts\s*\|\|\s*90/.test(t), 'queda «frecuencia_hearts || 90»');
    assert.ok(!/: 'Cada 30 días'/.test(t), 'queda el «Cada 30 días» fijo');
    assert.ok(/window\.ReglasClinicas/.test(t) && /\.frecuenciaDias\(\s*p\.estado_control,\s*p\.controlado_estable === 'Sí'\s*\)/.test(t),
      'main.js debe sacar el intervalo de ReglasClinicas.frecuenciaDias(p.estado_control, p.controlado_estable === \'Sí\')');
  });

  await step('K3-04 la ficha avisa «La cita queda a N días; el máximo para este paciente es M» si la cita excede el intervalo', () => {
    const { app, doc } = nuevaApp();
    const p = paciente({ estado_control: 'No Controlado', fecha_ultimo_control: mas(-5), fecha_limite: mas(65), appointments: [{ fecha_cita: mas(65) }] });
    const html = htmlDeFicha(app, doc, p);
    assert.ok(/La cita queda a 70 días; el máximo para este paciente es 30/.test(html), 'no aparece el aviso con 70 y 30');
  });

  await step('K3-04 sin exceso (o sin fecha del último control) no se muestra el aviso', () => {
    const { app, doc } = nuevaApp();
    const dentro = htmlDeFicha(app, doc, paciente({ estado_control: 'No Controlado', fecha_ultimo_control: mas(-5), fecha_limite: mas(20), appointments: [{ fecha_cita: mas(20) }] }));
    assert.ok(!/La cita queda a/.test(dentro), 'aviso falso con la cita a 25 días');
    const sinControl = htmlDeFicha(app, doc, paciente({ fecha_ultimo_control: undefined, observations: [], fecha_limite: mas(200), appointments: [{ fecha_cita: mas(200) }] }));
    assert.ok(!/La cita queda a/.test(sinControl), 'aviso sin saber la fecha del último control');
  });

  await step('K3-04 la fecha del último control puede salir de la última observación cuando el padrón no la trae', () => {
    const { app, doc } = nuevaApp();
    const p = paciente({ fecha_ultimo_control: undefined, observations: [{ fecha_registro: mas(-4) }, { fecha_registro: mas(-60) }], fecha_limite: mas(50), appointments: [{ fecha_cita: mas(50) }] });
    const html = htmlDeFicha(app, doc, p);
    assert.ok(/La cita queda a 54 días; el máximo para este paciente es 30/.test(html));
  });

  // ------------------------------------------------------------------ Importación HOSIX
  function subirCsvHosix(procesados, registros) {
    const parser = { parseCSV: () => registros || [{}], processRecords: () => procesados };
    const { app } = nuevaApp({ HosixParser: parser });
    app.upsertPatients = l => { app.cargados = l; };
    app.render = () => {};
    app.handleFileUpload({ name: 'consulta_hosix.csv', __texto: 'DNI;NOMBRE\n96000001;X' });
    return app;
  }

  await step('HOSIX las filas observadas (sin documento válido) se avisan: cuántas no se cargaron y por qué', () => {
    const procesados = [{ id: 'h1', dni: '96000001', apellidos_nombres: 'UNO' }];
    procesados.observados = [{ fila: 4, motivo: 'sin documento válido' }, { fila: 9, motivo: 'sin documento válido' }];
    const app = subirCsvHosix(procesados);
    assert.strictEqual(app.cargados.length, 1);
    const aviso = app.avisos.find(a => /2 fila/.test(a.m) && /sin documento válido/.test(a.m));
    assert.ok(aviso, 'no hay aviso de las filas observadas: ' + JSON.stringify(app.avisos));
    assert.ok(/2 filas no se cargaron/i.test(aviso.m), aviso.m);
    assert.ok(/4/.test(aviso.m) && /9/.test(aviso.m), 'el aviso debe nombrar las filas');
    assert.ok(aviso.t === 'warning' || aviso.t === 'danger');
  });

  await step('HOSIX con una sola fila observada el aviso concuerda en singular', () => {
    const procesados = [{ id: 'h1', dni: '96000001', apellidos_nombres: 'UNO' }];
    procesados.observados = [{ fila: 7, motivo: 'sin documento válido' }];
    const app = subirCsvHosix(procesados);
    assert.ok(app.avisos.some(a => /1 fila no se cargó \(sin documento válido\)\. Fila: 7\./.test(a.m)), JSON.stringify(app.avisos));
  });

  await step('HOSIX si todas las filas quedan observadas se dice que no se cargó ninguna (no un éxito)', () => {
    const procesados = [];
    procesados.observados = [{ fila: 1, motivo: 'sin documento válido' }, { fila: 2, motivo: 'sin documento válido' }];
    const app = subirCsvHosix(procesados);
    assert.ok(!app.avisos.some(a => a.t === 'success'), 'se anunció una ingesta exitosa con 0 pacientes: ' + JSON.stringify(app.avisos));
    assert.ok(app.avisos.some(a => /2 fila/.test(a.m) && /sin documento válido/.test(a.m)), JSON.stringify(app.avisos));
  });

  await step('HOSIX sin la propiedad observados (parser anterior) no falla y sigue cargando', () => {
    const procesados = [{ id: 'h1', dni: '96000001', apellidos_nombres: 'UNO' }, { id: 'h2', dni: '96000002', apellidos_nombres: 'DOS' }];
    const app = subirCsvHosix(procesados);
    assert.strictEqual(app.cargados.length, 2);
    assert.ok(app.avisos.some(a => a.t === 'success' && /2 pacientes/.test(a.m)), JSON.stringify(app.avisos));
    assert.ok(!app.avisos.some(a => /no se cargaron/i.test(a.m)));
  });

  // ------------------------------------------------------------------ recargarPacientes (P3-05)
  function appRecarga(authFetch) {
    const { app } = nuevaApp();
    let token = 'T1';
    app.session = { getUser: () => ({ role: 'ADMIN' }), isLoggedIn: () => true, getToken: () => token, authFetch };
    app.cambiarToken = t => { token = t; };
    app.spy = { render: 0, ajustar: 0, limpiar: 0 };
    app.render = () => { app.spy.render++; };
    app.ajustarVistaAPacientes = () => { app.spy.ajustar++; };
    const limpiar = app.limpiarSesion.bind(app);
    app.limpiarSesion = () => { app.spy.limpiar++; limpiar(); };
    app.setPatients([paciente({ id: 'viejo-1' })]);
    return app;
  }

  await step('P3-05 recargarPacientes() vuelve a pedir /api/cronicos, actualiza la lista y devuelve true sin mover la vista ni limpiar la sesión', async () => {
    let url = null;
    const app = appRecarga(async u => { url = u; return { ok: true, status: 200, json: async () => ([paciente({ id: 'nuevo-1', dni: '96000010' }), paciente({ id: 'nuevo-2', dni: '96000011' })]) }; });
    assert.strictEqual(typeof app.recargarPacientes, 'function', 'recargarPacientes() no existe');
    const r = await app.recargarPacientes();
    assert.strictEqual(r, true);
    assert.ok(/\/api\/cronicos/.test(url), 'pidió ' + url);
    assert.deepStrictEqual(app.patients.map(p => p.id), ['nuevo-1', 'nuevo-2']);
    assert.ok(app.findPatient('96000011'), 'el índice por documento no se actualizó');
    assert.strictEqual(app.spy.render >= 1, true, 'no se repintó la lista y el mapa');
    assert.strictEqual(app.spy.ajustar, 0, 'movió la vista del mapa');
    assert.strictEqual(app.spy.limpiar, 0, 'limpió la sesión (parpadeo de «sin sesión»)');
    assert.deepStrictEqual(app.avisos, [], 'mostró avisos al recargar en silencio');
  });

  await step('P3-05 recargarPacientes() devuelve false si el servidor falla (500 o sin red) y deja la lista como estaba', async () => {
    const a = appRecarga(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    assert.strictEqual(await a.recargarPacientes(), false);
    assert.deepStrictEqual(a.patients.map(p => p.id), ['viejo-1']);
    const b = appRecarga(async () => { throw new Error('Failed to fetch'); });
    assert.strictEqual(await b.recargarPacientes(), false);
    assert.deepStrictEqual(b.patients.map(p => p.id), ['viejo-1']);
    assert.strictEqual(b.spy.limpiar, 0);
  });

  await step('P3-05 recargarPacientes() no pisa la lista si la sesión cambió o se cerró mientras se esperaba la respuesta', async () => {
    let app;
    app = appRecarga(async () => { app.cambiarToken('T2'); return { ok: true, status: 200, json: async () => ([paciente({ id: 'de-otro-usuario' })]) }; });
    assert.strictEqual(await app.recargarPacientes(), false);
    assert.deepStrictEqual(app.patients.map(p => p.id), ['viejo-1']);
  });

  await step('P3-05 recargarPacientes() no pide nada si el rol no ve pacientes (Director) o no hay sesión', async () => {
    let pedidos = 0;
    const { app } = nuevaApp({}, 'DIRECTOR');
    app.session.authFetch = async () => { pedidos++; return { ok: true, status: 200, json: async () => [] }; };
    assert.strictEqual(typeof app.recargarPacientes, 'function', 'recargarPacientes() no existe');
    assert.strictEqual(await app.recargarPacientes(), false);
    assert.strictEqual(pedidos, 0);
  });

  // ------------------------------------------------------------------ C3-05 (parcial)
  await step('C3-05 las capas de mosaicos NO fuerzan «no-referrer» (OpenStreetMap exige Referer); el Referer solo lleva el origen', () => {
    const t = leer('js/map/mapManager.js');
    assert.ok(!/referrerPolicy:\s*['"]no-referrer['"]/.test(t), 'las capas fuerzan no-referrer: proveedores como OSM bloquearían el mapa');
    const capas = [...t.matchAll(/L\.tileLayer\([^)]*\{([\s\S]*?)\}\)/g)];
    assert.ok(capas.length >= 7, 'se esperaban 7 capas de mosaicos y hay ' + capas.length);
  });

  await step('K3-06: el tablero no cuenta como «vigentes» (verde) a los pacientes en gris (sin cita o cita cumplida)', () => {
    const t = leer('js/main.js');
    const m = /\n\s*renderDashboard\s*\(\)\s*\{/.exec(t);
    assert.ok(m, 'no se encontró la definición de renderDashboard');
    const bloque = t.slice(m.index, m.index + 4500);
    assert.ok(!/else green\+\+;/.test(bloque), 'renderDashboard cuenta el resto como verde');
    assert.ok(/gray\+\+/.test(bloque), 'renderDashboard no cuenta los grises aparte');
  });

  console.log(`\nResultado Cliente F3: ${passed} correctas, ${failed} con falla`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
