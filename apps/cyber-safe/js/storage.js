/* Локальные рекорды, история последних 30 задач и настройки организатора. */
(function (CS) {
  'use strict';
  const KEY='cybersafe-v2-offline';
  const defaults=()=>({settings:{guestMinutes:10,proMinutes:12,proEnabled:true,sound:true,demo:false},scores:{guest:[],pro:[]},history:{LOG:[],CR:[],LG:[],JS:[]},lastTemplates:{}});
  let data=defaults();let persistent=true;
  try {
    const raw=localStorage.getItem(KEY);
    if(raw){
      const parsed=JSON.parse(raw);
      if(parsed && typeof parsed==='object'){
        data.settings={...data.settings,...parsed.settings};
        data.scores={guest:Array.isArray(parsed.scores?.guest)?parsed.scores.guest:[],pro:Array.isArray(parsed.scores?.pro)?parsed.scores.pro:[]};
        for(const key of Object.keys(data.history))data.history[key]=Array.isArray(parsed.history?.[key])?parsed.history[key].slice(-30):[];
        data.lastTemplates=parsed.lastTemplates||{};
      }
    }
    localStorage.setItem(KEY,JSON.stringify(data));
  } catch(e) {persistent=false;}
  const save=()=>{if(persistent)try{localStorage.setItem(KEY,JSON.stringify(data));}catch(e){persistent=false;}};
  const clamp=(v,lo,hi,fallback)=>{const n=Number(v);return Number.isInteger(n)&&n>=lo&&n<=hi?n:fallback;};
  data.settings.guestMinutes=clamp(data.settings.guestMinutes,9,12,10);
  data.settings.proMinutes=clamp(data.settings.proMinutes,11,15,12);
  ['proEnabled','sound','demo'].forEach(k=>data.settings[k]=Boolean(data.settings[k]));
  CS.storage={
    get settings(){return {...data.settings};},
    saveSettings(values){data.settings={...data.settings,...values};data.settings.guestMinutes=clamp(data.settings.guestMinutes,9,12,10);data.settings.proMinutes=clamp(data.settings.proMinutes,11,15,12);save();},
    get persistent(){return persistent;},
    getHistory(category){return (data.history[category]||[]).slice();},
    addHistory(category,signature){const h=data.history[category]||[];h.push(signature);data.history[category]=h.slice(-30);save();},
    getLastTemplate(key){return data.lastTemplates[key];},
    setLastTemplate(key,value){data.lastTemplates[key]=value;save();},
    getScores(mode){return (data.scores[mode]||[]).filter(s=>s.levels===5).sort((a,b)=>a.ms-b.ms||a.hints-b.hints||a.created-b.created).slice(0,10);},
    addScore(mode,entry){const a=data.scores[mode]||[];const current=[...a.filter(s=>s.levels===5),entry];current.sort((x,y)=>x.ms-y.ms||x.hints-y.hints||x.created-y.created);data.scores[mode]=[...a.filter(s=>s.levels!==5),...current.slice(0,10)];save();},
    clearScores(){data.scores={guest:[],pro:[]};save();}
  };
})(window.CyberSafe);
