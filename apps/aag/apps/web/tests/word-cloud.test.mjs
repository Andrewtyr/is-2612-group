import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('frequent words grow and the most frequent word occupies the center', async () => {
  const source = await readFile(new URL('../src/word-cloud.js', import.meta.url), 'utf8');
  const context = { window: {} };
  runInNewContext(source, context);
  const result = context.window.layoutWordCloud([
    { text: 'сервис', count: 1 },
    { text: 'забота', count: 8 },
    { text: 'уют', count: 3 },
  ]);
  assert.equal(result[0].text, 'забота');
  assert.equal(result[0].x, 50);
  assert.equal(result[0].y, 50);
  assert.ok(result[0].fontSize > result[1].fontSize);
  assert.ok(result[1].fontSize > result[2].fontSize);
  assert.ok(result[1].x !== 50 || result[1].y !== 50);
});
