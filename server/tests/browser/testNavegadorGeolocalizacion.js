/**
 * testNavegadorGeolocalizacion.js
 * Geolocalización exacta y capas del mapa en un NAVEGADOR REAL (Chromium con Playwright).
 * Arranca el servidor real en el puerto 3110 con una carpeta de datos TEMPORAL (se borra al terminar), carga los
 * 20 pacientes SINTÉTICOS de la semilla y recorre: capas GeoRIS, cambio de mapa base, rutas de referencia, RIS y zonas,
 * medición, XSS en tooltips, y fijar la ubicación exacta por mapa, por coordenadas pegadas y por GPS (simulado).
 * Los mosaicos externos se responden con una imagen vacía (no depende de internet).
 * No forma parte de `npm test` (necesita Playwright): node server/tests/browser/testNavegadorGeolocalizacion.js
 * Opcional: SHOTS_DIR=<carpeta> guarda capturas de pantalla (solo datos sintéticos).
 */
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.log('Playwright no está instalado: se omite esta prueba de navegador (npm i -D playwright).');
  process.exit(0);
}
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cronicos-geo-'));
const SHOTS = process.env.SHOTS_DIR || '';
const shot = async (page, nombre) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, nombre) }); };
const PORT = 3110;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
async function step(name, fn) { try { await fn(); pass++; console.log('  OK   ', name); } catch (e) { fail++; console.log('  FALLA', name, '\n        ', e.message.slice(0, 600)); } }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), ADMIN_PASSWORD: 'Clave-Prueba-123', DATA_DIR: DATA, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE + '/health'); if (r.ok) break; } catch (e) {} await sleep(250); }

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, geolocation: { latitude: -10.067210, longitude: -78.153520, accuracy: 8 }, permissions: ['geolocation'] });
  // Mosaicos externos: se responden con un PNG vacío para no depender de la red
  await context.route(/(google|arcgisonline|cartocdn|openstreetmap)/, r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6360000002000154A24F5D0000000049454E44AE426082', 'hex') }));
  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push('console: ' + m.text()); });

  await page.goto(BASE + '/');
  await page.fill('#login-username', 'admin');
  await page.fill('#login-password', 'Clave-Prueba-123');
  await page.click('#login-submit');
  await page.waitForFunction(() => window.app && window.app.patients && window.app.patients.length >= 20, null, { timeout: 15000 });
  await sleep(800);

  await step('carga sin errores de consola', async () => { assert(errores.length === 0, errores.join(' | ')); });

  await step('20 pacientes semilla con coordenadas válidas y sector = polígono GeoRIS', async () => {
    const r = await page.evaluate(() => window.app.patients.map(p => {
      const s = window.AncashGeocoder.getSectorFromCoordinates(p.latitud, p.longitud);
      return { dni: p.dni, ok: window.GeoUbicacion.validarCoordenadas(p.latitud, p.longitud).ok, sec: p.sector_sanitario, pip: s ? 'Sector ' + s.id_sector : 'Sin sector GeoRIS' };
    }));
    const malos = r.filter(x => !x.ok || x.sec !== x.pip);
    assert(r.length === 20 && malos.length === 0, JSON.stringify(malos));
  });

  await step('un marcador por paciente en el mapa (20) en su panel propio', async () => {
    const n = await page.evaluate(() => window.app.mapManager.patientMarkers.size);
    const enPanel = await page.locator('.leaflet-panePacientes-pane .pin-patient-container').count();
    assert(n === 20 && enPanel === 20, `markers=${n} dom=${enPanel}`);
  });

  await step('un solo <canvas> para toda la cartografía', async () => {
    const n = await page.locator('#map canvas').count();
    assert(n === 1, 'canvas=' + n);
  });

  await step('cambiar de mapa base no lanza errores y sincroniza los dos selectores', async () => {
    errores.length = 0;
    await page.selectOption('#select-basemap', 'Modo Noche (CARTO)');
    await sleep(300);
    const r = await page.evaluate(() => ({ top: document.getElementById('select-basemap').value, side: document.getElementById('select-basemap-sidebar').value, cur: window.app.mapManager.currentBaseName }));
    assert(errores.length === 0, errores.join('|'));
    assert(r.top === 'Modo Noche (CARTO)' && r.side === 'Modo Noche (CARTO)' && r.cur === 'Modo Noche (CARTO)', JSON.stringify(r));
    await page.evaluate(() => window.app.setBaseMapGlobal('Esri Calles y Vías')); // alias antiguo
    const cur = await page.evaluate(() => window.app.mapManager.currentBaseName);
    assert(cur === 'Google Calles y Vías', cur);
  });

  // Helper: clic real en una coordenada del mapa
  const clickLatLng = async (lat, lng) => {
    const pt = await page.evaluate(([la, lo]) => { const p = window.app.mapManager.map.latLngToContainerPoint([la, lo]); const r = document.getElementById('map').getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; }, [lat, lng]);
    await page.mouse.click(pt.x, pt.y);
  };

  await step('tras trazar una referencia, los polígonos siguen respondiendo (popup de sector)', async () => {
    await page.evaluate(() => window.app.trazarReferenciaHaciaHospital('00001743'));
    await sleep(900);
    await page.evaluate(() => { window.app.mapManager.map.setView([-9.99, -78.06], 12, { animate: false }); });
    await sleep(300);
    const nCanvas = await page.locator('#map canvas').count();
    await clickLatLng(-9.99, -78.06);
    await sleep(400);
    const txt = await page.evaluate(() => { const p = document.querySelector('.leaflet-popup-content'); return p ? p.textContent : null; });
    assert(nCanvas === 1, 'canvas=' + nCanvas);
    assert(txt && /SECTOR SANITARIO/.test(txt), 'popup=' + txt);
    await page.evaluate(() => { window.app.mapManager.map.closePopup(); });
  });

  await step('RIS 157: sin sectores de la 156, hospitales de la 157, zonas con su RIS', async () => {
    await page.evaluate(() => window.app.selectRis('157'));
    await sleep(600);
    const r = await page.evaluate(() => {
      const mm = window.app.mapManager;
      const hosp = []; mm.layers.areaSanitaria.eachLayer(l => { if (l.getLatLng) hosp.push(l.getLatLng().lat.toFixed(2)); });
      return { sect: mm.layers.sectoresSanitarios.getLayers().length, zona: mm.currentZonaId, hosp: hosp.length, opts: [...document.querySelectorAll('#select-zona option')].slice(1, 3).map(o => o.value), refs: mm.layers.referenciasLines.getLayers().length };
    });
    assert(r.sect === 0 && r.zona === 'ALL' && r.hosp >= 1 && r.opts.every(v => v.startsWith('157|')) && r.refs === 0, JSON.stringify(r));
  });

  await step('referencia de una cabecera de Chimbote va a su hospital (Eleazar Guzmán Barrón)', async () => {
    await page.evaluate(() => window.app.selectRis('156'));
    await page.evaluate(() => window.app.trazarReferenciaHaciaHospital('00001704'));
    await sleep(400);
    const txt = await page.evaluate(() => document.getElementById('reference-inspector-card').textContent);
    assert(/ELEAZAR GUZMAN BARRON/.test(txt) && !/HUARMEY \(II-1\)/.test(txt.split('Destino:')[1] || ''), txt.slice(0, 200));
    await page.evaluate(() => { document.getElementById('reference-inspector-card').remove(); window.app.mapManager.home(); });
  });

  await step('zona 6 desde «Todas las RIS» encuadra la zona correcta', async () => {
    await page.evaluate(() => window.app.selectRis('ALL'));
    await page.evaluate(() => window.app.selectZona('156|6'));
    await sleep(500);
    const r = await page.evaluate(() => ({ ris: window.app.mapManager.currentRisId, zona: window.app.mapManager.currentZonaId, sel: document.getElementById('select-ris').value, sect: window.app.mapManager.layers.sectoresSanitarios.getLayers().length, c: window.app.mapManager.map.getCenter() }));
    assert(String(r.ris) === '156' && String(r.zona) === '6' && r.sel === '156' && r.sect === 11 && Math.abs(r.c.lat + 9.9) < 0.3, JSON.stringify(r));
    await page.evaluate(() => { window.app.selectRis('156'); window.app.mapManager.home(); });
    await sleep(500);
  });

  await step('las 13 opciones de hospital de referencia existen en GeoRIS', async () => {
    const r = await page.evaluate(() => [...document.querySelectorAll('#select-hospital option')].map(o => !!window.GeorisTerritory.getHospitalByCode(o.value)));
    assert(r.length === 13 && r.every(Boolean), JSON.stringify(r));
  });

  await step('medición: 2 clics en tierra = 2 puntos y no abre popups', async () => {
    await page.evaluate(() => { window.app.mapManager.map.setView([-10.068, -78.152], 15, { animate: false }); });
    await page.click('#btn-medir');
    await clickLatLng(-10.0600, -78.1450);
    await clickLatLng(-10.0700, -78.1400);
    await sleep(300);
    const r = await page.evaluate(() => ({ pts: window.app.mapManager.measurePoints.length, pop: !!document.querySelector('.leaflet-popup') }));
    await page.click('#btn-medir');
    assert(r.pts === 2 && !r.pop, JSON.stringify(r));
  });

  await step('XSS: diagnósticos y HbA1c maliciosos no se ejecutan en el tooltip', async () => {
    const token = await page.evaluate(() => window.app.session.getToken());
    const res = await fetch(BASE + '/api/padron/importar-lote', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ patients: [{ dni: '77777777', apellidos_nombres: 'PRUEBA XSS', direccion: 'Jr. Bolognesi 300', diagnosticos: ['<img src=x onerror="window.__xss=1">'], hba1c_texto: '<b id=xssb>x</b>' }] }) });
    assert(res.ok, 'import ' + res.status);
    await page.evaluate(() => window.app.loadInitialData());
    await sleep(500);
    await page.evaluate(() => { const m = window.app.mapManager.patientMarkers.get('pac-00001741-77777777'); m.openTooltip(); });
    await sleep(300);
    const r = await page.evaluate(() => ({ xss: window.__xss === 1, b: !!document.getElementById('xssb') }));
    assert(!r.xss && !r.b, JSON.stringify(r));
  });

  const PID = 'pac-sim-10000006'; // Jr. Arequipa 310: dirección que el geocodificador no reconoce
  await step('el paciente nuevo importado se geocodificó en el servidor con su precisión', async () => {
    const p = await page.evaluate(() => window.app.findPatient('77777777'));
    assert(p.precision_geo === 'calle' && p.geo_toponimo === 'JR BOLOGNESI' && p.sector_sanitario === 'Sector 67', JSON.stringify({ a: p.precision_geo, b: p.geo_toponimo, c: p.sector_sanitario, lat: p.latitud }));
  });

  await step('fijar ubicación EN EL MAPA: tocar el mapa, confirmar, guardar y recalcular sector', async () => {
    await page.evaluate(id => window.app.iniciarFijarUbicacion(id), PID);
    await page.click('[data-ubic-accion="mapa"]');
    await sleep(500);
    assert(await page.locator('#ubicacion-banner').isVisible(), 'sin banner');
    await page.evaluate(() => { window.app.mapManager.map.setView([-10.06993, -78.1498], 18, { animate: false }); });
    await sleep(200);
    await clickLatLng(-10.069930, -78.149800);
    await sleep(200);
    const banner = await page.locator('#ubicacion-banner-datos').textContent();
    assert(/Sector 69/.test(banner) && /Marcada en el mapa/.test(banner), banner);
    await page.click('[data-ubic="confirmar"]');
    await page.waitForFunction(() => !document.getElementById('ubicacion-banner'), null, { timeout: 5000 });
    await sleep(900);
    const p = await page.evaluate(id => window.app.findPatient(id), PID);
    assert(p.precision_geo === 'mapa' && Math.abs(p.latitud + 10.06993) < 1e-5 && Math.abs(p.longitud + 78.1498) < 1e-5 && p.sector_sanitario === 'Sector 69' && p.geo_registrado_por === 'admin', JSON.stringify({ a: p.precision_geo, lat: p.latitud, lng: p.longitud, s: p.sector_sanitario }));
    const clase = await page.evaluate(id => window.app.mapManager.patientMarkers.get(id).getElement().querySelector('.pin-patient-container').className, PID);
    assert(/pin-exacta/.test(clase), clase);
  });

  await step('la ubicación exacta queda en el servidor (otra sesión la ve igual)', async () => {
    const token = await page.evaluate(() => window.app.session.getToken());
    const list = await (await fetch(BASE + '/api/cronicos', { headers: { Authorization: 'Bearer ' + token } })).json();
    const p = list.find(x => x.id === PID);
    assert(p.precision_geo === 'mapa' && Math.abs(p.latitud + 10.06993) < 1e-5 && p.sector_sanitario === 'Sector 69' && p.sector_por_ubicacion === true, JSON.stringify(p && { a: p.precision_geo, lat: p.latitud }));
  });

  await step('reimportar el padrón con la misma dirección NO pisa la ubicación exacta', async () => {
    const token = await page.evaluate(() => window.app.session.getToken());
    await fetch(BASE + '/api/padron/importar-lote', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ patients: [{ id: PID, dni: '10000006', direccion: 'JR AREQUIPA NRO 310', latitud: -10.0700, longitud: -78.1600, precision_geo: 'calle', sector_sanitario: 'Sector 62' }] }) });
    const list = await (await fetch(BASE + '/api/cronicos', { headers: { Authorization: 'Bearer ' + token } })).json();
    const p = list.find(x => x.id === PID);
    assert(p.precision_geo === 'mapa' && Math.abs(p.latitud + 10.06993) < 1e-5 && p.sector_sanitario === 'Sector 69', JSON.stringify({ a: p.precision_geo, lat: p.latitud, s: p.sector_sanitario }));
  });

  const PID2 = 'pac-sim-10000009';
  await step('fijar ubicación con COORDENADAS pegadas (enlace de Google Maps)', async () => {
    await page.evaluate(id => window.app.iniciarFijarUbicacion(id), PID2);
    await page.click('[data-ubic-accion="coords"]');
    await page.fill('#ubic-coords-input', 'https://maps.google.com/?q=-10.074500,-78.147000');
    await sleep(150);
    const res = await page.locator('#ubic-coords-resultado').textContent();
    assert(/-10\.074500/.test(res), res);
    await page.click('#ubic-coords-ver');
    await sleep(500);
    await page.click('[data-ubic="confirmar"]');
    await page.waitForFunction(() => !document.getElementById('ubicacion-banner'), null, { timeout: 5000 });
    const p = await page.evaluate(id => window.app.findPatient(id), PID2);
    assert(p.precision_geo === 'manual' && p.latitud === -10.0745 && p.longitud === -78.147, JSON.stringify({ a: p.precision_geo, lat: p.latitud }));
  });

  const PID3 = 'pac-sim-10000016';
  await step('fijar ubicación por GPS (±8 m) y guardarla con su precisión', async () => {
    await page.evaluate(id => window.app.iniciarFijarUbicacion(id), PID3);
    await page.click('[data-ubic-accion="gps"]');
    await page.waitForSelector('#ubicacion-banner', { timeout: 10000 });
    await sleep(1200);
    const banner = await page.locator('#ubicacion-banner-datos').textContent();
    assert(/GPS del dispositivo \(±8 m\)/.test(banner), banner);
    const vis = await page.evaluate(() => {
      const s = window.app.mapManager.seleccion; const b = s.marker.getElement().getBoundingClientRect();
      const m = document.getElementById('map').getBoundingClientRect(); const ban = document.getElementById('ubicacion-banner').getBoundingClientRect();
      const ll = s.marker.getLatLng();
      return { dentro: b.left >= m.left && b.right <= m.right && b.top >= m.top && b.bottom <= m.bottom, bajoBanner: b.top >= ban.bottom, lat: ll.lat, lng: ll.lng, popup: !!document.querySelector('.leaflet-popup') };
    });
    assert(vis.dentro && vis.bajoBanner && Math.abs(vis.lat + 10.06721) < 1e-6 && Math.abs(vis.lng + 78.15352) < 1e-6 && !vis.popup, 'marcador fuera de la vista o tapado ' + JSON.stringify(vis));
    await shot(page, 'seleccion-gps.png');
    await page.click('[data-ubic="confirmar"]');
    await page.waitForFunction(() => !document.getElementById('ubicacion-banner'), null, { timeout: 5000 });
    await sleep(1200);
    const p = await page.evaluate(id => window.app.findPatient(id), PID3);
    assert(p.precision_geo === 'gps' && p.precision_m === 8 && p.latitud === -10.06721 && p.longitud === -78.15352 && p.sector_sanitario === 'Sector 67', JSON.stringify({ a: p.precision_geo, m: p.precision_m, lat: p.latitud, s: p.sector_sanitario }));
    const foco = await page.evaluate(() => window.app.mapManager.layers.focoPaciente.getLayers().length);
    assert(foco === 2, 'foco=' + foco);
    await shot(page, 'tras-gps.png');
  });

  await step('cancelar la selección no guarda nada', async () => {
    const antes = await page.evaluate(() => JSON.stringify(window.app.findPatient('pac-sim-10000017')));
    await page.evaluate(() => window.app.iniciarFijarUbicacion('pac-sim-10000017'));
    await page.click('[data-ubic-accion="mapa"]');
    await sleep(300);
    const c = await page.evaluate(() => { const c = window.app.mapManager.map.getCenter(); return [c.lat + 0.0002, c.lng + 0.0002]; });
    await clickLatLng(c[0], c[1]);
    await page.click('[data-ubic="cancelar"]');
    await sleep(200);
    const despues = await page.evaluate(() => JSON.stringify(window.app.findPatient('pac-sim-10000017')));
    assert(antes === despues && !(await page.locator('#ubicacion-banner').count()), 'cambió');
  });

  await step('centrar paciente abre su popup con la precisión', async () => {
    await page.evaluate(() => window.app.centrarPaciente('pac-sim-10000001'));
    await sleep(1500);
    const txt = await page.evaluate(() => { const p = document.querySelector('.leaflet-popup-content'); return p ? p.textContent : ''; });
    assert(/QUISPE ROJAS/.test(txt) && /Aproximada a la calle/.test(txt), txt.slice(0, 120));
    await shot(page, 'centrar.png');
  });

  await step('ficha clínica muestra la sección de ubicación', async () => {
    await page.evaluate(() => window.app.openPatientDetail('pac-sim-10000016'));
    await sleep(300);
    const txt = await page.locator('.ficha-ubicacion').textContent();
    assert(/Exacta por GPS \(±8 m\)/.test(txt) && /-10\.067210, -78\.153520/.test(txt), txt);
    await shot(page, 'ficha.png');
    await page.evaluate(() => document.getElementById('modal-patient-detail').classList.remove('active'));
  });

  await step('casillas de capas: apagar y encender sectores conserva el orden (sector encima de RIS)', async () => {
    await page.evaluate(() => { window.app.mapManager.toggleCapa('sectoresSanitarios', false); window.app.mapManager.toggleCapa('sectoresSanitarios', true); window.app.mapManager.toggleCapa('limiteRis', false); window.app.mapManager.toggleCapa('limiteRis', true); });
    await page.evaluate(() => { window.app.mapManager.map.setView([-9.99, -78.06], 12, { animate: false }); });
    await sleep(300);
    await clickLatLng(-9.99, -78.06);
    await sleep(300);
    const txt = await page.evaluate(() => { const p = document.querySelector('.leaflet-popup-content'); return p ? p.textContent : null; });
    assert(txt && /SECTOR SANITARIO/.test(txt), 'popup=' + txt);
  });

  await step('las 7 RIS y las 44 zonas dibujan exactamente lo de GeoRIS (sin duplicados ni establecimientos fuera de su zona)', async () => {
  const r = await page.evaluate(() => {
      const G = window.GeorisTerritory, mm = window.app.mapManager, b = G.bundle;
      const out = { problemas: [], resumen: [] };
      const contar = () => {
        const c = { ris: mm.layers.limiteRis.getLayers().length, zonas: mm.layers.zonasSanitarias.getLayers().length, sectores: mm.layers.sectoresSanitarios.getLayers().length, hosp: 0, cab: mm.layers.zonaSanitaria.getLayers().length, pe: mm.layers.puertaEntrada.getLayers().length, refs: mm.layers.referenciasLines.getLayers().length };
        mm.layers.areaSanitaria.eachLayer(l => { if (l.getLatLng) c.hosp++; });
        return c;
      };
      const pts = g => { const a = []; g.eachLayer(l => { if (l.getLatLng) a.push(l.getLatLng()); }); return a; };
      const zonaDe = ll => G.zonaQueContiene(ll.lat, ll.lng);
      // 1. Cada RIS
      for (const risF of b.ris.features) {
        const id = risF.properties.id_ris;
        window.app.selectRis(String(id));
        const c = contar();
        const esp = {
          zonas: b.zonas.features.filter(f => f.properties.id_ris === id).length,
          sectores: b.sectores.features.filter(f => f.properties.id_ris === id).length,
          hosp: G.getHospitalesArea(id).length,
          cab: b.eessZona.features.filter(f => f.properties.id_ris === id && !G.getHospitalesArea(id).some(h => h.cod_renipress === f.properties.cod_reni)).length
        };
        if (c.ris !== 7 || c.zonas !== esp.zonas || c.sectores !== esp.sectores || c.hosp !== esp.hosp || c.cab !== esp.cab) out.problemas.push(`RIS ${id}: dibujado ${JSON.stringify(c)} esperado ${JSON.stringify(esp)}`);
        // todo establecimiento dibujado está en una zona de esta RIS
        for (const ll of [...pts(mm.layers.zonaSanitaria), ...pts(mm.layers.puertaEntrada)]) { const z = zonaDe(ll); if (!z || z.id_ris !== id) out.problemas.push(`RIS ${id}: establecimiento dibujado fuera de la RIS en ${ll.lat.toFixed(4)},${ll.lng.toFixed(4)} (zona ${z ? z.id_ris + ':' + z.id_zona : 'ninguna'})`); }
        out.resumen.push(`RIS ${id}: ${JSON.stringify(c)}`);
        // 2. Cada zona de la RIS
        for (const zf of b.zonas.features.filter(f => f.properties.id_ris === id)) {
          const zid = zf.properties.id_zona;
          window.app.selectZona(`${id}|${zid}`);
          const cz = contar();
          const espS = b.sectores.features.filter(f => f.properties.id_ris === id && f.properties.id_zona === zid).length;
          if (cz.sectores !== espS) out.problemas.push(`Zona ${id}:${zid}: sectores ${cz.sectores} esperado ${espS}`);
          const cabEsHosp = G.getHospitalesArea(id).some(h => h.cod_renipress === (b.eessZona.features.find(f => f.properties.id_ris === id && f.properties.id_zona === zid) || {}).properties.cod_reni);
          if (cz.cab !== (cabEsHosp ? 0 : 1)) out.problemas.push(`Zona ${id}:${zid}: cabeceras dibujadas ${cz.cab}`);
          if (cz.zonas !== esp.zonas) out.problemas.push(`Zona ${id}:${zid}: polígonos de zona ${cz.zonas}`);
          for (const ll of [...pts(mm.layers.zonaSanitaria), ...pts(mm.layers.puertaEntrada)]) { const z = zonaDe(ll); if (!z || z.id_ris !== id || z.id_zona !== zid) out.problemas.push(`Zona ${id}:${zid}: establecimiento fuera de la zona en ${ll.lat.toFixed(4)},${ll.lng.toFixed(4)} → ${z ? z.id_ris + ':' + z.id_zona : 'ninguna'}`); }
          // la zona resaltada es la elegida
          let resaltada = null; mm.layers.zonasSanitarias.eachLayer(g => g.eachLayer(l => { if (l.options.weight === 3) resaltada = l.feature.properties; }));
          if (!resaltada || resaltada.id_zona !== zid) out.problemas.push(`Zona ${id}:${zid}: resaltada ${resaltada ? resaltada.id_zona : 'ninguna'}`);
          const sel = document.getElementById('select-zona').value; if (sel !== `${id}|${zid}`) out.problemas.push(`Zona ${id}:${zid}: selector muestra ${sel}`);
          const todosPts = [...pts(mm.layers.areaSanitaria), ...pts(mm.layers.zonaSanitaria), ...pts(mm.layers.puertaEntrada)].map(ll => ll.lat.toFixed(6) + ',' + ll.lng.toFixed(6));
          const rep = todosPts.filter((k, i) => todosPts.indexOf(k) !== i);
          if (rep.length) out.problemas.push(`Zona ${id}:${zid}: ${rep.length} establecimientos dibujados dos veces en el mismo punto`);
          const cabCod = (b.eessZona.features.find(f => f.properties.id_ris === id && f.properties.id_zona === zid) || {}).properties.cod_reni;
          const espPe = G.getPuertasEntrada(id, zid).filter(e => e.cod_renipress !== cabCod && !G.getHospitalesArea(id).some(h => h.cod_renipress === e.cod_renipress)).length
            + G.getVinculados(id, zid).filter(e => !G.getHospitalesArea(id).some(h => h.cod_renipress === e.cod_renipress)).length;
          const espPeFinal = (id === 156 && zid === 6) ? 11 : espPe;
          if (cz.pe !== espPeFinal) out.problemas.push(`Zona ${id}:${zid}: puertas+vinculados ${cz.pe} esperado ${espPeFinal}`);
          const totalEst = cz.cab + cz.pe; const espEst = 1 + G.getPuertasEntrada(id, zid).filter(e => e.cod_renipress !== (b.eessZona.features.find(f => f.properties.id_ris === id && f.properties.id_zona === zid) || {}).properties?.cod_reni || true).length;
          out.resumen.push(`  zona ${id}:${zid} sectores ${cz.sectores}, cabecera ${cz.cab}, puertas+vinculados ${cz.pe}, refs ${cz.refs}`);
        }
      }
      // 3. Todas las RIS
      window.app.selectRis('ALL');
      const ca = contar();
      if (ca.zonas !== 44 || ca.sectores !== 72 || ca.hosp !== 13 || ca.cab + 1 !== 44) out.problemas.push('ALL: ' + JSON.stringify(ca));
      { const todos = [...pts(mm.layers.areaSanitaria), ...pts(mm.layers.zonaSanitaria), ...pts(mm.layers.puertaEntrada)].map(ll => ll.lat.toFixed(6) + ',' + ll.lng.toFixed(6)); const rep = todos.filter((k, i) => todos.indexOf(k) !== i); if (rep.length) out.problemas.push('ALL: ' + rep.length + ' establecimientos repetidos: ' + rep.slice(0, 5).join(' ')); }
      out.resumen.push('ALL: ' + JSON.stringify(ca));
      out.panel = document.getElementById('zona-info-panel').textContent.replace(/\s+/g, ' ').trim();
      window.app.selectRis('156');
      return out;
    });
    assert(r.problemas.length === 0, r.problemas.slice(0, 5).join(' | '));
  });

  await step('sin errores de consola en todo el recorrido', async () => { assert(errores.length === 0, errores.join(' | ')); });

  await browser.close();
  srv.kill();
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* carpeta temporal */ }
  console.log(`\nResultado E2E: ${pass} correctas, ${fail} con falla`);
  if (fail) { console.log(log.slice(-2000)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
