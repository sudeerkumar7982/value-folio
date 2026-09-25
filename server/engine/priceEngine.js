/**
 * Price Engine & Market Metrics Calculator for Human Life Stocks
 */

export function getCircuitLimitsBySentiment(basePrice, sentimentData) {
  const base = Number(basePrice || 100);
  const score = sentimentData?.sentimentScore ?? 50;
  const sentiment = sentimentData?.sentiment ?? (
    score >= 80 ? 'VERY_BULLISH' :
    score >= 60 ? 'BULLISH' :
    score >= 40 ? 'NEUTRAL' :
    score >= 20 ? 'BEARISH' : 'VERY_BEARISH'
  );

  let upperCircuitPct = 10;
  let lowerCircuitPct = 10;

  if (sentiment === 'VERY_BULLISH' || score >= 80) {
    upperCircuitPct = 20; lowerCircuitPct = 5;
  } else if (sentiment === 'BULLISH' || score >= 60) {
    upperCircuitPct = 15; lowerCircuitPct = 8;
  } else if (sentiment === 'BEARISH' || (score >= 20 && score < 40)) {
    upperCircuitPct = 8; lowerCircuitPct = 15;
  } else if (sentiment === 'VERY_BEARISH' || score < 20) {
    upperCircuitPct = 5; lowerCircuitPct = 20;
  } else {
    upperCircuitPct = 10; lowerCircuitPct = 10;
  }

  const upperCircuit = Number((base * (1 + upperCircuitPct / 100)).toFixed(2));
  const lowerCircuit = Number((base * (1 - lowerCircuitPct / 100)).toFixed(2));

  return {
    upperCircuit,
    lowerCircuit,
    upperCircuitPct,
    lowerCircuitPct,
    sentiment,
    sentimentScore: score
  };
}

export function calculateNewPrice(currentPrice, impactPercent, lowerCircuit, upperCircuit) {
  const multiplier = 1 + (impactPercent / 100);
  const rawPrice = currentPrice * multiplier;
  let newP = Number(rawPrice.toFixed(2));
  if (lowerCircuit !== undefined && upperCircuit !== undefined) {
    newP = Math.min(Math.max(newP, lowerCircuit), upperCircuit);
  }
  return Math.max(newP, 1.00);
}

export function calculateSectorUpdates(currentSectors, primarySector, delta) {
  const updated = { ...currentSectors };
  
  if (primarySector && updated[primarySector] !== undefined) {
    const newScore = Math.min(Math.max(updated[primarySector] + delta, 0), 100);
    updated[primarySector] = newScore;
  }

  return updated;
}

export function computeStockMetrics(priceHistory, stock = null) {
  if (!priceHistory || priceHistory.length === 0) {
    const base = stock?.profile?.startingPrice || 100;
    const circuits = getCircuitLimitsBySentiment(base, stock?.sentiment);
    return {
      currentPrice: base,
      startingPrice: base,
      previousPrice: base,
      changeAmount: 0,
      changePercent: 0,
      totalChangeAmount: 0,
      totalChangePercent: 0,
      highPrice: base,
      lowPrice: base,
      totalEvents: 0,
      ...circuits
    };
  }

  const now = new Date();
  const startOfDayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const sorted = [...priceHistory].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const ticksBeforeToday = sorted.filter(t => new Date(t.timestamp).getTime() < startOfDayMs);

  let openingPrice;
  if (ticksBeforeToday.length > 0) {
    openingPrice = ticksBeforeToday[ticksBeforeToday.length - 1].price;
  } else if (stock?.profile?.startingPrice) {
    openingPrice = stock.profile.startingPrice;
  } else if (sorted.length > 0) {
    openingPrice = sorted[0].price;
  } else {
    openingPrice = 100;
  }

  const circuits = getCircuitLimitsBySentiment(openingPrice, stock?.sentiment);
  const rawPrices = sorted.map(p => p.price);
  const clampedPrices = rawPrices.map(p => Math.min(Math.max(p, circuits.lowerCircuit), circuits.upperCircuit));

  const currentPrice = clampedPrices[clampedPrices.length - 1];
  const startingPrice = openingPrice;
  const previousPrice = clampedPrices.length > 1 ? clampedPrices[clampedPrices.length - 2] : startingPrice;

  const changeAmount = Number((currentPrice - previousPrice).toFixed(2));
  const changePercent = previousPrice > 0 ? Number(((changeAmount / previousPrice) * 100).toFixed(2)) : 0;

  const totalChangeAmount = Number((currentPrice - startingPrice).toFixed(2));
  const totalChangePercent = startingPrice > 0 ? Number(((totalChangeAmount / startingPrice) * 100).toFixed(2)) : 0;

  return {
    currentPrice,
    startingPrice,
    previousPrice,
    changeAmount,
    changePercent,
    totalChangeAmount,
    totalChangePercent,
    highPrice: Math.max(...clampedPrices),
    lowPrice: Math.min(...clampedPrices),
    totalEvents: priceHistory.filter(h => h.eventId !== null).length,
    ...circuits
  };
}
