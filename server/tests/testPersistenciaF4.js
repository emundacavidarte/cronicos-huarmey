/**
 * testPersistenciaF4.js
 * Persistencia (Fase 4): guardado con espera máxima (L-04), un solo formato (S-14), transacción todo o nada,
 * respaldos diarios (S-09) y cifrado en reposo opcional con STORE_KEY (F2-18). Cada caso corre en un proceso
 * aparte con una carpeta temporal (DATA_DIR); nunca toca server/db. Ejecutar: node server/tests/testPersistenciaF4.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DB = JSON.stringify(path.join(__dirname, '..', 'db', 'database.js'));
const CLAVE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9a';
let passed = 0;
let failed = 0;

function step(name, fn) {
  try {
    fn();
    passed++;
    console.log('  OK    ' + name);
  } catch (e) {
    failed++;
    console.log('  FALLA ' + name + '\n        ' + e.message);
  }
}

/** Corre `codigo` en un proceso con DATA_DIR=dir (y env extra). Devuelve { status, out }. */
function correr(dir, codigo, env = {}) {
  const r = spawnSync(process.execPath, ['-e', `const db=require(${DB});` + codigo], {
    env: Object.assign({}, process.env, { DATA_DIR: dir, STORE_KEY: '' }, env), encoding: 'utf8', timeout: 30000
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const carpeta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'f4-persist-'));
const paciente = (dni, nombre) => `{id:'pac-00001741-${dni}',dni:'${dni}',apellidos_nombres:'${nombre}'}`;

console.log('Persistencia de la Fase 4\n');

step('S-14 el guardado síncrono (apagado) escribe el mismo formato compacto que el diferido', () => {
  const dir = carpeta();
  assert.strictEqual(correr(dir, `db.upsertPatient(${paciente('96600001', 'COMPACTO F4')});db.flushSync();`).status, 0);
  const texto = fs.readFileSync(path.join(dir, 'store.json'), 'utf8');
  assert.ok(!texto.includes('\n  '), 'el archivo tiene sangría');
  fs.rmSync(dir, { recursive: true, force: true });
});

step('L-04 en una ráfaga continua de escrituras el archivo se guarda a más tardar a los 2 s', () => {
  const dir = carpeta();
  // Escribe cada 50 ms durante 3,5 s; a los 2,6 s mira si store.json ya trae una escritura de la ráfaga
  const codigo = `db.flushSync();let i=0;const t0=Date.now();const fs=require('fs');let visto=false;
    const it=setInterval(()=>{db.upsertPatient({id:'pac-00001741-9670'+String(i).padStart(4,'0'),dni:'9670'+String(i).padStart(4,'0'),apellidos_nombres:'RAFAGA '+i});i++;},50);
    setTimeout(()=>{visto=fs.readFileSync(process.env.DATA_DIR+'/store.json','utf8').includes('RAFAGA 1');},2600);
    setTimeout(()=>{clearInterval(it);process.stdout.write(visto?'GUARDADO':'NO_GUARDADO');process.exit(0);},3500);`;
  const r = correr(dir, codigo);
  assert.ok(r.out.includes('GUARDADO') && !r.out.includes('NO_GUARDADO'), r.out);
  fs.rmSync(dir, { recursive: true, force: true });
});

step('una transacción que falla a mitad no deja nada escrito', () => {
  const dir = carpeta();
  const r = correr(dir, `try{db.runTransaction(()=>{db.upsertPatient(${paciente('96600002', 'A MEDIAS')});throw new Error('falla');});}catch(e){}
    process.stdout.write(String(!!db.getPatientByDni('96600002'))+'|'+String(db.getAllPatients().some(p=>p.dni==='96600002')));`);
  assert.strictEqual(r.out.trim(), 'false|false', r.out);
  fs.rmSync(dir, { recursive: true, force: true });
});

step('S-09 cada día queda un respaldo (permisos 600) y se conservan solo los últimos N', () => {
  const dir = carpeta();
  fs.mkdirSync(path.join(dir, 'respaldos'));
  for (let d = 1; d <= 5; d++) fs.writeFileSync(path.join(dir, 'respaldos', `respaldo-2020-01-0${d}.json`), '{}');
  const r = correr(dir, `db.upsertPatient(${paciente('96600003', 'RESPALDO F4')});db.flushSync();db.flushSync();`, { RESPALDOS_DIARIOS: '3' });
  assert.strictEqual(r.status, 0, r.out);
  const lista = fs.readdirSync(path.join(dir, 'respaldos')).sort();
  assert.strictEqual(lista.length, 3, lista.join(','));
  const hoy = lista[lista.length - 1];
  assert.ok(/^respaldo-\d{4}-\d{2}-\d{2}\.json$/.test(hoy) && !hoy.startsWith('respaldo-2020'), hoy);
  assert.strictEqual((fs.statSync(path.join(dir, 'respaldos', hoy)).mode & 0o777).toString(8), '600');
  fs.rmSync(dir, { recursive: true, force: true });
});

step('F2-18 con STORE_KEY el archivo, el .bak y el respaldo van cifrados; con la clave se leen intactos', () => {
  const dir = carpeta();
  assert.strictEqual(correr(dir, `db.upsertPatient(${paciente('96600004', 'CIFRADO SECRETO F4')});db.flushSync();db.flushSync();`, { STORE_KEY: CLAVE }).status, 0);
  for (const f of ['store.json', 'store.json.bak']) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!t.includes('CIFRADO SECRETO F4') && JSON.parse(t).formato === 'cronicos-cifrado-v1', f + ' no está cifrado');
  }
  const resp = fs.readdirSync(path.join(dir, 'respaldos'))[0];
  assert.ok(!fs.readFileSync(path.join(dir, 'respaldos', resp), 'utf8').includes('CIFRADO SECRETO F4'));
  const r = correr(dir, `process.stdout.write(db.getPatientByDni('96600004').apellidos_nombres);`, { STORE_KEY: CLAVE });
  assert.strictEqual(r.out.trim(), 'CIFRADO SECRETO F4', r.out);
  fs.rmSync(dir, { recursive: true, force: true });
});

step('F2-18 sin la clave (o con otra) no arranca, con un mensaje claro, y NO toca el archivo', () => {
  const dir = carpeta();
  correr(dir, `db.upsertPatient(${paciente('96600005', 'SIN CLAVE F4')});db.flushSync();`, { STORE_KEY: CLAVE });
  const antes = fs.readFileSync(path.join(dir, 'store.json'), 'utf8');
  const sin = correr(dir, ``);
  assert.notStrictEqual(sin.status, 0);
  assert.ok(/STORE_KEY/.test(sin.out), sin.out);
  const otra = correr(dir, ``, { STORE_KEY: 'f'.repeat(64) });
  assert.notStrictEqual(otra.status, 0);
  assert.ok(/no corresponde/.test(otra.out), otra.out);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'store.json'), 'utf8'), antes, 'el archivo cambió');
  assert.ok(!fs.readdirSync(dir).some(f => f.includes('corrupt')), 'no debe tratarse como corrupto');
  fs.rmSync(dir, { recursive: true, force: true });
});

step('F2-18 un store.json sin cifrar se lee con STORE_KEY y queda cifrado en el siguiente guardado', () => {
  const dir = carpeta();
  correr(dir, `db.upsertPatient(${paciente('96600006', 'MIGRA F4')});db.flushSync();`);
  assert.ok(fs.readFileSync(path.join(dir, 'store.json'), 'utf8').includes('MIGRA F4'));
  const r = correr(dir, `process.stdout.write(db.getPatientByDni('96600006').apellidos_nombres);db.flushSync();`, { STORE_KEY: CLAVE });
  assert.strictEqual(r.out.trim(), 'MIGRA F4', r.out);
  assert.ok(!fs.readFileSync(path.join(dir, 'store.json'), 'utf8').includes('MIGRA F4'));
  fs.rmSync(dir, { recursive: true, force: true });
});

step('S-09 restauración: copiar el respaldo del día sobre store.json devuelve los datos a ese momento (también cifrados)', () => {
  for (const env of [{}, { STORE_KEY: CLAVE }]) {
    const dir = carpeta();
    // Estado 1: un paciente; el primer guardado del día deja el respaldo
    assert.strictEqual(correr(dir, `db.upsertPatient(${paciente('96600007', 'ANTES DEL ERROR')});db.flushSync();`, env).status, 0);
    // Día siguiente (se simula quitando los respaldos): el primer guardado del día copia el estado anterior
    fs.rmSync(path.join(dir, 'respaldos'), { recursive: true, force: true });
    // Estado 2 (por ejemplo, una importación equivocada): se cambia el nombre
    correr(dir, `db.upsertPatient({id:'pac-00001741-96600007',dni:'96600007',apellidos_nombres:'IMPORTACION EQUIVOCADA'});db.flushSync();`, env);
    const respaldo = path.join(dir, 'respaldos', fs.readdirSync(path.join(dir, 'respaldos'))[0]);
    // Restaurar con el servidor detenido: copiar el respaldo sobre store.json
    fs.copyFileSync(respaldo, path.join(dir, 'store.json'));
    const r = correr(dir, `process.stdout.write(db.getPatientByDni('96600007').apellidos_nombres);`, env);
    assert.strictEqual(r.out.trim(), 'ANTES DEL ERROR', (env.STORE_KEY ? 'cifrado: ' : '') + r.out);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

step('F2-18 una STORE_KEY mal formada se rechaza al cargar', () => {
  const r = correr(carpeta(), ``, { STORE_KEY: 'corta' });
  assert.notStrictEqual(r.status, 0);
  assert.ok(/STORE_KEY debe tener 32 bytes/.test(r.out), r.out);
});

console.log(`\nResultado Persistencia F4: ${passed} correctas, ${failed} con falla`);
process.exit(failed ? 1 : 0);
