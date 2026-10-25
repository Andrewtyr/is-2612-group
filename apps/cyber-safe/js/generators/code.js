/* Этап JS: чтение кода без пользовательского eval. */
(function (CS) {
  'use strict';
  function build(type) {
    let code='',answer='',hint='',expr='';
    if(type==='JS-1') {
      const start=CS.randomInt(1,8),n=CS.randomInt(2,4),mul=CS.randomInt(2,4),add=CS.randomInt(1,4),mod=CS.randomInt(7,10);
      let x=start;for(let i=0;i<n;i++)x=(x*mul+add)%mod;
      answer=String(x);expr='x';
      code=`let x = ${start};\nfor (let i = 0; i < ${n}; i++) {\n  x = (x * ${mul} + ${add}) % ${mod};\n}`;
      hint='Проследите изменение x после первой итерации цикла; знак % означает остаток от деления.';
    } else if(type==='JS-2') {
      const start=CS.randomInt(2,18),bound=CS.randomInt(5,15),a=CS.randomInt(2,5),b=CS.randomInt(2,6);
      answer=String(start>bound ? start*2+a : start+b);expr='score';
      code=`let score = ${start};\nif (score > ${bound}) {\n  score = score * 2 + ${a};\n} else {\n  score = score + ${b};\n}`;
      hint='Сначала проверьте строгое сравнение >, затем выполняйте только одну из двух ветвей.';
    } else {
      const nums=Array.from({length:CS.randomInt(3,5)},()=>CS.randomInt(1,9));
      const index=CS.randomInt(1,nums.length-1),mult=CS.randomInt(2,4);
      answer=String(nums[index]*mult+nums[0]);expr='result';
      code=`const nums = [${nums.join(', ')}];\nconst index = ${index};\nconst result = nums[index] * ${mult} + nums[0];`;
      hint='Индексы массива начинаются с нуля: nums[0] — первый элемент.';
    }
    return {id:type,category:'JS',title:'Что выведет код?',subtitle:'Сектор 04 / анализ JavaScript',prompt:`Не запуская программу, определите итоговое значение переменной ${expr}.`,kind:'code',code,answer,inputType:'integer',maxLength:5,placeholder:'Число',hint,testExpression:expr,signature:`${type}|${code}`};
  }
  CS.gen.JS={templates:['JS-1','JS-2','JS-3'],generate:build};
})(window.CyberSafe);
