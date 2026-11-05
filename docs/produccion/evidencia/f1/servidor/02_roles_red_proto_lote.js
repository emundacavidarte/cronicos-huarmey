// Evidencia Fase 1 — ver docs/produccion/F1_diagnostico.md. Datos 100% inventados. Uso: ADMIN_PASSWORD=<clave del servidor de prueba> BASE=http://localhost:3230 node 02_roles_red_proto_lote.js
if(!process.env.ADMIN_PASSWORD){console.error('Defina ADMIN_PASSWORD (la del servidor de prueba) y, si hace falta, BASE=http://localhost:PUERTO');process.exit(2);}
const BASE=process.env.BASE||'http://localhost:3230';
async function call(method,path,{token,body,raw,headers={}}={}){const h={...headers};if(token)h.Authorization='Bearer '+token;let p;if(body!==undefined){p=raw?body:JSON.stringify(body);h['Content-Type']=h['Content-Type']||'application/json';}
 const r=await fetch(BASE+path,{method,headers:h,body:p});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{};return{status:r.status,json:j,text:t,headers:r.headers};}
(async()=>{
 const T=(await call('POST','/api/auth/login',{body:{username:'admin',password:process.env.ADMIN_PASSWORD}})).json.token;
 const redes=(await call("GET","/api/auth/redes",{token:T})).json; console.log("claves redes:",Array.isArray(redes)?"array":Object.keys(redes)); const rl=Array.isArray(redes)?redes:(Object.values(redes).find(Array.isArray)||[]);
 console.log('REDES:',rl.map(r=>`${r.codigo}=${r.nombre}`).join(' | '));
 // 1) patients/geo forma
 const g=await call('GET','/api/patients/geo',{token:T});
 console.log('geo: status',g.status,'| forma:',Array.isArray(g.json)?`array(${g.json.length})`:Object.keys(g.json||{}).join(','));
 const gl=g.json?.features||g.json?.data||g.json?.patients||g.json?.pacientes||[];
 console.log('geo: elementos en la lista interna =',Array.isArray(gl)?gl.length:typeof gl, '| claves de nivel 1 con tamaño:',Object.entries(g.json||{}).map(([k,v])=>`${k}:${Array.isArray(v)?v.length:typeof v}`).join(', '));
 // 2) Red correcta: Pacífico Sur
 const ps=rl.find(r=>/PACIFICO.*SUR/i.test(r.nombre+' '+r.etiqueta)); const otra=rl.find(r=>r.codigo!==ps.codigo);
 console.log('Pacífico Sur =',ps.codigo,'| otra =',otra.codigo);
 const pass=require('crypto').randomBytes(12).toString('base64url')+'-Aa1';
 for(const [u,role,red] of [['coord.pacsur','COORDINADOR',ps.codigo],['dir.pacsur','DIRECTOR',ps.codigo]]){const x=await call('POST','/api/users',{token:T,body:{username:u,nombre:'Diag '+u,role,red,password:pass}});console.log('crear',u,x.status);}
 const TC=(await call('POST','/api/auth/login',{body:{username:'coord.pacsur',password:pass}})).json.token;
 const TD=(await call('POST','/api/auth/login',{body:{username:'dir.pacsur',password:pass}})).json.token;
 const n=async(t,p)=>{const x=await call('GET',p,{token:t});const l=Array.isArray(x.json)?x.json:(x.json?.data||x.json?.patients||[]);return `${x.status}/${Array.isArray(l)?l.length:'-'}`};
 console.log('COORD Pacífico Sur  /api/cronicos (status/n):',await n(TC,'/api/cronicos'),'| /api/patients/geo:',await n(TC,'/api/patients/geo'));
 console.log('DIRECTOR Pacífico Sur /api/cronicos:',await n(TD,'/api/cronicos'),'| /api/alerts/summary:',(await call('GET','/api/alerts/summary',{token:TD})).status);
 const pid=(await call('GET','/api/cronicos',{token:T})).json[0].id;
 console.log('COORD Pacífico Sur  GET /fhir/Patient/:id (esperado 200):',(await call('GET','/fhir/Patient/'+encodeURIComponent(pid),{token:TC})).status);
 // 3) __proto__
 const u=await call('GET','/api/users',{token:T});const us=u.json?.users||u.json?.data||u.json;
 console.log('usuarios listados:',Array.isArray(us)?us.map(x=>x.username).join(','):Object.keys(us||{}).join(','));
 const lp=await call('POST','/api/auth/login',{body:{username:'__proto__',password:pass}});
 console.log('login como "__proto__" →',lp.status, '| rol del token:', lp.json?.user?.role);
 const hh=await call('GET','/health'); console.log('servidor sigue sano tras crear "__proto__":',hh.status);
 // 4) lote mixto: qué quedó guardado del registro inválido (solo forma)
 const all=(await call('GET','/api/cronicos',{token:T})).json;
 const m=all.filter(p=>String(p.id).includes('MIXTO'));
 console.log('registros MIXTO guardados:',m.length);
 m.forEach(p=>console.log('  id=',p.id,'| dni=',JSON.stringify(p.dni),'| nombre=',JSON.stringify(p.apellidos_nombres),'| fnac=',JSON.stringify(p.fecha_nacimiento),'| edad=',p.edad,'| diag=',JSON.stringify(p.diagnosticos),'| semaforo=',p.semaforo));
 // 5) paciente creado solo con DNI por webhook (T-06/T-07)
 const w=await call('POST','/api/webhooks/hosix',{token:T,body:{DNI:'90000077'}});
 console.log('webhook solo DNI → status',w.status,w.text.slice(0,140));
 const q=(await call('GET','/api/cronicos',{token:T})).json.find(p=>p.dni==='90000077'||p.dni_base==='90000077');
 if(q) console.log('  paciente solo-DNI: diagnosticos=',JSON.stringify(q.diagnosticos),'| semaforo=',q.semaforo,'| sexo=',q.sexo,'| financiador=',q.financiador,'| estado_control=',q.estado_control);
 else console.log('  no apareció');
})();
