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

test('circuit limits recalculate from a same-day circuit reset price', () => {
  const now = Date.parse('2026-03-04T05:00:00.000Z');
  const metrics = computeStockMetrics([
    { timestamp: '2026-03-03T04:00:00.000Z', price: 150, eventId: null },
    { timestamp: '2026-03-04T04:00:00.000Z', price: 150, eventId: null },
    { timestamp: '2026-03-04T04:30:00.000Z', price: 142.5, eventId: null },
    { timestamp: '2026-03-04T04:30:00.001Z', price: 142.5, eventId: 'circuit-reset-1772598600000' }
  ], { profile: { startingPrice: 150 }, sentiment: { sentimentScore: 80 } }, now);

  assert.equal(metrics.lowerCircuit, 135.38);
  assert.equal(metrics.upperCircuit, 171);
});

test('circuit limits recalculate again after a later same-day circuit reset', () => {
  const now = Date.parse('2026-03-04T05:00:00.000Z');
  const metrics = computeStockMetrics([
    { timestamp: '2026-03-03T04:00:00.000Z', price: 150, eventId: null },
    { timestamp: '2026-03-04T04:00:00.000Z', price: 150, eventId: null },
    { timestamp: '2026-03-04T04:30:00.001Z', price: 142.5, eventId: 'circuit-reset-1772598600000' },
    { timestamp: '2026-03-04T04:45:00.001Z', price: 135.38, eventId: 'circuit-reset-1772599500000' }
  ], { profile: { startingPrice: 150 }, sentiment: { sentimentScore: 80 } }, now);

  assert.equal(metrics.lowerCircuit, 128.61);
  assert.equal(metrics.upperCircuit, 162.46);
});

test('circuit resets from previous sessions do not change today’s circuit anchor', () => {
  const now = Date.parse('2026-03-04T05:00:00.000Z');
  const metrics = computeStockMetrics([
    { timestamp: '2026-03-03T04:30:00.001Z', price: 142.5, eventId: 'circuit-reset-1772512200000' },
    { timestamp: '2026-03-03T04:45:00.000Z', price: 150, eventId: null },
    { timestamp: '2026-03-04T04:00:00.000Z', price: 150, eventId: null }
  ], { profile: { startingPrice: 150 }, sentiment: { sentimentScore: 80 } }, now);

  assert.equal(metrics.lowerCircuit, 142.5);
  assert.equal(metrics.upperCircuit, 180);
});
