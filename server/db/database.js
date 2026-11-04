/**
 * Persistent Data Store for ValueFolio Human Life Stock Platform
 * Supports Multi-Stock Exchange, Human IPO Bidding & Listing
 *
 * Storage architecture (Neon/pool mode):
 *   - value_folio_state: JSONB blob for profile, sectors, events, trades (NO priceTicks)
 *   - price_ticks: one row per market/event tick
 *
 * The in-memory state/tick caches keep reads available during brief database
 * outages; writes are retried and storage errors are surfaced to callers.
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
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      keepAlive: true
    })
  : null;

const INITIAL_DATA = {
  activeSymbol: '',
  stocks: {},
  ipos: []
};

// Keep a full day of one-second market ticks in the live cache.
const MAX_MARKET_TICKS = 86400;

// ── In-memory tick cache ───────────────────────────────────────────────────────
// Acts as primary live-chart data source. Populated every tick regardless of
// whether the Neon write succeeds. On server restart it resets, but Neon ticks
// (from before the outage) are merged back in via getPriceTicks.
const tickCache = {}; // { [symbol]: Tick[] }
const marketTickCounts = {};
let cachedStore = null;

function getCacheTicks(symbol) {
  return tickCache[symbol] || [];
}

function addCacheTick(symbol, tick) {
  if (!tickCache[symbol]) tickCache[symbol] = [];
  const arr = tickCache[symbol];
  arr.push(tick);
  if (!tick.eventId) marketTickCounts[symbol] = (marketTickCounts[symbol] || 0) + 1;
  // Prune in batches to avoid scanning the full-day cache on every tick.
  if (marketTickCounts[symbol] > MAX_MARKET_TICKS + 1000) {
    const events = arr.filter(t => t.eventId);
    const market = arr.filter(t => !t.eventId).slice(-MAX_MARKET_TICKS);
    tickCache[symbol] = [...market, ...events].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
    marketTickCounts[symbol] = market.length;
  }
}

// ── DB tick enqueue for batch writes ───────────────────────────────────────
const pendingDbTicks = {};
function enqueueDbTick(symbol, tick) {
  if (!pendingDbTicks[symbol]) pendingDbTicks[symbol] = [];
  pendingDbTicks[symbol].push(tick);
  const pending = pendingDbTicks[symbol];
  if (pending.length > MAX_MARKET_TICKS + 1000) {
    const events = pending.filter(item => item.eventId);
    const market = pending.filter(item => !item.eventId).slice(-MAX_MARKET_TICKS);
    pendingDbTicks[symbol] = [...market, ...events];
  }
}
let flushingDbTicks = false;
async function waitForTickFlush() {
  while (flushingDbTicks) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function flushPendingDbTicks() {
  if (flushingDbTicks) return;
  flushingDbTicks = true;
  const symbols = Object.keys(pendingDbTicks);
  try {
    for (const sym of symbols) {
      const ticks = pendingDbTicks[sym];
      if (!ticks || ticks.length === 0) continue;
      const batch = ticks.slice(0, 1000);
      try {
        await dbInsertManyTicks(sym, batch);
        pendingDbTicks[sym].splice(0, batch.length);
      } catch (err) {
        console.warn(`[flushPendingDbTicks] DB write failed for ${sym}; ${ticks.length} ticks retained for retry: ${err.message}`);
      }
    }
  } finally {
    flushingDbTicks = false;
  }
}
if (pool) {
  setInterval(flushPendingDbTicks, 15000);
}
async function shutdown() {
  await waitForTickFlush();
  while (true) {
    const pendingBefore = Object.values(pendingDbTicks)
      .reduce((total, ticks) => total + ticks.length, 0);
    if (pendingBefore === 0) break;

    await flushPendingDbTicks();

    const pendingAfter = Object.values(pendingDbTicks)
      .reduce((total, ticks) => total + ticks.length, 0);
    if (pendingAfter >= pendingBefore) {
      console.error(`[shutdown] Could not flush ${pendingAfter} queued price ticks; they remain unpersisted.`);
      break;
    }
  }
  if (pendingStoreWrite) {
    try {
      await writeStoreNow(pendingStoreWrite);
    } catch (err) {
      console.error('[shutdown] Deferred state write failed:', err.message);
    }
  }
  if (pool) await pool.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Seed cache from DB ticks on first getPriceTicks call per symbol
const cacheSeedDone = {};

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
  const rows = ticks.map(tick => ({
    timestamp: tick.timestamp,
    price: tick.price,
    eventId: tick.eventId || null,
    label: tick.label || ''
  }));
  await pool.query(
    `INSERT INTO price_ticks (symbol, timestamp, price, event_id, label)
     SELECT $1, tick.timestamp, tick.price, tick."eventId", tick.label
       FROM jsonb_to_recordset($2::jsonb)
         AS tick(timestamp TIMESTAMPTZ, price NUMERIC(16,4), "eventId" TEXT, label TEXT)
     ON CONFLICT DO NOTHING`,
    [symbol, JSON.stringify(rows)]
  );
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
    return { activeSymbol: store.activeSymbol || '', stocks: {}, ipos: store.ipos || [] };
  } catch (err) {
    console.error('Error reading bundled store.json:', err);
    return INITIAL_DATA;
  }
}

// ── Core store read / write ───────────────────────────────────────────────────

async function readStore() {
  let store;
  if (pool) {
    if (cachedStore) return cachedStore;
    try {
      const { rows } = await pool.query('SELECT data FROM value_folio_state WHERE id = 1');
      store = rows[0]?.data || INITIAL_DATA;
    } catch (err) {
      throw new Error(`Persistent database read failed: ${err.message}`);
    }
    // Ensure no stale priceTicks arrays live in the blob (pool mode: table only)
    if (store.stocks) {
      for (const sym of Object.keys(store.stocks)) {
        store.stocks[sym].priceTicks = [];
      }
    }
    cachedStore = store;
    return cachedStore;
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
      throw new Error(`Persistent file store could not be read: ${err.message}`);
    }

    // Seamlessly bridge any time gap when server was sleeping or offline (file mode only)
    if (catchUpStoreStocks(store)) {
      writeStore(store).catch(err => console.error('Error persisting catch-up ticks:', err));
    }
  }

  return store;
}

/**
 * Persist state to Neon. priceTicks are NEVER written to the blob —
 * they live in the price_ticks table (or in-memory cache as fallback).
 * High-frequency price updates are persisted on a bounded schedule; failed
 * writes remain queued for retry instead of being silently discarded.
 */
let writeStoreTimeout = null;
let pendingStoreWrite = null;
function scheduleStoreWrite() {
  if (writeStoreTimeout) return;
  writeStoreTimeout = setTimeout(async () => {
    writeStoreTimeout = null;
    const snapshot = pendingStoreWrite;
    pendingStoreWrite = null;
    if (!snapshot) return;
    try {
      await writeStoreNow(snapshot);
    } catch (err) {
      console.error('[writeStore] Deferred state write failed; retaining it for retry:', err.message);
      pendingStoreWrite = pendingStoreWrite || snapshot;
      scheduleStoreWrite();
    }
  }, 5000);
}

function persistStore(data) {
  writeStore(data);
}

async function writeStore(data) {
  pendingStoreWrite = JSON.parse(JSON.stringify(data));
  scheduleStoreWrite();
}

/** Immediate (non-debounced) write — use for IPO/stock creation/deletion where data must persist NOW. */
async function writeStoreNow(data) {
  if (writeStoreTimeout) { clearTimeout(writeStoreTimeout); writeStoreTimeout = null; }
  pendingStoreWrite = null;
  if (pool) {
    const cleanStocks = {};
    for (const [sym, stock] of Object.entries(data.stocks || {})) {
      const { priceTicks, ...stockWithoutTicks } = stock; // eslint-disable-line no-unused-vars
      cleanStocks[sym] = stockWithoutTicks;
    }
    const cleanData = { ...data, stocks: cleanStocks };
    try {
      await pool.query(
        `INSERT INTO value_folio_state (id, data)
              VALUES (1, $1::jsonb)
              ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
        [JSON.stringify(cleanData)]
      );
      if (!cachedStore) cachedStore = data;
    } catch (err) {
      pendingStoreWrite = pendingStoreWrite || JSON.parse(JSON.stringify(data));
      scheduleStoreWrite();
      throw new Error(`Persistent database write failed: ${err.message}`);
    }
  } else {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  }
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
  events.forEach(e => {
    if (e.sentiment === 'POSITIVE' || e.impactPercent > 0) posCount++;
  });

  const positiveRatio = Math.round((posCount / events.length) * 100);
  const priceChangePercent = ((currentPrice - startingPrice) / startingPrice) * 100;

  let sentimentScore = Math.round(50 + (positiveRatio - 50) * 0.4 + Math.min(Math.max(priceChangePercent * 1.2, -25), 25));
  sentimentScore = Math.min(Math.max(sentimentScore, 5), 98);

  let sentiment = 'NEUTRAL';
  let sentimentLabel = 'Neutral ⚖️';
  if (sentimentScore >= 80) { sentiment = 'VERY_BULLISH'; sentimentLabel = 'Very Bullish 🔥'; }
  else if (sentimentScore >= 60) { sentiment = 'BULLISH'; sentimentLabel = 'Bullish 📈'; }
  else if (sentimentScore >= 40) { sentiment = 'NEUTRAL'; sentimentLabel = 'Neutral ⚖️'; }
  else if (sentimentScore >= 20) { sentiment = 'BEARISH'; sentimentLabel = 'Bearish 📉'; }
  else { sentiment = 'VERY_BEARISH'; sentimentLabel = 'Very Bearish 🔻'; }

  return { sentiment, sentimentScore, sentimentLabel, positiveRatio, totalEvents: events.length };
}

// ── DB method implementations ─────────────────────────────────────────────────

const dbMethods = {
  healthCheck: async () => {
    if (pool) await pool.query('SELECT 1');
    return true;
  },

  compactPriceHistory: async () => {
    if (!pool) return 0;
    await waitForTickFlush();
    const result = await pool.query(`
      WITH aged_ticks AS (
        SELECT id, symbol, timestamp, price,
          CASE
            WHEN timestamp < NOW() - INTERVAL '365 days' THEN 'hour'
            WHEN timestamp < NOW() - INTERVAL '30 days' THEN '15 minutes'
            ELSE 'minute'
          END AS resolution,
          CASE
            WHEN timestamp < NOW() - INTERVAL '365 days'
              THEN date_bin(INTERVAL '1 hour', timestamp, TIMESTAMPTZ '2000-01-01')
            WHEN timestamp < NOW() - INTERVAL '30 days'
              THEN date_bin(INTERVAL '15 minutes', timestamp, TIMESTAMPTZ '2000-01-01')
            ELSE date_bin(INTERVAL '1 minute', timestamp, TIMESTAMPTZ '2000-01-01')
          END AS bucket
        FROM price_ticks
        WHERE timestamp < NOW() - INTERVAL '24 hours'
          AND (event_id IS NULL OR event_id LIKE 'circuit-reset-%')
      ),
      ranked_ticks AS (
        SELECT id,
          ROW_NUMBER() OVER (PARTITION BY symbol, resolution, bucket ORDER BY timestamp, id) AS first_rank,
          ROW_NUMBER() OVER (PARTITION BY symbol, resolution, bucket ORDER BY timestamp DESC, id DESC) AS last_rank,
          ROW_NUMBER() OVER (PARTITION BY symbol, resolution, bucket ORDER BY price, timestamp, id) AS low_rank,
          ROW_NUMBER() OVER (PARTITION BY symbol, resolution, bucket ORDER BY price DESC, timestamp, id) AS high_rank
        FROM aged_ticks
      )
      DELETE FROM price_ticks ticks
      USING ranked_ticks ranked
      WHERE ticks.id = ranked.id
        AND ranked.first_rank > 1
        AND ranked.last_rank > 1
        AND ranked.low_rank > 1
        AND ranked.high_rank > 1
    `);
    Object.keys(tickCache).forEach(sym => {
      delete tickCache[sym];
      delete marketTickCounts[sym];
      delete cacheSeedDone[sym];
    });
    return result.rowCount;
  },

  initialize: async () => {
    if (process.env.NODE_ENV === 'production' && !pool) {
      throw new Error('DATABASE_URL must be configured in production for persistent storage');
    }
    if (!pool) return;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS value_folio_state (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        data JSONB NOT NULL
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS price_ticks (
        id        BIGSERIAL PRIMARY KEY,
        symbol    TEXT          NOT NULL,
        timestamp TIMESTAMPTZ   NOT NULL,
        price     NUMERIC(16,4) NOT NULL,
        event_id  TEXT,
        label     TEXT
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_price_ticks_symbol_ts
        ON price_ticks (symbol, timestamp DESC)
    `);
    const { rows: dedupeIndex } = await pool.query(
      `SELECT 1 FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = 'idx_price_ticks_symbol_ts_event'`
    );
    if (dedupeIndex.length === 0) {
      await pool.query(`
        DELETE FROM price_ticks older
         USING price_ticks newer
         WHERE older.id < newer.id
           AND older.symbol = newer.symbol
           AND older.timestamp = newer.timestamp
           AND COALESCE(older.event_id, '') = COALESCE(newer.event_id, '')
      `);
      await pool.query(`
        CREATE UNIQUE INDEX idx_price_ticks_symbol_ts_event
          ON price_ticks (symbol, timestamp, (COALESCE(event_id, '')))
      `);
    }

    const bundledStore = readBundledStore();
    const cleanStocks = {};
    for (const [sym, stock] of Object.entries(bundledStore.stocks || {})) {
      const { priceTicks, ...rest } = stock;
      cleanStocks[sym] = rest;
    }
    const cleanBundled = { ...bundledStore, stocks: cleanStocks };
    await pool.query(
      'INSERT INTO value_folio_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING',
      [JSON.stringify(cleanBundled)]
    );

    // Migrate chart ticks before removing them from the legacy state blob.
    const { rows: stateRows } = await pool.query('SELECT data FROM value_folio_state WHERE id = 1');
    const existingData = stateRows[0]?.data;
    if (existingData?.stocks) {
      for (const [sym, stock] of Object.entries(existingData.stocks)) {
        if (Array.isArray(stock.priceTicks) && stock.priceTicks.length > 0) {
          await dbInsertManyTicks(sym, stock.priceTicks);
        }
      }

      const cleanedData = { ...existingData, stocks: {} };
      for (const [sym, stock] of Object.entries(existingData.stocks)) {
        const { priceTicks, ...rest } = stock;
        cleanedData.stocks[sym] = rest;
      }
      await pool.query(
        `UPDATE value_folio_state SET data = $1::jsonb WHERE id = 1`,
        [JSON.stringify(cleanedData)]
      );
    }

    // ── Migrate any ticks from bundled store into price_ticks (best-effort) ──
    try {
      const bundledStore = readBundledStore();
      for (const [sym, stock] of Object.entries(bundledStore.stocks || {})) {
        if (Array.isArray(stock.priceTicks) && stock.priceTicks.length > 0) {
          const { rows: existing } = await pool.query(
            'SELECT COUNT(*)::int AS cnt FROM price_ticks WHERE symbol = $1',
            [sym]
          );
          if (existing[0].cnt === 0) {
            console.log(`📦 Seeding ${stock.priceTicks.length} ticks for ${sym} → price_ticks table`);
            await dbInsertManyTicks(sym, stock.priceTicks);
          }
        }
      }
    } catch (err) {
      console.warn('[initialize] Tick seeding skipped (storage full?):', err.message);
    }
  },

  catchUpAllStocks: async () => await readStore(),

  getActiveSymbol: async () => (await readStore()).activeSymbol || '',

  setActiveSymbol: async (symbol) => {
    const store = await readStore();
    if (store.stocks[symbol]) {
      store.activeSymbol = symbol;
      await writeStoreNow(store);
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
      await writeStoreNow(store);
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
      await writeStoreNow(store);
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

    const tick = { timestamp: event.timestamp, price: event.newPrice, eventId: event.id, label: event.title };

    if (pool) {
      addCacheTick(sym, tick);
      enqueueDbTick(sym, tick);
    } else {
      stock.priceTicks.push(tick);
    }

    await writeStoreNow(store);
    return event;
  },

  updateEvent: async (eventId, updates, symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    const stock = store.stocks[sym];
    if (!stock) return null;

    const event = stock.events.find(item => item.id === eventId);
    if (!event) return null;

    if (pool) {
      await waitForTickFlush();
      await pool.query(
        'UPDATE price_ticks SET label = $1 WHERE symbol = $2 AND event_id = $3',
        [updates.title, sym, eventId]
      );
    }

    event.title = updates.title;
    event.description = updates.description;

    if (pool) {
      tickCache[sym]?.forEach(tick => {
        if (tick.eventId === eventId) tick.label = event.title;
      });
      pendingDbTicks[sym]?.forEach(tick => {
        if (tick.eventId === eventId) tick.label = event.title;
      });
    } else {
      stock.priceTicks?.forEach(tick => {
        if (tick.eventId === eventId) tick.label = event.title;
      });
    }

    await writeStoreNow(store);
    return event;
  },

  deleteEvent: async (eventId, symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    const stock = store.stocks[sym];
    if (!stock) return store;

    if (pool) {
      await waitForTickFlush();
      await dbDeleteTickByEventId(eventId);
      pendingDbTicks[sym] = (pendingDbTicks[sym] || []).filter(tick => tick.eventId !== eventId);
    }
    stock.events = stock.events.filter(e => e.id !== eventId);

    if (pool) {
      if (tickCache[sym]) {
        tickCache[sym] = tickCache[sym].filter(t => t.eventId !== eventId);
        marketTickCounts[sym] = tickCache[sym].filter(t => !t.eventId).length;
      }

      // Determine new current price
      const allTicks = await dbMethods.getPriceTicks(sym);
      if (allTicks.length > 0) {
        stock.profile.currentPrice = allTicks[allTicks.length - 1].price;
      } else {
        stock.profile.currentPrice = stock.profile.startingPrice;
        const ipoTick = { timestamp: new Date().toISOString(), price: stock.profile.startingPrice, eventId: null, label: `${stock.profile.symbol} Initial Public Offering (IPO)` };
        addCacheTick(sym, ipoTick);
        enqueueDbTick(sym, ipoTick);
      }
    } else {
      stock.priceTicks = stock.priceTicks.filter(t => t.eventId !== eventId);
      if (stock.priceTicks.length > 0) {
        stock.profile.currentPrice = stock.priceTicks[stock.priceTicks.length - 1].price;
      } else {
        stock.profile.currentPrice = stock.profile.startingPrice;
        stock.priceTicks.push({ timestamp: new Date().toISOString(), price: stock.profile.startingPrice, eventId: null, label: `${stock.profile.symbol} Initial Public Offering (IPO)` });
      }
    }

    await writeStoreNow(store);
    return store;
  },

  getPriceTicks: async (symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;

    if (pool) {
      const nowMs = Date.now();

      // ── Seed cache from DB on first call per symbol (or if cache is empty) ──
      const cacheEmpty = !tickCache[sym] || tickCache[sym].length === 0;
      if (!cacheSeedDone[sym] || cacheEmpty) {
        cacheSeedDone[sym] = true;
        try {
          const dbTicks = await dbGetTicks(sym);
          const stockData = store.stocks[sym] || {};
          const lastKnownPrice =
            dbTicks[dbTicks.length - 1]?.price ||
            stockData.profile?.currentPrice ||
            100;

          const mockStock = {
            priceTicks: [...dbTicks],
            profile: {
              currentPrice: lastKnownPrice,
              startingPrice: stockData.profile?.startingPrice || lastKnownPrice,
              listingPrice:  stockData.profile?.listingPrice  || lastKnownPrice,
              symbol: sym
            },
            events: stockData.events || [],
            sectors: stockData.sectors || {}
          };

          // Always fill rich intraday history first (handles 0-tick case)
          ensureRichIntradayHistory(mockStock, nowMs);
          // Then catch up any gap since the last tick
          simulateCatchUpTicks(mockStock, nowMs);

          // Update the profile price to match simulation result
          if (stockData.profile) {
            stockData.profile.currentPrice = mockStock.profile.currentPrice;
          }

          // Use the fully-enriched tick array as the live cache
          tickCache[sym] = mockStock.priceTicks;
          marketTickCounts[sym] = tickCache[sym].filter(tick => !tick.eventId).length;

          // Best-effort: persist the newly generated gap-fill ticks to DB
          const dbTsSet = new Set(dbTicks.map(t => t.timestamp));
          const gapTicks = mockStock.priceTicks.filter(t => !dbTsSet.has(t.timestamp) && !t.eventId);
          if (gapTicks.length > 0) {
            dbInsertManyTicks(sym, gapTicks).catch(() => {/* storage full — ok, cache is primary */});
          }

          console.log(`[getPriceTicks] ${sym}: seeded ${dbTicks.length} DB ticks + ${gapTicks.length} gap-fill ticks into cache`);
        } catch (err) {
          console.warn('[getPriceTicks] cache seed failed:', err.message);
        }
      }

      // ── All subsequent calls: return cache ────────────────────────────────────
      const cacheTicks = getCacheTicks(sym);
      return cacheTicks.length > 0 ? cacheTicks : [];
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
      if (stock.profile.walletBalance < cost) throw new Error('Insufficient virtual cash balance');
      const totalCostBefore = stock.profile.sharesOwned * stock.profile.avgBuyPrice;
      const newTotalShares = stock.profile.sharesOwned + shares;
      stock.profile.walletBalance = Number((stock.profile.walletBalance - cost).toFixed(2));
      stock.profile.avgBuyPrice = Number(((totalCostBefore + cost) / newTotalShares).toFixed(2));
      stock.profile.sharesOwned = newTotalShares;
    } else if (type === 'SELL') {
      if (stock.profile.sharesOwned < shares) throw new Error('Not enough shares to sell');
      stock.profile.walletBalance = Number((stock.profile.walletBalance + cost).toFixed(2));
      stock.profile.sharesOwned -= shares;
      if (stock.profile.sharesOwned === 0) stock.profile.avgBuyPrice = 0;
    }

    const trade = { id: `trd-${Date.now()}`, type, shares, price: currentPrice, totalAmount: cost, timestamp: new Date().toISOString() };
    stock.trades.unshift(trade);
    await writeStoreNow(store);
    return { profile: stock.profile, trade };
  },

  addMarketTick: async (newPrice, label = 'Live Market Sentiment', symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    const stock = store.stocks[sym];
    if (!stock) return null;

    const sentimentData = computeStockSentiment(stock);

    if (pool) {
      // ── Pool mode: in-memory cache is primary; DB is best-effort ─────────────
      // Trigger cache seed (loads DB ticks + gap-fill simulation) on first tick
      // if getPriceTicks hasn't been called yet, OR if cache is empty (server restarted).
      const cacheIsEmpty = !tickCache[sym] || tickCache[sym].length === 0;
      if (!cacheSeedDone[sym] || cacheIsEmpty) {
        try { await dbMethods.getPriceTicks(sym); } catch (_) { /* best-effort */ }
      }
      const priceTicks = getCacheTicks(sym);
      const metrics = computeStockMetrics(priceTicks, { ...stock, sentiment: sentimentData });
      const clampedPrice = Math.min(Math.max(Number(newPrice), metrics.lowerCircuit), metrics.upperCircuit);

      const hitUpper = clampedPrice >= metrics.upperCircuit;
      const hitLower = clampedPrice <= metrics.lowerCircuit;
      let finalLabel = label;
      if (hitUpper) finalLabel = `🔒 Upper Circuit Limit Hit (+${metrics.upperCircuitPct}%)`;
      else if (hitLower) finalLabel = `🔒 Lower Circuit Limit Hit (-${metrics.lowerCircuitPct}%)`;

      stock.profile.currentPrice = clampedPrice;
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      // ── 1. Always update the in-memory cache (guaranteed to work) ────────────
      const cacheTicks = getCacheTicks(sym);
      const lastCache = cacheTicks.length > 0 ? cacheTicks[cacheTicks.length - 1] : null;
      const lastCacheMs = lastCache ? new Date(lastCache.timestamp).getTime() : 0;
      const prevWasCircuit = lastCache?.label?.includes('Circuit Limit Hit');

      if (lastCache && !lastCache.eventId && (nowMs - lastCacheMs < 900) && !prevWasCircuit) {
        // Replace duplicate scheduler runs, but retain one chart point per second.
        lastCache.price = clampedPrice;
        lastCache.timestamp = nowIso;
        lastCache.label = finalLabel;
      } else {
        addCacheTick(sym, { timestamp: nowIso, price: clampedPrice, eventId: null, label: finalLabel });
      }

      if (hitUpper || hitLower) {
        const resetLabel = hitUpper
          ? `📈 Circuit Reset — Trading Resumes from ₹${clampedPrice.toFixed(2)}`
          : `📉 Circuit Reset — Trading Resumes from ₹${clampedPrice.toFixed(2)}`;
        addCacheTick(sym, { timestamp: new Date(nowMs + 1).toISOString(), price: clampedPrice, eventId: `circuit-reset-${nowMs}`, label: resetLabel });
      }

      // ── 2. Enqueue DB writes (batch every 15s) ───────────────────────────────────────
      // Queue tick for DB write; flushed periodically
      enqueueDbTick(sym, { timestamp: nowIso, price: clampedPrice, eventId: null, label: finalLabel });
      if (hitUpper || hitLower) {
        const resetLabel = hitUpper
          ? `📈 Circuit Reset — Trading Resumes from ₹${clampedPrice.toFixed(2)}`
          : `📉 Circuit Reset — Trading Resumes from ₹${clampedPrice.toFixed(2)}`;
        enqueueDbTick(sym, { timestamp: new Date(nowMs + 1).toISOString(), price: clampedPrice, eventId: `circuit-reset-${nowMs}`, label: resetLabel });
      }
      // Note: DB writes are batched; cache ensures chart continuity even if Neon is full.

      // Persist currentPrice periodically without writing the state blob each second.
      persistStore(store);
      return stock.profile;

    } else {
      // ── File mode: original in-memory array logic ──────────────────────────
      const metrics = computeStockMetrics(stock.priceTicks, { ...stock, sentiment: sentimentData });
      const clampedPrice = Math.min(Math.max(Number(newPrice), metrics.lowerCircuit), metrics.upperCircuit);

      const hitUpper = clampedPrice >= metrics.upperCircuit;
      const hitLower = clampedPrice <= metrics.lowerCircuit;
      let finalLabel = label;
      if (hitUpper) finalLabel = `🔒 Upper Circuit Limit Hit (+${metrics.upperCircuitPct}%)`;
      else if (hitLower) finalLabel = `🔒 Lower Circuit Limit Hit (-${metrics.lowerCircuitPct}%)`;

      stock.profile.currentPrice = clampedPrice;
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const lastTick = stock.priceTicks.length > 0 ? stock.priceTicks[stock.priceTicks.length - 1] : null;
      const lastTickMs = lastTick ? new Date(lastTick.timestamp).getTime() : 0;
      const prevWasCircuit = lastTick?.label?.includes('Circuit Limit Hit');

      if (lastTick && !lastTick.eventId && (nowMs - lastTickMs < 900) && !prevWasCircuit) {
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
        stock.priceTicks.push({ timestamp: new Date(nowMs + 1).toISOString(), price: clampedPrice, eventId: `circuit-reset-${nowMs}`, label: resetLabel });
      }

      const MAX_TICKS = 43200;
      if (stock.priceTicks.length > MAX_TICKS) {
        const eventTicks = stock.priceTicks.filter(t => t.eventId !== null);
        const marketTicks = stock.priceTicks.filter(t => t.eventId === null);
        const keepMarket = marketTicks.slice(-(MAX_TICKS - eventTicks.length));
        stock.priceTicks = [...keepMarket, ...eventTicks].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      }

      persistStore(store);
      return stock.profile;
    }
  },

  getAllStocks: async () => {
    const store = await readStore();
    return Object.keys(store.stocks).map(sym => {
      const stock = store.stocks[sym];
      const sentimentData = computeStockSentiment(stock);
      // Use profile.currentPrice (kept live by addMarketTick) for listing
      const currentPrice = stock.profile?.currentPrice ?? 100;
      const startingPrice = stock.profile?.startingPrice ?? 100;
      const changeAmount = Number((currentPrice - startingPrice).toFixed(2));
      const changePercent = startingPrice > 0 ? Number(((changeAmount / startingPrice) * 100).toFixed(2)) : 0;
      const metrics = computeStockMetrics(stock.priceTicks || [], { ...stock, sentiment: sentimentData });

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
      id: `ipo-${Date.now()}`, symbol: sym, name: ipoData.name || 'New Human Stock IPO',
      bio: ipoData.bio || 'Human Life Ticker', status: ipoData.status || 'OPEN',
      priceRange: ipoData.priceRange || `₹${issuePrice} - ₹${(issuePrice * 1.1).toFixed(0)}`,
      issuePrice, lotSize: Number(ipoData.lotSize || 50), issueSize: ipoData.issueSize || '₹50 Cr',
      gmpPercent, gmpValue, subscriptionRatio: ipoData.subscriptionRatio || '3.5x', bidsCount: 150,
      sentiment, sentimentScore,
      openingDate: ipoData.openingDate || new Date().toISOString().split('T')[0],
      closingDate: ipoData.closingDate || new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0],
      listingDate: ipoData.listingDate || new Date(Date.now() + 86400000 * 8).toISOString().split('T')[0],
      sectors
    };
    store.ipos.unshift(newIPO);

    if (newIPO.status === 'LISTED') {
      const listingPrice = Number((issuePrice * (1 + gmpPercent / 100)).toFixed(2));
      const issueTimestamp = new Date();
      const initialTicks = [
        { timestamp: issueTimestamp.toISOString(), price: issuePrice, eventId: null, label: `${sym} Initial Public Offering (IPO)` },
        { timestamp: new Date(issueTimestamp.getTime() + 1).toISOString(), price: listingPrice, eventId: null, label: `${sym} IPO Listing Price` }
      ];
      const freshStock = {
        profile: { symbol: sym, name: newIPO.name, bio: newIPO.bio, startingPrice: issuePrice, listingPrice, currentPrice: listingPrice, walletBalance: 10000.00, sharesOwned: 0, avgBuyPrice: 0.00, apiKey: '', createdAt: new Date().toISOString() },
        sectors: newIPO.sectors, events: [], priceTicks: pool ? [] : initialTicks, trades: []
      };
      store.stocks[sym] = freshStock;
      store.activeSymbol = sym;
      if (pool) {
        tickCache[sym] = initialTicks;
        marketTickCounts[sym] = initialTicks.filter(tick => !tick.eventId).length;
        initialTicks.forEach(tick => enqueueDbTick(sym, tick));
      }
    }
    await writeStoreNow(store); // Immediate write — IPO must appear instantly in DB
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
      const issueTimestamp = new Date();
      const initialTicks = [
        { timestamp: issueTimestamp.toISOString(), price: ipo.issuePrice, eventId: null, label: `${sym} IPO Issue Price` },
        { timestamp: new Date(issueTimestamp.getTime() + 1).toISOString(), price: listedPrice, eventId: null, label: `${sym} IPO Listing Day Surge (+${ipo.gmpPercent}%)` }
      ];
      store.stocks[sym] = {
        profile: { symbol: sym, name: ipo.name, bio: ipo.bio, startingPrice: ipo.issuePrice, listingPrice: listedPrice, currentPrice: listedPrice, walletBalance: 10000.00, sharesOwned: 0, avgBuyPrice: 0.00, apiKey: '', createdAt: new Date().toISOString() },
        sectors: ipo.sectors || { Career: 75, Education: 75, Skills: 75, Projects: 75, Finance: 75, Social: 75, Wellbeing: 75 },
        events: [], priceTicks: pool ? [] : initialTicks, trades: []
      };
      if (pool) {
        tickCache[sym] = initialTicks;
        marketTickCounts[sym] = initialTicks.filter(tick => !tick.eventId).length;
        initialTicks.forEach(tick => enqueueDbTick(sym, tick));
      }
    }
    store.activeSymbol = sym;
    await writeStoreNow(store); // Immediate write — stock listing must persist now
    return { ipo, stock: store.stocks[sym] };
  },

  bidIPO: async (ipoId, bidsCount = 1) => {
    const store = await readStore();
    const ipo = store.ipos.find(i => i.id === ipoId);
    if (!ipo) throw new Error('IPO not found');
    ipo.bidsCount = (ipo.bidsCount || 0) + Number(bidsCount);
    const subMultiplier = Math.min((ipo.bidsCount / 100).toFixed(1), 99.9);
    ipo.subscriptionRatio = `${subMultiplier}x`;
    await writeStoreNow(store);
    return ipo;
  },

  createNewStock: async ({ symbol, name, bio, startingPrice = 100, walletBalance = 10000, initialSectors }) => {
    const store = await readStore();
    const sym = symbol ? symbol.toUpperCase() : 'NEW';
    if (store.stocks[sym]) throw new Error(`Ticker ${sym} is already listed`);

    const initialTick = { timestamp: new Date().toISOString(), price: Number(startingPrice), eventId: null, label: `${sym} Initial Public Offering (IPO)` };
    const freshStock = {
      profile: { symbol: sym, name: name || 'Human Stock Ticker', bio: bio || 'Personal Human Life Ticker.', startingPrice: Number(startingPrice), listingPrice: Number(startingPrice), currentPrice: Number(startingPrice), walletBalance: Number(walletBalance), sharesOwned: 0, avgBuyPrice: 0.00, apiKey: '', createdAt: new Date().toISOString() },
      sectors: initialSectors || { Career: 50, Education: 50, Skills: 50, Projects: 50, Finance: 50, Social: 50, Wellbeing: 50 },
      events: [], priceTicks: pool ? [] : [initialTick], trades: []
    };
    store.stocks[sym] = freshStock;
    store.activeSymbol = sym;
    await writeStoreNow(store); // Immediate — new stock must be visible right away
    if (pool) {
      tickCache[sym] = [initialTick];
      marketTickCounts[sym] = 1;
      enqueueDbTick(sym, initialTick);
    }
    return freshStock;
  },

  clearEvents: async (symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    const stock = store.stocks[sym];
    if (!stock) return store;

    if (pool) {
      await waitForTickFlush();
      await dbDeleteEventTicks(sym);
      pendingDbTicks[sym] = (pendingDbTicks[sym] || []).filter(
        tick => !tick.eventId || String(tick.eventId).startsWith('circuit-reset')
      );
    }
    stock.events = [];
    stock.profile.currentPrice = stock.profile.startingPrice;

    if (pool) {
      if (tickCache[sym]) {
        tickCache[sym] = tickCache[sym].filter(t => !t.eventId || String(t.eventId).startsWith('circuit-reset'));
        marketTickCounts[sym] = tickCache[sym].filter(t => !t.eventId).length;
      }
    } else {
      stock.priceTicks = stock.priceTicks.filter(t => t.eventId === null);
      if (stock.priceTicks.length === 0) {
        stock.priceTicks.push({ timestamp: new Date().toISOString(), price: stock.profile.startingPrice, eventId: null, label: `${stock.profile.symbol} Initial Public Offering (IPO)` });
      }
    }
    persistStore(store);
    return store;
  },

  deleteStock: async (symbol) => {
    const store = await readStore();
    const sym = String(symbol || '').trim().toUpperCase();
    if (!store.stocks?.[sym]) throw new Error(`Stock ${sym} not found`);

    if (pool) {
      await waitForTickFlush();
      await dbDeleteAllTicks(sym);
    }
    delete pendingDbTicks[sym];
    delete store.stocks[sym];
    delete tickCache[sym];
    delete marketTickCounts[sym];
    delete cacheSeedDone[sym];
    const remaining = Object.keys(store.stocks);
    store.activeSymbol = remaining.length > 0 ? remaining[0] : '';
    await writeStoreNow(store); // Immediate — deletion must be visible right away
    return store;
  },

  deleteIPO: async (ipoId) => {
    const store = await readStore();
    store.ipos = (store.ipos || []).filter(i => i.id !== ipoId);
    await writeStoreNow(store); // Immediate — deletion must be visible right away
    return store.ipos;
  },

  pruneTodayTicks: async (symbol, keepTicks) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    const stock = store.stocks[sym];
    if (!stock) throw new Error('Stock not found');

    if (pool) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Update in-memory cache
      if (tickCache[sym]) {
        tickCache[sym] = tickCache[sym].filter(t => new Date(t.timestamp).getTime() < todayStart.getTime());
        marketTickCounts[sym] = tickCache[sym].filter(tick => !tick.eventId).length;
      }
      if (Array.isArray(keepTicks)) {
        keepTicks.forEach(t => addCacheTick(sym, t));
      }

      await pool.query('DELETE FROM price_ticks WHERE symbol = $1 AND timestamp >= $2', [sym, todayStart.toISOString()]);
      if (Array.isArray(keepTicks) && keepTicks.length > 0) {
        await dbInsertManyTicks(sym, keepTicks);
      }

      const lastTick = await dbMethods.getPriceTicks(sym);
      if (lastTick.length > 0) {
        stock.profile.currentPrice = lastTick[lastTick.length - 1].price;
        await writeStoreNow(store);
      }
      return keepTicks || [];
    } else {
      stock.priceTicks = Array.isArray(keepTicks) ? keepTicks : [];
      if (stock.priceTicks.length > 0) {
        stock.profile.currentPrice = stock.priceTicks[stock.priceTicks.length - 1].price;
      }
      await writeStoreNow(store);
      return stock.priceTicks;
    }
  },

  resetData: async () => {
    const emptyState = { activeSymbol: '', stocks: {}, ipos: [] };
    await waitForTickFlush();
    if (pool) {
      if (writeStoreTimeout) clearTimeout(writeStoreTimeout);
      writeStoreTimeout = null;
      pendingStoreWrite = null;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('TRUNCATE TABLE price_ticks');
        await client.query(
          `INSERT INTO value_folio_state (id, data)
           VALUES (1, $1::jsonb)
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
          [JSON.stringify(emptyState)]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Database reset failed: ${err.message}`);
      } finally {
        client.release();
      }
    } else {
      await writeStoreNow(emptyState);
    }
    Object.keys(tickCache).forEach(k => delete tickCache[k]);
    Object.keys(marketTickCounts).forEach(k => delete marketTickCounts[k]);
    Object.keys(cacheSeedDone).forEach(k => delete cacheSeedDone[k]);
    Object.keys(pendingDbTicks).forEach(k => delete pendingDbTicks[k]);
    if (writeStoreTimeout) clearTimeout(writeStoreTimeout);
    writeStoreTimeout = null;
    pendingStoreWrite = null;
    cachedStore = emptyState;
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
