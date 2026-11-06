import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStockMetrics } from './priceEngine.js';

test('52-week price range uses the highest and lowest recorded prices within the trailing 52 weeks', () => {
  const now = Date.now();
  const metrics = computeStockMetrics([
    { timestamp: new Date(now - 53 * 7 * 24 * 60 * 60 * 1000).toISOString(), price: 500, eventId: null },
    { timestamp: new Date(now - 52 * 7 * 24 * 60 * 60 * 1000 + 60 * 1000).toISOString(), price: 80, eventId: null },
    { timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(), price: 175, eventId: null },
    { timestamp: new Date(now - 1000).toISOString(), price: 125, eventId: null },
    { timestamp: new Date(now + 60 * 60 * 1000).toISOString(), price: 900, eventId: null }
  ]);

  assert.equal(metrics.currentPrice, 900);
  assert.equal(metrics.fiftyTwoWeekHigh, 175);
  assert.equal(metrics.fiftyTwoWeekLow, 80);
});
