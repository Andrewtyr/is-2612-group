'use strict';
(function(){
  const $=id=>document.getElementById(id);
  let state=null,events=null,rankMode='guest',filter='active',selectedId=null,display=false;
  function fmt(ms){const s=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
  function el(tag,cls,txt){const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=String(txt);return x;}
  async function api(path,body){const res=await fetch('/cyber-safe/api'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});const data=await res.json();if(!res.ok)throw Error(data.error||'Ошибка сервера');return data;}
  function setConnection(connected){$('connectionDot').classList.toggle('connected',connected);$('connectionLabel').textContent=connected?'СИСТЕМА НА СВЯЗИ':'НЕТ СОЕДИНЕНИЯ';}
  function setDashboard(){ $('login').classList.add('hidden');$('dashboard').classList.remove('hidden');}
  function showLogin(message=''){$('dashboard').classList.add('hidden');$('login').classList.remove('hidden');$('loginError').textContent=message;if(events){events.close();events=null;}setConnection(false);}
  function live(){
    if(events)events.close();
    events=new EventSource('/cyber-safe/api/admin/events');
    events.addEventListener('state',event=>{state=JSON.parse(event.data);setConnection(true);render();});
    events.onerror=()=>{setConnection(false);};
  }
  function statusText(s){return s.status==='active'?(s.stale?'НЕТ СВЯЗИ':'В ИГРЕ'):s.status==='won'?'ПОБЕДА':s.status==='expired'?'ВРЕМЯ ВЫШЛО':'ВЫШЕЛ';}
  function listSessions(){
    const list=$('sessions');list.replaceChildren();let candidates=state.players;
    if(filter==='active')candidates=candidates.filter(s=>s.status==='active');
    if(filter==='guest'||filter==='pro')candidates=candidates.filter(s=>s.mode===filter);
    if(!candidates.length){list.append(el('div','empty','Активных игроков пока нет. Запустите игру с любого устройства — новая сессия появится здесь автоматически.'));return;}
    for(const p of candidates){
      const item=el('div','session-card'+(selectedId===p.id?' selected':''));item.tabIndex=0;item.setAttribute('role','button');item.setAttribute('aria-label',`Подробнее: ${p.name}`);
      item.append(el('div','avatar',p.name[0]?.toUpperCase()||'#'));
      const box=el('div','session-info');const top=el('div','session-top');top.append(el('div','session-name',p.name));top.append(el('div','pill '+(p.mode==='pro'?'pro':''),p.mode==='pro'?'PRO':'ГОСТЬ'));box.append(top);
      box.append(el('div','session-meta',`${statusText(p)} · ${p.stageTitle} · ${p.unlocked}/${p.total} замков открыто`));
      const bar=el('div','bar');const inner=el('div','bar-inner');inner.style.width=(p.unlocked/p.total*100)+'%';bar.append(inner);box.append(bar);item.append(box);
      const timer=el('div','time'+(p.remainingMs<30000&&p.status==='active'?' urgent':''),p.status==='active'?fmt(p.remainingMs):p.status==='won'?fmt(p.elapsedMs):'—');item.append(timer);
      const select=()=>{selectedId=selectedId===p.id?null:p.id;listSessions();renderDetail();};item.addEventListener('click',select);item.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});
      list.append(item);
    }
  }
  function renderDetail(){const details=$('selectedDetail');const p=state?.players.find(s=>s.id===selectedId);if(!p){details.classList.add('hidden');return;}
    details.classList.remove('hidden');details.replaceChildren();const title=el('div','detail-title');title.append(el('div','',`${p.name} · ${p.id}`));title.append(el('span','',statusText(p)));details.append(title);
    const grid=el('div','detail-grid');for(const [label,value] of [['СЕКТОР',p.status==='active'?`${p.stage} / ${p.total}`:`${p.unlocked} / ${p.total}`],['ОШИБКИ',p.wrong],['ПОДСКАЗКИ',p.hints]]){
      const part=el('div');part.append(el('span','',label));part.append(el('strong','',value));grid.append(part);
    }details.append(grid);
  }
  function renderScores(){const ranking=$('ranking');ranking.replaceChildren();const scores=state.scores[rankMode]||[];
    if(scores.length===0){ranking.append(el('div','empty','Рекордов пока нет. Первый победитель появится здесь после открытия сейфа.'));return;}
    for(let i=0;i<scores.length;i++){
      const score=scores[i];const item=el('div','rank-row');const name=el('div','rank-name');name.append(el('span','rank-index',String(i+1).padStart(2,'0')));name.append(el('span','name',score.name));item.append(name);item.append(el('strong','',fmt(score.ms)));item.append(el('span','',score.hints));ranking.append(item);
    }
  }
  function render(){if(!state)return;
    $('countActive').textContent=state.active;$('countToday').textContent=state.totalToday;$('countWinners').textContent=state.completedToday;
    const all=[...(state.scores.guest||[]).map(s=>({...s,mode:'ГОСТЬ'})),...(state.scores.pro||[]).map(s=>({...s,mode:'PRO'}))].sort((a,b)=>a.ms-b.ms);
    $('bestScore').textContent=all.length?fmt(all[0].ms):'—';$('bestMode').textContent=all.length?`${all[0].name} · ${all[0].mode}`:'среди двух режимов';
    $('liveBadge').textContent=state.active+' LIVE';$('updated').textContent='ОБНОВЛЕНО: '+new Date(state.serverTime).toLocaleTimeString('ru-RU');
    listSessions();renderDetail();renderScores();
  }
  async function open(){try{state=await api('/admin/summary');setDashboard();render();live();}catch(e){showLogin();}}
  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginButton').disabled=true;
    try{await api('/admin/login',{password:$('password').value});$('password').value='';await open();}
    catch(e){$('loginError').textContent=e.message;}finally{$('loginButton').disabled=false;}
  });
  $('sessionFilter').addEventListener('change',()=>{filter=$('sessionFilter').value;if(state){listSessions();renderDetail();}});
  for(const mode of ['guest','pro'])$(mode+'Tab').addEventListener('click',()=>{rankMode=mode;$('guestTab').classList.toggle('active',mode==='guest');$('proTab').classList.toggle('active',mode==='pro');if(state)renderScores();});
  $('displayBtn').addEventListener('click',()=>{display=!display;$('dashboard').classList.toggle('broadcast',display);$('displayBtn').textContent=display?'◀ РЕЖИМ ОРГАНИЗАТОРА':'▣ ЭКРАН ДЛЯ ГОСТЕЙ';});
  $('fullBtn').addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{});});
  $('logoutBtn').addEventListener('click',async()=>{try{await api('/admin/logout',{});}catch(e){}showLogin('');});
  setInterval(()=>{$('timeLabel').textContent=new Date().toLocaleTimeString('ru-RU');if(state){
    // Smooth countdown between server updates without changing authoritative state.
    const offset=Date.now()-state.serverTime;if(offset>0)for(const s of state.players){if(s.status==='active')s.remainingMs=Math.max(0,s.deadline-Date.now());}
    listSessions();renderDetail();
  }},1000);
  open();
})();
