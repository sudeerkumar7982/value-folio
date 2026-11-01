/**
 * Persistent Data Store for ValueFolio Human Life Stock Platform
 * Supports Multi-Stock Exchange, Human IPO Bidding & Listing
 *
 * Storage architecture (Neon/pool mode):
 *   - value_folio_state: JSONB blob for profile, sectors, events, trades (NO priceTicks)
 *   - price_ticks: one row per tick; auto-pruned to 500 market ticks per stock
 *     All event/circuit ticks are preserved indefinitely.
 *
 * Storage architecture (file / local mode):
 *   - store.json: full JSON including priceTicks (unchanged from original behaviour)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { computeStockMetrics } from '../engine/priceEngine.js';
import { simulateCatchUpTicks, ensureRichIntradayHistory } from '../../shared/marketSimulation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUNDLED_DATA_FILE = path.join(__dirname, 'store.json');
const DATA_FILE = process.env.DATA_FILE || BUNDLED_DATA_FILE;
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  : null;

const INITIAL_DATA = {
  activeSymbol: '',
  stocks: {},
  ipos: []
};

// Maximum market (non-event) ticks stored per stock in Neon.
// Event ticks are always kept. 500 ≈ 4 hours of 30-second granularity.
const MAX_MARKET_TICKS = 500;

// ── Neon price_ticks table helpers ────────────────────────────────────────────

/** Fetch all ticks for a symbol ordered chronologically. */
async function dbGetTicks(symbol) {
  const { rows } = await pool.query(
    `SELECT timestamp, price, event_id AS "eventId", label
       FROM price_ticks
      WHERE symbol = $1
      ORDER BY timestamp ASC`,
    [symbol]
  );
  return rows.map(r => ({
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    price: Number(r.price),
    eventId: r.eventId || null,
    label: r.label || ''
  }));
}

/** Fetch the single most-recent tick for a symbol (for 30-second dedup logic). */
async function dbGetLastTick(symbol) {
  const { rows } = await pool.query(
    `SELECT id, timestamp, price, event_id AS "eventId", label
       FROM price_ticks
      WHERE symbol = $1
      ORDER BY timestamp DESC
      LIMIT 1`,
    [symbol]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    price: Number(r.price),
    eventId: r.eventId || null,
    label: r.label || ''
  };
}

/** Insert a single new tick row. */
async function dbInsertTick(symbol, tick) {
  await pool.query(
    `INSERT INTO price_ticks (symbol, timestamp, price, event_id, label)
          VALUES ($1, $2, $3, $4, $5)`,
    [symbol, tick.timestamp, tick.price, tick.eventId || null, tick.label || '']
  );
}

/** Update the most-recent tick row in-place (for 30-second dedup). */
async function dbUpdateLastTickById(tickId, tick) {
  await pool.query(
    `UPDATE price_ticks
        SET price = $2, timestamp = $3, label = $4
      WHERE id = $1`,
    [tickId, tick.price, tick.timestamp, tick.label || '']
  );
}

/**
 * Delete market ticks beyond MAX_MARKET_TICKS for a symbol.
 * Event ticks (event_id IS NOT NULL) are never pruned.
 */
async function dbPruneMarketTicks(symbol) {
  await pool.query(
    `DELETE FROM price_ticks
      WHERE symbol = $1
        AND event_id IS NULL
        AND id NOT IN (
          SELECT id FROM price_ticks
           WHERE symbol = $1 AND event_id IS NULL
           ORDER BY timestamp DESC
           LIMIT $2
        )`,
    [symbol, MAX_MARKET_TICKS]
  );
}

/** Delete the single tick row whose event_id matches. */
async function dbDeleteTickByEventId(eventId) {
  await pool.query('DELETE FROM price_ticks WHERE event_id = $1', [eventId]);
}

/**
 * Delete all real life-event ticks for a symbol.
 * Circuit-reset synthetic ticks (event_id LIKE 'circuit-reset-%') are kept.
 */
async function dbDeleteEventTicks(symbol) {
  await pool.query(
    `DELETE FROM price_ticks
      WHERE symbol = $1
        AND event_id IS NOT NULL
        AND event_id NOT LIKE 'circuit-reset-%'`,
    [symbol]
  );
}

/** Wipe every tick for a symbol (used when deleting a stock). */
async function dbDeleteAllTicks(symbol) {
  await pool.query('DELETE FROM price_ticks WHERE symbol = $1', [symbol]);
}

/** Batch-insert many ticks for a symbol (used during migration and refresh). */
async function dbInsertManyTicks(symbol, ticks) {
  if (!ticks || ticks.length === 0) return;
  for (const t of ticks) {
    await pool.query(
      `INSERT INTO price_ticks (symbol, timestamp, price, event_id, label)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT DO NOTHING`,
      [symbol, t.timestamp, t.price, t.eventId || null, t.label || '']
    );
  }
}

// ── File-mode helpers ─────────────────────────────────────────────────────────

function catchUpStoreStocks(store) {
  if (!store || !store.stocks) return false;
  let modified = false;
  const nowMs = Date.now();
  for (const sym of Object.keys(store.stocks)) {
    const stock = store.stocks[sym];
    if (!stock.priceTicks) stock.priceTicks = [];
    const prevTicksLen = stock.priceTicks.length;
    const prevPrice = stock.profile ? stock.profile.currentPrice : null;
    ensureRichIntradayHistory(stock, nowMs);
    simulateCatchUpTicks(stock, nowMs);
    if (
      (stock.priceTicks && stock.priceTicks.length !== prevTicksLen) ||
      (stock.profile && stock.profile.currentPrice !== prevPrice)
    ) {
      modified = true;
    }
  }
  return modified;
}

function readBundledStore() {
  try {
    const store = JSON.parse(fs.readFileSync(BUNDLED_DATA_FILE, 'utf-8'));
    if (store && typeof store === 'object' && store.stocks) return store;
    return {
      activeSymbol: store.activeSymbol || '',
      stocks: {},
      ipos: store.ipos || []
    };
  } catch (err) {
    console.error('Error reading bundled store.json:', err);
    return INITIAL_DATA;
  }
}

// ── Core store read / write ───────────────────────────────────────────────────

async function readStore() {
  let store = INITIAL_DATA;
  if (pool) {
    const { rows } = await pool.query('SELECT data FROM value_folio_state WHERE id = 1');
    store = rows[0]?.data || INITIAL_DATA;
    // Ensure no stale priceTicks arrays live in the blob (pool mode: table only)
    if (store.stocks) {
      for (const sym of Object.keys(store.stocks)) {
        store.stocks[sym].priceTicks = [];
      }
    }
  } else {
    // ── File mode ────────────────────────────────────────────────────────────
    try {
      if (!fs.existsSync(DATA_FILE)) {
        let initialData = INITIAL_DATA;
        if (DATA_FILE !== BUNDLED_DATA_FILE && fs.existsSync(BUNDLED_DATA_FILE)) {
          try {
            const bundledData = JSON.parse(fs.readFileSync(BUNDLED_DATA_FILE, 'utf-8'));
            if (bundledData && typeof bundledData === 'object' && bundledData.stocks) {
              initialData = bundledData;
            }
          } catch (err) {
            console.error('Error seeding persistent store from bundled data:', err);
          }
        }
        fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
        store = initialData;
      } else {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        store = JSON.parse(raw);

        if (!store.stocks) {
          const migrated = {
            activeSymbol: store.activeSymbol || '',
            stocks: {},
            ipos: store.ipos || []
          };
          await writeStore(migrated);
          store = migrated;
        }
      }
    } catch (err) {
      console.error('Error reading store.json, re-initializing:', err);
      store = INITIAL_DATA;
    }

    // Seamlessly bridge any time gap when server was sleeping or offline (file mode only)
    if (catchUpStoreStocks(store)) {
      writeStore(store).catch(err => console.error('Error persisting catch-up ticks:', err));
    }
  }

  return store;
}

async function writeStore(data) {
  if (pool) {
    // Strip priceTicks from every stock — they live in the price_ticks table.
    const cleanStocks = {};
    for (const [sym, stock] of Object.entries(data.stocks || {})) {
      const { priceTicks, ...stockWithoutTicks } = stock; // eslint-disable-line no-unused-vars
      cleanStocks[sym] = stockWithoutTicks;
    }
    const cleanData = { ...data, stocks: cleanStocks };

    await pool.query(
      `INSERT INTO value_folio_state (id, data)
            VALUES (1, $1::jsonb)
            ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [JSON.stringify(cleanData)]
    );
    return;
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── Sentiment helper (exported) ───────────────────────────────────────────────

export function computeStockSentiment(stock) {
  if (!stock) return { sentiment: 'NEUTRAL', sentimentScore: 50, sentimentLabel: 'Neutral ⚖️', positiveRatio: 50 };

  const events = stock.events || [];
  const profile = stock.profile || {};
  const currentPrice = profile.currentPrice || 100;
  const startingPrice = profile.startingPrice || 100;

  if (events.length === 0) {
    const priceChange = ((currentPrice - startingPrice) / startingPrice) * 100;
    const score = Math.min(Math.max(Math.round(65 + priceChange * 1.5), 10), 95);
    return {
      sentiment: score >= 80 ? 'VERY_BULLISH' : score >= 60 ? 'BULLISH' : score >= 40 ? 'NEUTRAL' : score >= 20 ? 'BEARISH' : 'VERY_BEARISH',
      sentimentScore: score,
      sentimentLabel: score >= 80 ? 'Very Bullish 🔥' : score >= 60 ? 'Bullish 📈' : score >= 40 ? 'Neutral ⚖️' : score >= 20 ? 'Bearish 📉' : 'Very Bearish 🔻',
      positiveRatio: 100
    };
  }

  let posCount = 0;
  let totalImpact = 0;

  events.forEach(e => {
    if (e.sentiment === 'POSITIVE' || e.impactPercent > 0) posCount++;
    totalImpact += (e.impactPercent || 0);
  });

  const positiveRatio = Math.round((posCount / events.length) * 100);
  const priceChangePercent = ((currentPrice - startingPrice) / startingPrice) * 100;

  let sentimentScore = Math.round(50 + (positiveRatio - 50) * 0.4 + Math.min(Math.max(priceChangePercent * 1.2, -25), 25));
  sentimentScore = Math.min(Math.max(sentimentScore, 5), 98);

  let sentiment = 'NEUTRAL';
  let sentimentLabel = 'Neutral ⚖️';
  if (sentimentScore >= 80) {
    sentiment = 'VERY_BULLISH';
    sentimentLabel = 'Very Bullish 🔥';
  } else if (sentimentScore >= 60) {
    sentiment = 'BULLISH';
    sentimentLabel = 'Bullish 📈';
  } else if (sentimentScore >= 40) {
    sentiment = 'NEUTRAL';
    sentimentLabel = 'Neutral ⚖️';
  } else if (sentimentScore >= 20) {
    sentiment = 'BEARISH';
    sentimentLabel = 'Bearish 📉';
  } else {
    sentiment = 'VERY_BEARISH';
    sentimentLabel = 'Very Bearish 🔻';
  }

  return {
    sentiment,
    sentimentScore,
    sentimentLabel,
    positiveRatio,
    totalEvents: events.length
  };
}

// ── DB method implementations ─────────────────────────────────────────────────

const dbMethods = {
  initialize: async () => {
    if (process.env.NODE_ENV === 'production' && !pool) {
      throw new Error('DATABASE_URL must be configured in production for persistent storage');
    }
    if (!pool) return;

    // Create the main state table (unchanged schema)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS value_folio_state (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        data JSONB NOT NULL
      )
    `);

    // ── NEW: dedicated price_ticks table ──────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS price_ticks (
        id        BIGSERIAL PRIMARY KEY,
        symbol    TEXT        NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        price     NUMERIC(16,4) NOT NULL,
        event_id  TEXT,
        label     TEXT
      )
    `);
    // Index for fast per-symbol chronological queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_price_ticks_symbol_ts
        ON price_ticks (symbol, timestamp DESC)
    `);
    // ─────────────────────────────────────────────────────────────────────────

    // Seed the state blob from the bundled store.json if it doesn't exist yet
    const bundledStore = readBundledStore();

    // Strip priceTicks from bundled data before inserting into blob
    const cleanStocks = {};
    for (const [sym, stock] of Object.entries(bundledStore.stocks || {})) {
      const { priceTicks, ...stockWithoutTicks } = stock; // eslint-disable-line no-unused-vars
      cleanStocks[sym] = stockWithoutTicks;
    }
    const cleanBundled = { ...bundledStore, stocks: cleanStocks };

    await pool.query(
      'INSERT INTO value_folio_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING',
      [JSON.stringify(cleanBundled)]
    );

    // ── Migrate any existing priceTicks from the blob into the new table ─────
    // (Handles the one-time migration for existing deployments)
    const { rows } = await pool.query('SELECT data FROM value_folio_state WHERE id = 1');
    const existingData = rows[0]?.data || {};
    let migrationNeeded = false;

    for (const [sym, stock] of Object.entries(existingData.stocks || {})) {
      if (Array.isArray(stock.priceTicks) && stock.priceTicks.length > 0) {
        // Check if price_ticks table already has rows for this symbol
        const { rows: existing } = await pool.query(
          'SELECT COUNT(*)::int AS cnt FROM price_ticks WHERE symbol = $1',
          [sym]
        );
        if (existing[0].cnt === 0) {
          console.log(`📦 Migrating ${stock.priceTicks.length} ticks for ${sym} → price_ticks table`);
          await dbInsertManyTicks(sym, stock.priceTicks);
        }
        migrationNeeded = true;
      }
    }

    if (migrationNeeded) {
      // Strip priceTicks from the blob now that they're in the table
      const cleanedData = { ...existingData, stocks: {} };
      for (const [sym, stock] of Object.entries(existingData.stocks || {})) {
        const { priceTicks, ...rest } = stock; // eslint-disable-line no-unused-vars
        cleanedData.stocks[sym] = rest;
      }
      await pool.query(
        `INSERT INTO value_folio_state (id, data)
              VALUES (1, $1::jsonb)
              ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
        [JSON.stringify(cleanedData)]
      );
      console.log('✅ Migration complete: priceTicks removed from JSONB blob, now in price_ticks table');
    }

    // Seed initial ticks from bundled data for any symbol with no ticks yet
    for (const [sym, stock] of Object.entries(bundledStore.stocks || {})) {
      if (Array.isArray(stock.priceTicks) && stock.priceTicks.length > 0) {
        const { rows: existing } = await pool.query(
          'SELECT COUNT(*)::int AS cnt FROM price_ticks WHERE symbol = $1',
          [sym]
        );
        if (existing[0].cnt === 0) {
          console.log(`🌱 Seeding ${stock.priceTicks.length} initial ticks for ${sym}`);
          await dbInsertManyTicks(sym, stock.priceTicks);
        }
      }
    }
  },

  catchUpAllStocks: async () => await readStore(),

  getActiveSymbol: async () => (await readStore()).activeSymbol || '',

  setActiveSymbol: async (symbol) => {
    const store = await readStore();
    if (store.stocks[symbol]) {
      store.activeSymbol = symbol;
      await writeStore(store);
    }
    return store.activeSymbol;
  },

  getProfile: async (symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    return store.stocks[sym]?.profile || null;
  },

  updateProfile: async (updates, symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    if (store.stocks[sym]) {
      store.stocks[sym].profile = { ...store.stocks[sym].profile, ...updates };
      await writeStore(store);
      return store.stocks[sym].profile;
    }
    return null;
  },

  getSectors: async (symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    return store.stocks[sym]?.sectors || { Career: 50, Education: 50, Skills: 50, Projects: 50, Finance: 50, Social: 50, Wellbeing: 50 };
  },

  updateSectors: async (newSectors, symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    if (store.stocks[sym]) {
      store.stocks[sym].sectors = newSectors;
      await writeStore(store);
      return store.stocks[sym].sectors;
    }
    return null;
  },

  getEvents: async (symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    return store.stocks[sym]?.events || [];
  },

  addEvent: async (event, symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    const stock = store.stocks[sym];
    if (!stock) return null;

    stock.events.unshift(event);
    stock.profile.currentPrice = event.newPrice;

    if (pool) {
      // Write event tick to the dedicated table
      await dbInsertTick(sym, {
        timestamp: event.timestamp,
        price: event.newPrice,
        eventId: event.id,
        label: event.title
      });
    } else {
      // File mode: keep priceTicks in the blob
      stock.priceTicks.push({
        timestamp: event.timestamp,
        price: event.newPrice,
        eventId: event.id,
        label: event.title
      });
    }

    await writeStore(store);
    return event;
  },

  deleteEvent: async (eventId, symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    const stock = store.stocks[sym];
    if (!stock) return store;

    stock.events = stock.events.filter(e => e.id !== eventId);

    if (pool) {
      // Remove the event tick from the table
      await dbDeleteTickByEventId(eventId);

      // Determine new current price from the latest remaining tick
      const lastTick = await dbGetLastTick(sym);
      if (lastTick) {
        stock.profile.currentPrice = lastTick.price;
      } else {
        stock.profile.currentPrice = stock.profile.startingPrice;
        // Re-seed a single IPO tick so the chart has an anchor
        await dbInsertTick(sym, {
          timestamp: new Date().toISOString(),
          price: stock.profile.startingPrice,
          eventId: null,
          label: `${stock.profile.symbol} Initial Public Offering (IPO)`
        });
      }
    } else {
      // File mode
      stock.priceTicks = stock.priceTicks.filter(t => t.eventId !== eventId);

      if (stock.priceTicks.length > 0) {
        stock.profile.currentPrice = stock.priceTicks[stock.priceTicks.length - 1].price;
      } else {
        stock.profile.currentPrice = stock.profile.startingPrice;
        stock.priceTicks.push({
          timestamp: new Date().toISOString(),
          price: stock.profile.startingPrice,
          eventId: null,
          label: `${stock.profile.symbol} Initial Public Offering (IPO)`
        });
      }
    }

    await writeStore(store);
    return store;
  },

  getPriceTicks: async (symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    if (pool) {
      return await dbGetTicks(sym);
    }
    return store.stocks[sym]?.priceTicks || [];
  },

  getTrades: async (symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    return store.stocks[sym]?.trades || [];
  },

  executeTrade: async (type, shares, currentPrice, symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    const stock = store.stocks[sym];
    if (!stock) throw new Error('Stock not found');

    const cost = Number((shares * currentPrice).toFixed(2));

    if (type === 'BUY') {
      if (stock.profile.walletBalance < cost) {
        throw new Error('Insufficient virtual cash balance');
      }
      const totalCostBefore = stock.profile.sharesOwned * stock.profile.avgBuyPrice;
      const newTotalShares = stock.profile.sharesOwned + shares;
      stock.profile.walletBalance = Number((stock.profile.walletBalance - cost).toFixed(2));
      stock.profile.avgBuyPrice = Number(((totalCostBefore + cost) / newTotalShares).toFixed(2));
      stock.profile.sharesOwned = newTotalShares;
    } else if (type === 'SELL') {
      if (stock.profile.sharesOwned < shares) {
        throw new Error('Not enough shares to sell');
      }
      stock.profile.walletBalance = Number((stock.profile.walletBalance + cost).toFixed(2));
      stock.profile.sharesOwned -= shares;
      if (stock.profile.sharesOwned === 0) stock.profile.avgBuyPrice = 0;
    }

    const trade = {
      id: `trd-${Date.now()}`,
      type,
      shares,
      price: currentPrice,
      totalAmount: cost,
      timestamp: new Date().toISOString()
    };

    stock.trades.unshift(trade);
    await writeStore(store);
    return { profile: stock.profile, trade };
  },

  addMarketTick: async (newPrice, label = 'Live Market Sentiment', symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    const stock = store.stocks[sym];
    if (!stock) return null;

    const sentimentData = computeStockSentiment(stock);

    if (pool) {
      // ── Neon path: work entirely with the price_ticks table ─────────────────
      // Load ticks from table to compute metrics & circuit limits
      const priceTicks = await dbGetTicks(sym);
      const metrics = computeStockMetrics(priceTicks, { ...stock, sentiment: sentimentData });
      const clampedPrice = Math.min(Math.max(Number(newPrice), metrics.lowerCircuit), metrics.upperCircuit);

      const hitUpper = clampedPrice >= metrics.upperCircuit;
      const hitLower = clampedPrice <= metrics.lowerCircuit;

      let finalLabel = label;
      if (hitUpper) {
        finalLabel = `🔒 Upper Circuit Limit Hit (+${metrics.upperCircuitPct}%)`;
      } else if (hitLower) {
        finalLabel = `🔒 Lower Circuit Limit Hit (-${metrics.lowerCircuitPct}%)`;
      }

      stock.profile.currentPrice = clampedPrice;
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      // 30-second dedup: update the last market tick in-place instead of inserting
      const lastTick = await dbGetLastTick(sym);
      const lastTickMs = lastTick ? new Date(lastTick.timestamp).getTime() : 0;
      const prevWasCircuit = lastTick?.label?.includes('Circuit Limit Hit');

      if (lastTick && !lastTick.eventId && (nowMs - lastTickMs < 30000) && !prevWasCircuit) {
        await dbUpdateLastTickById(lastTick.id, { price: clampedPrice, timestamp: nowIso, label: finalLabel });
      } else {
        await dbInsertTick(sym, { timestamp: nowIso, price: clampedPrice, eventId: null, label: finalLabel });
      }

      // Circuit Breaker Reset — inject a synthetic anchor tick so bands re-center
      if (hitUpper || hitLower) {
        const resetLabel = hitUpper
          ? `📈 Circuit Reset — Trading Resumes from ₹${clampedPrice.toFixed(2)}`
          : `📉 Circuit Reset — Trading Resumes from ₹${clampedPrice.toFixed(2)}`;
        await dbInsertTick(sym, {
          timestamp: new Date(nowMs + 1).toISOString(),
          price: clampedPrice,
          eventId: `circuit-reset-${nowMs}`,
          label: resetLabel
        });
      }

      // Prune oldest market ticks, keeping the last MAX_MARKET_TICKS
      await dbPruneMarketTicks(sym);

      // Persist updated currentPrice in the blob
      await writeStore(store);
      return stock.profile;

    } else {
      // ── File mode: original in-memory array logic ─────────────────────────
      const metrics = computeStockMetrics(stock.priceTicks, { ...stock, sentiment: sentimentData });
      const clampedPrice = Math.min(Math.max(Number(newPrice), metrics.lowerCircuit), metrics.upperCircuit);

      const hitUpper = clampedPrice >= metrics.upperCircuit;
      const hitLower = clampedPrice <= metrics.lowerCircuit;

      let finalLabel = label;
      if (hitUpper) {
        finalLabel = `🔒 Upper Circuit Limit Hit (+${metrics.upperCircuitPct}%)`;
      } else if (hitLower) {
        finalLabel = `🔒 Lower Circuit Limit Hit (-${metrics.lowerCircuitPct}%)`;
      }

      stock.profile.currentPrice = clampedPrice;
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const lastTick = stock.priceTicks.length > 0 ? stock.priceTicks[stock.priceTicks.length - 1] : null;
      const lastTickMs = lastTick ? new Date(lastTick.timestamp).getTime() : 0;
      const prevWasCircuit = lastTick?.label?.includes('Circuit Limit Hit');

      if (lastTick && !lastTick.eventId && (nowMs - lastTickMs < 30000) && !prevWasCircuit) {
        lastTick.price = clampedPrice;
        lastTick.timestamp = nowIso;
        lastTick.label = finalLabel;
      } else {
        stock.priceTicks.push({ timestamp: nowIso, price: clampedPrice, eventId: null, label: finalLabel });
      }

      if (hitUpper || hitLower) {
        const resetLabel = hitUpper
          ? `📈 Circuit Reset — Trading Resumes from ₹${clampedPrice.toFixed(2)}`
          : `📉 Circuit Reset — Trading Resumes from ₹${clampedPrice.toFixed(2)}`;
        stock.priceTicks.push({
          timestamp: new Date(nowMs + 1).toISOString(),
          price: clampedPrice,
          eventId: `circuit-reset-${nowMs}`,
          label: resetLabel
        });
      }

      // Cap at 3000 ticks for file mode
      const MAX_TICKS = 3000;
      if (stock.priceTicks.length > MAX_TICKS) {
        const eventTicks = stock.priceTicks.filter(t => t.eventId !== null);
        const marketTicks = stock.priceTicks.filter(t => t.eventId === null);
        const keepMarket = marketTicks.slice(-(MAX_TICKS - eventTicks.length));
        stock.priceTicks = [...keepMarket, ...eventTicks].sort(
          (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );
      }

      await writeStore(store);
      return stock.profile;
    }
  },

  getAllStocks: async () => {
    const store = await readStore();
    return Object.keys(store.stocks).map(sym => {
      const stock = store.stocks[sym];
      const sentimentData = computeStockSentiment(stock);
      // In pool mode priceTicks are [] here; metrics will use startingPrice as base — fine for listing
      const metrics = computeStockMetrics(stock.priceTicks || [], { ...stock, sentiment: sentimentData });
      const startingPrice = metrics.startingPrice;
      const currentPrice = stock.profile?.currentPrice ?? metrics.currentPrice;
      const changeAmount = Number((currentPrice - startingPrice).toFixed(2));
      const changePercent = startingPrice > 0 ? Number(((changeAmount / startingPrice) * 100).toFixed(2)) : 0;

      return {
        symbol: sym,
        name: stock.profile.name,
        bio: stock.profile.bio,
        startingPrice,
        currentPrice,
        changeAmount,
        changePercent,
        walletBalance: stock.profile.walletBalance,
        sharesOwned: stock.profile.sharesOwned,
        eventsCount: stock.events.length,
        sectors: stock.sectors,
        upperCircuit: metrics.upperCircuit,
        lowerCircuit: metrics.lowerCircuit,
        upperCircuitPct: metrics.upperCircuitPct,
        lowerCircuitPct: metrics.lowerCircuitPct,
        ...sentimentData
      };
    });
  },

  getIPOs: async () => {
    const store = await readStore();
    return store.ipos || [];
  },

  createIPO: async (ipoData) => {
    const store = await readStore();
    const sym = ipoData.symbol ? ipoData.symbol.toUpperCase() : 'NEW';
    if (store.stocks[sym] || store.ipos.some(ipo => ipo.symbol === sym)) {
      throw new Error(`Ticker ${sym} is already in use`);
    }
    const sectors = ipoData.initialSectors || ipoData.sectors || { Career: 50, Education: 50, Skills: 50, Projects: 50, Finance: 50, Social: 50, Wellbeing: 50 };

    const sectorVals = Object.values(sectors);
    const avgSector = sectorVals.length > 0 ? sectorVals.reduce((a, b) => a + Number(b), 0) / sectorVals.length : 50;

    const dynamicGmp = Number(Math.min(Math.max(((avgSector - 50) * 0.5 + 10.0), -20), 100).toFixed(1));
    const gmpPercent = ipoData.gmpPercent !== undefined && ipoData.gmpPercent !== null ? Number(ipoData.gmpPercent) : dynamicGmp;

    const sentimentScore = Math.min(Math.max(Math.round(avgSector), 5), 98);
    let sentiment = 'NEUTRAL';
    if (sentimentScore >= 80) sentiment = 'VERY_BULLISH';
    else if (sentimentScore >= 60) sentiment = 'BULLISH';
    else if (sentimentScore >= 40) sentiment = 'NEUTRAL';
    else if (sentimentScore >= 20) sentiment = 'BEARISH';
    else sentiment = 'VERY_BEARISH';

    const issuePrice = Number(ipoData.startingPrice || 100);
    const gmpValue = Number((issuePrice * (gmpPercent / 100)).toFixed(2));

    const newIPO = {
      id: `ipo-${Date.now()}`,
      symbol: sym,
      name: ipoData.name || 'New Human Stock IPO',
      bio: ipoData.bio || 'Human Life Ticker',
      status: ipoData.status || 'OPEN',
      priceRange: ipoData.priceRange || `₹${issuePrice} - ₹${(issuePrice * 1.1).toFixed(0)}`,
      issuePrice,
      lotSize: Number(ipoData.lotSize || 50),
      issueSize: ipoData.issueSize || '₹50 Cr',
      gmpPercent,
      gmpValue,
      subscriptionRatio: ipoData.subscriptionRatio || '3.5x',
      bidsCount: 150,
      sentiment,
      sentimentScore,
      openingDate: ipoData.openingDate || new Date().toISOString().split('T')[0],
      closingDate: ipoData.closingDate || new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0],
      listingDate: ipoData.listingDate || new Date(Date.now() + 86400000 * 8).toISOString().split('T')[0],
      sectors
    };

    store.ipos.unshift(newIPO);

    if (newIPO.status === 'LISTED') {
      const listingPrice = Number((issuePrice * (1 + gmpPercent / 100)).toFixed(2));
      const initialTicks = [
        { timestamp: new Date().toISOString(), price: issuePrice, eventId: null, label: `${sym} Initial Public Offering (IPO)` },
        { timestamp: new Date().toISOString(), price: listingPrice, eventId: null, label: `${sym} IPO Listing Price` }
      ];

      const freshStock = {
        profile: {
          symbol: sym,
          name: newIPO.name,
          bio: newIPO.bio,
          startingPrice: issuePrice,
          listingPrice,
          currentPrice: listingPrice,
          walletBalance: 10000.00,
          sharesOwned: 0,
          avgBuyPrice: 0.00,
          apiKey: '',
          createdAt: new Date().toISOString()
        },
        sectors: newIPO.sectors,
        events: [],
        priceTicks: pool ? [] : initialTicks,
        trades: []
      };
      store.stocks[sym] = freshStock;
      store.activeSymbol = sym;

      if (pool) {
        await writeStore(store);
        await dbInsertManyTicks(sym, initialTicks);
      } else {
        await writeStore(store);
      }
    } else {
      await writeStore(store);
    }

    return newIPO;
  },

  listIPOOnExchange: async (ipoId) => {
    const store = await readStore();
    const ipo = store.ipos.find(i => i.id === ipoId);
    if (!ipo) throw new Error('IPO not found');

    ipo.status = 'LISTED';
    const sym = ipo.symbol;
    const listedPrice = Number((ipo.issuePrice * (1 + ipo.gmpPercent / 100)).toFixed(2));

    if (!store.stocks[sym]) {
      const initialTicks = [
        { timestamp: new Date().toISOString(), price: ipo.issuePrice, eventId: null, label: `${sym} IPO Issue Price` },
        { timestamp: new Date().toISOString(), price: listedPrice, eventId: null, label: `${sym} IPO Listing Day Surge (+${ipo.gmpPercent}%)` }
      ];

      store.stocks[sym] = {
        profile: {
          symbol: sym,
          name: ipo.name,
          bio: ipo.bio,
          startingPrice: ipo.issuePrice,
          listingPrice: listedPrice,
          currentPrice: listedPrice,
          walletBalance: 10000.00,
          sharesOwned: 0,
          avgBuyPrice: 0.00,
          apiKey: '',
          createdAt: new Date().toISOString()
        },
        sectors: ipo.sectors || { Career: 75, Education: 75, Skills: 75, Projects: 75, Finance: 75, Social: 75, Wellbeing: 75 },
        events: [],
        priceTicks: pool ? [] : initialTicks,
        trades: []
      };

      if (pool) {
        await dbInsertManyTicks(sym, initialTicks);
      }
    }

    store.activeSymbol = sym;
    await writeStore(store);
    return { ipo, stock: store.stocks[sym] };
  },

  bidIPO: async (ipoId, bidsCount = 1) => {
    const store = await readStore();
    const ipo = store.ipos.find(i => i.id === ipoId);
    if (!ipo) throw new Error('IPO not found');

    ipo.bidsCount = (ipo.bidsCount || 0) + Number(bidsCount);
    const subMultiplier = Math.min((ipo.bidsCount / 100).toFixed(1), 99.9);
    ipo.subscriptionRatio = `${subMultiplier}x`;

    await writeStore(store);
    return ipo;
  },

  createNewStock: async ({ symbol, name, bio, startingPrice = 100, walletBalance = 10000, initialSectors }) => {
    const store = await readStore();
    const sym = symbol ? symbol.toUpperCase() : 'NEW';
    if (store.stocks[sym]) throw new Error(`Ticker ${sym} is already listed`);

    const initialTick = {
      timestamp: new Date().toISOString(),
      price: Number(startingPrice),
      eventId: null,
      label: `${sym} Initial Public Offering (IPO)`
    };

    const freshStock = {
      profile: {
        symbol: sym,
        name: name || 'Human Stock Ticker',
        bio: bio || 'Personal Human Life Ticker.',
        startingPrice: Number(startingPrice),
        listingPrice: Number(startingPrice),
        currentPrice: Number(startingPrice),
        walletBalance: Number(walletBalance),
        sharesOwned: 0,
        avgBuyPrice: 0.00,
        apiKey: '',
        createdAt: new Date().toISOString()
      },
      sectors: initialSectors || {
        Career: 50, Education: 50, Skills: 50, Projects: 50, Finance: 50, Social: 50, Wellbeing: 50
      },
      events: [],
      priceTicks: pool ? [] : [initialTick],
      trades: []
    };

    store.stocks[sym] = freshStock;
    store.activeSymbol = sym;
    await writeStore(store);

    if (pool) {
      await dbInsertTick(sym, initialTick);
    }

    return freshStock;
  },

  clearEvents: async (symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    const stock = store.stocks[sym];
    if (!stock) return store;

    stock.events = [];
    stock.profile.currentPrice = stock.profile.startingPrice;

    if (pool) {
      // Remove all real life-event ticks; keep market & circuit-reset ticks
      await dbDeleteEventTicks(sym);
    } else {
      stock.priceTicks = stock.priceTicks.filter(t => t.eventId === null);
      if (stock.priceTicks.length === 0) {
        stock.priceTicks.push({
          timestamp: new Date().toISOString(),
          price: stock.profile.startingPrice,
          eventId: null,
          label: `${stock.profile.symbol} Initial Public Offering (IPO)`
        });
      }
    }

    await writeStore(store);
    return store;
  },

  deleteStock: async (symbol) => {
    const store = await readStore();
    const sym = String(symbol || '').trim().toUpperCase();
    if (!store.stocks?.[sym]) throw new Error(`Stock ${sym} not found`);

    delete store.stocks[sym];
    const remaining = Object.keys(store.stocks);
    store.activeSymbol = remaining.length > 0 ? remaining[0] : '';

    if (pool) {
      await dbDeleteAllTicks(sym);
    }

    await writeStore(store);
    return store;
  },

  deleteIPO: async (ipoId) => {
    const store = await readStore();
    store.ipos = (store.ipos || []).filter(i => i.id !== ipoId);
    await writeStore(store);
    return store.ipos;
  },

  pruneTodayTicks: async (symbol, keepTicks) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    const stock = store.stocks[sym];
    if (!stock) throw new Error('Stock not found');

    if (pool) {
      // Delete all of today's ticks for this symbol and re-insert only keepTicks
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      await pool.query(
        `DELETE FROM price_ticks
          WHERE symbol = $1
            AND timestamp >= $2`,
        [sym, todayStart.toISOString()]
      );

      if (Array.isArray(keepTicks) && keepTicks.length > 0) {
        await dbInsertManyTicks(sym, keepTicks);
      }

      const lastTick = await dbGetLastTick(sym);
      if (lastTick) {
        stock.profile.currentPrice = lastTick.price;
        await writeStore(store);
      }

      return keepTicks || [];
    } else {
      // File mode
      stock.priceTicks = Array.isArray(keepTicks) ? keepTicks : [];
      if (stock.priceTicks.length > 0) {
        stock.profile.currentPrice = stock.priceTicks[stock.priceTicks.length - 1].price;
      }
      await writeStore(store);
      return stock.priceTicks;
    }
  },

  resetData: async () => {
    const emptyState = { activeSymbol: '', stocks: {}, ipos: [] };
    await writeStore(emptyState);
    return emptyState;
  }
};

let operationQueue = Promise.resolve();

export const DB = new Proxy(dbMethods, {
  get(target, property) {
    const method = target[property];
    if (typeof method !== 'function') return method;
    return (...args) => {
      const operation = operationQueue.then(() => method(...args));
      operationQueue = operation.catch(() => {});
      return operation;
    };
  }
});
