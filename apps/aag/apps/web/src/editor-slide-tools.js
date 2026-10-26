window.editorSlideTools = {
  duplicateSlide(slide) {
    const copy = structuredClone(slide);
    for (const element of copy.elements ?? []) element.id = crypto.randomUUID();
    return copy;
  },
  moveElement(elements, index, direction) {
    const next = [...elements];
    const target = index + (direction === 'forward' ? 1 : -1);
    if (target >= 0 && target < next.length) [next[index], next[target]] = [next[target], next[index]];
    return next;
  },
  createElement(type, assetId) {
    const id = crypto.randomUUID();
    if (type === 'text') return { id, type, x: 20, y: 40, w: 55, h: 18, text: 'Новая надпись', color: '#ffffff', fontSize: 32, bold: false, italic: false, align: 'left' };
    if (type === 'shape') return { id, type, shape: 'rectangle', x: 30, y: 55, w: 30, h: 18, color: '#bf9f62' };
    if (type === 'image') return { id, type, x: 20, y: 25, w: 60, h: 50, assetId };
    throw new Error('Неизвестный тип элемента.');
  },
  setSlideLayout(slide, type) {
    if (!['cover', 'content', 'closing'].includes(type) || !['cover', 'content', 'closing'].includes(slide.type)) throw new Error('Этот макет недоступен.');
    const copy = { ...slide, type };
    if (['content', 'closing'].includes(type)) copy.bullets = copy.bullets || [];
    else delete copy.bullets;
    return copy;
  },
};
