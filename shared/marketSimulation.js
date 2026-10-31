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

/**
 * Calculates the % price move for a single tick using GBM.
 *
 * Calibration (30-second tick interval, ~6.5 hr trading day):
 *   Annual vol σ_annual = 35%  →  daily σ = 35%/√252 ≈ 2.2%
 *   Per-30s σ = 2.2% × √(30/23400) ≈ 0.057% per tick
 *
 * This produces Groww-like intraday charts:
 *   • Visible up/down bounces every tick
 *   • Daily range roughly ±1.5–3% around opening
 *   • Organic-looking momentum runs & pullbacks
 */
export function calculateMarketMovePercent(
  currentPrice,
  referencePrice,     // today's opening price — mean-reversion anchor
  sentimentScore,
  symbol,
  nowMs = Date.now(),
  randomValue = Math.random()
) {
  const current   = Number(currentPrice)  || 100;
  const reference = Number(referencePrice) || current;
  const score     = Math.max(0, Math.min(100, Number(sentimentScore) || 50));

  // ── GBM core ──────────────────────────────────────────────────────────────
  // σ per tick calibrated to ~2.2% daily volatility (realistic mid-cap stock).
  // We approximate N(0,1) from the single uniform randomValue using a simple
  // approximation (close enough for simulation purposes).
  const u1 = Math.max(0.001, Math.min(0.999, randomValue));
  const u2 = Math.max(0.001, Math.min(0.999, pseudoHash(nowMs * 0.001 + score)));
  const Z  = boxMuller(u1, u2);                 // N(0,1)
  const sigmaTick = 0.057;                       // % per tick (30s interval)
  const gbmNoise  = sigmaTick * Z;               // core random walk

  // ── Momentum texture (4-min cycle) ────────────────────────────────────────
  // Adds organic short-term trends — price tends to continue briefly before
  // reversing. Amplitude kept small so it doesn't dominate.
  const symbolSeed = Array.from(String(symbol || '')).reduce(
    (acc, c, i) => (acc + c.charCodeAt(0) * (i + 1) * 17) % 1000, 13
  );
  const tSec   = nowMs / 1000;
  const medRad = ((tSec + symbolSeed * 13) / 240) * Math.PI * 2;
  const momentum = Math.sin(medRad) * 0.012 + Math.cos(medRad * 1.5) * 0.006;

  // ── Sentiment drift (μ per tick) ──────────────────────────────────────────
  // BULLISH (score=75): +0.002% per tick → +0.24% per hour gentle drift.
  // BEARISH (score=25): -0.002% per tick → -0.24% per hour.
  const mu = (score - 50) * 0.00004;

  // ── Mean reversion toward today's opening ────────────────────────────────
  // Activates only when price has drifted >2% from opening — gently pulls back.
  // This keeps the intraday range realistic (±3-5% max from open).
  const driftPct = ((current - reference) / reference) * 100;
  const reversion = driftPct > 2 || driftPct < -2
    ? Math.max(-0.03, Math.min(0.03, -driftPct * 0.008))
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

  let sentimentScore = 50;
  if (stock.events && stock.events.length > 0) {
    let posCount = 0;
    stock.events.forEach(e => {
      if (e.sentiment === 'POSITIVE' || (e.impactPercent && e.impactPercent > 0)) posCount++;
    });
    const positiveRatio      = (posCount / stock.events.length) * 100;
    const priceChangePercent = ((currentPrice - startingPrice) / startingPrice) * 100;
    sentimentScore = Math.min(Math.max(
      Math.round(50 + (positiveRatio - 50) * 0.4 + Math.min(Math.max(priceChangePercent * 1.2, -25), 25)),
      5), 98);
  } else {
    const priceChange = ((currentPrice - startingPrice) / startingPrice) * 100;
    sentimentScore = Math.min(Math.max(Math.round(65 + priceChange * 1.5), 10), 95);
  }

  // Wide circuit bands — safety net for extreme life events only.
  // Normal GBM movement (σ=0.057% per tick) will never reach these.
  let upperCircuitPct = 40;
  let lowerCircuitPct = 40;
  if      (sentimentScore >= 80) { upperCircuitPct = 60; lowerCircuitPct = 25; }
  else if (sentimentScore >= 60) { upperCircuitPct = 50; lowerCircuitPct = 30; }
  else if (sentimentScore >= 40) { upperCircuitPct = 40; lowerCircuitPct = 40; }
  else if (sentimentScore >= 20) { upperCircuitPct = 30; lowerCircuitPct = 50; }
  else                           { upperCircuitPct = 20; lowerCircuitPct = 60; }

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
    // Unbiased pseudo-random pair: mean ≈ 0.5 each
    const u1 = pseudoHash(currentTimeMs * 0.001731 + tickIndex * 127.1);
    const u2 = pseudoHash(currentTimeMs * 0.003713 + tickIndex * 311.7);
    const noise = calculateMarketMovePercent(simPrice, startingPrice, sentimentScore, symbol, currentTimeMs, u1);

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

  const now        = new Date(targetNowMs);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 15, 0, 0);
  const marketOpenMs = startOfDay.getTime() > targetNowMs
    ? targetNowMs - (4 * 3600 * 1000)
    : startOfDay.getTime();

  const todayTicks = stock.priceTicks.filter(t => new Date(t.timestamp).getTime() >= marketOpenMs);
  if (todayTicks.length >= 120) return stock;  // already rich enough

  const { symbol, sentimentScore, upperCircuit, lowerCircuit } = getStockMarketParams(stock);
  const startingPrice = Number(stock.profile.startingPrice || stock.profile.listingPrice || 100);

  const priorTicks         = stock.priceTicks.filter(t => new Date(t.timestamp).getTime() <  marketOpenMs);
  const existingEventsToday = stock.priceTicks.filter(t => new Date(t.timestamp).getTime() >= marketOpenMs && t.eventId);

  const durationMs = Math.max(targetNowMs - marketOpenMs, 60000);
  const numSteps   = Math.min(360, Math.max(80, Math.floor(durationMs / 30000))); // ~30s per step
  const stepMs     = Math.floor(durationMs / numSteps);

  let currentP     = startingPrice;
  const generated  = [];

  for (let i = 0; i <= numSteps; i++) {
    const tMs = marketOpenMs + i * stepMs;
    if (tMs > targetNowMs) break;

    if (i === 0) {
      generated.push({ timestamp: new Date(tMs).toISOString(), price: currentP, eventId: null, label: '🔔 Market Open (9:15 AM)' });
      continue;
    }

    // Unbiased pseudo-random pair
    const u1    = pseudoHash(tMs * 0.001731 + i * 127.1);
    const noise = calculateMarketMovePercent(currentP, startingPrice, sentimentScore, symbol, tMs, u1);

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
  if (stock.priceTicks.length > 0) {
    stock.profile.currentPrice = stock.priceTicks[stock.priceTicks.length - 1].price;
  }

  return stock;
}