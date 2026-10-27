import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const load = (name) => {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(resolve('src', name), 'utf8'), context);
  return context.window;
};

test('legacy slide keeps its background and presentation ratio', () => {
  const root = { style: {} };
  load('presentation-view.js').applySlideAppearance(root, { background: '#abcdef' }, '4:3');
  assert.equal(root.style.backgroundColor, '#abcdef');
  assert.equal(root.style.backgroundImage, 'none');
  assert.equal(root.style.aspectRatio, '4 / 3');
  load('presentation-view.js').applySlideAppearance(root, { type: 'quiz' }, '16:9');
  assert.equal(root.style.backgroundColor, '');
  assert.equal(root.style.backgroundImage, '');
  assert.equal(root.style.aspectRatio, '16 / 9');
});

test('interactive template is shown behind the question and removed on the next slide', () => {
  const view = load('presentation-view.js');
  const root = { style: {} };
  const template = { importId: '123e4567-e89b-42d3-a456-426614174000', page: 2 };
  view.applySlideAppearance(root, { type: 'poll', template }, '16:9');
  assert.match(root.style.backgroundImage, /123e4567-e89b-42d3-a456-426614174000\/pages\/2/);
  assert.match(root.style.backgroundImage, /linear-gradient/);
  assert.equal(root.style.backgroundSize, 'cover');
  view.applySlideAppearance(root, { type: 'poll' }, '16:9');
  assert.equal(root.style.backgroundImage, '');
  assert.equal(root.style.backgroundSize, '');
});

test('participant view changes when the host closes a question', () => {
  const view = load('presentation-view.js');
  const data = { slideIndex: 1, question: { deadline: 1234, closed: false }, answered: false, event: { status: 'active' } };
  assert.notEqual(view.participantRenderKey(data), view.participantRenderKey({ ...data, question: { ...data.question, closed: true } }));
});

test('score visibility defaults to off for polls and can be set per slide', () => {
  const view = load('presentation-view.js');
  assert.equal(view.showPointsOnSlide({ type: 'poll' }), false);
  assert.equal(view.showPointsOnSlide({ type: 'quiz' }), true);
  assert.equal(view.showPointsOnSlide({ type: 'quiz', showPoints: false }), false);
  assert.equal(view.showPointsOnSlide({ type: 'poll', showPoints: true }), true);
});

test('projector keeps the same video slide while live counters update', () => {
  const view = load('presentation-view.js');
  const data = { event: { slideIndex: 2 }, slide: { type: 'content', title: 'Видео', elements: [{ type: 'video', assetId: 'asset' }] }, answerCount: 1 };
  assert.equal(view.projectorRenderKey(data), view.projectorRenderKey({ ...data, answerCount: 3 }));
  assert.notEqual(view.projectorRenderKey(data), view.projectorRenderKey({ ...data, event: { slideIndex: 3 } }));
  assert.ok(view.projectorTypography({ title: 'Вопрос'.repeat(30), options: Array(6).fill('Длинный вариант '.repeat(15)) }).options < view.projectorTypography({ title: 'Вопрос', options: ['Да', 'Нет'] }).options);
});
