/**
 * High-Fidelity Continuous Market Simulation Engine
 * Generates realistic multi-frequency stock price movements (macro waves, pullbacks,
 * momentum runs, plateaus, and micro-ticks) modeled after real equity trading charts (Zerodha / Dixon).
 */

export function calculateMarketMovePercent(currentPrice, referencePrice, sentimentScore, symbol, nowMs = Date.now(), randomValue = Math.random()) {
  const current = Number(currentPrice) || 100;
  const reference = Number(referencePrice) || current;
  const score = Math.max(0, Math.min(100, Number(sentimentScore) || 50));
  const normalizedRandom = Math.max(0, Math.min(1, randomValue));

  const symbolSeed = Array.from(String(symbol || '')).reduce(
    (acc, char, idx) => (acc + char.charCodeAt(0) * (idx + 1) * 17) % 1000,
    13
  );

  const tSec = nowMs / 1000;

  // 1. Macro Wave (~15 to 25 minute cycle): broad market trend
  const macroRad = ((tSec + symbolSeed * 7) / 1200) * Math.PI * 2;
  const macroWave = Math.sin(macroRad) * 0.18 + Math.cos(macroRad * 0.7) * 0.08;

  // 2. Medium Wave (~3 to 5 minute cycle): sector momentum & pullbacks
  const medRad = ((tSec + symbolSeed * 13) / 260) * Math.PI * 2;
  const medWave = Math.sin(medRad) * 0.12 + Math.cos(medRad * 1.3) * 0.06;

  // 3. Micro Swing (~30 to 60 second cycle): order-flow swings
  const microRad = ((tSec + symbolSeed * 31) / 45) * Math.PI * 2;
  const microWave = Math.sin(microRad) * 0.06;

  // 4. Tick Jitter (fast micro-fluctuations)
  const jitter = (normalizedRandom - 0.49) * 0.07;

  // 5. Sentiment Drift (bullish or bearish bias)
  const sentimentBias = (score - 50) * 0.0012;

  // 6. Mean Reversion towards reference price to prevent runaway while allowing realistic 10-25% rallies/dips
  const deviationPercent = ((reference - current) / reference) * 100;
  const meanReversion = Math.max(-0.04, Math.min(0.04, deviationPercent * 0.012));

  return Number((macroWave + medWave + microWave + jitter + sentimentBias + meanReversion).toFixed(4));
}

/**
 * Computes dynamic circuit limits and sentiment parameters for a stock
 */
function getStockMarketParams(stock) {
  const currentPrice = Number(stock.profile?.currentPrice || 100);
  const startingPrice = Number(stock.profile?.startingPrice || stock.profile?.listingPrice || 100);
  const symbol = stock.profile?.symbol || 'STOCK';

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

  let upperCircuitPct = 20;
  let lowerCircuitPct = 15;
  if (sentimentScore >= 80) { upperCircuitPct = 30; lowerCircuitPct = 8; }
  else if (sentimentScore >= 60) { upperCircuitPct = 20; lowerCircuitPct = 10; }
  else if (sentimentScore >= 40) { upperCircuitPct = 15; lowerCircuitPct = 15; }
  else if (sentimentScore >= 20) { upperCircuitPct = 10; lowerCircuitPct = 20; }
  else { upperCircuitPct = 8; lowerCircuitPct = 25; }

  const lastEventTick = Array.isArray(stock.priceTicks) ? [...stock.priceTicks].reverse().find(t => t.eventId !== null) : null;
  const circuitAnchorPrice = lastEventTick ? lastEventTick.price : startingPrice;
  const upperCircuit = Number((circuitAnchorPrice * (1 + upperCircuitPct / 100)).toFixed(2));
  const lowerCircuit = Math.max(1.0, Number((circuitAnchorPrice * (1 - lowerCircuitPct / 100)).toFixed(2)));

  return { currentPrice, startingPrice, symbol, sentimentScore, upperCircuitPct, lowerCircuitPct, circuitAnchorPrice, upperCircuit, lowerCircuit };
}

/**
 * Simulates elapsed continuous market ticks when the user closes the site or the server sleeps.
 * Fills in the time gap seamlessly from last recorded tick to targetNowMs with high-resolution detail.
 */
export function simulateCatchUpTicks(stock, targetNowMs = Date.now(), maxTicksToGenerate = 600) {
  if (!stock || !stock.profile) return stock;

  if (!Array.isArray(stock.priceTicks) || stock.priceTicks.length === 0) {
    ensureRichIntradayHistory(stock, targetNowMs);
    return stock;
  }

  const lastTick = stock.priceTicks[stock.priceTicks.length - 1];
  const lastTimeMs = new Date(lastTick.timestamp).getTime();
  if (isNaN(lastTimeMs) || targetNowMs <= lastTimeMs) {
    return stock;
  }

  const elapsedMs = targetNowMs - lastTimeMs;
  // If less than 2.5 seconds, no catch-up needed yet
  if (elapsedMs < 2500) {
    return stock;
  }

  // Calculate dynamic step based on elapsed time to preserve realistic tick density
  let stepMs = 5000; // 5 seconds
  if (elapsedMs > 7 * 24 * 3600 * 1000) {
    stepMs = Math.max(3600 * 1000, Math.floor(elapsedMs / maxTicksToGenerate));
  } else if (elapsedMs > 24 * 3600 * 1000) {
    stepMs = Math.max(10 * 60 * 1000, Math.floor(elapsedMs / maxTicksToGenerate)); // ~10-15 min
  } else if (elapsedMs > 6 * 3600 * 1000) {
    stepMs = Math.max(60 * 1000, Math.floor(elapsedMs / maxTicksToGenerate)); // ~1-2 min
  } else if (elapsedMs > 60 * 60 * 1000) {
    stepMs = 30 * 1000; // 30 sec
  } else if (elapsedMs > 10 * 60 * 1000) {
    stepMs = 15 * 1000; // 15 sec
  } else if (elapsedMs > 2 * 60 * 1000) {
    stepMs = 8 * 1000; // 8 sec
  } else {
    stepMs = 4 * 1000; // 4 sec
  }

  const { symbol, sentimentScore, upperCircuitPct, lowerCircuitPct, circuitAnchorPrice, upperCircuit, lowerCircuit } = getStockMarketParams(stock);
  let simPrice = Number(stock.profile.currentPrice || lastTick.price || 100);
  let currentTimeMs = lastTimeMs + stepMs;
  let ticksGenerated = 0;

  const symbolSeed = Array.from(String(symbol || '')).reduce((acc, c) => acc + c.charCodeAt(0), 0);

  while (currentTimeMs <= targetNowMs && ticksGenerated < maxTicksToGenerate) {
    const pseudoRand = Math.abs(Math.sin(currentTimeMs * 0.0019 + symbolSeed * 37.1));
    const noise = calculateMarketMovePercent(simPrice, circuitAnchorPrice, sentimentScore, symbol, currentTimeMs, pseudoRand);
    const rawPrice = simPrice * (1 + noise / 100);
    simPrice = Number(Math.min(Math.max(rawPrice, lowerCircuit), upperCircuit).toFixed(2));
    if (simPrice < 1.0) simPrice = 1.0;

    let tickLabel = noise > 0.02 ? '🔥 Bullish Buying' : noise < -0.02 ? '🔻 Bearish Selling' : '⚖️ Market Fluctuation';
    if (simPrice >= upperCircuit) {
      tickLabel = `🔒 Upper Circuit (+${upperCircuitPct}%)`;
    } else if (simPrice <= lowerCircuit) {
      tickLabel = `🔒 Lower Circuit (-${lowerCircuitPct}%)`;
    }

    const isoStr = new Date(currentTimeMs).toISOString();

    stock.priceTicks.push({
      timestamp: isoStr,
      price: simPrice,
      eventId: null,
      label: tickLabel
    });

    currentTimeMs += stepMs;
    ticksGenerated++;
  }

  stock.profile.currentPrice = simPrice;
  return stock;
}

/**
 * Ensures a stock has rich intraday tick history for today (starting from market opening 9:15 AM).
 * If the stock has fewer than 40 ticks for today, this backfills the trading day so the 1D chart
 * immediately renders with beautiful, continuous, detailed market waves.
 */
export function ensureRichIntradayHistory(stock, targetNowMs = Date.now()) {
  if (!stock || !stock.profile) return stock;

  if (!Array.isArray(stock.priceTicks)) {
    stock.priceTicks = [];
  }

  const now = new Date(targetNowMs);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 15, 0, 0); // 9:15 AM Market Open
  const marketOpenMs = startOfDay.getTime() > targetNowMs ? targetNowMs - (4 * 3600 * 1000) : startOfDay.getTime();

  const todayTicks = stock.priceTicks.filter(t => new Date(t.timestamp).getTime() >= marketOpenMs);

  // If already has plenty of detailed ticks today, no need to backfill
  if (todayTicks.length >= 45) {
    return stock;
  }

  const { symbol, sentimentScore, circuitAnchorPrice, upperCircuit, lowerCircuit } = getStockMarketParams(stock);
  const startingPrice = Number(stock.profile.startingPrice || stock.profile.listingPrice || 100);

  // Preserve existing ticks from prior days
  const priorTicks = stock.priceTicks.filter(t => new Date(t.timestamp).getTime() < marketOpenMs);
  const existingEventsToday = stock.priceTicks.filter(t => new Date(t.timestamp).getTime() >= marketOpenMs && t.eventId);

  const durationMs = Math.max(targetNowMs - marketOpenMs, 60000);
  const numSteps = Math.min(160, Math.max(50, Math.floor(durationMs / 45000))); // step every 45-90 seconds
  const stepMs = Math.floor(durationMs / numSteps);

  let currentP = startingPrice;
  const generatedTicks = [];
  const symbolSeed = Array.from(String(symbol || '')).reduce((acc, c) => acc + c.charCodeAt(0), 0);

  for (let i = 0; i <= numSteps; i++) {
    const tMs = marketOpenMs + i * stepMs;
    if (tMs > targetNowMs) break;

    const pseudoRand = Math.abs(Math.sin(tMs * 0.0019 + symbolSeed * 37.1));
    const noise = calculateMarketMovePercent(currentP, circuitAnchorPrice, sentimentScore, symbol, tMs, pseudoRand);
    const rawPrice = currentP * (1 + noise / 100);
    currentP = Number(Math.min(Math.max(rawPrice, lowerCircuit), upperCircuit).toFixed(2));
    if (currentP < 1.0) currentP = 1.0;

    const isoStr = new Date(tMs).toISOString();
    const label = i === 0
      ? `🔔 Market Open (9:15 AM)`
      : noise > 0.02 ? '🔥 Bullish Buying' : noise < -0.02 ? '🔻 Bearish Selling' : '⚖️ Market Fluctuation';

    generatedTicks.push({
      timestamp: isoStr,
      price: currentP,
      eventId: null,
      label
    });
  }

  // Merge any events that happened today
  existingEventsToday.forEach(evt => {
    generatedTicks.push(evt);
  });
  generatedTicks.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  stock.priceTicks = [...priorTicks, ...generatedTicks];
  if (stock.priceTicks.length > 0) {
    stock.profile.currentPrice = stock.priceTicks[stock.priceTicks.length - 1].price;
  }

  return stock;
}