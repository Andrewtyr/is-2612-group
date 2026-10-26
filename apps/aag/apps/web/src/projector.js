const $ = (id) => document.getElementById(id);
const eventId = Number(new URLSearchParams(location.search).get('event'));
const requestedMode = new URLSearchParams(location.search).get('mode') === 'fullscreen' ? 'fullscreen' : 'window';
let fullscreenMessage = '';
const make = (tag, value, className) => { const element = document.createElement(tag); element.textContent = value; if (className) element.className = className; return element; };
const fullscreenButton = $('fullscreen-button');
const updateFullscreen = () => { fullscreenButton.textContent = document.fullscreenElement ? 'Выйти из полного экрана' : 'На весь экран'; $('fullscreen-hint').hidden = requestedMode !== 'fullscreen' || !!document.fullscreenElement; };
fullscreenButton.addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); fullscreenMessage = ''; $('message').textContent = ''; }
  catch { fullscreenMessage = 'Браузер не разрешил полный экран. Показ продолжается в окне.'; $('message').textContent = fullscreenMessage; }
  updateFullscreen();
});
document.addEventListener('fullscreenchange', updateFullscreen);
updateFullscreen();
function renderStatistics(slide, statistics) {
  const panel = document.createElement('aside'); panel.className = 'projector-statistics';
  panel.append(make('h2', 'Результаты ответов'), make('p', `Ответили: ${statistics.total}`));
  if (!statistics.counts.length) return panel;
  const labels = slide.options ?? statistics.counts.map((_, index) => String(index + 1));
  const chart = window.statisticsChartData(labels, statistics.counts);
  if (slide.statisticsChart === 'pie') {
    const pie = document.createElement('div'); pie.className = 'statistics-pie'; pie.style.background = chart.gradient;
    pie.setAttribute('role', 'img'); pie.setAttribute('aria-label', chart.rows.map((row) => `${row.label}: ${row.count}`).join(', '));
    panel.append(pie);
  }
  chart.rows.forEach((entry) => {
    const row = document.createElement('div'); row.className = 'statistics-row';
    row.append(make('span', entry.label), make('strong', String(entry.count)));
    if (slide.statisticsChart !== 'pie') {
      const track = document.createElement('div'); track.className = 'statistics-track';
      const fill = document.createElement('span'); fill.style.width = `${entry.percent}%`; fill.style.background = entry.color; track.append(fill); row.append(track);
    }
    panel.append(row);
  });
  return panel;
}
async function refresh() {
  if (!eventId) return $('message').textContent = 'Откройте экран аудитории из пульта ведущего.';
  try {
    const response = await fetch(`/aag/api/live/${eventId}/projector`, { credentials: 'same-origin' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    const box = $('slide');
    window.applySlideAppearance(box, data.slide, data.aspectRatio);
    if (data.slide.type === 'imported') box.replaceChildren(window.renderSlideElements(data.slide, { aspectRatio: data.aspectRatio }));
    else if (data.slide.elements) box.replaceChildren(window.renderSlideElements(data.slide, { aspectRatio: data.aspectRatio }));
    else {
      box.replaceChildren(make('small', data.slide.eyebrow || 'ЗАНЯТИЕ ИЛИ МЕРОПРИЯТИЕ'), make('h1', data.slide.title));
      if (data.slide.body) box.append(make('p', data.slide.body));
      const values = data.slide.options ?? data.slide.bullets;
      if (values) { const list = document.createElement(data.slide.options ? 'ol' : 'ul'); values.forEach((value) => list.append(make('li', value))); box.append(list); }
    }
    if (data.statistics) box.append(renderStatistics(data.slide, data.statistics));
    if (data.wordCloud.length) box.append(window.renderWordCloud(data.wordCloud));
    if (data.leaderboard?.length) { const rank = document.createElement('div'); rank.className = 'cloud'; rank.append(make('h2', 'Рейтинг')); data.leaderboard.forEach((person) => rank.append(make('span', `${person.place}. ${person.name} — ${person.points}`))); box.append(rank); }
    $('progress').textContent = `${data.event.slideIndex + 1} / ${data.slideCount}`;
    $('code').textContent = data.event.code;
    $('count').textContent = `${data.participantCount} участников`;
    $('qr').src ||= `/aag/api/live/${eventId}/qr`;
    if (data.question && !data.question.closed) box.append(make('div', `${data.event.status === 'paused' ? 'Пауза' : 'Приём ответов открыт'} · ${Math.max(0, Math.ceil((data.question.deadline - (data.event.pausedAt ?? Date.now())) / 1000))} сек. · Ответили: ${data.answerCount} из ${data.participantCount}`, 'question-state'));
    if (data.event.status === 'ended') box.append(make('div', 'Сессия завершена', 'question-state'));
    $('message').textContent = fullscreenMessage;
  } catch (issue) { $('message').textContent = issue.message ?? 'Нет связи с сервером.'; }
}
refresh(); setInterval(() => { if (!document.hidden) refresh(); }, 1500);
