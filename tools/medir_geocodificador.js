/**
 * medir_geocodificador.js
 * Prueba y mide la precisión del geocodificador determinista (G-02):
 * 1. Determinismo: la misma dirección produce exactamente las mismas coordenadas en N llamadas.
 * 2. Delimitación de palabras completas: "CONCENTRO 45" y "Centro Poblado Los Pinos" no caen en la plaza.
 * 3. Especificidad de toponimia: "Av. Grau s/n Puerto Huarmey" resuelve en Puerto Huarmey, no en Grau centro.
 * 4. Honestidad ante direcciones vacías o sin coincidencia: matched=false y lat=null, lng=null.
 * 5. Sectorización oficial: asignación por punto-en-polígono con sectores GeoRIS (62 a 72).
 */
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const geocoder = require(path.join(ROOT, 'client', 'js', 'map', 'ancashGeocoder.js'));

console.log('=== MEDICIÓN Y PRUEBA DEL GEOCODIFICADOR DETERMINISTA (G-02) ===\n');

let passed = 0;
let failed = 0;

function test(desc, fn) {
  try {
    fn();
    console.log(`  OK    ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${desc}: ${err.message}`);
    failed++;
  }
}

// 1. Determinismo
test('Determinismo: "Jr Bolognesi 120" produce coordenadas idénticas en 10 llamadas', () => {
  const r1 = geocoder.geocode('Jr Bolognesi 120');
  for (let i = 0; i < 9; i++) {
    const ri = geocoder.geocode('Jr Bolognesi 120');
    assert.strictEqual(ri.lat, r1.lat, `Latitud difiere en iteración ${i}`);
    assert.strictEqual(ri.lng, r1.lng, `Longitud difiere en iteración ${i}`);
    assert.strictEqual(ri.sector, r1.sector);
  }
});

// 2. Falsos positivos de subcadenas eliminados
test('"CONCENTRO 45" no coincide con "CENTRO" (matched=false)', () => {
  const r = geocoder.geocode('CONCENTRO 45');
  assert.strictEqual(r.matched, false);
  assert.strictEqual(r.lat, null);
  assert.strictEqual(r.lng, null);
});

test('"Centro Poblado Los Pinos" no coincide con "CENTRO" (Plaza de Armas)', () => {
  const r = geocoder.geocode('Centro Poblado Los Pinos');
  assert.strictEqual(r.matched, false);
  assert.strictEqual(r.lat, null);
});

test('"Calle Nueva Esperanza 12" no coincide con "CALLE NUEVA" del casco urbano', () => {
  const r = geocoder.geocode('Calle Nueva Esperanza 12');
  assert.strictEqual(r.matched, false);
});

// 3. Especificidad de frases largas
test('"Av. Grau s/n Puerto Huarmey" resuelve en Puerto Huarmey (00001742)', () => {
  const r = geocoder.geocode('Av. Grau s/n Puerto Huarmey');
  assert.strictEqual(r.matched, true);
  assert.strictEqual(r.es_puerta_id, '00001742');
  assert.strictEqual(r.sector, 'Sector 66');
});

test('"Jr Casma 123" resuelve en calle Casma de Huarmey, mientras "Ciudad de Casma" en Casma', () => {
  const rCalle = geocoder.geocode('Jr Casma 123');
  const rCiudad = geocoder.geocode('Ciudad de Casma');
  assert.strictEqual(rCalle.matched, true);
  // Puerta de entrada GeoRIS del sector 67 (casco urbano) = C.S. La Victoria; el hospital es el área sanitaria
  assert.strictEqual(rCalle.es_puerta_id, '00001744');
  assert.ok(['Sector 67', 'Sector 69'].includes(rCalle.sector), 'Jr. Casma está entre los sectores 67 y 69');
  assert.strictEqual(rCiudad.matched, true);
  assert.strictEqual(rCiudad.es_puerta_id, '00001719');
});

// 4. Honestidad
test('Dirección vacía o null devuelve matched=false sin coordenadas inventadas', () => {
  const rVacio = geocoder.geocode('');
  assert.strictEqual(rVacio.matched, false);
  assert.strictEqual(rVacio.lat, null);
  assert.strictEqual(rVacio.lng, null);
  assert.strictEqual(rVacio.precision_geo, 'sin_ubicacion');

  const rNull = geocoder.geocode(null);
  assert.strictEqual(rNull.matched, false);
  assert.strictEqual(rNull.lat, null);
});

// 5. Coordenadas oficiales y sectorización GeoRIS
test('Topónimos andinos tienen coordenadas GeoRIS y sectores numerados (62-72)', () => {
  const rHuayan = geocoder.geocode('Distrito de Huayan');
  assert.strictEqual(rHuayan.matched, true);
  assert.strictEqual(rHuayan.es_puerta_id, '00001752');
  assert.strictEqual(rHuayan.sector, 'Sector 72');

  const rCochapeti = geocoder.geocode('Puesto de Salud Cochapeti');
  assert.strictEqual(rCochapeti.matched, true);
  assert.strictEqual(rCochapeti.es_puerta_id, '00001749');
  assert.strictEqual(rCochapeti.sector, 'Sector 71');

  const rCulebras = geocoder.geocode('Caleta Culebras');
  assert.strictEqual(rCulebras.matched, true);
  assert.strictEqual(rCulebras.es_puerta_id, '00001743');
  assert.strictEqual(rCulebras.sector, 'Sector 62');
});

// 6. Corrección de vías con Catastro
test('El Olivar y Panamericana Norte usan coordenadas ajustadas con el catastro', () => {
  const rOlivar = geocoder.geocode('Av. El Olivar');
  assert.strictEqual(rOlivar.matched, true);
  // Alrededor de -10.06058
  assert.ok(Math.abs(rOlivar.lat - (-10.06058)) < 0.005);

  const rPana = geocoder.geocode('Panamericana Norte');
  assert.strictEqual(rPana.matched, true);
  assert.ok(Math.abs(rPana.lat - (-10.05200)) < 0.005);
});

// 7. Auditoría 06/11/2026: calles homónimas de ciudades, ciudad explícita, cuadra por número de puerta
test('"Jr Huaraz 145", "Av Casma 230", "Jr Chimbote 12" no se mandan a Huaraz, Casma ni Chimbote', () => {
  for (const a of ['Jr Huaraz 145', 'Av Casma 230', 'Jr Chimbote 12']) assert.notStrictEqual(geocoder.geocode(a).precision_geo, 'localidad', a);
});
test('"Urb Buenos Aires, Chimbote" va a Chimbote (RIS Pacífico Norte), no al AH Buenos Aires de Huarmey', () => {
  assert.strictEqual(geocoder.geocode('Urb Buenos Aires, Chimbote').es_puerta_id, '00001652');
});
test('"Jr. Bolognesi 330" se ubica en la cuadra 3 sobre la línea de la calle', () => {
  const r = geocoder.geocode('Jr. Bolognesi 330');
  assert.strictEqual(r.precision_geo, 'cuadra');
  assert.strictEqual(r.cuadra, 3);
  assert.strictEqual(r.fuente_geo, 'catastro_osm');
});

// Resumen de cobertura del diccionario contra el catastro (solo vías, sin pacientes)
const conCatastro = new Set(geocoder.entries.filter(e => e.tramos).map(e => e.catastro.join('/')));
console.log(`\nCobertura: ${conCatastro.size} vías del diccionario con línea del catastro; ${new Set(geocoder.entries.filter(e => !e.tramos && e.precision === 'calle').map(e => e._item.keywords[0])).size} calles solo con punto de referencia.`);

console.log(`\nResultado: ${passed} correctas, ${failed} con falla`);
if (failed > 0) process.exit(1);
