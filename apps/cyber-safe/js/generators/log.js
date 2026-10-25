/* Этап LOG: три различных шаблона анализа журналов. */
(function (CS) {
  'use strict';
  const labels = ['gateway', 'auth-node', 'database', 'firewall', 'storage', 'backup', 'api', 'worker'];
  const time = minute => '10:' + CS.two(minute) + ':' + CS.two(CS.randomInt(0, 59));
  function rows(targets, others) {
    return CS.shuffle([...targets, ...others]).map(e => ({...e, text: `${e.time}   ${e.level.padEnd(13)}  ${e.id}   ${e.details}`}));
  }
  function digits() { return CS.shuffle([0,1,2,3,4,5,6,7,8,9]).slice(0, 3); }
  function build(type) {
    const nums = digits();
    const times = CS.shuffle(Array.from({length: 48}, (_, i) => i+5)).slice(0, 7).sort((a,b) => a-b);
    const targetTimes = times.slice(0, 3);
    let targets=[], others=[], prompt='', hint='';
    if (type === 'LOG-1') {
      prompt = 'Найдите три события ERROR. Расположите их по времени от раннего к позднему и выпишите последние цифры их ID.';
      hint = 'Следите за полем ERROR, затем за временем. У идентификатора E472 нужна только последняя цифра.';
      targets = targetTimes.map((t,i) => ({ time:time(t), level:'ERROR', id:`E${CS.randomInt(10,99)}${nums[i]}`, details:CS.pick(labels) + ' failure' }));
      others = times.slice(3, CS.randomInt(5, 7)).map(t => ({time:time(t),level:CS.pick(['INFO','WARN','DEBUG']),id:`E${CS.randomInt(100,999)}`,details:CS.pick(labels)+' check'}));
    } else if (type === 'LOG-2') {
      prompt = 'Найдите три строки FAILED LOGIN. Отсортируйте их по времени и выпишите последнюю цифру каждого ID.';
      hint = 'Нужны только записи FAILED LOGIN. Порядок — от самого раннего времени к позднему.';
      targets = targetTimes.map((t,i) => ({ time:time(t), level:'AUTH', id:`L${CS.randomInt(10,99)}${nums[i]}`, details:'FAILED LOGIN / '+CS.pick(labels) }));
      others = times.slice(3,CS.randomInt(5,7)).map(t => ({time:time(t),level:'AUTH',id:`L${CS.randomInt(100,999)}`,details:CS.pick(['LOGIN OK','TOKEN REFRESH','SESSION END'])}));
    } else {
      const source = CS.pick(['SECURITY', 'CORE', 'ACCESS']);
      prompt = `Отыщите три записи источника ${source}. Упорядочите их по времени и соберите код из последних цифр ID.`;
      hint = `Игнорируйте другие источники. Сначала проверьте время у трёх строк ${source}.`;
      targets = targetTimes.map((t,i) => ({time:time(t),level:source,id:`S${CS.randomInt(10,99)}${nums[i]}`,details:'signal='+CS.pick(['accepted','verified','checked'])}));
      others = times.slice(3,CS.randomInt(5,7)).map(t => ({time:time(t),level:CS.pick(['BACKUP','NETWORK','CACHE']),id:`S${CS.randomInt(100,999)}`,details:'background task'}));
    }
    const list=rows(targets,others);
    const signature=`${type}|${targets.map(x=>x.id+'@'+x.time).join('|')}|${list.map(x=>x.id).join(',')}`;
    return {id:type,category:'LOG',title:'Анализ событий',subtitle:'Сектор 01 / журнал системы',prompt,kind:'log',rows:list,answer:nums.join(''),inputType:'digits',maxLength:3,placeholder:'Три цифры',hint,signature};
  }
  CS.gen.LOG={templates:['LOG-1','LOG-2','LOG-3'],generate:build};
})(window.CyberSafe);
