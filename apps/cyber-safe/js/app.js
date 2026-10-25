/* CYBER SAFE 3.0 — игровая логика, интерфейс, таймер, звуки и администрирование. */
(function (root) {
  'use strict';
  const CS = root.CyberSafe;
  const $ = id => document.getElementById(id);
  const screens={intro:$('introScreen'),ready:$('readyScreen'),play:$('playScreen'),success:$('successScreen'),fail:$('failScreen'),ranking:$('rankingScreen')};
  const stageOrder={guest:['LOG','CR','LG'],pro:['LOG','CR','LG','JS']};
  const names={guest:'ГОСТЬ',pro:'PRO'};
  let page='intro',selectedMode='guest',rankMode='guest',rankReturn='intro';
  let run=null,timerId=null,resultsIdle=null,transitionId=null,audioCtx=null;
  let online=false, sharedScores={guest:[],pro:[]}, heartbeatId=null;
  async function api(path,data){
    const response=await fetch('/cyber-safe/api'+path,{
      method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},
      body:data===undefined?undefined:JSON.stringify(data),cache:'no-store'});
    const result=await response.json();
    if(!response.ok)throw Object.assign(new Error(result.error||'Ошибка сервера'),{data:result,status:response.status});
    return result;
  }
  function serverState(data){
    if(!run)return;
    run.deadline=data.deadline;run.remaining=Math.max(0,data.deadline-Date.now());run.unlocked=data.unlocked;
    run.stage=data.stage;run.penalties=data.penalties;run.hints=data.hints;run.wrong=data.wrong;
    if(data.task)run.stages[data.stage]=data.task;
    if(data.elapsedMs!==undefined)run.effective=data.elapsedMs;
    updatePenalties();
  }
  function endHeartbeat(){if(heartbeatId!==null)clearInterval(heartbeatId);heartbeatId=null;}
  function abandon(){if(run&&run.online&&!run.finished&&run.token){
    api('/session/quit',{token:run.token}).catch(()=>{});
  }}
  function startHeartbeat(){
    endHeartbeat();heartbeatId=setInterval(async()=>{
      if(!run||!run.online||run.finished||page!=='play')return;
      try {const state=await api('/session/heartbeat',{token:run.token});serverState(state);
        if(state.status==='expired')fail('Время истекло. Система заблокирована.');
      }catch(e){setFeedback('Связь с сервером потеряна. Проверьте интернет и повторите попытку.',true);}
    },5000);
  }
  async function initOnline(){
    try {const info=await api('/config');if(!info.online)return;
      online=true;
      const footer=$('footerNotice');footer.textContent='ОНЛАЙН · ЕДИНЫЙ РЕЙТИНГ · ЖИВЫЕ СЕССИИ';
      document.querySelector('#rankingScreen .fine-print').textContent='Общие рекорды всех игроков. Результаты сохраняются на сервере.';
      document.querySelector('#introScreen .fine-print').textContent='Онлайн · Единый рейтинг · Новые задания при каждом запуске';
      $('guestTime').textContent='06:00';$('proTime').textContent='08:00';
      const nav=document.querySelector('.nav-actions');const link=document.createElement('a');link.href='/cyber-safe/monitor';link.target='_blank';link.rel='noopener noreferrer';link.className='nav-btn monitor-link';link.textContent='◉ Монитор';nav.insertBefore(link,$('soundBtn'));
      renderMode();
    }catch(e) { /* static/offline version still usable */ }
  }

  function duration(mode){const s=CS.storage.settings;return (mode==='guest'?s.guestMinutes:s.proMinutes)*60000;}
  function mmss(ms){const seconds=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
  function setText(id,text){$(id).textContent=String(text);}
  function playSound(type,force=false){
    if(!CS.storage.settings.sound&&!force)return;
    try {
      const AudioContext=root.AudioContext||root.webkitAudioContext;
      if(!AudioContext)return;
      audioCtx=audioCtx||new AudioContext();
      if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
      const sounds={click:[[450,0,.08]],success:[[580,0,.11],[740,.12,.11]],error:[[190,0,.13]],hint:[[420,0,.09]],win:[[440,0,.12],[570,.13,.14],[880,.28,.27]],fail:[[280,0,.19],[180,.21,.26]]};
      (sounds[type]||sounds.click).forEach(([frequency,delay,length])=>{
        const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),start=audioCtx.currentTime+delay+.01;
        osc.type=type==='error'||type==='fail'?'triangle':'sine';osc.frequency.setValueAtTime(frequency,start);
        gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.065,start+.02);gain.gain.exponentialRampToValueAtTime(.0001,start+length);
        osc.connect(gain);gain.connect(audioCtx.destination);osc.start(start);osc.stop(start+length+.02);
      });
    }catch(e){/* Некоторые браузеры запрещают автовоспроизведение. Игра работает без звука. */}
  }
  function clearTimers(){endHeartbeat();if(timerId!==null)clearInterval(timerId);timerId=null;if(resultsIdle!==null)clearTimeout(resultsIdle);resultsIdle=null;if(transitionId!==null)clearTimeout(transitionId);transitionId=null;}
  function screen(id){page=id;Object.entries(screens).forEach(([key,el])=>el.classList.toggle('hidden',key!==id));}
  function setVault(status){
    const scene=$('vaultScene');scene.dataset.state=status;
    const statuses={idle:['СИСТЕМА ОЖИДАЕТ','ГОТОВ К ИСПЫТАНИЮ'],ready:['СИСТЕМА ГОТОВА','ПРОВЕРКА ДОСТУПА'],playing:['ДОСТУП ЗАКРЫТ','ТРЕБУЕТСЯ АВТОРИЗАЦИЯ'],unlock:['ЗАМОК ОТКРЫТ','ЧАСТИЧНЫЙ ДОСТУП'],open:['ДОСТУП ПОЛУЧЕН','ВСЕ ЗАМКИ ОТКРЫТЫ'],denied:['СИСТЕМА ЗАБЛОКИРОВАНА','ДОСТУП ОТКЛОНЁН']};
    setText('vaultStatus',statuses[status][0]);setText('protocolLabel',statuses[status][1]);
    setText('doorLabel',status==='open'?'OPEN':'LOCKED');$('doorLight').style.background=status==='open'?'#66efbf':'';
  }
  function renderLocks(count,open){
    const wrap=$('lockIndicators');wrap.replaceChildren();
    for(let i=0;i<count;i++){
      const elem=document.createElement('span');elem.className='lock-led'+(i<open?' open':'');elem.title=`Замок ${i+1}: ${i<open?'открыт':'закрыт'}`;wrap.append(elem);
    }
  }
  function renderMode(){
    const settings=CS.storage.settings;
    if(!settings.proEnabled&&!online&&selectedMode==='pro')selectedMode='guest';
    ['guest','pro'].forEach(mode=>{const b=$(mode+'Mode');b.classList.toggle('selected',mode===selectedMode);b.setAttribute('aria-pressed',String(mode===selectedMode));});
    $('proMode').disabled=!settings.proEnabled&&!online;
    setText('guestTime',mmss(online?360000:settings.guestMinutes*60000));setText('proTime',mmss(online?480000:settings.proMinutes*60000));
    setText('readyMode',names[selectedMode]);setText('readyTime',mmss(online?(selectedMode==='guest'?360000:480000):duration(selectedMode)));
    $('soundBtn').textContent=settings.sound?'♫':'♩';$('soundBtn').setAttribute('aria-label',settings.sound?'Выключить звук':'Включить звук');
    setText('footerNotice',online?'ОНЛАЙН · ЕДИНЫЙ РЕЙТИНГ · ЖИВЫЕ СЕССИИ':settings.demo?'ДЕМО-РЕЖИМ · РЕЗУЛЬТАТЫ НЕ ЗАПИСЫВАЮТСЯ':CS.storage.persistent?'OFFLINE-READY · НИКАКИХ ВНЕШНИХ СЕРВИСОВ':'ВНИМАНИЕ: БРАУЗЕР НЕ СОХРАНЯЕТ РЕКОРДЫ');
  }
  function intro(){abandon();clearTimers();run=null;screen('intro');setVault('idle');renderLocks(selectedMode==='pro'?4:3,0);renderMode();}
  function selectMode(mode){if(mode==='pro'&&!CS.storage.settings.proEnabled&&!online)return;selectedMode=mode;renderMode();renderLocks(mode==='pro'?4:3,0);playSound('click');}
  function ready(){screen('ready');setVault('ready');renderLocks(stageOrder[selectedMode].length,0);renderMode();playSound('click');}
  function generateStage(category,index){
    const gen=CS.gen[category];
    const allowed=gen.available?gen.available(selectedMode):gen.templates;
    const key=selectedMode+'|'+category+'|'+index;
    const prev=CS.storage.getLastTemplate(key);
    const pool=allowed.filter(x=>x!==prev);
    const chosen=pool.length?pool:allowed;
    const hist=new Set(CS.storage.getHistory(category));
    let candidate=null;
    for(let i=0;i<75;i++){
      const type=CS.pick(chosen);
      try{candidate=gen.generate(type);}catch(e){continue;}
      if(candidate&&candidate.answer&&(!hist.has(candidate.signature)||i===74))break;
    }
    if(!candidate||!candidate.answer)throw new Error('Не удалось создать задачу '+category);
    CS.storage.addHistory(category,candidate.signature);
    CS.storage.setLastTemplate(key,candidate.id);
    return candidate;
  }
  async function startGame(){
    clearTimers();
    if(online){
      $('startBtn').disabled=true;
      try{
        const n=$('playerName').value.trim();
        const response=await api('/session/start',{mode:selectedMode,name:n});
        const stages=new Array(response.total);stages[0]=response.task;
        run={online:true,token:response.token,mode:selectedMode,stages,stage:0,unlocked:0,
          hints:0,wrong:0,penalties:0,limit:response.limit,deadline:response.deadline,
          remaining:response.deadline-Date.now(),finished:false,saved:false};
        screen('play');setVault('playing');renderLocks(stages.length,0);renderStage();updateTime();
        timerId=setInterval(updateTime,80);startHeartbeat();playSound('click');
      }catch(e){alert('Не удалось запустить игру: '+e.message+' Попробуйте ещё раз.');}
      finally{$('startBtn').disabled=false;}
      return;
    }
    let stages;
    try{stages=stageOrder[selectedMode].map((cat,i)=>generateStage(cat,i));}catch(e){alert('Не удалось создать задание. Обновите страницу. '+e.message);return;}
    run={mode:selectedMode,stages,stage:0,unlocked:0,hintsUsed:Array(stages.length).fill(false),hints:0,wrong:0,penalties:0,limit:duration(selectedMode),deadline:performance.now()+duration(selectedMode),remaining:duration(selectedMode),finished:false,saved:false};
    screen('play');setVault('playing');renderLocks(stages.length,0);renderStage();updateTime();timerId=setInterval(updateTime,80);playSound('click');
  }
  function textNode(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;element.textContent=text;return element;}
  function renderChallengeData(stage){
    const area=$('challengeData');area.replaceChildren();area.append(textNode('div','data-head',stage.kind==='log'?'// SYSTEM_EVENT_LOG':stage.kind==='cipher'?'// ENCRYPTED_PAYLOAD':stage.kind==='logic'?'// CONSTRAINT_ENGINE':'// CODE_INSPECTION'));
    if(stage.kind==='log'){
      stage.rows.forEach(row=>{const p=textNode('div','log-row'+(row.level==='WARN'?' warn-row':''),row.text);area.append(p);});
    }else if(stage.kind==='cipher'){
      area.append(textNode('div','cipher-caption',stage.note));area.append(textNode('div','cipher-word',stage.cipher));
      if(stage.ascii){const details=document.createElement('details');details.className='ascii-details';details.append(textNode('summary','', 'СПРАВОЧНИК ASCII · A—Z'));
        const grid=textNode('div','ascii-grid','');for(let i=0;i<26;i++)grid.append(textNode('span','',String.fromCharCode(65+i)+'\n'+(65+i)));
        details.append(grid);area.append(details);
      }
    }else if(stage.kind==='logic'){
      const grid=textNode('div','logic-lines','');stage.lines.forEach(line=>grid.append(textNode('div','logic-line',line)));area.append(grid);
    }else{const pre=textNode('pre','code-window',stage.code);area.append(pre);}
  }
  function renderStage(){
    if(!run)return;
    const stage=run.stages[run.stage];
    setText('challengeProgress',`СЕКТОР ${CS.two(run.stage+1)} / ${CS.two(run.stages.length)}`);
    setText('challengeId',stage.id);setText('challengeTitle',stage.title);setText('challengePrompt',stage.prompt);
    renderChallengeData(stage);
    const track=$('progressTrack');track.replaceChildren();for(let i=0;i<run.stages.length;i++){
      const el=document.createElement('span');el.className=i<run.unlocked?'complete':i===run.stage?'current':'';track.append(el);
    }
    const inp=$('answerInput');inp.value='';inp.disabled=false;inp.placeholder=stage.placeholder;inp.maxLength=stage.maxLength;inp.inputMode=stage.inputType==='digits'||stage.inputType==='integer'?'numeric':'text';
    setText('answerFormat',stage.inputType==='word'?'/ Латиница':stage.inputType==='integer'?'/ Целое число':'/ 3 цифры');
    setFeedback('');$('hintBox').classList.add('hidden');$('hintBox').textContent='';$('hintBtn').disabled=false;
    $('checkBtn').disabled=false;renderLocks(run.stages.length,run.unlocked);setVault('playing');updatePenalties();
    setTimeout(()=>{if(page==='play'&&!run.finished)inp.focus({preventScroll:true});},80);
  }
  function setFeedback(message,error=false){const el=$('answerFeedback');el.textContent=message;el.classList.toggle('error',error);}
  function remaining(){return run?Math.max(0,run.deadline-(run.online?Date.now():performance.now())):0;}
  function updateTime(){
    if(!run||run.finished||page!=='play')return;
    run.remaining=remaining();
    setText('timerValue',mmss(run.remaining));$('timerWrap').classList.toggle('urgent',run.remaining<=30000);
    if(run.remaining<=0)fail('Время истекло. Система заблокирована. Новый запуск — новые задания.');
  }
  function updatePenalties(){setText('penaltyLabel','ШТРАФЫ: '+mmss(run?.penalties||0));}
  function penalty(ms){
    if(!run||run.finished)return;
    run.penalties+=ms;run.deadline-=ms;updatePenalties();updateTime();
  }
  async function submitAnswer(e){
    e.preventDefault();if(!run||run.finished||page!=='play')return;
    updateTime();if(run.finished)return;
    const stage=run.stages[run.stage];const input=$('answerInput');
    let value=CS.normalize(input.value);
    if(!value){setFeedback('Введите ответ перед проверкой.',true);input.focus();return;}
    if(stage.inputType==='word'&&!/^[A-Z]+$/.test(value)){setFeedback('Используйте только английские буквы A–Z.',true);return;}
    if(stage.inputType==='digits'&&!/^\d{3}$/.test(value)){setFeedback('Нужно ввести ровно три цифры, включая возможный ноль в начале.',true);return;}
    if(stage.inputType==='integer'&&!/^\d{1,5}$/.test(value)){setFeedback('Введите целое неотрицательное число.',true);return;}
    if(run.online){
      $('checkBtn').disabled=true;
      try{
        const result=await api('/session/answer',{token:run.token,value});
        const wasStage=run.stage;serverState(result);
        if(result.status==='expired'){fail('Время истекло. Система заблокирована.');return;}
        if(result.correct){
          setFeedback('КЛЮЧ ПРИНЯТ. ЗАМОК ОТКРЫТ!');renderLocks(run.stages.length,run.unlocked);
          input.disabled=true;$('hintBtn').disabled=true;setVault('unlock');playSound('success');
          if(result.status==='won'){
            run.finished=true;clearInterval(timerId);endHeartbeat();timerId=null;
            transitionId=setTimeout(win,650);
          }else{transitionId=setTimeout(()=>{if(run&&!run.finished){renderStage();}},650);}
        }else{setFeedback('НЕВЕРНЫЙ КЛЮЧ · −5 СЕКУНД. Попробуй ещё раз.',true);playSound('error');input.select();updateTime();}
      }catch(e){setFeedback('Ошибка соединения: '+e.message,true);}
      finally{if(run&&!run.finished&&page==='play'&&$('answerInput').disabled===false)$('checkBtn').disabled=false;}
      return;
    }
    if(value===stage.answer){
      run.unlocked+=1;setFeedback('КЛЮЧ ПРИНЯТ. ЗАМОК ОТКРЫТ!');renderLocks(run.stages.length,run.unlocked);
      input.disabled=true;$('checkBtn').disabled=true;$('hintBtn').disabled=true;setVault('unlock');playSound('success');
      if(run.unlocked===run.stages.length){
        run.remaining=remaining();run.finished=true;clearInterval(timerId);timerId=null;
        transitionId=setTimeout(win,650);
      }else{
        transitionId=setTimeout(()=>{if(run&&run.finished===false){run.stage++;input.disabled=false;renderStage();}},650);
      }
    }else{
      run.wrong++;penalty(5000);if(run.finished)return;
      setFeedback('НЕВЕРНЫЙ КЛЮЧ · −5 СЕКУНД. Попробуй ещё раз.',true);$('playScreen').classList.remove('wobble');void $('playScreen').offsetHeight;$('playScreen').classList.add('wobble');
      playSound('error');input.select();
    }
  }
  async function useHint(){
    if(!run||run.finished||page!=='play')return;
    if(run.online){
      if($('hintBtn').disabled)return;$('hintBtn').disabled=true;
      try{
        const result=await api('/session/hint',{token:run.token});serverState(result);
        if(result.status==='expired'){fail('Время истекло. Система заблокирована.');return;}
        const hint=$('hintBox');hint.textContent='ПОДСКАЗКА · '+result.hint;hint.classList.remove('hidden');playSound('hint');
      }catch(e){setFeedback('Не удалось получить подсказку: '+e.message,true);$('hintBtn').disabled=false;}
      return;
    }
    if(run.hintsUsed[run.stage])return;
    run.hintsUsed[run.stage]=true;run.hints++;penalty(20000);if(run.finished)return;
    const hint=$('hintBox');hint.textContent='ПОДСКАЗКА · '+run.stages[run.stage].hint;hint.classList.remove('hidden');$('hintBtn').disabled=true;playSound('hint');
  }
  function stopAfterResult(){resultsIdle=setTimeout(()=>{if(page==='success'||page==='fail')intro();},60000);}
  function win(){
    if(!run)return;
    const ms=run.online?run.effective:Math.min(run.limit,Math.round(run.limit-run.remaining));run.effective=ms;
    screen('success');setVault('open');renderLocks(run.stages.length,run.stages.length);
    setText('finalTime',mmss(ms));setText('finalHints',run.hints);setText('finalPenalties',mmss(run.penalties));
    $('nickname').value='';$('saveScoreBtn').disabled=false;
    if(CS.storage.settings.demo&&!run.online){setText('saveScoreFeedback','Демонстрационный режим: результат не записывается.');$('saveScoreWrap').classList.add('hidden');}
    else{$('saveScoreWrap').classList.remove('hidden');setText('saveScoreFeedback','До 16 символов, без персональных данных.');}
    playSound('win');stopAfterResult();
  }
  function fail(reason){
    if(!run||run.finished)return;
    run.finished=true;clearTimers();screen('fail');setVault('denied');renderLocks(run.stages.length,run.unlocked);
    setText('failReason',reason);setText('failLocks',`${run.unlocked} / ${run.stages.length}`);setText('failTime',mmss(run.limit));playSound('fail');stopAfterResult();
  }
  async function saveScore(){
    if(page!=='success'||!run||run.saved||(!run.online&&CS.storage.settings.demo))return;
    const name=$('nickname').value.trim();
    if(!/^[A-Za-zА-Яа-яЁё0-9 _-]{1,16}$/.test(name)){setText('saveScoreFeedback','Допустимо 1–16 символов: буквы, цифры, пробел, _ или -.');return;}
    if(run.online){
      $('saveScoreBtn').disabled=true;
      try{await api('/session/score',{token:run.token,name});run.saved=true;
        setText('saveScoreFeedback','Результат сохранён в общем рейтинге!');playSound('success');
      }catch(e){$('saveScoreBtn').disabled=false;setText('saveScoreFeedback','Не удалось сохранить: '+e.message);}
      return;
    }
    CS.storage.addScore(run.mode,{name,ms:run.effective,hints:run.hints,created:Date.now()});run.saved=true;$('saveScoreBtn').disabled=true;
    setText('saveScoreFeedback','Результат сохранён! Открой таблицу рекордов.');playSound('success');
  }
  function showRanking(){
    if(page==='play'&&!confirm('Прервать текущую игру и открыть рекорды?'))return;
    if(page==='play'){abandon();clearTimers();run=null;rankReturn='intro';setVault('idle');renderLocks(3,0);} else rankReturn=page;
    rankMode=(run&&run.mode)||selectedMode;screen('ranking');renderRanking();if(online)syncRanking();
  }
  async function syncRanking(){
    try{sharedScores=await api('/scores');if(page==='ranking')renderRanking();}
    catch(e){if(page==='ranking')$('rankingRows').textContent='Не удалось загрузить общий рейтинг: '+e.message;}
  }
  function renderRanking(){
    ['guest','pro'].forEach(m=>{$('rank'+(m==='guest'?'Guest':'Pro')).classList.toggle('active',m===rankMode);});
    const data=online?(sharedScores[rankMode]||[]):CS.storage.getScores(rankMode),list=$('rankingRows');list.replaceChildren();
    if(!data.length){list.append(textNode('div','rank-empty','Пока нет рекордов. Открой сейф первым!'));return;}
    data.forEach((score,i)=>{
      const row=textNode('div','rank-row','');const name=textNode('div','rank-name','');name.append(textNode('span','rank-position',String(i+1).padStart(2,'0')));name.append(textNode('span','',score.name));
      row.append(name);row.append(textNode('span','',mmss(score.ms)));row.append(textNode('span','',String(score.hints)));list.append(row);
    });
  }
  function home(){
    if(page==='play'&&!confirm('Прервать текущую попытку? Прогресс не сохранится.'))return;
    intro();
  }
  function openAdmin(){
    if(online){window.open('/cyber-safe/monitor','_blank','noopener,noreferrer');return;}
    $('adminOverlay').classList.remove('hidden');$('adminOverlay').setAttribute('aria-hidden','false');$('adminSettings').classList.add('hidden');$('adminAuth').classList.remove('hidden');$('adminPin').value='';setText('adminAuthError','');$('adminPin').focus();
  }
  function closeAdmin(){ $('adminOverlay').classList.add('hidden');$('adminOverlay').setAttribute('aria-hidden','true'); }
  function adminUnlock(){
    // Это PIN для защиты от случайных изменений, а не криптографическая защита: приложение открытое и офлайновое.
    if($('adminPin').value!=='2612'){setText('adminAuthError','Неверный PIN.');return;}
    const s=CS.storage.settings;setText('adminAuthError','');$('adminAuth').classList.add('hidden');$('adminSettings').classList.remove('hidden');
    $('guestMinutes').value=s.guestMinutes;$('proMinutes').value=s.proMinutes;$('proEnabled').checked=s.proEnabled;$('demoEnabled').checked=s.demo;$('soundEnabled').checked=s.sound;
  }
  function saveSettings(){
    const s={guestMinutes:Number($('guestMinutes').value),proMinutes:Number($('proMinutes').value),proEnabled:$('proEnabled').checked,demo:$('demoEnabled').checked,sound:$('soundEnabled').checked};
    CS.storage.saveSettings(s);renderMode();if(page==='intro'){renderLocks(stageOrder[selectedMode].length,0);}closeAdmin();
  }
  function resetScores(){if(confirm('Точно удалить все рекорды Гость и PRO с этого компьютера? Отменить нельзя.')){CS.storage.clearScores();if(page==='ranking')renderRanking();alert('Таблица рекордов очищена.');}}

  $('guestMode').addEventListener('click',()=>selectMode('guest'));$('proMode').addEventListener('click',()=>selectMode('pro'));
  $('toReadyBtn').addEventListener('click',ready);$('backBtn').addEventListener('click',intro);$('startBtn').addEventListener('click',startGame);
  $('answerForm').addEventListener('submit',submitAnswer);$('hintBtn').addEventListener('click',useHint);
  $('homeBtn').addEventListener('click',home);$('scoresBtn').addEventListener('click',showRanking);
  $('soundBtn').addEventListener('click',()=>{CS.storage.saveSettings({sound:!CS.storage.settings.sound});renderMode();playSound('click');});
  $('fullBtn').addEventListener('click',()=>{try{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen();}catch(e){}});
  document.querySelectorAll('.replay-button').forEach(b=>b.addEventListener('click',()=>{selectedMode=run?.mode||selectedMode;ready();}));
  document.querySelectorAll('.show-ranking').forEach(b=>b.addEventListener('click',showRanking));
  $('saveScoreBtn').addEventListener('click',saveScore);$('nickname').addEventListener('keydown',e=>{if(e.key==='Enter')saveScore();});
  $('rankGuest').addEventListener('click',()=>{rankMode='guest';renderRanking();if(online)syncRanking();});$('rankPro').addEventListener('click',()=>{rankMode='pro';renderRanking();if(online)syncRanking();});
  $('rankBack').addEventListener('click',()=>{
    if(rankReturn==='success'||rankReturn==='fail'){
      screen(rankReturn);if(resultsIdle!==null)clearTimeout(resultsIdle);stopAfterResult();
    } else intro();
  });
  $('adminClose').addEventListener('click',closeAdmin);$('adminUnlock').addEventListener('click',adminUnlock);
  $('adminPin').addEventListener('keydown',e=>{if(e.key==='Enter')adminUnlock();});
  $('adminSave').addEventListener('click',saveSettings);$('resetScores').addEventListener('click',resetScores);$('soundTest').addEventListener('click',()=>playSound('win',true));
  $('adminOverlay').addEventListener('click',e=>{if(e.target===$('adminOverlay'))closeAdmin();});
  // Автовозврат через 60 секунд именно БЕЗ действий участника на итоговом экране.
  ['pointerdown','keydown'].forEach(eventName=>document.addEventListener(eventName,()=>{
    if(page==='success'||page==='fail'){if(resultsIdle!==null)clearTimeout(resultsIdle);stopAfterResult();}
  }));
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='a')||(e.ctrlKey&&e.altKey&&e.key.toLowerCase()==='s')){e.preventDefault();openAdmin();}
    if(e.key==='Escape'&&!$('adminOverlay').classList.contains('hidden'))closeAdmin();
  });
  $('answerInput').addEventListener('input',function(){
    if(!run)return;const stage=run.stages[run.stage];
    if(stage.inputType==='digits'||stage.inputType==='integer')this.value=this.value.replace(/\D/g,'');
    if(stage.inputType==='word')this.value=this.value.replace(/[^a-z]/gi,'').toUpperCase();
  });
  renderMode();renderLocks(3,0);setVault('idle');screen('intro');initOnline();
  // Для локальных автотестов и демонстрации, без влияния на игру.
  if(root.__CYBER_SAFE_TEST__) CS.debug={get state(){return {page,selectedMode,run:run?{...run,stages:run.stages.map(s=>({...s}))}:null};},generateStage:(category,mode='guest')=>{const prev=selectedMode;selectedMode=mode;const result=generateStage(category,0);selectedMode=prev;return result;}};
})(window);
