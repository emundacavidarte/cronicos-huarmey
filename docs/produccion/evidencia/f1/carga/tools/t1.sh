#!/bin/bash
# t1.sh N rep : limiter desde una sola IP (sin TRUST_PROXY)
W=${WORK_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
N=$1; REP=$2
$W/tools/srv.sh stop >/dev/null; sleep 0.5
$W/tools/srv.sh start $W/data1 srv_t1 false >/dev/null
T=$($W/tools/login.sh)
cd $W/tools
echo "=== T1 N=$N rep=$REP  (inicio ventana limiter: login = 1 escritura) $(date +%T)"
( sleep 10; node appuser.js --token $T --label "usuario-real@t=10s(durante carga)" ) &
( sleep 25; node appuser.js --token $T --label "usuario-real@t=25s(tras carga, misma ventana)" ) &
( sleep 75; node appuser.js --token $T --label "usuario-real@t=75s(ventana nueva)" ) &
node bench.js --url http://127.0.0.1:3220/api/cronicos --conns $N --duration 20 --token $T --pid $(cat $W/server.pid) --label "T1 N=$N rep=$REP 1IP" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const r=JSON.parse(s);console.log(JSON.stringify({N:r.conns,total:r.total,rps:r.rps,status:r.status,errors:r.errors,p50:r.lat_ms.p50,p99:r.lat_ms.p99,cpu_srv:r.cpu_server_pct, body429:(r.samples_non2xx[0]||{}).body}))})'
wait
