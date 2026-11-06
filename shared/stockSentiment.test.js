import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStockSentiment } from './stockSentiment.js';

test('stocks without user-entered events remain neutral', () => {
  assert.equal(computeStockSentiment({
    profile: { startingPrice: 100, currentPrice: 130 },
    events: []
  }).sentimentScore, 50);
  assert.equal(computeStockSentiment(null).sentiment, 'NEUTRAL');
});

test('sentiment score follows the weighted impact of entered events', () => {
  const positive = computeStockSentiment({
    events: [{ impactPercent: 8, sentiment: 'POSITIVE', importance: 'HIGH' }]
  });
  const negative = computeStockSentiment({
    events: [{ impactPercent: -8, sentiment: 'NEGATIVE', importance: 'HIGH' }]
  });

  assert.equal(positive.sentiment, 'BULLISH');
  assert.equal(negative.sentiment, 'BEARISH');
  assert.ok(positive.sentimentScore > 50);
  assert.ok(negative.sentimentScore < 50);
});

test('importance weights stronger life events more heavily', () => {
  const sentiment = computeStockSentiment({
    events: [
      { impactPercent: 8, sentiment: 'POSITIVE', importance: 'CRITICAL' },
      { impactPercent: -8, sentiment: 'NEGATIVE', importance: 'LOW' }
    ]
  });

  assert.ok(sentiment.sentimentScore > 50);
});

test('neutral entries do not create an artificial bullish sentiment', () => {
  const sentiment = computeStockSentiment({
    events: [{ impactPercent: 0, sentiment: 'NEUTRAL', importance: 'LOW' }]
  });

  assert.equal(sentiment.sentimentScore, 50);
  assert.equal(sentiment.sentiment, 'NEUTRAL');
});
