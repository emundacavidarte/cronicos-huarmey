/**
 * testDescargaGeorisNavegador.js
 * Prueba en un NAVEGADOR REAL (Chromium con Playwright) el guion tools/descargar_georis_en_navegador.js que el usuario
 * pega en la consola de geominsa.minsa.gob.pe: contra un servidor ArcGIS SIMULADO (sin internet) en el puerto 3113,
 * descarga las 7 capas como GeoJSON, y tools/comparar_georis_oficial.js --desde=<carpeta> las compara y actualiza una
 * COPIA del bundle. No forma parte de `npm test` (necesita Playwright): node server/tests/browser/testDescargaGeorisNavegador.js
 */
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.log('Playwright no está instalado: se omite esta prueba de navegador (npm i -D playwright).');
  process.exit(0);
}
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { iniciar } = require('../helpers/mockArcgis');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const GUION = fs.readFileSync(path.join(ROOT, 'tools', 'descargar_georis_en_navegador.js'), 'utf8');
const PORT = 3113;
let passed = 0, failed = 0;
async function step(name, fn) { try { await fn(); passed++; console.log('  OK    ' + name); } catch (e) { failed++; console.log('  FALLA ' + name + '\n        ' + e.message); } }

(async () => {
  const { srv, pob67, base } = await iniciar(PORT);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'georis-navegador-'));
  const carpeta = path.join(tmp, 'georis_oficial');
  fs.mkdirSync(carpeta);
  const browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const consola = [];
  page.on('console', m => consola.push(m.text()));
  const descargas = [];
  page.on('download', d => descargas.push(d.saveAs(path.join(carpeta, d.suggestedFilename())).then(() => d.suggestedFilename())));
  console.log('Descarga de capas GeoRIS desde el navegador (servidor simulado)');
  try {
    await page.goto(`${base}/rest/services`);
    await step('el guion pegado en la consola descarga las 7 capas y el manifiesto', async () => {
      await page.evaluate(GUION);
      await page.waitForFunction(() => true);
      const limite = Date.now() + 60000;
      while (descargas.length < 8 && Date.now() < limite) await new Promise(r => setTimeout(r, 250));
      const nombres = (await Promise.all(descargas)).sort();
      assert.deepStrictEqual(nombres, ['eessArea.geojson', 'eessPuertas.geojson', 'eessVinculados.geojson', 'eessZona.geojson', 'manifiesto.json', 'ris.geojson', 'sectores.geojson', 'zonas.geojson'], nombres.join(', ') + ' | ' + consola.slice(-3).join(' | '));
      const man = JSON.parse(fs.readFileSync(path.join(carpeta, 'manifiesto.json'), 'utf8'));
      assert.deepStrictEqual(man.faltantes, []);
      assert.strictEqual(man.capas.sectores.elementos, 74, 'el servidor simulado tiene 74 sectores (72 + RIS 157 + uno de Lima)');
      assert.ok(consola.some(t => /Listo/.test(t)), consola.slice(-3).join(' | '));
    });
    await step('las geometrías convertidas a GeoJSON son válidas (polígonos, multipolígonos y puntos)', async () => {
      const zonas = JSON.parse(fs.readFileSync(path.join(carpeta, 'zonas.geojson'), 'utf8'));
      assert.strictEqual(zonas.features.length, 44);
      assert.ok(zonas.features.some(f => f.geometry.type === 'MultiPolygon'), 'falta el multipolígono');
      const p = JSON.parse(fs.readFileSync(path.join(carpeta, 'eessPuertas.geojson'), 'utf8'));
      assert.ok(p.features.every(f => f.geometry.type === 'Point' && f.geometry.coordinates.length === 2));
    });
    await step('el comparador --desde=<carpeta> detecta los cambios y actualiza una COPIA del bundle', async () => {
      const copia = path.join(tmp, 'georisDataBundle.js');
      fs.copyFileSync(path.join(ROOT, 'client', 'data', 'georis', 'georisDataBundle.js'), copia);
      const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'comparar_georis_oficial.js'), `--desde=${carpeta}`, `--bundle=${copia}`, `--informe=${path.join(tmp, 'informe.md')}`, '--actualizar'], { cwd: ROOT, encoding: 'utf8' });
      assert.strictEqual(r.status, 1, r.stdout + r.stderr);
      const res = JSON.parse(fs.readFileSync(path.join(tmp, 'COMPARACION_GEORIS_OFICIAL.json'), 'utf8'));
      const sec = res.resultados.find(x => x.clave === 'sectores');
      assert.deepStrictEqual(sec.soloOficial.map(e => e.clave), ['157:1']);
      assert.strictEqual(sec.atributos[0].clave, '156:67');
      assert.strictEqual(res.resultados.find(x => x.clave === 'eessPuertas').geometria[0].clave, '00001743');
      const w = {};
      new Function('window', fs.readFileSync(copia, 'utf8'))(w);
      assert.strictEqual(w.GEORIS_DATA_BUNDLE.sectores.features.length, 73);
      assert.strictEqual(w.GEORIS_DATA_BUNDLE.sectores.features.find(f => f.properties.id_ris === 156 && f.properties.id_sector === 67).properties.pob_t, pob67);
    });
  } finally {
    await browser.close();
    srv.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\nResultado Descarga GeoRIS en navegador: ${passed} correctas, ${failed} con falla`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
