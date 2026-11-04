const path = require('path');
global.window = {};
require('../client/data/georis/georisDataBundle.js');
const B = global.window.GEORIS_DATA_BUNDLE;

function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function inGeom(lng, lat, g) {
  if (!g) return false;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some(p => inRing(lng, lat, p[0]) && !p.slice(1).some(h => inRing(lng, lat, h)));
}
function getSectorFromGeoRIS(lat, lng) {
  if (!B || !B.sectores) return null;
  const f = B.sectores.features.find(f => inGeom(lng, lat, f.geometry));
  if (!f) return null;
  return {
    id_sector: f.properties.id_sector,
    nombre: 'Sector ' + f.properties.id_sector,
    ipress: f.properties.ipress,
    distrito: f.properties.distrito,
    id_zona: f.properties.id_zona,
    id_ris: f.properties.id_ris
  };
}

console.log('Plaza de Armas:', getSectorFromGeoRIS(-10.0689, -78.1524));
console.log('Huayan GeoRIS:', getSectorFromGeoRIS(-9.875857, -77.707839));
console.log('Cochapeti GeoRIS:', getSectorFromGeoRIS(-9.985718, -77.645025));
