/**
 * mockArcgis.js
 * Servidor ArcGIS REST SIMULADO para pruebas (sin internet): sirve las capas del bundle del prototipo como si fueran
 * las oficiales de GeoRIS (Hosted/RIS_PERU_FINAL_gdb/FeatureServer bajo /geominsaserver/rest/services), con cambios
 * conocidos, en Esri JSON y con nombres de campo en mayúsculas. /bloqueado/ responde como una página de Cloudflare.
 */
const http = require('http');
const path = require('path');

const BUNDLE = path.join(__dirname, '..', '..', '..', 'client', 'data', 'georis', 'georisDataBundle.js');
const PREFIJO = '/geominsaserver/rest/services/Hosted/RIS_PERU_FINAL_gdb/FeatureServer';
const CAPAS = { 11: ['RIS_TOTAL', 'ris'], 13: ['ZONAS_TOTAL', 'zonas'], 12: ['SECTOR_TOTAL', 'sectores'], 2: ['P_AREA_TOTAL', 'eessArea'], 4: ['P_REF_TOTAL', 'eessZona'], 3: ['P_ENT_TOTAL', 'eessPuertas'], 5: ['P_VIN_TOTAL', 'eessVinculados'] };

function cargarBundle() {
  global.window = global.window || {};
  require(BUNDLE);
  return JSON.parse(JSON.stringify(global.window.GEORIS_DATA_BUNDLE));
}

/** Datos «oficiales»: el bundle con cambios conocidos (población, sector nuevo, puesto movido, un elemento de Lima). */
function datosOficiales() {
  const oficial = cargarBundle();
  const s67 = oficial.sectores.features.find(f => f.properties.id_sector === 67);
  s67.properties.pob_t += 100;
  const culebras = oficial.eessPuertas.features.find(f => f.properties.cod_reni === '00001743');
  culebras.geometry.coordinates = [culebras.geometry.coordinates[0], culebras.geometry.coordinates[1] + 0.0045];
  const z157 = oficial.zonas.features.find(f => f.properties.id_ris === 157 && f.properties.id_zona === 1);
  oficial.sectores.features.push({ type: 'Feature', geometry: z157.geometry, properties: { id_ris: 157, id_zona: 1, id_sector: 1, ipress: z157.properties.ipress, cod_reni: z157.properties.cod_reni, pob_t: z157.properties.pob_t, region: 'ANCASH', departamen: 'ANCASH' } });
  oficial.sectores.features.push({ type: 'Feature', geometry: z157.geometry, properties: { id_ris: 999, id_zona: 1, id_sector: 1, ipress: 'OTRO', cod_reni: '99999999', pob_t: 1, region: 'LIMA', departamen: 'LIMA' } });
  return { oficial, pob67: s67.properties.pob_t };
}

function areaFirmada(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[i][0] - r[j][0]) * (r[i][1] + r[j][1]); return a / 2; }
function aEsri(g) {
  if (g.type === 'Point') return { x: g.coordinates[0], y: g.coordinates[1] };
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const rings = [];
  for (const p of polys) p.forEach((r, i) => { const horario = areaFirmada(r) > 0; rings.push((i === 0) === horario ? r : r.slice().reverse()); });
  return { rings };
}
const MAYUS = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toUpperCase(), v]));

function iniciar(port) {
  const { oficial, pob67 } = datosOficiales();
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = o => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname.startsWith('/bloqueado/')) {
      res.writeHead(403, { 'Content-Type': 'text/html' });
      return res.end('<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head><body>Sorry, you have been blocked</body></html>');
    }
    if (u.pathname === '/geominsaserver/rest/services' && u.searchParams.get('f') !== 'json') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<!DOCTYPE html><html><head><title>Folder: / (simulado)</title></head><body><h2>ArcGIS REST Services Directory</h2></body></html>');
    }
    if (u.pathname === PREFIJO) return json({ layers: Object.entries(CAPAS).map(([id, [name]]) => ({ id: Number(id), name })), maxRecordCount: 1000 });
    const m = new RegExp('^' + PREFIJO + '/(\\d+)(/query)?$').exec(u.pathname);
    if (!m || !CAPAS[m[1]]) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"error":{"code":404,"message":"no existe"}}'); }
    const fc = oficial[CAPAS[m[1]][1]];
    if (!m[2]) return json({ geometryType: fc.features[0].geometry.type === 'Point' ? 'esriGeometryPoint' : 'esriGeometryPolygon', objectIdField: 'OBJECTID', maxRecordCount: 1000 });
    if (u.searchParams.get('returnIdsOnly') === 'true') return json({ objectIdFieldName: 'OBJECTID', objectIds: fc.features.map((f, i) => i + 1) });
    const ids = (u.searchParams.get('objectIds') || '').split(',').filter(Boolean).map(Number);
    return json({ features: ids.map(id => fc.features[id - 1]).filter(Boolean).map((f, i) => ({ attributes: MAYUS({ ...f.properties, objectid: ids[i] }), geometry: aEsri(f.geometry) })) });
  });
  return new Promise(resolve => srv.listen(port, '127.0.0.1', () => resolve({ srv, pob67, base: `http://127.0.0.1:${port}/geominsaserver`, bloqueado: `http://127.0.0.1:${port}/bloqueado` })));
}

module.exports = { iniciar };
