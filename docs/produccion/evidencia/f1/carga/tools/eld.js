// Precarga de instrumentacion (NO modifica el repo): retardo del bucle de eventos + duracion de JSON.stringify grandes + escritura a disco
const { monitorEventLoopDelay, performance } = require('perf_hooks');
const fs = require('fs');
const LOG = process.env.ELD_LOG;
const w = (o) => fs.appendFileSync(LOG, JSON.stringify(o) + '\n');
const h = monitorEventLoopDelay({ resolution: 5 }); h.enable();
setInterval(() => { w({ k: 'eld', t: new Date().toISOString().slice(11, 23), max_ms: +(h.max / 1e6).toFixed(1), p99_ms: +(h.percentile(99) / 1e6).toFixed(1) }); h.reset(); }, 1000).unref();
const origStr = JSON.stringify;
JSON.stringify = function (...a) {
  const s = performance.now(); const r = origStr.apply(this, a); const d = performance.now() - s;
  if (d > 15 && r && r.length > 500000) w({ k: 'stringify', t: new Date().toISOString().slice(11, 23), ms: +d.toFixed(1), chars: r.length, indent: a.length >= 3 });
  return r;
};
const fsp = fs.promises; const ow = fsp.writeFile; const or = fsp.rename;
fsp.writeFile = async function (...a) { const s = performance.now(); const r = await ow.apply(this, a); w({ k: 'async_writeFile', t: new Date().toISOString().slice(11, 23), ms: +(performance.now() - s).toFixed(1), file: String(a[0]).split('/').pop() }); return r; };
const ows = fs.writeFileSync; fs.writeFileSync = function (...a) { const s = performance.now(); const r = ows.apply(this, a); if (String(a[0]).includes('store.json')) w({ k: 'sync_writeFile', t: new Date().toISOString().slice(11, 23), ms: +(performance.now() - s).toFixed(1) }); return r; };
