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

/**
 * Simulates elapsed continuous market ticks when the user closes the site or the server sleeps.
 * Fills in the time gap seamlessly from last recorded tick to targetNowMs.
 */
export function simulateCatchUpTicks(stock, targetNowMs = Date.now(), maxTicksToGenerate = 150) {
  if (!stock || !stock.profile) return stock;

  if (!Array.isArray(stock.priceTicks) || stock.priceTicks.length === 0) {
    const startP = Number(stock.profile.startingPrice || 100);
    stock.priceTicks = [{
      timestamp: new Date(targetNowMs).toISOString(),
      price: startP,
      eventId: null,
      label: `${stock.profile.symbol || 'STOCK'} Listing Price`
    }];
    stock.profile.currentPrice = startP;
    return stock;
  }

  const lastTick = stock.priceTicks[stock.priceTicks.length - 1];
  const lastTimeMs = new Date(lastTick.timestamp).getTime();
  if (isNaN(lastTimeMs) || targetNowMs <= lastTimeMs) {
    return stock;
  }

  const elapsedMs = targetNowMs - lastTimeMs;
  // If less than 2 seconds, no catch-up needed
  if (elapsedMs < 2000) {
    return stock;
  }

  // Calculate dynamic step based on elapsed time to keep simulation snappy and realistic
  let stepMs = 5000;
  if (elapsedMs > 7 * 24 * 3600 * 1000) {
    stepMs = Math.max(3600 * 1000, Math.floor(elapsedMs / maxTicksToGenerate));
  } else if (elapsedMs > 24 * 3600 * 1000) {
    stepMs = 30 * 60 * 1000; // 30 min
  } else if (elapsedMs > 6 * 3600 * 1000) {
    stepMs = 15 * 60 * 1000; // 15 min
  } else if (elapsedMs > 3600 * 1000) {
    stepMs = 5 * 60 * 1000; // 5 min
  } else if (elapsedMs > 10 * 60 * 1000) {
    stepMs = 60 * 1000; // 1 min
  } else if (elapsedMs > 2 * 60 * 1000) {
    stepMs = 15 * 1000; // 15 sec
  }

  const currentPrice = Number(stock.profile.currentPrice || lastTick.price || 100);
  const startingPrice = Number(stock.profile.startingPrice || 100);
  const symbol = stock.profile.symbol || 'STOCK';

  // Compute sentiment score
  let sentimentScore = 50;
  if (stock.events && stock.events.length > 0) {
    let posCount = 0;
    stock.events.forEach(e => {
      if (e.sentiment === 'POSITIVE' || (e.impactPercent && e.impactPercent > 0)) posCount++;
    });
    const positiveRatio = (posCount / stock.events.length) * 100;
    const priceChangePercent = ((currentPrice - startingPrice) / startingPrice) * 100;
    sentimentScore = Math.min(Math.max(Math.round(50 + (positiveRatio - 50) * 0.4 + Math.min(Math.max(priceChangePercent * 1.2, -25), 25)), 5), 98);
  } else {
    const priceChange = ((currentPrice - startingPrice) / startingPrice) * 100;
    sentimentScore = Math.min(Math.max(Math.round(65 + priceChange * 1.5), 10), 95);
  }

  // Circuit limits
  let upperCircuitPct = 10;
  let lowerCircuitPct = 10;
  if (sentimentScore >= 80) { upperCircuitPct = 20; lowerCircuitPct = 5; }
  else if (sentimentScore >= 60) { upperCircuitPct = 15; lowerCircuitPct = 8; }
  else if (sentimentScore >= 40) { upperCircuitPct = 10; lowerCircuitPct = 10; }
  else if (sentimentScore >= 20) { upperCircuitPct = 8; lowerCircuitPct = 15; }
  else { upperCircuitPct = 5; lowerCircuitPct = 20; }

  const lastEventTick = [...stock.priceTicks].reverse().find(t => t.eventId !== null);
  const circuitAnchorPrice = lastEventTick ? lastEventTick.price : startingPrice;
  const upperCircuit = Number((circuitAnchorPrice * (1 + upperCircuitPct / 100)).toFixed(2));
  const lowerCircuit = Number((circuitAnchorPrice * (1 - lowerCircuitPct / 100)).toFixed(2));

  let simPrice = currentPrice;
  let currentTimeMs = lastTimeMs + stepMs;
  let ticksGenerated = 0;

  const symbolPhase = Array.from(String(symbol || '')).reduce(
    (phase, character) => (phase + character.charCodeAt(0)) % 20,
    0
  );

  while (currentTimeMs <= targetNowMs && ticksGenerated < maxTicksToGenerate) {
    const pseudoRand = Math.abs(Math.sin(currentTimeMs * 0.0017 + symbolPhase * 31.7));
    const noise = calculateMarketMovePercent(simPrice, circuitAnchorPrice, sentimentScore, symbol, currentTimeMs, pseudoRand);
    const rawPrice = simPrice * (1 + noise / 100);
    simPrice = Number(Math.min(Math.max(rawPrice, lowerCircuit), upperCircuit).toFixed(2));
    if (simPrice < 1.0) simPrice = 1.0;

    let tickLabel = noise > 0.01 ? '🔥 Bullish Sentiment Buying' : noise < -0.01 ? '🔻 Bearish Market Selling' : '⚖️ Neutral Fluctuation';
    if (simPrice >= upperCircuit) {
      tickLabel = `🔒 Upper Circuit Limit Hit (+${upperCircuitPct}%)`;
    } else if (simPrice <= lowerCircuit) {
      tickLabel = `🔒 Lower Circuit Limit Hit (-${lowerCircuitPct}%)`;
    }

    const isoStr = new Date(currentTimeMs).toISOString();
    const currentMin = isoStr.slice(0, 16);
    const prevTick = stock.priceTicks[stock.priceTicks.length - 1];

    if (prevTick && !prevTick.eventId && prevTick.timestamp && prevTick.timestamp.startsWith(currentMin)) {
      prevTick.price = simPrice;
      prevTick.timestamp = isoStr;
      prevTick.label = tickLabel;
    } else {
      stock.priceTicks.push({
        timestamp: isoStr,
        price: simPrice,
        eventId: null,
        label: tickLabel
      });
    }

    currentTimeMs += stepMs;
    ticksGenerated++;
  }

  stock.profile.currentPrice = simPrice;
  return stock;
}