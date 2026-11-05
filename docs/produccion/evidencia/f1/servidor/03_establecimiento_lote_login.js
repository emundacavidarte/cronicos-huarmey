// Evidencia Fase 1 — ver docs/produccion/F1_diagnostico.md. Datos 100% inventados. Uso: ADMIN_PASSWORD=<clave del servidor de prueba> BASE=http://localhost:3230 node 03_establecimiento_lote_login.js
if(!process.env.ADMIN_PASSWORD){console.error('Defina ADMIN_PASSWORD (la del servidor de prueba) y, si hace falta, BASE=http://localhost:PUERTO');process.exit(2);}
const BASE=process.env.BASE||'http://localhost:3230';
async function call(method,path,{token,body,raw,headers={}}={}){const h={...headers};if(token)h.Authorization='Bearer '+token;let p;if(body!==undefined){p=raw?body:JSON.stringify(body);h['Content-Type']=h['Content-Type']||'application/json';}
 const r=await fetch(BASE+path,{method,headers:h,body:p});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{};return{status:r.status,json:j,text:t,headers:r.headers};}
const pass=require('crypto').randomBytes(12).toString('base64url')+'-Aa1';
(async()=>{
 const T=(await call('POST','/api/auth/login',{body:{username:'admin',password:process.env.ADMIN_PASSWORD}})).json.token;
 if(!T){console.log('no hay token (¿429?)');return;}
 const all=(await call('GET','/api/cronicos',{token:T})).json;
 // ---- A) alcance por establecimiento
 const por={};all.forEach(p=>{const k=p.puerta_entrada_id||'(sin)';por[k]=(por[k]||0)+1;});
 console.log('A) pacientes por puerta_entrada_id (conteo):',JSON.stringify(por));
 const est=Object.keys(por).filter(k=>k!=='(sin)').sort((a,b)=>por[b]-por[a])[0];
 const cu=await call('POST','/api/users',{token:T,body:{username:'coord.est',nombre:'Diag est',role:'COORDINADOR',red:'156',establecimiento_id:est,password:pass}});
 console.log('   crear COORD con establecimiento',est,'→',cu.status, cu.status>=400?cu.text.slice(0,160):'');
 const TE=(await call('POST','/api/auth/login',{body:{username:'coord.est',password:pass}})).json?.token;
 if(TE){const x=await call('GET','/api/cronicos',{token:TE});console.log(`   COORD acotado a ${est} ve ${x.json.length} (esperado ${por[est]}) →`, x.json.length===por[est]?'OK':'DIFIERE');
  const f=await call('GET','/api/patients/geo',{token:TE});console.log('   geo del acotado: features =',f.json?.features?.length);
  const otro=all.find(p=>p.puerta_entrada_id&&p.puerta_entrada_id!==est);
  if(otro){const y=await call('GET','/fhir/Patient/'+encodeURIComponent(otro.id),{token:TE});console.log('   paciente de otro establecimiento por id →',y.status,'(esperado 404)');
   const w=await call('POST','/api/webhooks/hosix',{token:TE,body:{DNI:'90000555',ESTABLECIMIENTO:'otro'}});console.log('   escritura de paciente sin establecimiento del acotado →',w.status);}
 }
 // ---- B) importar-lote con registros inválidos
 const antes=(await call('GET','/api/cronicos',{token:T})).json.length;
 const lote=[{id:'DIAG-LOTE-OK',dni:'90000101',apellidos_nombres:'LOTE VALIDO',sexo:'F',edad:50,diagnosticos:['I10']},
             {id:'DIAG-LOTE-MAL',dni:'abc',apellidos_nombres:'',edad:'xx',diagnosticos:'no-es-lista'},
             {apellidos_nombres:'SIN ID NI DNI'}];
 const il=await call('POST','/api/padron/importar-lote',{token:T,body:lote});
 const desp=(await call('GET','/api/cronicos',{token:T})).json;
 console.log('B) importar-lote 3 registros (1 válido, 2 inválidos) → status',il.status,il.text.slice(0,200));
 console.log('   pacientes antes/después:',antes,'/',desp.length);
 desp.filter(p=>String(p.id).startsWith('DIAG-LOTE')||p.apellidos_nombres==='SIN ID NI DNI').forEach(p=>console.log('   guardado: id=',JSON.stringify(p.id),'dni=',JSON.stringify(p.dni),'nombre=',JSON.stringify(p.apellidos_nombres),'edad=',JSON.stringify(p.edad),'diag=',JSON.stringify(p.diagnosticos)));
 // ---- C) login bloqueado por cupo de escritura
 let c={}; for(let i=0;i<125;i++){const x=await call('POST','/api/webhooks/hosix',{token:T,body:{DNI:'90000200'}});c[x.status]=(c[x.status]||0)+1;}
 const l2=await call('POST','/api/auth/login',{body:{username:'admin',password:process.env.ADMIN_PASSWORD}});
 console.log('C) 125 escrituras →',JSON.stringify(c),'| luego un LOGIN correcto desde la misma IP →',l2.status, l2.status===429?'(login bloqueado por el cupo de escritura)':'');
 const lectura=await call('GET','/api/auth/me',{token:T});
 console.log('   lectura (GET /api/auth/me) con el cupo de escritura agotado →',lectura.status);
})();
