/* CYBER SAFE — общие утилиты. Без зависимостей и интернета. */
(function (root) {
  'use strict';
  const CS = root.CyberSafe = root.CyberSafe || {};
  CS.randomInt = function (min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) throw new Error('Bad random range');
    const span = max - min + 1;
    if (root.crypto && typeof root.crypto.getRandomValues === 'function') {
      const range = 0x100000000;
      const limit = range - range % span;
      const bucket = new Uint32Array(1);
      do { root.crypto.getRandomValues(bucket); } while (bucket[0] >= limit);
      return min + bucket[0] % span;
    }
    // Резерв только для старых браузеров без Web Crypto.
    return min + Math.floor(Math.random() * span);
  };
  CS.pick = items => items[CS.randomInt(0, items.length - 1)];
  CS.shuffle = items => {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = CS.randomInt(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  CS.two = n => String(n).padStart(2, '0');
  CS.normalize = value => String(value).trim().toUpperCase();
  CS.gen = {};
  CS.VERSION = '3.0.0';
})(window);
