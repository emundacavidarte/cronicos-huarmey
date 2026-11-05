/**
 * testComparadorGeoris.js
 * Prueba de tools/comparar_georis_oficial.js contra un servidor ArcGIS REST SIMULADO en el puerto 3112 (sin internet):
 * sirve las capas del bundle como si fueran las oficiales, con cambios conocidos, y comprueba que la herramienta los
 * detecta, filtra lo que no es de Áncash, actualiza una COPIA del bundle con respaldo y no toca archivos del proyecto.
 * También comprueba que ante una página de bloqueo de Cloudflare se detiene con un mensaje claro (sin evadirlo).
 * Ejecutar: node server/tests/testComparadorGeoris.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const TOOL = path.join(ROOT, 'tools', 'comparar_georis_oficial.js');
const BUNDLE = path.join(ROOT, 'client', 'data', 'georis', 'georisDataBundle.js');
const PORT = 3112;
let passed = 0;
let failed = 0;
function step(name, fn) {
  try { fn(); passed++; console.log('  OK    ' + name); }
  catch (e) { failed++; console.log('  FALLA ' + name + '\n        ' + e.message); }
}

const { iniciar } = require('./helpers/mockArcgis');

iniciar(PORT).then(({ srv, pob67, base, bloqueado }) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'comparador-georis-'));
  const copia = path.join(tmp, 'georisDataBundle.js');
  fs.copyFileSync(BUNDLE, copia);
  const proyectoAntes = ['client/index.html', 'client/sw.js', 'client/data/georis/georisDataBundle.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const correr = (args, cb) => {
    const { spawn } = require('child_process');
    const ch = spawn(process.execPath, [TOOL, ...args], { cwd: ROOT });
    let out = '';
    ch.stdout.on('data', d => { out += d; });
    ch.stderr.on('data', d => { out += d; });
    ch.on('close', code => cb(code, out));
  };

  console.log('Comparador con la fuente oficial de GeoRIS (servidor simulado)');
  correr([`--base=${base}`, `--bundle=${copia}`, `--informe=${path.join(tmp, 'informe.md')}`, `--guardar=${path.join(tmp, 'oficial')}`, '--actualizar'], (code, out) => {
    const inf = fs.existsSync(path.join(tmp, 'informe.md')) ? fs.readFileSync(path.join(tmp, 'informe.md'), 'utf8') : '';
    const res = fs.existsSync(path.join(tmp, 'COMPARACION_GEORIS_OFICIAL.json')) ? JSON.parse(fs.readFileSync(path.join(tmp, 'COMPARACION_GEORIS_OFICIAL.json'), 'utf8')) : { resultados: [] };
    const r = c => res.resultados.find(x => x.clave === c) || {};

    step('descarga las 7 capas, convierte Esri JSON y sale con código 1 (hay diferencias)', () => {
      assert.strictEqual(code, 1, out);
      assert.strictEqual(res.resultados.length, 7);
      assert.deepStrictEqual(res.faltantes, []);
    });
    step('capas sin cambios: todo igual (atributos y geometría, también polígonos con hueco y multipolígonos)', () => {
      const unicos = { ris: 7, zonas: 44, eessArea: 13, eessZona: 44, eessVinculados: 184 }; // eessArea: Sihuas viene dos veces
      for (const c of Object.keys(unicos)) {
        const x = r(c);
        assert.strictEqual(x.iguales, unicos[c], `${c}: ${JSON.stringify({ i: x.iguales, b: x.bundle, a: x.atributos, g: x.geometria })}`);
        assert.strictEqual(x.soloOficial.length + x.soloBundle.length + x.atributos.length + x.geometria.length, 0, c);
      }
    });
    step('detecta la población distinta del sector 67, el sector nuevo de la RIS 157 y descarta el de Lima', () => {
      const x = r('sectores');
      assert.strictEqual(x.oficial, 73, 'el elemento de Lima no debía contarse');
      assert.deepStrictEqual(x.soloOficial.map(e => e.clave), ['157:1']);
      assert.strictEqual(x.atributos.length, 1);
      assert.strictEqual(x.atributos[0].clave, '156:67');
      assert.strictEqual(x.atributos[0].difs[0].campo, 'pob_t');
      assert.ok(/\| sectores \| 73 \| 72 \|/.test(inf), 'el informe no trae la fila de sectores');
    });
    step('detecta el puesto de salud desplazado (~500 m)', () => {
      const g = r('eessPuertas').geometria;
      assert.strictEqual(g.length, 1);
      assert.strictEqual(g[0].clave, '00001743');
      assert.ok(g[0].distancia_m > 450 && g[0].distancia_m < 550, String(g[0].distancia_m));
    });
    step('--actualizar reemplaza las capas en la COPIA del bundle, con respaldo, y no toca archivos del proyecto', () => {
      global.window = {};
      new Function('window', fs.readFileSync(copia, 'utf8'))(global.window);
      const nuevo = global.window.GEORIS_DATA_BUNDLE;
      assert.strictEqual(nuevo.sectores.features.length, 73);
      assert.ok(nuevo.sectores.features.some(f => f.properties.id_ris === 157 && f.properties.id_sector === 1));
      assert.strictEqual(nuevo.sectores.features.find(f => f.properties.id_sector === 67 && f.properties.id_ris === 156).properties.pob_t, pob67);
      assert.ok(fs.readdirSync(tmp).some(f => /^georisDataBundle\.backup-.*\.js$/.test(f)), 'sin copia de respaldo');
      const proyectoDespues = ['client/index.html', 'client/sw.js', 'client/data/georis/georisDataBundle.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'));
      assert.ok(proyectoAntes.every((t, i) => t === proyectoDespues[i]), 'se modificó un archivo del proyecto');
    });

    correr([`--base=${bloqueado}`, `--bundle=${copia}`, `--informe=${path.join(tmp, 'informe2.md')}`, `--guardar=${path.join(tmp, 'oficial2')}`], (code2, out2) => {
      step('ante el bloqueo de Cloudflare se detiene (código 2) y explica qué hacer, sin reintentar evadirlo', () => {
        assert.strictEqual(code2, 2, out2);
        assert.ok(/Cloudflare/.test(out2) && /conexión normal/.test(out2), out2);
      });
      srv.close();
      fs.rmSync(tmp, { recursive: true, force: true });
      console.log(`\nResultado Comparador GeoRIS: ${passed} correctas, ${failed} con falla`);
      process.exit(failed ? 1 : 0);
    });
  });
});
