/**
 * medir_exactitud_campo.js
 * Mide qué tan cerca queda el geocodificador de la vivienda REAL, con una muestra de control tomada en campo.
 *
 * Muestra: CSV con columnas direccion, sector, latitud_gps, longitud_gps (plantilla en
 * templates/muestra_control_geolocalizacion.csv). Solo direcciones y puntos GPS: NO nombres, DNI ni datos clínicos.
 * Cómo se toma: en la puerta de la vivienda, con el GPS del celular (precisión ≤ 10 m), 50 a 100 direcciones
 * de distintos sectores (centro, asentamientos con Mz/Lt, Puerto Huarmey, caseríos).
 *
 * Uso: node tools/medir_exactitud_campo.js <muestra.csv> [--detalle]
 *   --detalle imprime cada dirección con su error (no usar con direcciones de pacientes reales en pantallas compartidas).
 * Resultado: error en metros (mediana, percentil 90) en total y por precisión, % a ≤ 50 m, ≤ 100 m y ≤ 250 m,
 * cuántas no se ubicaron, y si la numeración de cuadras va en el sentido supuesto (desde la Plaza de Armas).
 */
const fs = require('fs');
const path = require('path');
const geocoder = require(path.join(__dirname, '..', 'client', 'js', 'map', 'ancashGeocoder.js'));

const archivo = process.argv[2];
const detalle = process.argv.includes('--detalle');
if (!archivo) {
  console.log('Uso: node tools/medir_exactitud_campo.js <muestra.csv> [--detalle]');
  process.exit(1);
}

function parseCsv(texto) {
  const filas = [];
  let campo = '', fila = [], comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',' || c === ';') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some(x => x.trim() !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some(x => x.trim() !== '')) filas.push(fila);
  return filas;
}

const hav = (a, b, c, d) => {
  const R = 6371000, t = x => x * Math.PI / 180;
  const A = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(A));
};
const percentil = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
};

const filas = parseCsv(fs.readFileSync(archivo, 'utf8').replace(/^﻿/, ''));
const cab = filas.shift().map(h => h.trim().toLowerCase());
const col = n => cab.indexOf(n);
const iDir = col('direccion'), iSec = col('sector'), iLat = col('latitud_gps'), iLng = col('longitud_gps');
if (iDir < 0 || iLat < 0 || iLng < 0) {
  console.log('El CSV debe tener las columnas direccion, sector, latitud_gps, longitud_gps.');
  process.exit(1);
}

const errores = [];
const porPrecision = {};
let sinUbicar = 0, invalidas = 0, sentidoOk = 0, sentidoMal = 0;
for (const f of filas) {
  const lat = geocoder.parseCoordenada(f[iLat]);
  const lng = geocoder.parseCoordenada(f[iLng]);
  const v = geocoder.validarCoordenadas(lat, lng);
  if (!v.ok) { invalidas++; continue; }
  const g = geocoder.geocodeConSector(f[iDir], iSec >= 0 ? f[iSec] : '');
  if (!g.matched) {
    sinUbicar++;
    if (detalle) console.log(`SIN UBICAR | ${f[iDir]}`);
    continue;
  }
  const e = hav(g.lat, g.lng, v.lat, v.lng);
  errores.push(e);
  (porPrecision[g.precision_geo] = porPrecision[g.precision_geo] || []).push(e);
  // Sentido de la numeración: el punto GPS debe estar más cerca de la cuadra estimada que de la «cuadra espejo»
  if (g.precision_geo === 'cuadra') {
    const espejo = geocoder.geocode(`${f[iDir]}`.replace(/\d{1,4}/, n => String(Math.max(100, 1000 - Number(n)))));
    if (espejo.matched && espejo.precision_geo === 'cuadra') {
      if (e <= hav(espejo.lat, espejo.lng, v.lat, v.lng)) sentidoOk++; else sentidoMal++;
    }
  }
  if (detalle) console.log(`${String(Math.round(e)).padStart(6)} m | ${g.precision_geo.padEnd(10)} | ${f[iDir]}`);
}

const total = filas.length - invalidas;
const res = arr => arr.length ? `mediana ${Math.round(percentil(arr, 0.5))} m · p90 ${Math.round(percentil(arr, 0.9))} m · n=${arr.length}` : 'n=0';
const pct = umbral => total ? `${Math.round(100 * errores.filter(e => e <= umbral).length / total)}%` : '-';
console.log('=== Exactitud del geocodificador contra la muestra de campo ===');
console.log(`Direcciones válidas: ${total} (descartadas por GPS inválido: ${invalidas}) · sin ubicar: ${sinUbicar}`);
console.log(`Error total: ${res(errores)}`);
for (const [k, arr] of Object.entries(porPrecision)) console.log(`  ${k.padEnd(10)} ${res(arr)}`);
console.log(`A ≤ 50 m: ${pct(50)} · ≤ 100 m: ${pct(100)} · ≤ 250 m: ${pct(250)} (sobre el total, contando las no ubicadas como fallas)`);
if (sentidoOk + sentidoMal) console.log(`Sentido de la numeración de cuadras: ${sentidoOk} coinciden, ${sentidoMal} invertidas (si hay muchas invertidas, revisar el supuesto «desde la Plaza de Armas» en esas calles).`);
