// count.js <token> <datadir> : pacientes en memoria (API) y en disco
const http=require('http'),fs=require('fs'),path=require('path');
const [,,token,dir]=process.argv;
http.get({host:'127.0.0.1',port:3220,path:'/api/cronicos',headers:{Authorization:'Bearer '+token}},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>{
 const mem=JSON.parse(b).length; let disk=null,sz=null,mt=null,cond=null,obs=null,aud=null;
 try{const f=path.join(dir,'store.json');const st=fs.statSync(f);sz=st.size;mt=st.mtime.toISOString().slice(11,23);const s=JSON.parse(fs.readFileSync(f,'utf8'));disk=s.patients.length;cond=s.conditions.length;obs=s.observations.length;aud=s.audit_logs.length;}catch(e){disk='ERR '+e.message}
 console.log(JSON.stringify({pacientes_memoria_api:mem,pacientes_disco:disk,store_bytes:sz,store_mtime:mt,conditions_disco:cond,observations_disco:obs,audit_disco:aud}));
});});
