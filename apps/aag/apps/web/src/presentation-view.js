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
