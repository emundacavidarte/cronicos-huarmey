/*
 * descargar_georis_en_navegador.js
 * Descarga las capas GeoRIS OFICIALES de Áncash desde el navegador del usuario (su conexión y su sesión normales).
 *
 * CÓMO USARLO (Chrome o Edge en la PC de la oficina):
 *   1. Abra https://geominsa.minsa.gob.pe/geominsaserver/rest/services  (debe verse la lista de servicios del MINSA).
 *   2. Pulse F12 → pestaña «Consola». Si Chrome lo pide, escriba «permitir pegar» (o «allow pasting») y Enter.
 *   3. Copie TODO este archivo, péguelo en la consola y pulse Enter.
 *   4. Si el navegador pregunta si permite descargar varios archivos, elija «Permitir».
 *   5. Se descargan ris.geojson, zonas.geojson, sectores.geojson, eessArea.geojson, eessZona.geojson,
 *      eessPuertas.geojson, eessVinculados.geojson y manifiesto.json a la carpeta Descargas.
 *   6. Muévalos a la carpeta georis_oficial/ del proyecto y súbala (vea georis_oficial/LEEME.md).
 *
 * Hace consultas de a una, con una pausa entre cada una, a la API pública ArcGIS REST del MINSA (la misma que usa su
 * visor). Solo lee datos públicos de establecimientos y polígonos sanitarios; no envía nada.
 */
(async () => {
  const SERVICIOS = [
    'Hosted/RIS_PERU_FINAL_gdb/FeatureServer',
    'SRV_APP_DGAIN_DIPOS/SRV_DGAIN_DIPOS_Poligonos_Sanitarios_RIS_CONFORMADA/MapServer'
  ];
  const CAPAS = [
    { clave: 'ris', tipo: 'poligono', nombre: /^(RIS_TOTAL|RIS|AREA[_ ]?SANITARIA|AREAS?[_ ]?SANITARIAS?)$/i },
    { clave: 'zonas', tipo: 'poligono', nombre: /^(ZONAS?_TOTAL|ZONAS?[_ ]?SANITARIAS?)$/i },
    { clave: 'sectores', tipo: 'poligono', nombre: /^(SECTOR(ES)?_TOTAL|SECTOR(ES)?[_ ]?SANITARIOS?)$/i },
    { clave: 'eessArea', tipo: 'punto', nombre: /^P_AREA(_TOTAL)?$/i },
    { clave: 'eessZona', tipo: 'punto', nombre: /^P_REF(_TOTAL)?$/i },
    { clave: 'eessPuertas', tipo: 'punto', nombre: /^P_ENT(_TOTAL)?$/i },
    { clave: 'eessVinculados', tipo: 'punto', nombre: /^P_VIN(_TOTAL)?$/i }
  ];
  const BBOX_ANCASH = '-78.95,-11.10,-76.60,-7.70';
  const PAUSA_MS = 300;
  const base = (window.GEORIS_BASE || (location.origin + '/geominsaserver')) + '/rest/services/';
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const qs = o => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const log = (...a) => console.log('%c[GeoRIS]', 'color:#0369a1;font-weight:bold', ...a);

  async function getJson(url) {
    await esperar(PAUSA_MS);
    const res = await fetch(url, { credentials: 'same-origin' });
    const texto = await res.text();
    let json;
    try { json = JSON.parse(texto); } catch (e) { throw new Error(`La respuesta no es JSON (${res.status}). ¿Está en una página de geominsa.minsa.gob.pe y la lista de servicios se ve bien? ${url}`); }
    if (json && json.error) throw new Error(`ArcGIS: ${json.error.code} ${json.error.message} (${url})`);
    return json;
  }
  function areaFirmada(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[i][0] - r[j][0]) * (r[i][1] + r[j][1]); return a / 2; }
  function enAnillo(x, y, r) {
    let ins = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins;
    }
    return ins;
  }
  function esriAGeojson(g) {
    if (!g) return null;
    if (typeof g.x === 'number' && typeof g.y === 'number') return { type: 'Point', coordinates: [g.x, g.y] };
    if (!Array.isArray(g.rings)) return null;
    const anillos = g.rings.filter(r => Array.isArray(r) && r.length >= 4);
    let ext = anillos.filter(r => areaFirmada(r) > 0), huecos = anillos.filter(r => areaFirmada(r) <= 0);
    if (!ext.length) { ext = huecos; huecos = []; }
    const polis = ext.map(e => [e]);
    for (const h of huecos) { const d = polis.find(p => enAnillo(h[0][0], h[0][1], p[0])); if (d) d.push(h); }
    if (!polis.length) return null;
    return polis.length === 1 ? { type: 'Polygon', coordinates: polis[0] } : { type: 'MultiPolygon', coordinates: polis };
  }
  function descargar(nombre, objeto) {
    const blob = new Blob([JSON.stringify(objeto)], { type: 'application/geo+json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  const resultado = {};
  const fuentes = {};
  for (const servicio of SERVICIOS) {
    let meta;
    try { meta = await getJson(`${base}${servicio}?f=json`); } catch (e) { log(`${servicio}: no disponible (${e.message})`); continue; }
    const capas = [...(meta.layers || []), ...(meta.tables || [])];
    log(`${servicio}: ${capas.map(c => c.name).join(', ')}`);
    for (const def of CAPAS) {
      if (resultado[def.clave]) continue;
      const c = capas.find(x => def.nombre.test(String(x.name).trim()));
      if (!c) continue;
      const url = `${base}${servicio}/${c.id}`;
      const info = await getJson(`${url}?f=json`);
      if ((def.tipo === 'poligono') !== /polygon/i.test(info.geometryType || '')) continue;
      const ids = await getJson(`${url}/query?${qs({ where: '1=1', geometry: BBOX_ANCASH, geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', returnIdsOnly: 'true', f: 'json' })}`);
      const lista = (ids.objectIds || []).slice().sort((a, b) => a - b);
      const lote = Math.max(1, Math.min(Number(info.maxRecordCount) || 1000, 200));
      const features = [];
      for (let i = 0; i < lista.length; i += lote) {
        const r = await getJson(`${url}/query?${qs({ objectIds: lista.slice(i, i + lote).join(','), outFields: '*', returnGeometry: 'true', outSR: 4326, geometryPrecision: 6, f: 'json' })}`);
        for (const f of (r.features || [])) { const geometry = esriAGeojson(f.geometry); if (geometry) features.push({ type: 'Feature', properties: f.attributes, geometry }); }
        log(`${def.clave} (${c.name}): ${features.length}/${lista.length}`);
      }
      resultado[def.clave] = { type: 'FeatureCollection', features };
      fuentes[def.clave] = url;
    }
  }
  const obtenidas = Object.keys(resultado);
  if (!obtenidas.length) { console.error('[GeoRIS] No se encontró ninguna capa. Revise que la página sea de geominsa.minsa.gob.pe.'); return; }
  for (const c of obtenidas) { descargar(`${c}.geojson`, resultado[c]); await esperar(700); }
  descargar('manifiesto.json', {
    fuente: base, descargado: new Date().toISOString(), navegador: navigator.userAgent,
    capas: Object.fromEntries(obtenidas.map(c => [c, { url: fuentes[c], elementos: resultado[c].features.length }])),
    faltantes: CAPAS.map(d => d.clave).filter(c => !resultado[c])
  });
  log(`Listo: ${obtenidas.map(c => `${c} (${resultado[c].features.length})`).join(', ')}. Mueva los archivos de Descargas a la carpeta georis_oficial/ del proyecto.`);
})().catch(e => console.error('[GeoRIS] Error:', e.message));
