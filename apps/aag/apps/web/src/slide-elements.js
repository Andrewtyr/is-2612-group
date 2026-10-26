window.renderSlideElements = function renderSlideElements(slide, { editable = false, selectedIndex = -1, onSelect = () => {}, onChange = () => {}, backgroundSrc, aspectRatio = '16:9' } = {}) {
  const surface = document.createElement('div'); surface.className = 'element-slide';
  surface.style.aspectRatio = aspectRatio === '4:3' ? '4 / 3' : '16 / 9';
  if (slide.background) surface.style.background = slide.background;
  if (slide.type === 'imported') {
    surface.classList.add('imported-element-slide');
    const background = document.createElement('img');
    background.className = 'imported-slide imported-background';
    background.alt = slide.title;
    if (backgroundSrc !== '') background.src = backgroundSrc ?? `/aag/api/imports/${slide.importId}/pages/${slide.page}`;
    surface.append(background);
  }
  (slide.elements ?? []).forEach((element, index) => {
    const object = document.createElement('div');
    object.className = `slide-object slide-object-${element.type}${editable && index === selectedIndex ? ' selected' : ''}`;
    const position = () => { for (const key of ['x', 'y']) object.style[key === 'x' ? 'left' : 'top'] = `${element[key]}%`; for (const key of ['w', 'h']) object.style[key === 'w' ? 'width' : 'height'] = `${element[key]}%`; };
    position();
    if (element.type === 'shape') { object.style.backgroundColor = element.color; if (element.shape === 'ellipse') object.style.borderRadius = '50%'; }
    else if (element.type === 'image') {
      const image = document.createElement('img'); image.alt = 'Изображение слайда'; image.dataset.assetId = element.assetId; image.src = `/aag/api/assets/${element.assetId}`; object.append(image);
    } else {
      object.textContent = element.text;
      object.style.color = element.color;
      object.style.fontSize = `${element.fontSize / 16}cqw`;
      object.style.fontWeight = element.bold ? '700' : '400';
      object.style.fontStyle = element.italic ? 'italic' : 'normal';
      object.style.textAlign = element.align;
    }
    if (editable) {
      object.tabIndex = 0;
      object.setAttribute('aria-label', `Элемент ${index + 1}: ${element.type === 'text' ? element.text : element.type === 'image' ? 'изображение' : 'фигура'}`);
      object.addEventListener('click', () => onSelect(index));
      const handle = document.createElement('span'); handle.className = 'resize-handle'; handle.setAttribute('aria-label', 'Изменить размер'); object.append(handle);
      object.addEventListener('pointerdown', (event) => {
        event.preventDefault(); onSelect(index);
        const resize = event.target === handle;
        const startX = event.clientX, startY = event.clientY;
        const start = { x: element.x, y: element.y, w: element.w, h: element.h };
        object.setPointerCapture(event.pointerId);
        const move = (next) => {
          const rect = surface.getBoundingClientRect();
          const dx = (next.clientX - startX) * 100 / rect.width;
          const dy = (next.clientY - startY) * 100 / rect.height;
          if (resize) {
            element.w = Math.max(5, Math.min(100 - element.x, Math.round(start.w + dx)));
            element.h = Math.max(5, Math.min(100 - element.y, Math.round(start.h + dy)));
          } else {
            element.x = Math.max(0, Math.min(100 - element.w, Math.round(start.x + dx)));
            element.y = Math.max(0, Math.min(100 - element.h, Math.round(start.y + dy)));
          }
          position();
        };
        const finish = () => { object.removeEventListener('pointermove', move); object.removeEventListener('pointerup', finish); object.removeEventListener('pointercancel', finish); onChange(); };
        object.addEventListener('pointermove', move);
        object.addEventListener('pointerup', finish);
        object.addEventListener('pointercancel', finish);
      });
    }
    surface.append(object);
  });
  return surface;
};
