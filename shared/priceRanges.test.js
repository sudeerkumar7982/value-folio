import test from 'node:test';
import assert from 'node:assert/strict';
import { getPriceRanges } from './priceRanges.js';

test('price ranges include only prices recorded during actual market sessions', () => {
  const now = Date.parse('2026-03-04T05:00:00.000Z');
  const ranges = getPriceRanges([
    { timestamp: '2025-03-03T04:00:00.000Z', price: 500 },
    { timestamp: '2025-12-03T04:00:00.000Z', price: 70 },
    { timestamp: '2026-03-02T04:00:00.000Z', price: 200 },
    { timestamp: '2026-03-04T03:44:00.000Z', price: 900 },
    { timestamp: '2026-03-04T04:00:00.000Z', price: 100 },
    { timestamp: '2026-03-04T04:15:00.000Z', price: 110 },
    { timestamp: '2026-03-04T10:00:00.000Z', price: 1 },
    { timestamp: '2026-03-04T05:01:00.000Z', price: 800 }
  ], now);

  assert.deepEqual(ranges, {
    todayHigh: 110,
    todayLow: 100,
    fiftyTwoWeekHigh: 200,
    fiftyTwoWeekLow: 70
  });
});

test('price ranges do not report current quote as today range on non-trading days', () => {
  const saturday = Date.parse('2026-03-07T05:00:00.000Z');

  assert.deepEqual(getPriceRanges([
    { timestamp: '2026-03-06T04:00:00.000Z', price: 120 }
  ], saturday), {
    todayHigh: null,
    todayLow: null,
    fiftyTwoWeekHigh: 120,
    fiftyTwoWeekLow: 120
  });
});

test('price ranges include Muhurat session prices but exclude its pre-opening ticks', () => {
  const now = Date.parse('2026-11-08T09:00:00.000Z');

  assert.deepEqual(getPriceRanges([
    { timestamp: '2026-11-08T08:40:00.000Z', price: 900 },
    { timestamp: '2026-11-08T08:50:00.000Z', price: 100 },
    { timestamp: '2026-11-08T09:00:00.000Z', price: 115 }
  ], now), {
    todayHigh: 115,
    todayLow: 100,
    fiftyTwoWeekHigh: 115,
    fiftyTwoWeekLow: 100
  });
});
