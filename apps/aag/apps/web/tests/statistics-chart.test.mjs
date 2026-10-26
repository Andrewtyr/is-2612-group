import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const context = { window: {} };
test('statistics chart computes bars and pie sectors without exposing answer keys', () => {
  vm.runInNewContext(readFileSync(resolve('src/statistics-chart.js'), 'utf8'), context);
  const chart = context.window.statisticsChartData(['Первый', 'Второй'], [3, 1]);
  assert.equal(chart.rows[0].percent, 75);
  assert.equal(chart.rows[1].percent, 25);
  assert.match(chart.gradient, /75%/);
  assert.equal(context.window.statisticsChartData(['А'], [0]).rows[0].percent, 0);
});
