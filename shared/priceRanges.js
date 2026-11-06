import { getMarketStatus, isMarketOpenAt } from './marketCalendar.js';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function getPriceRanges(priceTicks, nowMs = Date.now()) {
  const todayDate = getMarketStatus(nowMs).date;
  const yearAgo = nowMs - ONE_YEAR_MS;
  const todayPrices = [];
  let fiftyTwoWeekHigh = null;
  let fiftyTwoWeekLow = null;
  let firstSessionDate = null;
  let firstSessionLastTick = -Infinity;

  for (const tick of Array.isArray(priceTicks) ? priceTicks : []) {
    const timestamp = Date.parse(tick.timestamp);
    const price = Number(tick.price);
    if (!Number.isFinite(timestamp) || !Number.isFinite(price) || !isMarketOpenAt(timestamp)) continue;

    if (timestamp <= nowMs && getMarketStatus(timestamp).date === todayDate) todayPrices.push(price);
    if (timestamp < yearAgo || timestamp > nowMs) continue;

    const sessionDate = getMarketStatus(timestamp).date;
    fiftyTwoWeekHigh = fiftyTwoWeekHigh === null ? price : Math.max(fiftyTwoWeekHigh, price);
    if (firstSessionDate === null || sessionDate < firstSessionDate) {
      firstSessionDate = sessionDate;
      firstSessionLastTick = timestamp;
      fiftyTwoWeekLow = price;
    } else if (sessionDate === firstSessionDate && timestamp > firstSessionLastTick) {
      firstSessionLastTick = timestamp;
      fiftyTwoWeekLow = price;
    }
  }

  return {
    todayHigh: todayPrices.length > 0 ? Math.max(...todayPrices) : null,
    todayLow: todayPrices.length > 0 ? Math.min(...todayPrices) : null,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow
  };
}
