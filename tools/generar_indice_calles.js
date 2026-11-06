/**
 * generar_indice_calles.js
 * Genera client/js/map/huarmeyCallesIndex.js: índice reducido de las vías CON NOMBRE del catastro
 * (client/data/georis/huarmeyCadastreBundle.js, origen OpenStreetMap, no oficial).
 * El geocodificador lo usa para poner el pin SOBRE la línea de la calle (G-05) sin cargar los 2,1 MB del catastro.
 * El catastro no tiene numeración, manzana ni lote (G9): la precisión máxima posible es «calle».
 * Solo usa geometría de vías; no toca datos de pacientes.
 * Uso: node tools/generar_indice_calles.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'client', 'data', 'georis', 'huarmeyCadastreBundle.js');
const OUT = path.join(ROOT, 'client', 'js', 'map', 'huarmeyCallesIndex.js');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: SRC });
const C = sandbox.window.HUARMEY_CADASTRE;

const porNombre = new Map();
for (const f of C.features) {
  const p = f.properties || {};
  if (p.type !== 'highway' || !p.name || !f.geometry || f.geometry.type !== 'LineString') continue;
  const nombre = String(p.name).trim();
  if (!porNombre.has(nombre)) porNombre.set(nombre, []);
  porNombre.get(nombre).push(f.geometry.coordinates.map(([lng, lat]) => [+lat.toFixed(6), +lng.toFixed(6)]));
}

const calles = [...porNombre.entries()]
  .sort((a, b) => a[0].localeCompare(b[0], 'es'))
  .map(([nombre, tramos]) => ({ nombre, tramos }));

const nVertices = calles.reduce((s, c) => s + c.tramos.reduce((t, tr) => t + tr.length, 0), 0);
const body = `/**
 * huarmeyCallesIndex.js — ARCHIVO GENERADO por tools/generar_indice_calles.js (no editar a mano).
 * Vías con nombre del catastro de Huarmey (OpenStreetMap, no oficial): ${calles.length} nombres, ${nVertices} vértices.
 * Coordenadas [lat, lng]. Sin numeración de puerta: solo sirve para ubicar «sobre la calle».
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.HUARMEY_CALLES_INDEX = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  return ${JSON.stringify({ fuente: 'OpenStreetMap (catastro del repositorio)', calles })};
});
`;
fs.writeFileSync(OUT, body);
console.log(`Índice generado: ${path.relative(ROOT, OUT)} (${calles.length} calles, ${nVertices} vértices, ${(body.length / 1024).toFixed(1)} KB)`);
