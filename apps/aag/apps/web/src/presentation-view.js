window.applySlideAppearance = (root, slide, aspectRatio = '16:9') => {
  root.style.aspectRatio = aspectRatio === '4:3' ? '4 / 3' : '16 / 9';
  root.style.backgroundColor = slide.background ?? '';
  root.style.backgroundImage = slide.background ? 'none' : '';
};

window.participantRenderKey = (data) => [
  data.slideIndex,
  data.question?.deadline,
  data.question?.closed,
  data.answered,
  data.question?.published,
  data.event.status,
].join(':');

window.showPointsOnSlide = (slide) => slide.showPoints ?? ['quiz', 'multi-quiz', 'text'].includes(slide.type);

window.projectorRenderKey = (data) => JSON.stringify([data.event.slideIndex, data.slide]);
window.projectorTypography = (slide) => {
  const length = (slide.title || '').length;
  const optionLength = (slide.options || slide.bullets || []).reduce((sum, text) => sum + text.length, 0);
  return { title: length > 130 ? 3 : length > 80 ? 3.6 : 4.4, options: optionLength > 900 ? 1.25 : optionLength > 450 ? 1.5 : optionLength > 180 ? 1.8 : 2.2 };
};
