import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMarketMovePercent,
  calculateEventDriftPercent,
  ensureRichIntradayHistory,
  getSentimentCircuitPercentages,
  simulateCatchUpTicks
} from './marketSimulation.js';
import {
  getMarketSessionFor,
  getMarketStatus,
  getTradingSessionsBetween,
  isMarketOpenAt,
  isTradingDay
} from './marketCalendar.js';

test('market opens and closes at the specified IST times', () => {
  assert.equal(isMarketOpenAt(Date.parse('2026-03-04T03:44:59.999Z')), false);
  assert.equal(isMarketOpenAt(Date.parse('2026-03-04T03:45:00.000Z')), true);
  assert.equal(isMarketOpenAt(Date.parse('2026-03-04T10:00:00.000Z')), false);
});

test('real-life event impact drives rally strength and circuit bands remain unchanged', () => {
  const nowMs = Date.UTC(2026, 0, 1);
  const strongBullishEvent = [{
    impactPercent: 25,
    sentiment: 'POSITIVE',
    importance: 'CRITICAL',
    postedAt: new Date(nowMs).toISOString()
  }];
  const strongBearishEvent = [{
    impactPercent: -25,
    sentiment: 'NEGATIVE',
    importance: 'CRITICAL',
    postedAt: new Date(nowMs).toISOString()
  }];
  assert.ok(calculateEventDriftPercent(strongBullishEvent, nowMs, 30000) > 0);
  assert.ok(calculateEventDriftPercent(strongBearishEvent, nowMs, 30000) < 0);
  assert.equal(calculateEventDriftPercent([], nowMs, 30000), 0);
  assert.ok(calculateEventDriftPercent(strongBullishEvent, nowMs, 30000) >
    calculateEventDriftPercent([{ ...strongBullishEvent[0], impactPercent: 3 }], nowMs, 30000));
  assert.equal(calculateEventDriftPercent([{
    ...strongBullishEvent[0],
    postedAt: new Date(nowMs + 1).toISOString()
  }], nowMs, 30000), 0);

  const averageMove = (events) => {
    let total = 0;
    const sampleCount = 600;
    for (let index = 0; index < sampleCount; index++) {
      total += calculateMarketMovePercent(
        100,
        100,
        events,
        'TEST',
        nowMs + index * 30000,
        ((index * 37) % 199 + 0.5) / 200,
        30000
      );
    }
    return total / sampleCount;
  };
  assert.ok(averageMove(strongBullishEvent) > averageMove([]));
  assert.ok(averageMove([]) > averageMove(strongBearishEvent));

  assert.deepEqual(getSentimentCircuitPercentages(85), { upperCircuitPct: 20, lowerCircuitPct: 5 });
  assert.deepEqual(getSentimentCircuitPercentages(50), { upperCircuitPct: 10, lowerCircuitPct: 10 });
  assert.deepEqual(getSentimentCircuitPercentages(15), { upperCircuitPct: 5, lowerCircuitPct: 20 });
});

test('event impact drives price movement even when the sentiment label disagrees', () => {
  const nowMs = Date.UTC(2026, 0, 1);
  const movesForEvents = events => Array.from({ length: 600 }, (_, index) =>
    calculateMarketMovePercent(
      100,
      100,
      events,
      'TEST',
      Date.UTC(2026, 0, 1) + index * 30000,
      ((index * 37) % 199 + 0.5) / 200,
      30000
    )
  );

  const eventImpact = [{
    impactPercent: 25,
    sentiment: 'NEUTRAL',
    importance: 'CRITICAL',
    postedAt: new Date(nowMs).toISOString()
  }];
  const neutralImpact = [{
    impactPercent: 0,
    sentiment: 'NEUTRAL',
    importance: 'CRITICAL',
    postedAt: new Date(nowMs).toISOString()
  }];
  const averageMove = moves => moves.reduce((total, move) => total + move, 0) / moves.length;

  assert.ok(averageMove(movesForEvents(eventImpact)) > averageMove(movesForEvents(neutralImpact)));
  assert.ok(Math.max(...movesForEvents(neutralImpact).map(Math.abs)) < 0.5);
});

test('market is closed on weekends and NSE trading holidays', () => {
  assert.equal(isMarketOpenAt(Date.parse('2026-03-07T05:00:00.000Z')), false);
  assert.equal(isMarketOpenAt(Date.parse('2026-03-03T05:00:00.000Z')), false);
});

test('Diwali Muhurat trading overrides the Sunday holiday only for its special session', () => {
  const beforePreOpen = Date.parse('2026-11-08T08:34:59.999Z');
  const preOpen = Date.parse('2026-11-08T08:35:00.000Z');
  const beforeTrading = Date.parse('2026-11-08T08:49:59.999Z');
  const tradingOpen = Date.parse('2026-11-08T08:50:00.000Z');
  const beforeClose = Date.parse('2026-11-08T09:59:59.999Z');
  const tradingClose = Date.parse('2026-11-08T10:00:00.000Z');

  assert.equal(isTradingDay(tradingOpen), true);
  assert.equal(isMarketOpenAt(beforePreOpen), false);
  assert.equal(isMarketOpenAt(preOpen), false);
  assert.equal(isMarketOpenAt(beforeTrading), false);
  assert.equal(isMarketOpenAt(tradingOpen), true);
  assert.equal(isMarketOpenAt(beforeClose), true);
  assert.equal(isMarketOpenAt(tradingClose), false);

  const status = getMarketStatus(tradingOpen);
  assert.equal(status.specialSession, 'Diwali Muhurat Trading');
  assert.equal(status.preOpeningStartsAt, '2026-11-08T08:35:00.000Z');
  assert.equal(status.preOpeningEndsAt, '2026-11-08T08:50:00.000Z');
  assert.equal(status.opensAt, '2026-11-08T08:50:00.000Z');
  assert.equal(status.closingAuctionEndsAt, '2026-11-08T09:45:00.000Z');
  assert.equal(status.closesAt, '2026-11-08T10:00:00.000Z');

  const session = getMarketSessionFor(tradingOpen);
  assert.deepEqual(session, {
    marketOpen: tradingOpen,
    marketClose: tradingClose
  });
  const followingDay = getMarketStatus(Date.parse('2026-11-09T08:50:00.000Z'));
  assert.equal(followingDay.specialSession, undefined);
  assert.equal(followingDay.opensAt, '2026-11-09T03:45:00.000Z');

  const sessions = getTradingSessionsBetween(
    Date.parse('2026-11-08T08:30:00.000Z'),
    Date.parse('2026-11-08T10:15:00.000Z')
  );
  assert.deepEqual(sessions, [{ start: tradingOpen, end: tradingClose, offset: 0 }]);

  const stock = {
    profile: { symbol: 'TEST', currentPrice: 100, startingPrice: 100 },
    priceTicks: []
  };
  ensureRichIntradayHistory(stock, Date.parse('2026-11-08T09:00:00.000Z'));
  assert.equal(stock.priceTicks[0].timestamp, '2026-11-08T08:50:00.000Z');
  assert.ok(stock.priceTicks.every(tick => isMarketOpenAt(Date.parse(tick.timestamp))));
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
