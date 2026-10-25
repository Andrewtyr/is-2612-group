'use strict';
// CYBER SAFE 3.0 — Node.js HTTP server, shared scores, server-verified tasks, live spectator monitor.
// No npm dependencies. Node.js >= 20 recommended.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {URL} = require('node:url');
const root = __dirname;
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || '0.0.0.0';
const adminPassword = process.env.ADMIN_PASSWORD;
const basePath = (process.env.BASE_PATH || '').replace(/\/$/, '');
const publicOrigin = process.env.PUBLIC_ORIGIN || '';
if (!adminPassword || adminPassword.length < 12) {
  console.error('Set ADMIN_PASSWORD to a unique password of at least 12 characters. See README_SERVER.md.');
  process.exit(1);
}
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root,'data');
fs.mkdirSync(dataDir, {recursive:true});
const scoresFile = path.join(dataDir,'scores.json');
const fallbackScores={guest:[],pro:[]};
let scores;
try {const file=JSON.parse(fs.readFileSync(scoresFile,'utf8'));scores={guest:Array.isArray(file.guest)?file.guest:[],pro:Array.isArray(file.pro)?file.pro:[]};}
catch(e){
  if(e.code!=='ENOENT'){
    console.error('Cannot read scores.json; refusing to overwrite existing rankings:',e.message);
    process.exit(1);
  }
  scores=structuredClone(fallbackScores);
}
const sessions=new Map();
const adminTokens=new Map();
const liveStreams=new Set();
const recentTemplates={LOG:[],CR:[],LG:[],JS:[]};
const lastTemplate={};
const failedLogin=new Map();
let lastSseId=0;
function loadGenerator(){
  const ctx={window:{crypto:crypto.webcrypto},crypto:crypto.webcrypto,Uint32Array,Math};
  vm.createContext(ctx);
  for(const file of ['js/core.js','js/generators/log.js','js/generators/cipher.js','js/generators/logic.js','js/generators/code.js']){
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file,timeout:2000});
  }
  return ctx.window.CyberSafe;
}
const CS=loadGenerator();
const categories={guest:['LOG','CR','LG'],pro:['LOG','CR','LG','JS']};
const times={guest:360000,pro:480000};
function safeName(input){const name=String(input||'').trim();return /^[A-Za-zА-Яа-яЁё0-9 _-]{1,16}$/.test(name)?name:null;}
function task(cat,mode,index){
  const generator=CS.gen[cat]; const available=generator.available?generator.available(mode):generator.templates;
  const key=mode+'|'+cat+'|'+index;
  const types=available.filter(t=>t!==lastTemplate[key]);
  const pool=types.length?types:available;
  let t;
  for(let i=0;i<75;i++){
    t=generator.generate(CS.pick(pool));
    if(!recentTemplates[cat].includes(t.signature) || i===74)break;
  }
  lastTemplate[key]=t.id;
  recentTemplates[cat].push(t.signature);recentTemplates[cat]=recentTemplates[cat].slice(-30);
  return t;
}
function stripTask(t){const {answer,signature,solutionCount,testExpression,hint,...safe}=t;return safe;}
function send(res,status,payload,headers={}){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});
  res.end(JSON.stringify(payload));
}
function getJSON(req){return new Promise((resolve,reject)=>{
  let data='';req.on('data',chunk=>{data+=chunk;if(data.length>8192){reject(Object.assign(Error('Payload too large'),{status:413}));req.destroy();}});
  req.on('end',()=>{try{resolve(data?JSON.parse(data):{});}catch(e){reject(Object.assign(Error('Invalid JSON'),{status:400}));}});
  req.on('error',reject);
});}
function secret(){return crypto.randomBytes(32).toString('base64url');}
function current(s){
  if(s.status==='active' && Date.now()>=s.deadline){s.status='expired';s.endedAt=Date.now();broadcast();}
  return s.status;
}
function getSession(token){const s=sessions.get(String(token||''));if(!s)throw Object.assign(Error('Session not found'),{status:404});current(s);return s;}
function getState(s){return {sessionId:s.id,mode:s.mode,name:s.name,stage:s.stage,unlocked:s.unlocked,total:s.tasks.length,hints:s.hints,wrong:s.wrong,penalties:s.penalties,limit:s.limit,deadline:s.deadline,status:current(s),task:s.status==='active'?stripTask(s.tasks[s.stage]):null,saved:s.saved,elapsedMs:s.status==='won'?s.elapsedMs:undefined};}
function rankings(){return {guest:scores.guest,pro:scores.pro};}
function persistScores(){const tmp=scoresFile+'.tmp.'+process.pid;fs.writeFileSync(tmp,JSON.stringify(scores,null,2),'utf8');fs.renameSync(tmp,scoresFile);}
function summary(){
  const now=Date.now();const all=[...sessions.values()];
  const active=all.filter(s=>current(s)==='active');
  const recent=all.filter(s=>s.startedAt>now-3600000)
    .sort((a,b)=>b.startedAt-a.startedAt).slice(0,60).map(s=>({
      id:s.id,name:s.name,mode:s.mode,stage:s.stage+1,total:s.tasks.length,unlocked:s.unlocked,
      stageTitle:s.status==='active'?s.tasks[s.stage].title:s.status==='won'?'Сейф открыт':s.status==='expired'?'Время вышло':'Игра завершена',
      stageCode:s.status==='active'?s.tasks[s.stage].id:'—',status:s.status,startedAt:s.startedAt,
      deadline:s.deadline,lastSeen:s.lastSeen,remainingMs:Math.max(0,s.deadline-now),
      hints:s.hints,wrong:s.wrong,elapsedMs:s.elapsedMs||null,stale:s.status==='active'&&now-s.lastSeen>20000
    }));
  return {serverTime:now,active:active.length,totalToday:all.filter(s=>new Date(s.startedAt).toDateString()===new Date(now).toDateString()).length,completedToday:all.filter(s=>s.status==='won'&&new Date(s.startedAt).toDateString()===new Date(now).toDateString()).length,players:recent,scores:rankings()};
}
function broadcast(){
  if(!liveStreams.size)return;
  const message=`id: ${++lastSseId}\nevent: state\ndata: ${JSON.stringify(summary())}\n\n`;
  for(const res of liveStreams){try{res.write(message);}catch(e){liveStreams.delete(res);}}
}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(k=>k.trim().split('=')).filter(p=>p.length===2));}
function authorized(req){const token=cookies(req)['cybersafe_admin'];return token&&adminTokens.get(token)>Date.now();}
function sameOrigin(req){const origin=req.headers.origin;if(!origin)return true;const h=req.headers.host||'';try{return publicOrigin ? new URL(origin).origin===publicOrigin : new URL(origin).host===h;}catch(e){return false;}}
function passwordEquals(a,b){const x=crypto.createHash('sha256').update(a).digest();const y=crypto.createHash('sha256').update(b).digest();return crypto.timingSafeEqual(x,y);}
function endpoint(req,url,res,body){
  const p=url.pathname;
  if(req.method==='GET'&&p==='/api/config')return send(res,200,{online:true,version:'3.0',modes:{guest:6,pro:8}});
  if(req.method==='GET'&&p==='/api/scores')return send(res,200,rankings());
  if(req.method==='POST'&&p==='/api/session/start'){
    const mode=body.mode;if(!categories[mode])return send(res,400,{error:'Некорректный режим'});
    const active=[...sessions.values()].filter(s=>current(s)==='active').length;
    if(active>500)return send(res,429,{error:'Слишком много игроков'});
    const name=safeName(body.name)||'Игрок '+crypto.randomInt(1000,9999);
    const tasks=categories[mode].map((c,i)=>task(c,mode,i));
    const now=Date.now();const token=secret();const s={token,id:crypto.randomUUID().slice(0,8).toUpperCase(),name,mode,tasks,stage:0,unlocked:0,
      startedAt:now,lastSeen:now,deadline:now+times[mode],limit:times[mode],wrong:0,hints:0,hintsUsed:[],penalties:0,status:'active',saved:false,endedAt:null};
    sessions.set(token,s);broadcast();return send(res,200,{token,...getState(s)});
  }
  if(req.method==='POST'&&p==='/api/session/heartbeat'){
    const s=getSession(body.token);s.lastSeen=Date.now();return send(res,200,getState(s));
  }
  if(req.method==='POST'&&p==='/api/session/answer'){
    const s=getSession(body.token);if(s.status!=='active')return send(res,409,{error:'Игра уже завершена',...getState(s)});
    const answer=CS.normalize(body.value||'');if(answer.length>30)return send(res,400,{error:'Ответ слишком длинный'});
    s.lastSeen=Date.now();const correct=answer===s.tasks[s.stage].answer;
    if(correct){s.unlocked++;if(s.unlocked===s.tasks.length){s.status='won';s.endedAt=Date.now();s.elapsedMs=Math.min(s.limit,Math.max(0,s.limit-(s.deadline-s.endedAt)));}else{s.stage++;}}
    else{s.wrong++;s.penalties+=5000;s.deadline-=5000;current(s);}
    broadcast();return send(res,200,{correct,...getState(s)});
  }
  if(req.method==='POST'&&p==='/api/session/hint'){
    const s=getSession(body.token);if(s.status!=='active')return send(res,409,{error:'Игра уже завершена',...getState(s)});
    s.lastSeen=Date.now();
    if(s.hintsUsed[s.stage])return send(res,409,{error:'Подсказка уже использована',...getState(s)});
    s.hintsUsed[s.stage]=true;s.hints++;s.penalties+=20000;s.deadline-=20000;current(s);
    broadcast();return send(res,200,{hint:s.tasks[s.stage].hint,...getState(s)});
  }
  if(req.method==='POST'&&p==='/api/session/quit'){
    const s=getSession(body.token);if(s.status==='active'){s.status='abandoned';s.endedAt=Date.now();broadcast();}return send(res,200,{ok:true});
  }
  if(req.method==='POST'&&p==='/api/session/score'){
    const s=getSession(body.token);if(s.status!=='won'||s.saved)return send(res,409,{error:'Результат не может быть сохранён повторно'});
    if(Date.now()-s.endedAt>10*60000)return send(res,409,{error:'Время сохранения истекло'});
    const name=safeName(body.name);if(!name)return send(res,400,{error:'Некорректный ник (1–16 символов)'});
    const oldScores=scores[s.mode].slice();
    scores[s.mode].push({name,ms:s.elapsedMs,hints:s.hints,created:s.endedAt});
    scores[s.mode].sort((a,b)=>a.ms-b.ms||a.hints-b.hints||a.created-b.created);
    scores[s.mode]=scores[s.mode].slice(0,10);
    try { persistScores(); } catch(e) { scores[s.mode]=oldScores;throw e; }
    s.name=name;s.saved=true;broadcast();
    return send(res,200,{ok:true,scores:rankings()});
  }
  if(req.method==='POST'&&p==='/api/admin/login'){
    const ip=(req.socket.remoteAddress||'unknown');const f=failedLogin.get(ip)||{count:0,until:0};
    if(f.until>Date.now())return send(res,429,{error:'Слишком много попыток. Повторите через 15 минут.'});
    if(!passwordEquals(String(body.password||''),adminPassword)){
      f.count++;if(f.count>=8){f.until=Date.now()+15*60000;f.count=0;}failedLogin.set(ip,f);
      return send(res,401,{error:'Неверный пароль'});
    }
    failedLogin.delete(ip);const token=secret();adminTokens.set(token,Date.now()+8*3600000);
    const secure=publicOrigin.startsWith('https://')||req.socket.encrypted||req.headers['x-forwarded-proto']==='https';
    return send(res,200,{ok:true},{'Set-Cookie':`cybersafe_admin=${token}; HttpOnly; SameSite=Strict; Path=${basePath}/api/admin; Max-Age=28800${secure?'; Secure':''}`});
  }
  if(req.method==='POST'&&p==='/api/admin/logout'){
    const token=cookies(req).cybersafe_admin;adminTokens.delete(token);
    return send(res,200,{ok:true},{'Set-Cookie':`cybersafe_admin=; HttpOnly; SameSite=Strict; Path=${basePath}/api/admin; Max-Age=0`});
  }
  if(req.method==='GET'&&p==='/api/admin/summary'){
    if(!authorized(req))return send(res,401,{error:'Требуется вход'});
    return send(res,200,summary());
  }
  if(req.method==='GET'&&p==='/api/admin/events'){
    if(!authorized(req))return send(res,401,{error:'Требуется вход'});
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.write(`retry: 2500\nevent: state\ndata: ${JSON.stringify(summary())}\n\n`);
    liveStreams.add(res);req.on('close',()=>liveStreams.delete(res));return;
  }
  return send(res,404,{error:'Адрес API не найден'});
}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
function serveStatic(url,res){
  let p=url.pathname==='/monitor'?'/monitor.html':url.pathname==='/'?'/index.html':url.pathname;
  let decoded;try{decoded=decodeURIComponent(p);}catch(e){return send(res,400,{error:'Некорректный путь'});}
  const full=path.resolve(root,'.'+decoded);
  if(!full.startsWith(root+path.sep)||decoded.split('/').some(x=>x.startsWith('.')) || decoded.includes('\\') || !Object.keys(types).includes(path.extname(full).toLowerCase()) || decoded.startsWith('/data/') || path.basename(full)==='server.js')return send(res,404,{error:'Файл не найден'});
  fs.readFile(full,(err,data)=>{
    if(err)return send(res,404,{error:'Файл не найден'});
    res.writeHead(200,{'Content-Type':types[path.extname(full)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});res.end(data);
  });
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{ok:true});
    if(url.pathname.startsWith('/api/')){
      if(!sameOrigin(req))return send(res,403,{error:'Недопустимый источник'});
      if(!['GET','POST'].includes(req.method))return send(res,405,{error:'Метод не поддерживается'});
      const body=req.method==='POST'?await getJSON(req):{};
      return endpoint(req,url,res,body);
    }
    if(req.method==='GET'||req.method==='HEAD')return serveStatic(url,res);
    send(res,405,{error:'Метод не поддерживается'});
  }catch(e){if(!res.headersSent)send(res,e.status||500,{error:e.status?e.message:'Внутренняя ошибка'});else res.end();if(!e.status)console.error(e);}
});
const pulse=setInterval(()=>{
  const now=Date.now();
  for(const [token,s] of sessions){current(s);if((s.status!=='active'&&now-(s.endedAt||s.startedAt)>2*3600000)||now-s.startedAt>12*3600000)sessions.delete(token);}
  for(const [token,exp] of adminTokens)if(exp<now)adminTokens.delete(token);
  for(const [ip,f] of failedLogin)if(f.until<now&&f.count===0)failedLogin.delete(ip);
  broadcast();
},3000);
pulse.unref();
server.listen(port,host,()=>console.log(`CYBER SAFE 3.0 listening at http://${host}:${port} — monitor /monitor`));
