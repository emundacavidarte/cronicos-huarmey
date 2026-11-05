#!/bin/bash
# t4.sh <conns> <rep> <fhir|hosix> [srcdata]  : escrituras concurrentes (TRUST_PROXY=true, XFF por peticion)
W=${WORK_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
C=$1; REP=$2; KIND=$3; SRC=${4:-$W/data_550}
TAG=t4_${KIND}_c${C}_r${REP}; D=$W/run_$TAG; rm -rf $D; cp -r $SRC $D
export ELD_LOG=$W/eld_$TAG.log; rm -f $ELD_LOG
$W/tools/srv.sh stop >/dev/null; sleep 0.5
NODE_EXTRA="--require $W/tools/eld.js" $W/tools/srv.sh start $D srv_$TAG true >/dev/null
T=$($W/tools/login.sh); PID=$(cat $W/server.pid); sleep 1
URL=/fhir/Bundle; [ "$KIND" = hosix ] && URL=/api/webhooks/hosix
echo "### $TAG ; antes:"; node $W/tools/count.js $T $D
( while true; do echo "$(date +%T.%N | cut -c1-12) $(stat -c '%y %s' $D/store.json | cut -c12-23,36-)" >> $W/watch_$TAG.log; sleep 0.25; done ) &
WP=$!
BASE=$(( (REP*10 + (C==200?2:1)) * 100000 ))
cd $W/tools
R=$(node bench.js --url http://127.0.0.1:3220$URL --method POST --body $KIND --conns $C --duration 10 --xff --token $T --pid $PID --probe-ms 100 --dnibase $BASE --label "$TAG")
TEND=$(date +%T.%N | cut -c1-12)
echo "$R" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const r=JSON.parse(s);console.log(JSON.stringify({c:r.conns,rps:r.rps,total:r.total,accepted_2xx:r.accepted_2xx,status:r.status,errors:r.errors,p50:r.lat_ms.p50,p95:r.lat_ms.p95,p99:r.lat_ms.p99,max:r.lat_ms.max,cpuSrv:r.cpu_server_pct,cpuGen:r.cpu_generator_pct,healthProbe:r.probe,rss:r.rss_mb,no2xx:r.samples_non2xx}))})'
echo "fin de rafaga a las $TEND"
sleep 1; echo "1 s despues de la rafaga:"; node $W/tools/count.js $T $D
sleep 2; echo "3 s despues:"; node $W/tools/count.js $T $D
kill $WP 2>/dev/null
echo "--- store.json mtime/size durante la rafaga (cada 250 ms; solo cambios):"
awk '{k=$2" "$3; if(k!=prev){print; prev=k}}' $W/watch_$TAG.log | head -40
echo "--- instrumentacion (stringify/escritura/retardo bucle) :"
grep -E '"k":"(stringify|async_writeFile|sync_writeFile)"' $ELD_LOG | head -20
node -e 'const l=require("fs").readFileSync(process.argv[1],"utf8").split("\n").filter(x=>x.includes("\"eld\"")).map(x=>JSON.parse(x)); const m=l.map(x=>x.max_ms); console.log("retardo bucle max por segundo (ms):",m.join(" "))' $ELD_LOG
