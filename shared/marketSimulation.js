export function calculateMarketMovePercent(currentPrice, referencePrice, sentimentScore, symbol, nowMs = Date.now(), randomValue = Math.random()) {
  const current = Number(currentPrice) || 100;
  const reference = Number(referencePrice) || current;
  const score = Math.max(0, Math.min(100, Number(sentimentScore) || 50));
  const normalizedRandom = Math.max(0, Math.min(1, randomValue));
  const symbolPhase = Array.from(String(symbol || '')).reduce(
    (phase, character) => (phase + character.charCodeAt(0)) % 20,
    0
  );

  const cycleRadians = ((nowMs / 1000 + symbolPhase) / 20) * Math.PI * 2;
  const oscillation = Math.sin(cycleRadians) * 0.06;
  const deviationPercent = ((reference - current) / reference) * 100;
  const meanReversion = Math.max(-0.025, Math.min(0.025, deviationPercent * 0.01));
  const sentimentBias = (score - 50) * 0.0001;
  const jitter = (normalizedRandom - 0.5) * 0.008;

  return Number((oscillation + meanReversion + sentimentBias + jitter).toFixed(4));
}