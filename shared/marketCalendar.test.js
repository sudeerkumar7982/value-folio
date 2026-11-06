import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMarketMovePercent,
  calculateSentimentDriftPercent,
  ensureRichIntradayHistory,
  getSentimentCircuitPercentages,
  simulateCatchUpTicks
} from './marketSimulation.js';
import { getTradingSessionsBetween, isMarketOpenAt } from './marketCalendar.js';

test('market opens and closes at the specified IST times', () => {
  assert.equal(isMarketOpenAt(Date.parse('2026-03-04T03:44:59.999Z')), false);
  assert.equal(isMarketOpenAt(Date.parse('2026-03-04T03:45:00.000Z')), true);
  assert.equal(isMarketOpenAt(Date.parse('2026-03-04T10:00:00.000Z')), false);
});

test('sentiment creates directional drift and adjusts circuit bands', () => {
  assert.ok(calculateSentimentDriftPercent(80, 30000) > 0);
  assert.equal(calculateSentimentDriftPercent(50, 30000), 0);
  assert.ok(calculateSentimentDriftPercent(20, 30000) < 0);

  const averageMove = (score) => {
    let total = 0;
    const sampleCount = 600;
    for (let index = 0; index < sampleCount; index++) {
      total += calculateMarketMovePercent(
        100,
        100,
        score,
        'TEST',
        Date.UTC(2026, 0, 1) + index * 30000,
        ((index * 37) % 199 + 0.5) / 200,
        30000
      );
    }
    return total / sampleCount;
  };
  assert.ok(averageMove(80) > averageMove(50));
  assert.ok(averageMove(50) > averageMove(20));

  assert.deepEqual(getSentimentCircuitPercentages(85), { upperCircuitPct: 20, lowerCircuitPct: 5 });
  assert.deepEqual(getSentimentCircuitPercentages(50), { upperCircuitPct: 10, lowerCircuitPct: 10 });
  assert.deepEqual(getSentimentCircuitPercentages(15), { upperCircuitPct: 5, lowerCircuitPct: 20 });
});

test('neutral sentiment does not produce outsized simulated price swings', () => {
  const moves = Array.from({ length: 600 }, (_, index) =>
    calculateMarketMovePercent(
      100,
      100,
      50,
      'TEST',
      Date.UTC(2026, 0, 1) + index * 30000,
      ((index * 37) % 199 + 0.5) / 200,
      30000
    )
  );

  assert.ok(Math.max(...moves.map(Math.abs)) < 0.5);
});

test('market is closed on weekends and NSE trading holidays', () => {
  assert.equal(isMarketOpenAt(Date.parse('2026-03-07T05:00:00.000Z')), false);
  assert.equal(isMarketOpenAt(Date.parse('2026-03-03T05:00:00.000Z')), false);
});

test('historical chart sessions exclude non-trading hours and compress overnight gaps', () => {
  const sessions = getTradingSessionsBetween(
    Date.parse('2026-03-06T03:00:00.000Z'),
    Date.parse('2026-03-09T12:00:00.000Z')
  );

  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions.map(session => session.end - session.start), [
    6.25 * 60 * 60 * 1000,
    6.25 * 60 * 60 * 1000
  ]);
  assert.equal(sessions[0].offset, 0);
  assert.equal(sessions[1].offset, sessions[0].end - sessions[0].start);
  assert.ok(sessions.every(session =>
    isMarketOpenAt(session.start) &&
    !isMarketOpenAt(session.end)
  ));
});

test('historical chart can start at listing time and skips pre-listing hours', () => {
  const listingDuringSession = Date.parse('2026-03-04T08:00:00.000Z');
  const duringSession = getTradingSessionsBetween(
    listingDuringSession,
    Date.parse('2026-03-05T10:00:00.000Z')
  );
  assert.equal(duringSession[0].start, listingDuringSession);
  assert.equal(duringSession[0].offset, 0);

  const listingAfterClose = Date.parse('2026-03-04T11:00:00.000Z');
  const afterClose = getTradingSessionsBetween(
    listingAfterClose,
    Date.parse('2026-03-05T10:00:00.000Z')
  );
  assert.equal(afterClose[0].start, Date.parse('2026-03-05T03:45:00.000Z'));
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
