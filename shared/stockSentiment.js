const IMPORTANCE_WEIGHTS = {
  LOW: 0.7,
  MEDIUM: 1,
  HIGH: 1.6,
  CRITICAL: 2.2
};

function getSentimentLabel(score) {
  if (score >= 80) return { sentiment: 'VERY_BULLISH', sentimentLabel: 'Very Bullish 🔥' };
  if (score >= 60) return { sentiment: 'BULLISH', sentimentLabel: 'Bullish 📈' };
  if (score >= 40) return { sentiment: 'NEUTRAL', sentimentLabel: 'Neutral ⚖️' };
  if (score >= 20) return { sentiment: 'BEARISH', sentimentLabel: 'Bearish 📉' };
  return { sentiment: 'VERY_BEARISH', sentimentLabel: 'Very Bearish 🔻' };
}

export function computeStockSentiment(stock) {
  const events = Array.isArray(stock?.events) ? stock.events : [];
  if (events.length === 0) {
    return {
      sentiment: 'NEUTRAL',
      sentimentScore: 50,
      sentimentLabel: 'Neutral ⚖️',
      positiveRatio: 50,
      totalEvents: 0
    };
  }

  let weightedImpact = 0;
  let totalWeight = 0;
  let positiveWeight = 0;

  for (const event of events) {
    const rawImpact = event.impactPercent;
    const hasImpact = rawImpact !== null && rawImpact !== '' && Number.isFinite(Number(rawImpact));
    const impact = hasImpact
      ? Number(rawImpact)
      : event.sentiment === 'POSITIVE' ? 5
        : event.sentiment === 'NEGATIVE' ? -5
          : 0;
    const weight = IMPORTANCE_WEIGHTS[event.importance] || IMPORTANCE_WEIGHTS.MEDIUM;
    const boundedImpact = Math.min(Math.max(impact, -25), 35);

    weightedImpact += boundedImpact * weight;
    totalWeight += weight;
    if (hasImpact ? impact > 0 : event.sentiment === 'POSITIVE') positiveWeight += weight;
  }

  const averageImpact = totalWeight > 0 ? weightedImpact / totalWeight : 0;
  const sentimentScore = Math.min(Math.max(Math.round(50 + averageImpact * 2.5), 0), 100);
  const { sentiment, sentimentLabel } = getSentimentLabel(sentimentScore);

  return {
    sentiment,
    sentimentScore,
    sentimentLabel,
    positiveRatio: totalWeight > 0 ? Math.round((positiveWeight / totalWeight) * 100) : 50,
    totalEvents: events.length
  };
}
