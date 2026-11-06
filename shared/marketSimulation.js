import { getMarketSessionFor, isMarketOpenAt } from './marketCalendar.js';
import { computeStockSentiment } from './stockSentiment.js';

/**
 * Realistic Market Simulation Engine — Geometric Brownian Motion (GBM)
 * Models price movement exactly as real stock exchanges do:
 *   dS = S × (μ·dt + σ·√dt·Z)
 * Calibrated for Groww/Zerodha-style intraday charts with 30-second ticks.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Unbiased pseudo-random hash [0, 1) — uses fractional part of large product.
// Mean ≈ 0.5 (unlike Math.abs(Math.sin()) which averages 0.637 → biased up).
// ─────────────────────────────────────────────────────────────────────────────
function pseudoHash(seed) {
  const x = Math.sin(seed * 9301.0 + 49297.0) * 233280.0;
  return x - Math.floor(x); // uniform [0, 1)
}

// Box-Muller transform: converts two uniform [0,1] values → standard normal Z
function boxMuller(u1, u2) {
  const r = Math.sqrt(-2.0 * Math.log(Math.max(u1, 1e-10)));
  const theta = 2.0 * Math.PI * u2;
  return r * Math.cos(theta); // N(0,1)
}

export function getSentimentCircuitPercentages(sentimentScore) {
  const score = Math.max(0, Math.min(100, Number(sentimentScore) || 0));
  if (score >= 80) return { upperCircuitPct: 20, lowerCircuitPct: 5 };
  if (score >= 60) return { upperCircuitPct: 15, lowerCircuitPct: 8 };
  if (score >= 40) return { upperCircuitPct: 10, lowerCircuitPct: 10 };
  if (score >= 20) return { upperCircuitPct: 8, lowerCircuitPct: 15 };
  return { upperCircuitPct: 5, lowerCircuitPct: 20 };
}

export function calculateSentimentDriftPercent(sentimentScore, intervalMs = 1000) {
  const score = Math.max(0, Math.min(100, Number(sentimentScore) || 0));
  const intervalScale = Math.max(0, intervalMs) / 30000;
  return (score - 50) * 0.0003 * intervalScale;
}

/**
 * Calculates the % price move for a single tick using GBM.
 *
 * Calibration (30-second tick interval):
 *   Positive life-event sentiment adds upward drift; negative sentiment adds
 *   downward drift. Random noise keeps the intraday movement organic.
 */
export function calculateMarketMovePercent(
  currentPrice,
  referencePrice,     // today's opening price — mean-reversion anchor
  sentimentScore,
  symbol,
  nowMs = Date.now(),
  randomValue = Math.random(),
  intervalMs = 1000
) {
  const current   = Number(currentPrice)  || 100;
  const reference = Number(referencePrice) || current;
  const score     = Math.max(0, Math.min(100, Number(sentimentScore) || 50));

  // ── GBM core ──────────────────────────────────────────────────────────────
  // σ per 30-second tick calibrated to ~2.2% daily volatility.
  // We approximate N(0,1) from the single uniform randomValue using a simple
  // approximation (close enough for simulation purposes).
  const u1 = Math.max(0.001, Math.min(0.999, randomValue));
  const u2 = Math.max(0.001, Math.min(0.999, pseudoHash(nowMs * 0.001 + score)));
  const Z  = boxMuller(u1, u2);                 // N(0,1)
  const intervalScale = Math.max(0, intervalMs) / 30000;
  const sigmaTick = 0.08 * Math.sqrt(intervalScale);
  const gbmNoise  = sigmaTick * Z;               // core random walk

  // ── Momentum texture (4-min cycle) ────────────────────────────────────────
  // Adds organic short-term trends visible at chart scale.
  const symbolSeed = Array.from(String(symbol || '')).reduce(
    (acc, c, i) => (acc + c.charCodeAt(0) * (i + 1) * 17) % 1000, 13
  );
  const tSec   = nowMs / 1000;
  const medRad = ((tSec + symbolSeed * 13) / 240) * Math.PI * 2;
  const momentum = (Math.sin(medRad) * 0.025 + Math.cos(medRad * 1.5) * 0.012) * intervalScale;

  // ── Human-life sentiment drift (μ per tick) ───────────────────────────────
  const mu = calculateSentimentDriftPercent(score, intervalMs);

  // ── Mean reversion toward today's opening ────────────────────────────────
  // Activates when price drifts >1% from opening — creates visible oscillations.
  // This is what makes the chart go up AND come back down organically.
  const driftPct = ((current - reference) / reference) * 100;
  const reversionStrength = 0.004 * (1 - 0.8 * Math.abs(score - 50) / 50);
  const reversion = driftPct > 1 || driftPct < -1
    ? Math.max(-0.08 * intervalScale, Math.min(0.08 * intervalScale, -driftPct * reversionStrength * intervalScale))
    : 0;

  const total = gbmNoise + momentum + mu + reversion;
  return Number(total.toFixed(4));
}

/**
 * Computes dynamic circuit limits and sentiment parameters for a stock.
 * Circuits are wide safety-nets for extreme life events — not daily constraints.
 */
function getStockMarketParams(stock) {
  const currentPrice  = Number(stock.profile?.currentPrice  || 100);
  const startingPrice = Number(stock.profile?.startingPrice || stock.profile?.listingPrice || 100);
  const symbol        = stock.profile?.symbol || 'STOCK';

  const { sentimentScore } = computeStockSentiment(stock);

  const { upperCircuitPct, lowerCircuitPct } = getSentimentCircuitPercentages(sentimentScore);

  const lastEventTick    = Array.isArray(stock.priceTicks)
    ? [...stock.priceTicks].reverse().find(t => t.eventId !== null && !String(t.eventId).startsWith('circuit-reset'))
    : null;
  const circuitAnchorPrice = lastEventTick ? lastEventTick.price : startingPrice;
  const upperCircuit = Number((circuitAnchorPrice * (1 + upperCircuitPct / 100)).toFixed(2));
  const lowerCircuit = Math.max(1.0, Number((circuitAnchorPrice * (1 - lowerCircuitPct / 100)).toFixed(2)));

  return { currentPrice, startingPrice, symbol, sentimentScore, upperCircuitPct, lowerCircuitPct, circuitAnchorPrice, upperCircuit, lowerCircuit };
}

/**
 * Simulates elapsed continuous market ticks when the server was offline.
 * Uses unbiased pseudo-random (not Math.abs(Math.sin) which averages 0.637→biased up).
 */
export function simulateCatchUpTicks(stock, targetNowMs = Date.now(), maxTicksToGenerate = 1200) {
  if (!stock || !stock.profile) return stock;

  if (!Array.isArray(stock.priceTicks) || stock.priceTicks.length === 0) {
    ensureRichIntradayHistory(stock, targetNowMs);
    return stock;
  }

  const lastTick   = stock.priceTicks[stock.priceTicks.length - 1];
  const lastTimeMs = new Date(lastTick.timestamp).getTime();
  if (isNaN(lastTimeMs) || targetNowMs <= lastTimeMs) return stock;

  const elapsedMs = targetNowMs - lastTimeMs;
  if (elapsedMs < 2500) return stock;

  // Dynamic step — denser for shorter gaps, coarser for long outages
  let stepMs;
  if      (elapsedMs > 7 * 24 * 3600 * 1000) stepMs = Math.max(3600 * 1000, Math.floor(elapsedMs / maxTicksToGenerate));
  else if (elapsedMs > 24 * 3600 * 1000)     stepMs = Math.max(10 * 60 * 1000, Math.floor(elapsedMs / maxTicksToGenerate));
  else if (elapsedMs > 6 * 3600 * 1000)      stepMs = Math.max(30 * 1000, Math.floor(elapsedMs / maxTicksToGenerate));
  else if (elapsedMs > 60 * 60 * 1000)       stepMs = 20 * 1000;
  else if (elapsedMs > 10 * 60 * 1000)       stepMs = 8 * 1000;
  else if (elapsedMs > 2 * 60 * 1000)        stepMs = 4 * 1000;
  else                                        stepMs = 2 * 1000;

  const { symbol, sentimentScore, upperCircuitPct, lowerCircuitPct, startingPrice, upperCircuit, lowerCircuit } = getStockMarketParams(stock);
  let simPrice      = Number(stock.profile.currentPrice || lastTick.price || 100);
  let currentTimeMs = lastTimeMs + stepMs;
  let tickIndex     = 0;

  while (currentTimeMs <= targetNowMs && tickIndex < maxTicksToGenerate) {
    if (!isMarketOpenAt(currentTimeMs)) {
      currentTimeMs += stepMs;
      continue;
    }

    // Unbiased pseudo-random pair: mean ≈ 0.5 each
    const u1 = pseudoHash(currentTimeMs * 0.001731 + tickIndex * 127.1);
    const u2 = pseudoHash(currentTimeMs * 0.003713 + tickIndex * 311.7);
    const noise = calculateMarketMovePercent(simPrice, startingPrice, sentimentScore, symbol, currentTimeMs, u1, stepMs);

    const rawPrice = simPrice * (1 + noise / 100);
    simPrice = Number(Math.min(Math.max(rawPrice, lowerCircuit), upperCircuit).toFixed(2));
    if (simPrice < 1.0) simPrice = 1.0;

    const tickLabel = noise > 0.03 ? '🔥 Bullish Buying' : noise < -0.03 ? '🔻 Bearish Selling' : '⚖️ Market Fluctuation';

    stock.priceTicks.push({
      timestamp: new Date(currentTimeMs).toISOString(),
      price:     simPrice,
      eventId:   null,
      label:     tickLabel
    });

    currentTimeMs += stepMs;
    tickIndex++;
  }

  stock.profile.currentPrice = simPrice;
  return stock;
}

/**
 * Backfills today's intraday history with GBM ticks from 9:15 AM to now.
 * Uses unbiased pseudo-random so there's no systematic upward/downward drift.
 */
export function ensureRichIntradayHistory(stock, targetNowMs = Date.now()) {
  if (!stock || !stock.profile) return stock;
  if (!Array.isArray(stock.priceTicks)) stock.priceTicks = [];

  const session = getMarketSessionFor(targetNowMs);
  if (!session) return stock;
  const { marketOpen: marketOpenMs, marketClose: marketCloseMs } = session;
  if (targetNowMs < marketOpenMs) return stock;
  const historyEndMs = Math.min(targetNowMs, marketCloseMs - 1000);

  const todayTicks = stock.priceTicks.filter(t => new Date(t.timestamp).getTime() >= marketOpenMs);
  if (todayTicks.length >= 120) return stock;  // already rich enough

  const { symbol, sentimentScore, upperCircuit, lowerCircuit } = getStockMarketParams(stock);
  // Start the GBM walk from the CURRENT price (not IPO startingPrice).
  // This centers the generated chart around the actual live price so the
  // oscillations look realistic and don't appear as a sloping line from IPO.
  const openAnchor = Number(
    stock.profile.currentPrice ||
    stock.profile.listingPrice ||
    stock.profile.startingPrice ||
    100
  );
  const realCurrentPrice = openAnchor; // preserve for after backfill

  const priorTicks         = stock.priceTicks.filter(t => new Date(t.timestamp).getTime() <  marketOpenMs);
  const existingEventsToday = stock.priceTicks.filter(t => new Date(t.timestamp).getTime() >= marketOpenMs && t.eventId);

  const durationMs = historyEndMs - marketOpenMs;
  if (durationMs <= 0) return stock;
  const numSteps   = Math.min(360, Math.max(80, Math.floor(durationMs / 30000))); // ~30s per step
  const stepMs     = Math.floor(durationMs / numSteps);

  let currentP    = openAnchor;
  const generated  = [];

  for (let i = 0; i <= numSteps; i++) {
    const tMs = marketOpenMs + i * stepMs;
    if (tMs > historyEndMs) break;

    if (i === 0) {
      generated.push({ timestamp: new Date(tMs).toISOString(), price: currentP, eventId: null, label: '🔔 Market Open (9:15 AM)' });
      continue;
    }

    // Unbiased pseudo-random pair
    const u1    = pseudoHash(tMs * 0.001731 + i * 127.1);
    const noise = calculateMarketMovePercent(currentP, openAnchor, sentimentScore, symbol, tMs, u1, stepMs);

    const rawPrice = currentP * (1 + noise / 100);
    currentP = Number(Math.min(Math.max(rawPrice, lowerCircuit), upperCircuit).toFixed(2));
    if (currentP < 1.0) currentP = 1.0;

    const label = noise > 0.03 ? '🔥 Bullish Buying' : noise < -0.03 ? '🔻 Bearish Selling' : '⚖️ Market Fluctuation';
    generated.push({ timestamp: new Date(tMs).toISOString(), price: currentP, eventId: null, label });
  }

  // Merge existing event ticks (life events should be preserved)
  existingEventsToday.forEach(evt => generated.push(evt));
  generated.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  stock.priceTicks = [...priorTicks, ...generated];
  // Keep the actual live currentPrice — don't overwrite with GBM endpoint
  stock.profile.currentPrice = realCurrentPrice;

  return stock;
}