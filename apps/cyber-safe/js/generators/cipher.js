/* Этап CR: сдвиг Цезаря, реверс + сдвиг, ASCII. */
(function (CS) {
  'use strict';
  const words=['CODE','LOGIN','HOTEL','GUEST','SERVER','SYSTEM','SCRIPT','BROWSER','NETWORK','PORTAL','ACCESS','TOKEN','ROUTER','SECURE','KEYBOARD','ARRAY','DEBUG','CIPHER','MODULE','STORAGE','DATABASE','PACKET','SIGNAL','CLIENT','DIGITAL','BACKUP','PYTHON','COMPUTER','FUNCTION','PROGRAM','MEMORY','DEVICE','WINDOW','BUTTON','NUMBER','STRING','OBJECT','SOURCE','EDITOR','SYNTAX','BRANCH','CLOUD','COOKIE','TABLE','SAFETY','CODING','UPLOAD','SCREEN','OUTPUT','INPUT'];
  const shift = (word,k) => [...word].map(ch=>String.fromCharCode(65+(ch.charCodeAt(0)-65+k+26)%26)).join('');
  const reverse = word => [...word].reverse().join('');
  function build(type) {
    const word=CS.pick(words);
    const k=CS.randomInt(1,9);
    let prompt='',hint='',cipher='',note='';
    if(type==='CR-1') {
      cipher=shift(word,k);
      prompt=`Исходное английское слово зашифровано шифром Цезаря. Каждая буква сдвинута на +${k}. Введите исходное слово.`;
      hint=`Чтобы расшифровать, сдвиньте каждую букву на ${k} позиций назад. Например, A превращалась бы в ${shift('A',k)}.`;
      note=`ШИФР ЦЕЗАРЯ · СДВИГ +${k}`;
    } else if(type==='CR-2') {
      cipher=shift(reverse(word),k);
      prompt=`Сначала исходное слово записали задом наперёд, затем сдвинули каждую букву на +${k}. Восстановите исходное слово.`;
      hint=`Обратный порядок операций: сначала сдвиг на ${k} букв назад, затем переверните полученную строку.`;
      note=`РЕВЕРС + ШИФР · СДВИГ +${k}`;
    } else {
      cipher=[...word].map(ch=>ch.charCodeAt(0)).join(' ');
      prompt='Каждая буква заменена её десятичным ASCII-кодом. Преобразуйте числа обратно в заглавные английские буквы.';
      hint='В таблице ASCII: A = 65, B = 66, C = 67, …, Z = 90. Найдите каждую букву отдельно.';
      note='ASCII · ДЕСЯТИЧНЫЕ КОДЫ';
    }
    return {id:type,category:'CR',title:'Расшифровка сообщения',subtitle:'Сектор 02 / перехват сигнала',prompt,kind:'cipher',cipher,note,ascii:type==='CR-3',answer:word,inputType:'word',maxLength:20,placeholder:'Исходное слово',hint,signature:`${type}|${word}|${type==='CR-3'?'ascii':k}`};
  }
  CS.gen.CR={templates:['CR-1','CR-2','CR-3'],available:mode=> mode==='pro'?['CR-1','CR-2','CR-3']:['CR-1','CR-2'],generate:build, shift, reverse, words};
})(window.CyberSafe);
