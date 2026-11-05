#!/bin/bash
# t2.sh <datadir_src> <tag> <rep> "<endpoints>" "<conns>"   (TRUST_PROXY=true, XFF distinto por peticion)
W=${WORK_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
SRC=$1; TAG=$2; REP=$3; EPS=${4:-"health cronicos cronicosgz geo"}; CONNS=${5:-"50 200 1000"}
D=$W/run_${TAG}_r${REP}; rm -rf $D; cp -r $SRC $D
$W/tools/srv.sh stop >/dev/null; sleep 0.5
$W/tools/srv.sh start $D srv_${TAG}_r${REP} true >/dev/null
T=$($W/tools/login.sh); PID=$(cat $W/server.pid)
rss() { curl -s http://127.0.0.1:3220/health | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>console.log(JSON.parse(s).memory_rss_mb))'; }
echo "### $TAG rep=$REP datos=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$D/store.json')).patients.length)") pacientes ; RSS inicial=$(rss) MB"
cd $W/tools
for ep in $EPS; do
 case $ep in
  health)     URL=/health; EXTRA="";;
  cronicos)   URL=/api/cronicos; EXTRA="--token $T";;
  cronicosgz) URL=/api/cronicos; EXTRA="--token $T --gzip";;
  geo)        URL=/api/patients/geo; EXTRA="--token $T --gzip";;
  geonogz)    URL=/api/patients/geo; EXTRA="--token $T";;
  cronicos304) URL=/api/cronicos; ETAG=$(curl -s -D - -o /dev/null -H "Authorization: Bearer $T" http://127.0.0.1:3220/api/cronicos | grep -i '^etag' | cut -d' ' -f2- | tr -d '\r'); EXTRA="--token $T --inm $ETAG";;
 esac
 for c in $CONNS; do
  R=$(node bench.js --url http://127.0.0.1:3220$URL --conns $c --duration 20 --xff $EXTRA --pid $PID --probe-ms 100 --label "T2 $TAG r$REP $ep c=$c")
  echo "$R" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const r=JSON.parse(s);console.log(JSON.stringify({ep:"'$ep'",c:r.conns,rps:r.rps,total:r.total,status:r.status,errors:r.errors,p50:r.lat_ms.p50,p95:r.lat_ms.p95,p99:r.lat_ms.p99,max:r.lat_ms.max,bytes:r.avg_resp_bytes,cpuSrv:r.cpu_server_pct,cpuGen:r.cpu_generator_pct,rss:r.rss_mb,healthProbe:r.probe}))})'
  sleep 3; echo "   RSS 3s despues: $(rss) MB"
 done
done
echo "   RSS fin (tras 62 s, limpieza de buckets): $(sleep 62; rss) MB"
