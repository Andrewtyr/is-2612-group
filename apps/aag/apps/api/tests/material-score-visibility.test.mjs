import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMaterial } from '../src/material-store.mjs';

test('material keeps score visibility on a poll slide', () => {
  const material = validateMaterial({ title: 'Опрос', slides: [{ type: 'poll', title: 'Вопрос', options: ['Да', 'Нет'], showPoints: false }] });
  assert.equal(material.slides[0].showPoints, false);
});

test('one material accepts different question types', () => {
  const slides = [
    { type: 'quiz', title: 'Тест', options: ['А', 'Б'], correctIndex: 0 },
    { type: 'multi-quiz', title: 'Несколько', options: ['А', 'Б', 'В'], correctIndices: [0, 2] },
    { type: 'poll', title: 'Опрос', options: ['Да', 'Нет'] },
    { type: 'scale', title: 'Шкала', maxValue: 5 },
    { type: 'word-cloud', title: 'Облако' },
    { type: 'text', title: 'Текст' },
  ];
  const material = validateMaterial({ title: 'Разные вопросы', slides });
  assert.equal(material.slides.length, slides.length);
});
