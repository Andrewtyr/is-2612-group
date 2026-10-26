window.layoutWordCloud = function layoutWordCloud(values) {
  return [...values]
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'ru'))
    .slice(0, 40)
    .map((item, index) => {
      const angle = -Math.PI / 2 + (index - 1) * 2.399963229728653;
      const radius = Math.min(42, 25 + 4 * Math.sqrt(index));
      return {
        text: item.text,
        count: item.count,
        fontSize: Math.min(64, Math.round(20 + 7 * Math.log2(Math.max(1, item.count)))),
        x: index === 0 ? 50 : Math.round(50 + Math.cos(angle) * radius),
        y: index === 0 ? 50 : Math.round(50 + Math.sin(angle) * radius * 0.82),
      };
    });
};

window.renderWordCloud = function renderWordCloud(values) {
  const cloud = document.createElement('div');
  cloud.className = 'cloud-map';
  cloud.setAttribute('aria-label', 'Облако ответов участников');
  for (const [index, item] of window.layoutWordCloud(values).entries()) {
    const word = document.createElement('span');
    word.className = `cloud-word${index === 0 ? ' cloud-word-center' : ''}`;
    word.textContent = item.text;
    word.title = `${item.text}: ${item.count}`;
    word.style.left = `${item.x}%`;
    word.style.top = `${item.y}%`;
    word.style.setProperty('--cloud-size', `${item.fontSize}px`);
    cloud.append(word);
  }
  if (values.length > 40) {
    const more = document.createElement('small');
    more.className = 'cloud-more';
    more.textContent = `Показаны 40 самых частых слов из ${values.length}`;
    cloud.append(more);
  }
  return cloud;
};
