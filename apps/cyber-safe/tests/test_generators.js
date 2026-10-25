'use strict';
/* Запуск: node tests/test_generators.js. Зависимости не требуются. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.join(__dirname,'..');
const sandbox={console,Math,Uint32Array,crypto:require('crypto').webcrypto,localStorage:{getItem:()=>null,setItem:()=>{}}};sandbox.window=sandbox;
vm.createContext(sandbox);
for(const f of ['js/core.js','js/generators/log.js','js/generators/cipher.js','js/generators/logic.js','js/generators/code.js']) vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),sandbox,{filename:f});
const CS=sandbox.CyberSafe;
const count=1000;
const seen=new Map();
for(const category of ['LOG','CR','LG','JS']){
  const gen=CS.gen[category];
  for(const type of gen.templates){
    let distinct=new Set();
    for(let i=0;i<count;i++){
      const s=gen.generate(type);
      assert.strictEqual(s.id,type);assert(s.prompt&&s.answer&&s.hint&&s.signature);
      distinct.add(s.signature);
      if(category==='LOG'){
        assert(/^\d{3}$/.test(s.answer));
        assert(s.rows.length>=5&&s.rows.length<=7);
        let t=s.rows.filter(x=>type==='LOG-1'?x.level==='ERROR':type==='LOG-2'?x.details.includes('FAILED LOGIN'):x.level===s.prompt.match(/источника ([A-Z]+)/)[1]).sort((a,b)=>a.time.localeCompare(b.time));
        assert.strictEqual(t.length,3);assert.strictEqual(t.map(x=>x.id.at(-1)).join(''),s.answer);
      }
      if(category==='CR'){
        const dec=type==='CR-3'?String.fromCharCode(...s.cipher.split(' ').map(Number)):CS.gen.CR.shift(s.cipher,-Number(s.note.match(/\+(\d+)/)?.[1]));
        assert.strictEqual(type==='CR-2'?CS.gen.CR.reverse(dec):dec,s.answer);
        assert(/^[A-Z]+$/.test(s.answer));
      }
      if(category==='LG'){
        assert.strictEqual(s.solutionCount,1);
        assert(/^\d{3}$/.test(s.answer));
        assert.strictEqual(new Set(s.answer).size,3);
      }
      if(category==='JS'){
        const result=vm.runInNewContext(s.code+'\n'+s.testExpression+';');
        assert.strictEqual(String(result),s.answer);
        assert(s.code.split('\n').length>=3&&s.code.split('\n').length<=7);
      }
    }
    assert(distinct.size>(type==='CR-3'?35:100),category+'/'+type+' не создаёт достаточно различных комбинаций: '+distinct.size);
    console.log('✓',type,'—',count,'корректных вариантов, уникальных:',distinct.size);
  }
}
console.log('PASS — все генераторы успешно проверены');
