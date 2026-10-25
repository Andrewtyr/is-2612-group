/* Этап CR: русский шифр Цезаря, реверс + сдвиг, английский ASCII. */
(function (CS) {
  'use strict';
  const alphabet='АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
  const words=['КОД','ПАРОЛЬ','СЕРВЕР','СИСТЕМА','БРАУЗЕР','ПОРТАЛ','ДОСТУП','МАРШРУТ','КЛАВИАТУРА','МАССИВ','ОТЛАДКА','ШИФР','МОДУЛЬ','ХРАНИЛИЩЕ','БАЗА','ПАКЕТ','СИГНАЛ','КЛИЕНТ','РЕЗЕРВ','КОМПЬЮТЕР','ФУНКЦИЯ','ПРОГРАММА','ПАМЯТЬ','УСТРОЙСТВО','ОКНО','КНОПКА','ЧИСЛО','СТРОКА','ОБЪЕКТ','ИСТОЧНИК','РЕДАКТОР','СИНТАКСИС','ВЕТКА','ОБЛАКО','ТАБЛИЦА','ЗАЩИТА','ЗАГРУЗКА','ЭКРАН','ВЫВОД','ВВОД'];
  const asciiWords=['CODE','LOGIN','HOTEL','GUEST','SERVER','SYSTEM','SCRIPT','BROWSER','NETWORK','PORTAL','ACCESS','TOKEN','ROUTER','SECURE','KEYBOARD','ARRAY','DEBUG','CIPHER','MODULE','STORAGE','DATABASE','PACKET','SIGNAL','CLIENT','DIGITAL','BACKUP','PYTHON','COMPUTER','FUNCTION','PROGRAM','MEMORY','DEVICE','WINDOW','BUTTON','NUMBER','STRING','OBJECT','SOURCE','EDITOR','SYNTAX','BRANCH','CLOUD','COOKIE','TABLE','SAFETY','CODING','UPLOAD','SCREEN','OUTPUT','INPUT'];
  const shift = (word,k) => [...word].map(ch=>alphabet[(alphabet.indexOf(ch)+k%alphabet.length+alphabet.length)%alphabet.length]).join('');
  const reverse = word => [...word].reverse().join('');
  function build(type) {
    const word=CS.pick(type==='CR-3'?asciiWords:words);
    const k=CS.randomInt(1,9);
    let prompt='',hint='',cipher='',note='';
    if(type==='CR-1') {
      cipher=shift(word,k);
      prompt=`Русское слово зашифровано шифром Цезаря: каждую букву сдвинули на +${k} по алфавиту с Ё. Чтобы найти исходное слово, сдвигайте буквы на ${k} шагов НАЗАД.`;
      hint=`Первая буква: ${Array.from({length:k+1},(_,i)=>shift(cipher[0],-i)).join(' → ')}. Каждую следующую букву сдвиньте на ${k} шагов назад.`;
      note=`ШИФР ЦЕЗАРЯ · СДВИГ +${k}`;
    } else if(type==='CR-2') {
      cipher=shift(reverse(word),k);
      prompt=`Русское слово сначала записали задом наперёд, затем сдвинули каждую букву на +${k} по алфавиту с Ё. Сдвиньте буквы на ${k} шагов НАЗАД, потом переверните слово.`;
      hint=`Первая буква: ${Array.from({length:k+1},(_,i)=>shift(cipher[0],-i)).join(' → ')}. Так расшифруйте всё слово, затем прочитайте его справа налево.`;
      note=`РЕВЕРС + ШИФР · СДВИГ +${k}`;
    } else {
      cipher=[...word].map(ch=>ch.charCodeAt(0)).join(' ');
      prompt='Каждая буква заменена её десятичным ASCII-кодом. Преобразуйте числа обратно в заглавные английские буквы.';
      hint='В таблице ASCII: A = 65, B = 66, C = 67, …, Z = 90. Найдите каждую букву отдельно.';
      note='ASCII · ДЕСЯТИЧНЫЕ КОДЫ';
    }
    return {id:type,category:'CR',title:'Расшифровка сообщения',subtitle:'Сектор 02 / перехват сигнала',prompt,kind:'cipher',cipher,note,ascii:type==='CR-3',answer:word,inputType:type==='CR-3'?'word':'cyrillic',maxLength:20,placeholder:'Исходное слово',hint,signature:`${type}|${word}|${type==='CR-3'?'ascii':k}`};
  }
  CS.gen.CR={templates:['CR-1','CR-2','CR-3'],available:mode=> mode==='pro'?['CR-1','CR-2','CR-3']:['CR-1','CR-2'],generate:build, shift, reverse, words};
})(window.CyberSafe);
