#!/bin/bash
curl -s -X POST http://127.0.0.1:3220/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"'$ADMIN_PASSWORD'"}' | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{try{console.log(JSON.parse(s).token||"")}catch(e){console.log("")}})'
