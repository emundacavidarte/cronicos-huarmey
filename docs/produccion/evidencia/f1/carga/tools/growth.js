// growth.js <srcDataDir> : mide, EN PROCESO (sin servidor), el guardado y el crecimiento de store.json con la bitacora.
const fs = require('fs'); const path = require('path'); const { performance } = require('perf_hooks');
const W = path.resolve(__dirname, '..'); const SRC = process.argv[2];
const D = path.join(W, 'run_growth'); fs.rmSync(D, { recursive: true, force: true }); fs.cpSync(SRC, D, { recursive: true });
process.env.DATA_DIR = D;
const db = require(require('path').resolve(__dirname, '../../../../../../server/db/database'));
const f = path.join(D, 'store.json');
const size = () => fs.statSync(f).size;
async function save() { const t = performance.now(); await db._flushToDiskAsync(); return +(performance.now() - t).toFixed(1); }
function strTime(indent) { const t = performance.now(); const s = indent ? JSON.stringify(db.data, null, 2) : JSON.stringify(db.data); return { ms: +(performance.now() - t).toFixed(1), bytes: s.length }; }
(async () => {
  const out = { pacientes: db.data.patients.length, audit_inicial: db.data.audit_logs.length };
  await save(); out.size_inicial = size();
  const steps = [0, 1000, 2500, 5000, 5001, 7500, 10000, 50000];
  let n = 0; out.pasos = [];
  const t0 = performance.now();
  for (const target of steps.slice(1)) {
    const ts = performance.now();
    while (n < target) { db.addAuditLog('LOAD_TEST', 'EVENTO_SIMULADO', { n, detalle: 'registro de prueba de crecimiento', patients: 1, conditions: 1 }, { actor: 'admin', ip: '10.1.2.3' }); n++; }
    const addMs = performance.now() - ts;
    if (db._saveTimer) { clearTimeout(db._saveTimer); db._saveTimer = null; }
    const s1 = strTime(false), s2 = strTime(true);
    const wr = await save();
    out.pasos.push({ escrituras_audit: target, audit_en_memoria: db.data.audit_logs.length, store_bytes: size(), add_total_ms: +addMs.toFixed(1), stringify_compacto_ms: s1.ms, stringify_indent2_ms: s2.ms, bytes_indent2: s2.bytes, guardado_async_total_ms: wr });
  }
  console.log(JSON.stringify(out, null, 1));
  const a = db.data.audit_logs[0]; console.log('bytes por registro de audit (JSON):', JSON.stringify(a).length);
  process.exit(0);
})();
