import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLiveStore } from '../src/live-store.mjs';

test('a poll displays its running results on the current projector slide', () => {
  const directory = mkdtempSync(join(tmpdir(), 'aag-poll-'));
  const material = { title: 'Опрос', slides: [{ type: 'poll', title: 'Вопрос', options: ['Да', 'Нет'], timeSeconds: 30, showStatistics: true }] };
  const live = createLiveStore(join(directory, 'aag.sqlite'), material, () => 1_000, { bannedWordsPath: join(directory, 'words.txt') });
  try {
    const event = live.start(1);
    live.open(event.id, 1);
    const participant = live.join(event.code, 'Участник');
    live.respond(event.id, participant.participantToken, 0, 0);
    const display = live.getProjector(event.id, 1);
    assert.equal(display.question.closed, false);
    assert.deepEqual(display.statistics, { total: 1, counts: [1, 0] });
  } finally {
    live.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
