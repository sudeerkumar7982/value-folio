import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStockMetrics } from './priceEngine.js';

test('52-week high uses the in-window maximum and low uses the first plotted daily price', () => {
  const now = Date.parse('2026-03-04T05:00:00.000Z');
  const metrics = computeStockMetrics([
    { timestamp: '2025-03-03T04:00:00.000Z', price: 500, eventId: null },
    { timestamp: '2025-12-03T04:00:00.000Z', price: 90, eventId: null },
    { timestamp: '2025-12-03T04:15:00.000Z', price: 95, eventId: null },
    { timestamp: '2025-12-04T04:00:00.000Z', price: 70, eventId: null },
    { timestamp: '2026-03-02T04:00:00.000Z', price: 200, eventId: null },
    { timestamp: '2026-03-04T03:44:00.000Z', price: 900, eventId: null },
    { timestamp: '2026-03-04T04:00:00.000Z', price: 100, eventId: null },
    { timestamp: '2026-03-04T04:15:00.000Z', price: 110, eventId: null },
    { timestamp: '2026-03-04T05:01:00.000Z', price: 800, eventId: null }
  ], null, now);

  assert.equal(metrics.currentPrice, 110);
  assert.equal(metrics.todayHigh, 110);
  assert.equal(metrics.todayLow, 100);
  assert.equal(metrics.fiftyTwoWeekHigh, 200);
  assert.equal(metrics.fiftyTwoWeekLow, 95);
});
