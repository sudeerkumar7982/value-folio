/**
 * Persistent Data Store for ValueFolio Human Life Stock Platform
 * Supports Multi-Stock Exchange, Human IPO Bidding & Listing
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { computeStockMetrics } from '../engine/priceEngine.js';

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

async function readStore() {
  if (pool) {
    const { rows } = await pool.query('SELECT data FROM value_folio_state WHERE id = 1');
    return rows[0]?.data || INITIAL_DATA;
  }

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
      return initialData;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const store = JSON.parse(raw);

    if (!store.stocks) {
      const migrated = {
        activeSymbol: store.activeSymbol || '',
        stocks: {},
        ipos: store.ipos || []
      };
      await writeStore(migrated);
      return migrated;
    }

    return store;
  } catch (err) {
    console.error('Error reading store.json, re-initializing:', err);
    return INITIAL_DATA;
  }
}

async function writeStore(data) {
  if (pool) {
    await pool.query(
      `INSERT INTO value_folio_state (id, data)
       VALUES (1, $1::jsonb)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [JSON.stringify(data)]
    );
    return;
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

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

const dbMethods = {
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
    await pool.query(
      'INSERT INTO value_folio_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING',
      [JSON.stringify(readBundledStore())]
    );
  },

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
    stock.priceTicks.push({
      timestamp: event.timestamp,
      price: event.newPrice,
      eventId: event.id,
      label: event.title
    });
    stock.profile.currentPrice = event.newPrice;

    await writeStore(store);
    return event;
  },

  deleteEvent: async (eventId, symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    const stock = store.stocks[sym];
    if (!stock) return store;

    stock.events = stock.events.filter(e => e.id !== eventId);
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

    await writeStore(store);
    return store;
  },

  getPriceTicks: async (symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
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
    const metrics = computeStockMetrics(stock.priceTicks, { ...stock, sentiment: sentimentData });
    const clampedPrice = Math.min(Math.max(Number(newPrice), metrics.lowerCircuit), metrics.upperCircuit);

    let finalLabel = label;
    if (clampedPrice >= metrics.upperCircuit) {
      finalLabel = `🔒 Upper Circuit Limit Hit (+${metrics.upperCircuitPct}%)`;
    } else if (clampedPrice <= metrics.lowerCircuit) {
      finalLabel = `🔒 Lower Circuit Limit Hit (-${metrics.lowerCircuitPct}%)`;
    }

    stock.profile.currentPrice = clampedPrice;
    const nowIso = new Date().toISOString();
    const currentMin = nowIso.slice(0, 16);
    const lastTick = stock.priceTicks.length > 0 ? stock.priceTicks[stock.priceTicks.length - 1] : null;

    if (lastTick && !lastTick.eventId && lastTick.timestamp && lastTick.timestamp.startsWith(currentMin)) {
      lastTick.price = clampedPrice;
      lastTick.timestamp = nowIso;
      lastTick.label = finalLabel;
    } else {
      stock.priceTicks.push({
        timestamp: nowIso,
        price: clampedPrice,
        eventId: null,
        label: finalLabel
      });
    }

    await writeStore(store);
    return stock.profile;
  },

  getAllStocks: async () => {
    const store = await readStore();
    return Object.keys(store.stocks).map(sym => {
      const stock = store.stocks[sym];
      const sentimentData = computeStockSentiment(stock);
      const metrics = computeStockMetrics(stock.priceTicks, { ...stock, sentiment: sentimentData });
      const startingPrice = metrics.startingPrice;
      const currentPrice = metrics.currentPrice;
      const changeAmount = metrics.totalChangeAmount;
      const changePercent = metrics.totalChangePercent;

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
    
    // Dynamically calculate initial GMP % and Sentiment Score based on sector ratings
    const sectorVals = Object.values(sectors);
    const avgSector = sectorVals.length > 0 ? sectorVals.reduce((a, b) => a + Number(b), 0) / sectorVals.length : 50;
    
    // Formula: (avgSector - 50) * 0.5 + 10.0 (clamped between -20% and 100%)
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
      store.stocks[sym] = {
        profile: {
          symbol: sym,
          name: newIPO.name,
          bio: newIPO.bio,
          startingPrice: newIPO.issuePrice,
          listingPrice: Number((newIPO.issuePrice * (1 + newIPO.gmpPercent / 100)).toFixed(2)),
          currentPrice: Number((newIPO.issuePrice * (1 + newIPO.gmpPercent / 100)).toFixed(2)),
          walletBalance: 10000.00,
          sharesOwned: 0,
          avgBuyPrice: 0.00,
          apiKey: '',
          createdAt: new Date().toISOString()
        },
        sectors: newIPO.sectors,
        events: [],
        priceTicks: [
          {
            timestamp: new Date().toISOString(),
            price: newIPO.issuePrice,
            eventId: null,
            label: `${sym} Initial Public Offering (IPO)`
          },
          {
            timestamp: new Date().toISOString(),
            price: Number((newIPO.issuePrice * (1 + newIPO.gmpPercent / 100)).toFixed(2)),
            eventId: null,
            label: `${sym} IPO Listing Price`
          }
        ],
        trades: []
      };
      store.activeSymbol = sym;
    }

    await writeStore(store);
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
        priceTicks: [
          {
            timestamp: new Date().toISOString(),
            price: ipo.issuePrice,
            eventId: null,
            label: `${sym} IPO Issue Price`
          },
          {
            timestamp: new Date().toISOString(),
            price: listedPrice,
            eventId: null,
            label: `${sym} IPO Listing Day Surge (+${ipo.gmpPercent}%)`
          }
        ],
        trades: []
      };
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
      priceTicks: [
        {
          timestamp: new Date().toISOString(),
          price: Number(startingPrice),
          eventId: null,
          label: `${sym} Initial Public Offering (IPO)`
        }
      ],
      trades: []
    };

    store.stocks[sym] = freshStock;
    store.activeSymbol = sym;
    await writeStore(store);
    return freshStock;
  },

  clearEvents: async (symbol) => {
    const store = await readStore();
    const sym = symbol || store.activeSymbol;
    const stock = store.stocks[sym];
    if (!stock) return store;

    stock.events = [];
    stock.priceTicks = stock.priceTicks.filter(t => t.eventId === null);
    if (stock.priceTicks.length === 0) {
      stock.priceTicks.push({
        timestamp: new Date().toISOString(),
        price: stock.profile.startingPrice,
        eventId: null,
        label: `${stock.profile.symbol} Initial Public Offering (IPO)`
      });
    }
    stock.profile.currentPrice = stock.profile.startingPrice;
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
    await writeStore(store);
    return store;
  },

  deleteIPO: async (ipoId) => {
    const store = await readStore();
    store.ipos = (store.ipos || []).filter(i => i.id !== ipoId);
    await writeStore(store);
    return store.ipos;
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
