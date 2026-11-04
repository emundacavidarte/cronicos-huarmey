#!/usr/bin/env node
'use strict';

/*
 * verificar_semaforo.js
 * Uso: node tools/verificar_semaforo.js <ruta a sampleDataset.js> [--hoy=yyyy-mm-dd]
 * Aplica client/js/clinical/semaforo.js al padrón (en memoria, sin escribir nada) e imprime SOLO conteos:
 * semáforo guardado vs recalculado, y personas únicas por DNI.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const S = require(path.join(__dirname, '..', 'client', 'js', 'clinical', 'semaforo.js'));

const args = process.argv.slice(2);
const ruta = args.find((a) => !a.startsWith('--'));
const optHoy = (args.find((a) => a.startsWith('--hoy=')) || '').split('=')[1];
if (!ruta) {
  console.error('Uso: node tools/verificar_semaforo.js <ruta a sampleDataset.js> [--hoy=yyyy-mm-dd]');
  process.exit(1);
}

try {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(ruta, 'utf8'), sandbox, { timeout: 15000 });
  const regs = Object.values(sandbox.window).find((v) => Array.isArray(v) && v.length);
  const hoy = optHoy ? S.parseFechaLocal(optHoy) : new Date();

  const guardado = {};
  for (const p of regs) guardado[p.semaforo] = (guardado[p.semaforo] || 0) + 1;

  const cambios = S.aplicarSemaforo(regs, hoy);
  const nuevo = {};
  for (const p of regs) nuevo[p.semaforo] = (nuevo[p.semaforo] || 0) + 1;
  const cruce = {};
  for (const p of regs) {
    const k = (p.semaforo_guardado === undefined ? p.semaforo : p.semaforo_guardado) + ' -> ' + p.semaforo;
    cruce[k] = (cruce[k] || 0) + 1;
  }
  const fmt = (o) => Object.keys(o).sort().map((k) => k + '=' + o[k]).join(', ');
  const dnis = new Set(regs.map((p) => String(p.dni).trim()));

  console.log('Hoy de referencia: ' + hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0'));
  console.log('Registros: ' + regs.length + ' | personas únicas por DNI: ' + dnis.size);
  console.log('Semáforo guardado : ' + fmt(guardado));
  console.log('Semáforo recalculado: ' + fmt(nuevo));
  console.log('Registros que cambian de color: ' + cambios);
  console.log('Detalle guardado -> recalculado: ' + fmt(cruce));
} catch (err) {
  console.error('Error: ' + (err && err.message ? err.message : String(err)));
  process.exit(1);
}
