import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureRichIntradayHistory, simulateCatchUpTicks } from './marketSimulation.js';
import { isMarketOpenAt } from './marketCalendar.js';

test('market opens and closes at the specified IST times', () => {
  assert.equal(isMarketOpenAt(Date.parse('2026-03-04T03:44:59.999Z')), false);
  assert.equal(isMarketOpenAt(Date.parse('2026-03-04T03:45:00.000Z')), true);
  assert.equal(isMarketOpenAt(Date.parse('2026-03-04T10:00:00.000Z')), false);
});

test('market is closed on weekends and NSE trading holidays', () => {
  assert.equal(isMarketOpenAt(Date.parse('2026-03-07T05:00:00.000Z')), false);
  assert.equal(isMarketOpenAt(Date.parse('2026-03-03T05:00:00.000Z')), false);
});

test('intraday history is not generated before market open or on a holiday', () => {
  for (const timestamp of [
    Date.parse('2026-03-04T03:44:00.000Z'),
    Date.parse('2026-03-03T05:00:00.000Z')
  ]) {
    const stock = {
      profile: { symbol: 'TEST', currentPrice: 100, startingPrice: 100 },
      priceTicks: []
    };
    ensureRichIntradayHistory(stock, timestamp);
    assert.deepEqual(stock.priceTicks, []);
  }
});

test('intraday history and outage catch-up contain only open-session ticks', () => {
  const stock = {
    profile: { symbol: 'TEST', currentPrice: 100, startingPrice: 100 },
    priceTicks: []
  };
  ensureRichIntradayHistory(stock, Date.parse('2026-03-04T10:30:00.000Z'));
  assert.ok(stock.priceTicks.length > 0);
  assert.ok(stock.priceTicks.every(tick => isMarketOpenAt(Date.parse(tick.timestamp))));

  const resumedStock = {
    profile: { symbol: 'TEST', currentPrice: 100, startingPrice: 100 },
    priceTicks: [{ timestamp: '2026-03-06T09:59:00.000Z', price: 100, eventId: null }]
  };
  simulateCatchUpTicks(resumedStock, Date.parse('2026-03-09T05:00:00.000Z'));
  assert.ok(resumedStock.priceTicks.length > 1);
  assert.ok(resumedStock.priceTicks.every(tick => isMarketOpenAt(Date.parse(tick.timestamp))));
});
