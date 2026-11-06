const TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PRE_OPEN_MINUTES = 9 * 60;
const MARKET_OPEN_MINUTES = 9 * 60 + 15;
const MARKET_CLOSE_MINUTES = 15 * 60 + 30;
const SPECIAL_SESSIONS = new Map([
  ['2026-11-08', {
    name: 'Diwali Muhurat Trading',
    preOpeningStartMinutes: 14 * 60 + 5,
    marketOpenMinutes: 14 * 60 + 20,
    closingAuctionEndMinutes: 15 * 60 + 15,
    marketCloseMinutes: 15 * 60 + 30
  }]
]);

const holidays = new Map([
  ['2026-01-15', 'Municipal Corporation Election - Maharashtra'],
  ['2026-01-26', 'Republic Day'],
  ['2026-02-15', 'Mahashivratri'],
  ['2026-03-03', 'Holi'],
  ['2026-03-21', 'Id-Ul-Fitr (Ramadan Eid)'],
  ['2026-03-26', 'Shri Ram Navami'],
  ['2026-03-31', 'Shri Mahavir Jayanti'],
  ['2026-04-03', 'Good Friday'],
  ['2026-04-14', 'Dr. Baba Saheb Ambedkar Jayanti'],
  ['2026-05-01', 'Maharashtra Day'],
  ['2026-05-28', 'Bakri Id'],
  ['2026-06-26', 'Muharram'],
  ['2026-08-15', 'Independence Day'],
  ['2026-09-14', 'Ganesh Chaturthi'],
  ['2026-10-02', 'Mahatma Gandhi Jayanti'],
  ['2026-10-20', 'Dussehra'],
  ['2026-11-08', 'Diwali Laxmi Pujan'],
  ['2026-11-10', 'Diwali-Balipratipada'],
  ['2026-11-24', 'Prakash Gurpurb Sri Guru Nanak Dev'],
  ['2026-12-25', 'Christmas']
]);

function getExchangeDate(timestampMs) {
  const date = new Date(timestampMs + IST_OFFSET_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
    dateKey: [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0')
    ].join('-'),
    minutes: date.getUTCHours() * 60 + date.getUTCMinutes(),
    seconds: date.getUTCSeconds(),
    milliseconds: date.getUTCMilliseconds()
  };
}

function getSessionBounds(dateParts) {
  const specialSession = SPECIAL_SESSIONS.get(dateParts.dateKey);
  const openMinutes = specialSession?.marketOpenMinutes ?? MARKET_OPEN_MINUTES;
  const closeMinutes = specialSession?.marketCloseMinutes ?? MARKET_CLOSE_MINUTES;
  const marketOpen = Date.UTC(
    dateParts.year,
    dateParts.month,
    dateParts.day,
    Math.floor(openMinutes / 60),
    openMinutes % 60
  ) - IST_OFFSET_MS;
  const marketClose = Date.UTC(
    dateParts.year,
    dateParts.month,
    dateParts.day,
    Math.floor(closeMinutes / 60),
    closeMinutes % 60
  ) - IST_OFFSET_MS;
  return { marketOpen, marketClose };
}

function getSessionTimes(dateParts) {
  const isTradingDay = SPECIAL_SESSIONS.has(dateParts.dateKey) ||
    (dateParts.weekday !== 0 && dateParts.weekday !== 6 && !holidays.has(dateParts.dateKey));
  if (!isTradingDay) return {};

  const specialSession = SPECIAL_SESSIONS.get(dateParts.dateKey);
  const preOpeningStartMinutes = specialSession?.preOpeningStartMinutes ?? PRE_OPEN_MINUTES;
  const marketOpenMinutes = specialSession?.marketOpenMinutes ?? MARKET_OPEN_MINUTES;

  const atMinutes = minutes => new Date(Date.UTC(
    dateParts.year,
    dateParts.month,
    dateParts.day,
    Math.floor(minutes / 60),
    minutes % 60
  ) - IST_OFFSET_MS).toISOString();

  const sessionTimes = {
    preOpeningStartsAt: atMinutes(preOpeningStartMinutes),
    preOpeningEndsAt: atMinutes(marketOpenMinutes)
  };
  if (!specialSession) return sessionTimes;

  return {
    ...sessionTimes,
    specialSession: specialSession.name,
    closingAuctionEndsAt: atMinutes(specialSession.closingAuctionEndMinutes)
  };
}

export function setTradingHolidays(records = []) {
  for (const record of records) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(record.date) && record.description) {
      holidays.set(record.date, record.description);
    }
  }
}

export function isTradingDay(timestampMs = Date.now()) {
  const { weekday, dateKey } = getExchangeDate(timestampMs);
  return SPECIAL_SESSIONS.has(dateKey) || (weekday !== 0 && weekday !== 6 && !holidays.has(dateKey));
}

export function isMarketOpenAt(timestampMs = Date.now()) {
  const exchangeDate = getExchangeDate(timestampMs);
  const specialSession = SPECIAL_SESSIONS.get(exchangeDate.dateKey);
  if (!specialSession && (exchangeDate.weekday === 0 || exchangeDate.weekday === 6 || holidays.has(exchangeDate.dateKey))) {
    return false;
  }
  const openMinutes = specialSession?.marketOpenMinutes ?? MARKET_OPEN_MINUTES;
  const closeMinutes = specialSession?.marketCloseMinutes ?? MARKET_CLOSE_MINUTES;
  return exchangeDate.minutes >= openMinutes && exchangeDate.minutes < closeMinutes;
}

export function getMarketStatus(timestampMs = Date.now()) {
  const exchangeDate = getExchangeDate(timestampMs);
  const { marketOpen, marketClose } = getSessionBounds(exchangeDate);
  const holiday = holidays.get(exchangeDate.dateKey) || null;
  const tradingDay = isTradingDay(timestampMs);
  const marketOpenNow = isMarketOpenAt(timestampMs);
  const sessionTimes = getSessionTimes(exchangeDate);
  const preOpeningStartsAt = sessionTimes.preOpeningStartsAt
    ? Date.parse(sessionTimes.preOpeningStartsAt)
    : null;
  const sessionPhase = !tradingDay
    ? 'closed'
    : marketOpenNow
      ? 'market-open'
      : preOpeningStartsAt !== null && timestampMs >= preOpeningStartsAt && timestampMs < marketOpen
        ? 'pre-opening'
        : 'closed';

  return {
    timezone: TIME_ZONE,
    marketOpen: marketOpenNow,
    tradingDay,
    sessionPhase,
    date: exchangeDate.dateKey,
    holiday,
    opensAt: new Date(marketOpen).toISOString(),
    closesAt: new Date(marketClose).toISOString(),
    ...sessionTimes
  };
}

export function getMarketSessionFor(timestampMs = Date.now()) {
  const exchangeDate = getExchangeDate(timestampMs);
  if (!SPECIAL_SESSIONS.has(exchangeDate.dateKey) &&
      (exchangeDate.weekday === 0 || exchangeDate.weekday === 6 || holidays.has(exchangeDate.dateKey))) {
    return null;
  }

  return getSessionBounds(exchangeDate);
}

export function getTradingSessionsBetween(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];

  const startDate = getExchangeDate(startMs);
  const endDate = getExchangeDate(endMs);
  let dateCursor = Date.UTC(startDate.year, startDate.month, startDate.day, 12);
  const lastDate = Date.UTC(endDate.year, endDate.month, endDate.day, 12);
  const sessions = [];
  let tradingDuration = 0;

  while (dateCursor <= lastDate) {
    const session = getMarketSessionFor(dateCursor);
    if (session) {
      const start = Math.max(startMs, session.marketOpen);
      const end = Math.min(endMs, session.marketClose);
      if (end > start) {
        sessions.push({ start, end, offset: tradingDuration });
        tradingDuration += end - start;
      }
    }
    dateCursor += DAY_MS;
  }

  return sessions;
}
