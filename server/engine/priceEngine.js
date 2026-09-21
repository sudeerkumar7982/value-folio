/**
 * Price Engine & Market Metrics Calculator for Human Life Stocks
 */

export function calculateNewPrice(currentPrice, impactPercent) {
  const multiplier = 1 + (impactPercent / 100);
  const rawPrice = currentPrice * multiplier;
  // Keep stock price formatted to 2 decimal places, with a floor of ₹1.00
  return Math.max(Number(rawPrice.toFixed(2)), 1.00);
}

export function calculateSectorUpdates(currentSectors, primarySector, delta) {
  const updated = { ...currentSectors };
  
  if (primarySector && updated[primarySector] !== undefined) {
    const newScore = Math.min(Math.max(updated[primarySector] + delta, 0), 100);
    updated[primarySector] = newScore;
  }

  return updated;
}

export function computeStockMetrics(priceHistory) {
  if (!priceHistory || priceHistory.length === 0) {
    return {
      currentPrice: 100,
      startingPrice: 100,
      changeAmount: 0,
      changePercent: 0,
      highPrice: 100,
      lowPrice: 100,
      totalEvents: 0
    };
  }

  const prices = priceHistory.map(p => p.price);
  const currentPrice = prices[prices.length - 1];
  const startingPrice = prices[0];
  const previousPrice = prices.length > 1 ? prices[prices.length - 2] : startingPrice;

  const changeAmount = Number((currentPrice - previousPrice).toFixed(2));
  const changePercent = Number(((changeAmount / previousPrice) * 100).toFixed(2));

  const totalChangeAmount = Number((currentPrice - startingPrice).toFixed(2));
  const totalChangePercent = Number(((totalChangeAmount / startingPrice) * 100).toFixed(2));

  const highPrice = Math.max(...prices);
  const lowPrice = Math.min(...prices);

  return {
    currentPrice,
    startingPrice,
    previousPrice,
    changeAmount,
    changePercent,
    totalChangeAmount,
    totalChangePercent,
    highPrice,
    lowPrice,
    totalEvents: priceHistory.filter(h => h.eventId !== null).length
  };
}
