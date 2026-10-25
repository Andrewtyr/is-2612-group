/* Этап LG: задания формируются из известного решения и валидируются перебором. */
(function (CS) {
  'use strict';
  const domain=()=>{const arr=[];for(let A=1;A<=9;A++)for(let B=1;B<=9;B++)for(let C=1;C<=9;C++) if(A!==B&&B!==C&&A!==C)arr.push({A,B,C});return arr;};
  const triples=domain();
  function conditions(type, A,B,C) {
    if(type==='LG-1') return [
      {text:`A + B = ${A+B}`,test:t=>t.A+t.B===A+B},
      {text:`B + C = ${B+C}`,test:t=>t.B+t.C===B+C},
      {text:`A + C = ${A+C}`,test:t=>t.A+t.C===A+C}
    ];
    if(type==='LG-2') {
      // B=C+d, A=m*C+offset, A+B=sum.
      const m=CS.randomInt(2,3),off=CS.randomInt(0,2),d=CS.randomInt(1,3);
      if(A!==m*C+off || B!==C+d) return null;
      return [
        {text:`A + B = ${A+B}`,test:t=>t.A+t.B===A+B},
        {text:`B = C + ${d}`,test:t=>t.B===t.C+d},
        {text:`A = ${m} × C + ${off}`,test:t=>t.A===m*t.C+off}
      ];
    }
    // Для PRO — несколько разных арифметических правил + порядок цифр.
    const total=A+B+C;
    const bank=[
      {text:`A + B + C = ${total}`,test:t=>t.A+t.B+t.C===total},
      {text:`A + 2 × B + C = ${A+2*B+C}`,test:t=>t.A+2*t.B+t.C===A+2*B+C},
      {text:`2 × A + B + C = ${2*A+B+C}`,test:t=>2*t.A+t.B+t.C===2*A+B+C},
      {text:`A + B = ${A+B}`,test:t=>t.A+t.B===A+B},
      {text:`B + C = ${B+C}`,test:t=>t.B+t.C===B+C},
      {text:`A + C = ${A+C}`,test:t=>t.A+t.C===A+C},
      {text:`A ${A<B?'<':'>'} B`,test:t=>A<B?t.A<t.B:t.A>t.B},
      {text:`B ${B<C?'<':'>'} C`,test:t=>B<C?t.B<t.C:t.B>t.C},
      {text:`A ${A<C?'<':'>'} C`,test:t=>A<C?t.A<t.C:t.A>t.C},
      {text:`|A − C| = ${Math.abs(A-C)}`,test:t=>Math.abs(t.A-t.C)===Math.abs(A-C)},
      {text:`|B − C| = ${Math.abs(B-C)}`,test:t=>Math.abs(t.B-t.C)===Math.abs(B-C)}
    ];
    // Целевая сумма, взвешенная сумма, сравнение и дополнительные правила до единственности.
    const chosen=[bank[0],bank[1]];
    const rest=CS.shuffle(bank.slice(2));
    for(const item of rest) {
      if(triples.filter(t=>chosen.every(c=>c.test(t))).length===1) break;
      chosen.push(item);
      if(chosen.length>=5) break;
    }
    if(triples.filter(t=>chosen.every(c=>c.test(t))).length!==1) {
      for(const item of [bank[3],bank[4],bank[5]]) if(!chosen.includes(item)) {
        chosen.push(item);
        if(triples.filter(t=>chosen.every(c=>c.test(t))).length===1)break;
      }
    }
    return chosen;
  }
  function build(type) {
    let A,B,C,items,possible;
    for(let attempt=0;attempt<2000;attempt++) {
      [A,B,C]=CS.shuffle([1,2,3,4,5,6,7,8,9]).slice(0,3);
      items=conditions(type,A,B,C);
      if(!items) continue;
      possible=triples.filter(t=>items.every(c=>c.test(t)));
      if(possible.length===1) break;
    }
    if(!possible || possible.length!==1) throw new Error('Failed to generate unique logic challenge');
    const lines=CS.shuffle(items.map(x=>x.text));
    const hint=type==='LG-1'?'Сложите все три равенства: каждая переменная окажется посчитана дважды.':
      type==='LG-2'?'Подставьте выражения через C в уравнение суммы A + B.':
      'Начните с общей суммы и взвешенной суммы. Разница между ними поможет найти одну цифру.';
    return {id:type,category:'LG',title:'Логический замок',subtitle:'Сектор 03 / числовая защита',prompt:'Найдите три разные цифры A, B и C (от 1 до 9). Введите код в порядке ABC.',kind:'logic',lines,answer:`${A}${B}${C}`,inputType:'digits',maxLength:3,placeholder:'ABC',hint,solutionCount:possible.length,signature:`${type}|${A}${B}${C}|${lines.join(';')}`};
  }
  CS.gen.LG={templates:['LG-1','LG-2','LG-3'],available:mode=>mode==='pro'?['LG-1','LG-2','LG-3']:['LG-1','LG-2'],generate:build};
})(window.CyberSafe);
