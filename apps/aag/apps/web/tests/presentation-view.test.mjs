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
