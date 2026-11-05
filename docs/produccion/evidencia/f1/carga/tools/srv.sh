#!/bin/bash
# uso: srv.sh start <datadir> <logname> [trust_proxy=true|false] ; srv.sh stop
W=${WORK_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
case "$1" in
 start)
  D=$2; LOG=$W/$3.log; TP=${4:-false}
  cd /home/user/cronicos-huarmey
  DATA_DIR=$D PORT=3220 NODE_ENV=development ADMIN_USER=admin ADMIN_PASSWORD="${ADMIN_PASSWORD:?defina ADMIN_PASSWORD}" AUTH_SECRET="${AUTH_SECRET:?defina AUTH_SECRET}" TRUST_PROXY=$TP \
   nohup node ${NODE_EXTRA} server/server.js > $LOG 2>&1 &
  echo $! > $W/server.pid
  for i in $(seq 1 100); do
    if curl -s -o /dev/null http://127.0.0.1:3220/health; then echo "up pid=$(cat $W/server.pid) after ${i}x100ms"; exit 0; fi
    sleep 0.1
  done
  echo "NO ARRANCO"; tail -5 $LOG; exit 1;;
 stop)
  if [ -f $W/server.pid ]; then kill $(cat $W/server.pid) 2>/dev/null; sleep 0.5; kill -9 $(cat $W/server.pid) 2>/dev/null; rm -f $W/server.pid; fi
  echo stopped;;
esac
