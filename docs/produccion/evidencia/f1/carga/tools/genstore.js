// genstore.js <seed store.json> <outdir> <N pacientes>  -> escribe outdir/store.json con N pacientes INVENTADOS (DNI 9xxxxxxx)
const fs = require('fs'); const path = require('path');
const [,, seedPath, outDir, nStr] = process.argv; const N = parseInt(nStr, 10);
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const base = seed.patients;
const out = { ...seed, patients: [], conditions: [], appointments: [], observations: [], medications: [], events: [], audit_logs: [] };
for (let i = 0; i < N; i++) {
  const src = base[i % base.length];
  const p = JSON.parse(JSON.stringify(src));
  const dni = String(91000000 + i);
  p.dni = dni; p.dni_base = dni; p.id = `pac-00001741-${dni}`;
  p.historia_clinica = `HC${dni}`; p.apellidos_nombres = `PRUEBA CARGA ${dni}`;
  p.latitud = (p.latitud || -10.07) + ((i % 37) - 18) * 0.0004; p.longitud = (p.longitud || -78.15) + ((i % 41) - 20) * 0.0004;
  out.patients.push(p);
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'store.json'), JSON.stringify(out));
console.log(outDir, 'pacientes', out.patients.length, 'bytes', fs.statSync(path.join(outDir, 'store.json')).size);
