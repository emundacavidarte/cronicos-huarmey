// summ.js <log> : tabla por (ep,c) con ambas repeticiones
const fs=require('fs'); const lines=fs.readFileSync(process.argv[2],'utf8').split('\n');
let rep=0; const rows=[]; const rss={};
for(const l of lines){
  if(l.startsWith('###')){rep++; rss[rep]={init:(l.match(/RSS inicial=([\d.]+)/)||[])[1], after:[], fin:null}; continue;}
  if(l.includes('RSS fin')){rss[rep].fin=(l.match(/: ([\d.]+) MB/)||[])[1]; continue;}
  if(l.includes('RSS 3s')){rss[rep].after.push((l.match(/: ([\d.]+) MB/)||[])[1]); continue;}
  if(l.startsWith('{')){ try{const r=JSON.parse(l); r.rep=rep; rows.push(r);}catch(e){} }
}
const key=r=>r.ep+' c='+r.c;
const g={}; for(const r of rows){(g[key(r)]=g[key(r)]||[]).push(r);}
console.log('endpoint c | rps (r1/r2) | p50 ms | p95 | p99 | max | status r1 | errores | KB/resp | cpuSrv% | RSS first->max (MB) | health-probe p50/p99/max');
for(const k of Object.keys(g)){ const a=g[k];
  const f=(fn)=>a.map(fn).join('/');
  const st=a.map(r=>Object.entries(r.status).map(([s,n])=>s+':'+n).join(',')).join(' | ');
  const er=a.map(r=>JSON.stringify(r.errors)).join('|');
  console.log(k+' | '+f(r=>Math.round(r.rps))+' | '+f(r=>r.p50)+' | '+f(r=>r.p95)+' | '+f(r=>r.p99)+' | '+f(r=>r.max)+' | '+st+' | '+er+' | '+(a[0].bytes/1024).toFixed(1)+' | '+f(r=>r.cpuSrv)+' | '+a.map(r=>r.rss?r.rss.first+'->'+r.rss.max:'-').join('/')+' | '+a.map(r=>r.healthProbe?r.healthProbe.p50+'/'+r.healthProbe.p99+'/'+r.healthProbe.max:'-').join(' ; '));
}
console.log('RSS por rep:',JSON.stringify(rss));
