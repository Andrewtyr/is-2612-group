'use strict';
const assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const vm=require('node:vm');
const serverRoot=path.resolve(__dirname,'..');
const storage=fs.mkdtempSync(path.join(os.tmpdir(),'cyber-test-'));
fs.writeFileSync(path.join(storage,'scores.json'),JSON.stringify({guest:[{name:'Старый рекорд',ms:1000,hints:0,created:1}],pro:[]}));
const port=23000+Math.floor(Math.random()*10000);
const url='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server.js'],{cwd:serverRoot,env:{...process.env,ADMIN_PASSWORD:'integration_test_secret_password_!2026',PORT:String(port),HOST:'127.0.0.1',DATA_DIR:storage,BASE_PATH:'/cyber-safe',PUBLIC_ORIGIN:'https://is2612.ru'},stdio:['ignore','pipe','pipe']});
let logs='';server.stderr.on('data',x=>logs+=x);
async function req(route,data,cookie){const res=await fetch(url+route,{method:data===undefined?'GET':'POST',headers:{...(data!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)});const value=await res.json();return {status:res.status,value,cookie:res.headers.get('set-cookie')};}
function solution(task){
  if(task.kind==='log'){
    let targets;
    if(task.id==='LOG-1')targets=task.rows.filter(r=>r.level==='ERROR');
    if(task.id==='LOG-2')targets=task.rows.filter(r=>r.details.includes('FAILED LOGIN'));
    if(task.id==='LOG-3'){const target=task.prompt.match(/источника (\w+)/)[1];targets=task.rows.filter(r=>r.level===target);}
    assert.equal(targets.length,3);
    return targets.sort((a,b)=>a.time.localeCompare(b.time)).map(r=>r.id.slice(-1)).join('');
  }
  if(task.kind==='cipher'){
    if(task.ascii)return task.cipher.split(' ').map(x=>String.fromCharCode(+x)).join('');
    const shift=Number(task.note.match(/\+(\d+)/)[1]);
    const alphabet='АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
    const result=[...task.cipher].map(x=>alphabet[(alphabet.indexOf(x)-shift+alphabet.length)%alphabet.length]).join('');
    return task.id==='CR-2'?[...result].reverse().join(''):result;
  }
  if(task.kind==='logic'){
    const tests=task.lines.map(text=>{
      let expr=text.replace(/×/g,'*').replace(/−/g,'-').replace(/\|([^|]+)\|/g,'Math.abs($1)').replace(/(?<![<>=])=(?!=)/g,'===');
      return new Function('A','B','C',`return (${expr});`);
    });
    const sols=[];
    for(let A=1;A<=9;A++)for(let B=1;B<=9;B++)for(let C=1;C<=9;C++)if(A!==B&&B!==C&&A!==C&&tests.every(f=>f(A,B,C)))sols.push(`${A}${B}${C}`);
    assert.equal(sols.length,1);return sols[0];
  }
  if(task.kind==='code'){
    const variable=task.prompt.match(/переменной (\w+)/)[1];
    return String(vm.runInNewContext(task.code+'\n'+variable));
  }
  throw Error('unknown task '+task.kind);
}
async function main(){
  const corrupt=fs.mkdtempSync(path.join(os.tmpdir(),'cyber-corrupt-'));
  fs.writeFileSync(path.join(corrupt,'scores.json'),'{invalid');
  const failedStart=spawnSync(process.execPath,['server.js'],{cwd:serverRoot,env:{...process.env,ADMIN_PASSWORD:'integration_test_secret_password_!2026',PORT:String(port+1),HOST:'127.0.0.1',DATA_DIR:corrupt},timeout:5000,encoding:'utf8'});
  assert.equal(failedStart.error,undefined,'corrupt rankings must fail immediately, not hang');
  assert.notEqual(failedStart.status,0,'corrupt rankings must prevent startup');
  assert.equal(fs.readFileSync(path.join(corrupt,'scores.json'),'utf8'),'{invalid');
  fs.rmSync(corrupt,{recursive:true,force:true});
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Server exited: '+logs);try{await req('/health');break;}catch(e){await new Promise(r=>setTimeout(r,80));}}
  let r=await req('/api/config');assert.equal(r.value.online,true);
  r=await req('/api/scores');assert.equal(r.value.guest.length,0,'рекорды прежнего раунда не смешиваются с пятью этапами');
  r=await req('/api/admin/summary');assert.equal(r.status,401);
  r=await req('/api/admin/login',{password:'wrong'});assert.equal(r.status,401);
  r=await req('/api/admin/login',{password:'integration_test_secret_password_!2026'});assert.equal(r.status,200);
  assert.match(r.cookie,/Path=\/cyber-safe\/api\/admin/);
  assert.match(r.cookie,/; Secure/);
  const publicLogin=await fetch(url+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://is2612.ru'},body:JSON.stringify({password:'integration_test_secret_password_!2026'})});
  assert.equal(publicLogin.status,200);
  const foreignLogin=await fetch(url+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://elsewhere.example'},body:JSON.stringify({password:'integration_test_secret_password_!2026'})});
  assert.equal(foreignLogin.status,403);
  const cookie=r.cookie.split(';')[0];assert.ok(cookie.startsWith('cybersafe_admin='));
  let leader;
  for(const mode of ['guest','pro']){
    r=await req('/api/session/start',{mode,name:mode==='guest'?'ТестИгрок':'ProCoder'});assert.equal(r.status,200);
    let state=r.value;const token=state.token;assert.equal(state.total,5);assert.equal(state.limit,mode==='guest'?600000:720000);
    const seenTypes={LOG:new Set(),CR:new Set()};
    assert.ok(!JSON.stringify(state.task).includes('"answer"'));
    const observer=await req('/api/admin/summary',undefined,cookie);assert.equal(observer.status,200);
    assert.ok(observer.value.players.some(p=>p.name===(mode==='guest'?'ТестИгрок':'ProCoder')));
    let wrong=await req('/api/session/answer',{token,value:'WRONG!'});assert.equal(wrong.value.correct,false);
    const beforeHint=wrong.value.deadline;
    const hint=await req('/api/session/hint',{token});assert.ok(hint.value.hint);assert.equal(hint.value.deadline,beforeHint-20000);
    const hintAgain=await req('/api/session/hint',{token});assert.equal(hintAgain.status,409);
    for(let i=0;i<state.total;i++){
      if(seenTypes[state.task.category]){
        assert.equal(seenTypes[state.task.category].has(state.task.id),false,'один тип задания не должен повторяться в раунде');
        seenTypes[state.task.category].add(state.task.id);
      }
      const answer=solution(state.task);r=await req('/api/session/answer',{token,value:answer});
      assert.equal(r.status,200,JSON.stringify(r.value));assert.equal(r.value.correct,true);
      state=r.value;if(i<state.total-1)assert.equal(state.status,'active');
    }
    assert.equal(state.status,'won');assert.ok(state.elapsedMs>=25000);assert.equal(state.hints,1);
    r=await req('/api/session/score',{token,name:mode==='guest'?'ТестИгрок':'ProCoder'});assert.equal(r.status,200);
    r=await req('/api/session/score',{token,name:'Hacker'});assert.equal(r.status,409);
  }
  leader=await req('/api/scores');assert.equal(leader.value.guest.length,1);assert.equal(leader.value.pro.length,1);
  assert.ok(fs.existsSync(path.join(storage,'scores.json')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(storage,'scores.json'),'utf8')).guest.length,2,'старые рекорды сохраняются в файле');
  const monitorResponse=await fetch(url+'/monitor');assert.equal(monitorResponse.status,200);assert.match(await monitorResponse.text(),/ЦЕНТР УПРАВЛЕНИЯ/);
  assert.match(await (await fetch(url+'/')).text(),/<base href="\/cyber-safe\/">/);
  assert.match(await (await fetch(url+'/monitor')).text(),/\/cyber-safe\/js\/monitor.js/);
  console.log('Integration test passed: guest/pro, unique logic answers, server validation, hints, save-once, admin auth, scores.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{server.kill('SIGTERM');setTimeout(()=>{try{fs.rmSync(storage,{recursive:true,force:true});}catch(e){}},200).unref();});
