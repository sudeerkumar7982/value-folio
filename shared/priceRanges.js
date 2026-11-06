import { getMarketStatus, isMarketOpenAt } from './marketCalendar.js';

const FIFTY_TWO_WEEKS_MS = 52 * 7 * 24 * 60 * 60 * 1000;

export function getPriceRanges(priceTicks, nowMs = Date.now()) {
  const todayDate = getMarketStatus(nowMs).date;
  const fiftyTwoWeeksAgo = nowMs - FIFTY_TWO_WEEKS_MS;
  const todayPrices = [];
  const fiftyTwoWeekPrices = [];

  for (const tick of Array.isArray(priceTicks) ? priceTicks : []) {
    const timestamp = Date.parse(tick.timestamp);
    const price = Number(tick.price);
    if (!Number.isFinite(timestamp) || !Number.isFinite(price) || !isMarketOpenAt(timestamp)) continue;

    if (timestamp <= nowMs && getMarketStatus(timestamp).date === todayDate) todayPrices.push(price);
    if (timestamp >= fiftyTwoWeeksAgo && timestamp <= nowMs) fiftyTwoWeekPrices.push(price);
  }

  return {
    todayHigh: todayPrices.length > 0 ? Math.max(...todayPrices) : null,
    todayLow: todayPrices.length > 0 ? Math.min(...todayPrices) : null,
    fiftyTwoWeekHigh: fiftyTwoWeekPrices.length > 0 ? Math.max(...fiftyTwoWeekPrices) : null,
    fiftyTwoWeekLow: fiftyTwoWeekPrices.length > 0 ? Math.min(...fiftyTwoWeekPrices) : null
  };
}
