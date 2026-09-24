/**
 * Client API Layer with LocalStorage & Express Backend Sync
 * Supports ValueFolio Multi-Stock Exchange and Human IPO Launchpad
 */
import { analyzeLifeEvent } from '../../server/ai/sentimentEngine.js';

const STORAGE_KEY = 'VALUEFOLIO_MULTI_STOCK_V8';

const DEFAULT_STORE = {
  activeSymbol: '',
  stocks: {},
  ipos: []
};

function getLocalStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_STORE));
      return DEFAULT_STORE;
    }
    const store = JSON.parse(raw);

    if (!store.stocks) {
      const migrated = {
        activeSymbol: store.activeSymbol || '',
        stocks: {},
        ipos: store.ipos || []
      };
      saveLocalStore(migrated);
      return migrated;
    }

    return store;
  } catch (e) {
    return DEFAULT_STORE;
  }
}

function saveLocalStore(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('LocalStorage write error:', e);
  }
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

  events.forEach(e => {
    if (e.sentiment === 'POSITIVE' || e.impactPercent > 0) posCount++;
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

function computeMetrics(priceTicks) {
  if (!priceTicks || priceTicks.length === 0) {
    return {
      currentPrice: 100, startingPrice: 100, previousPrice: 100,
      changeAmount: 0, changePercent: 0, totalChangeAmount: 0, totalChangePercent: 0,
      highPrice: 100, lowPrice: 100, totalEvents: 0
    };
  }
  const prices = priceTicks.map(p => p.price);
  const currentPrice = prices[prices.length - 1];
  const startingPrice = prices[0];
  const previousPrice = prices.length > 1 ? prices[prices.length - 2] : startingPrice;

  const changeAmount = Number((currentPrice - previousPrice).toFixed(2));
  const changePercent = Number(((changeAmount / previousPrice) * 100).toFixed(2));
  const totalChangeAmount = Number((currentPrice - startingPrice).toFixed(2));
  const totalChangePercent = Number(((totalChangeAmount / startingPrice) * 100).toFixed(2));

  return {
    currentPrice,
    startingPrice,
    previousPrice,
    changeAmount,
    changePercent,
    totalChangeAmount,
    totalChangePercent,
    highPrice: Math.max(...prices),
    lowPrice: Math.min(...prices),
    totalEvents: priceTicks.filter(h => h.eventId !== null).length
  };
}

export const API = {
  getAllStocks: async () => {
    try {
      const res = await fetch('/api/stocks');
      if (res.ok) return await res.json();
    } catch (e) {}

    const store = getLocalStore();
    return Object.keys(store.stocks).map(sym => {
      const stock = store.stocks[sym];
      const sentimentData = computeStockSentiment(stock);
      const startingPrice = stock.profile.startingPrice;
      const currentPrice = stock.profile.currentPrice;
      const changeAmount = Number((currentPrice - startingPrice).toFixed(2));
      const changePercent = Number(((changeAmount / startingPrice) * 100).toFixed(2));

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
        ...sentimentData
      };
    });
  },

  getActiveSymbol: async () => {
    try {
      const res = await fetch('/api/stocks/active');
      if (res.ok) {
        const data = await res.json();
        return data.activeSymbol;
      }
    } catch (e) {}

    const store = getLocalStore();
    return store.activeSymbol || '';
  },

  setActiveSymbol: async (symbol) => {
    const store = getLocalStore();
    if (store.stocks[symbol]) {
      store.activeSymbol = symbol;
      saveLocalStore(store);
    }

    try {
      await fetch('/api/stocks/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });
    } catch (e) {}

    return store.activeSymbol;
  },

  deleteStock: async (symbol) => {
    const store = getLocalStore();
    if (store.stocks && store.stocks[symbol]) {
      delete store.stocks[symbol];
      const remaining = Object.keys(store.stocks);
      store.activeSymbol = remaining.length > 0 ? remaining[0] : '';
      saveLocalStore(store);
    }

    try {
      await fetch('/api/stocks/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });
    } catch (e) {}

    return store;
  },

  getProfile: async (symbol = null) => {
    try {
      const symQuery = symbol ? `?symbol=${symbol}` : '';
      const res = await fetch(`/api/stock/profile${symQuery}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.profile) return data;
      }
    } catch (e) {}

    const store = getLocalStore();
    const stockKeys = Object.keys(store.stocks || {});
    let sym = symbol || store.activeSymbol;
    if (!sym || !store.stocks[sym]) {
      sym = stockKeys.length > 0 ? stockKeys[0] : '';
    }

    const stock = store.stocks[sym];
    if (!stock) return null;

    return {
      profile: stock.profile,
      sectors: stock.sectors,
      metrics: computeMetrics(stock.priceTicks),
      priceTicks: stock.priceTicks || [],
      eventsCount: stock.events ? stock.events.length : 0,
      sentiment: computeStockSentiment(stock)
    };
  },

  getEvents: async (symbol = null) => {
    try {
      const symQuery = symbol ? `?symbol=${symbol}` : '';
      const res = await fetch(`/api/events${symQuery}`);
      if (res.ok) return await res.json();
    } catch (e) {}

    const store = getLocalStore();
    const stockKeys = Object.keys(store.stocks || {});
    let sym = symbol || store.activeSymbol;
    if (!sym || !store.stocks[sym]) {
      sym = stockKeys.length > 0 ? stockKeys[0] : '';
    }

    const stock = store.stocks[sym];
    return stock ? stock.events || [] : [];
  },

  getIPOs: async () => {
    try {
      const res = await fetch('/api/ipos');
      if (res.ok) return await res.json();
    } catch (e) {}

    const store = getLocalStore();
    return store.ipos || [];
  },

  createIPO: async (ipoData) => {
    const store = getLocalStore();
    const sym = ipoData.symbol ? ipoData.symbol.toUpperCase() : 'NEW';
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
      store.stocks[sym] = {
        profile: {
          symbol: sym,
          name: newIPO.name,
          bio: newIPO.bio,
          startingPrice: newIPO.issuePrice,
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
          }
        ],
        trades: []
      };
      store.activeSymbol = sym;
    }

    saveLocalStore(store);

    try {
      await fetch('/api/ipos/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ipoData)
      });
    } catch (e) {}

    return newIPO;
  },

  listIPOOnExchange: async (ipoId) => {
    const store = getLocalStore();
    const ipo = store.ipos.find(i => i.id === ipoId);
    if (ipo) {
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
            { timestamp: new Date().toISOString(), price: ipo.issuePrice, eventId: null, label: `${sym} IPO Issue Price` },
            { timestamp: new Date().toISOString(), price: listedPrice, eventId: null, label: `${sym} IPO Listing Day Surge (+${ipo.gmpPercent}%)` }
          ],
          trades: []
        };
      }

      store.activeSymbol = sym;
      saveLocalStore(store);
    }

    try {
      await fetch('/api/ipos/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ipoId })
      });
    } catch (e) {}

    return store;
  },

  bidIPO: async (ipoId, bidsCount = 1) => {
    const store = getLocalStore();
    const ipo = store.ipos.find(i => i.id === ipoId);
    if (ipo) {
      ipo.bidsCount = (ipo.bidsCount || 0) + bidsCount;
      const subMultiplier = Math.min((ipo.bidsCount / 100).toFixed(1), 99.9);
      ipo.subscriptionRatio = `${subMultiplier}x`;
      saveLocalStore(store);
    }

    try {
      await fetch('/api/ipos/bid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ipoId, bidsCount })
      });
    } catch (e) {}

    return ipo;
  },

  deleteIPO: async (ipoId) => {
    const store = getLocalStore();
    store.ipos = (store.ipos || []).filter(i => i.id !== ipoId);
    saveLocalStore(store);

    try {
      await fetch('/api/ipos/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ipoId })
      });
    } catch (e) {}

    return store.ipos;
  },

  createStock: async ({ symbol, name, bio, startingPrice = 100, walletBalance = 10000, initialSectors }) => {
    const store = getLocalStore();
    const sym = symbol ? symbol.toUpperCase() : 'NEW';

    const freshStock = {
      profile: {
        symbol: sym,
        name: name || 'Human Stock Ticker',
        bio: bio || 'Personal Human Life Ticker.',
        startingPrice: Number(startingPrice),
        currentPrice: Number(startingPrice),
        walletBalance: Number(walletBalance),
        sharesOwned: 0,
        avgBuyPrice: 0.00,
        apiKey: '',
        createdAt: new Date().toISOString()
      },
      sectors: initialSectors || { Career: 50, Education: 50, Skills: 50, Projects: 50, Finance: 50, Social: 50, Wellbeing: 50 },
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
    saveLocalStore(store);

    try {
      await fetch('/api/stock/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym, name, bio, startingPrice, walletBalance, initialSectors })
      });
    } catch (e) {}

    return freshStock;
  },

  analyzeEvent: async (title, description, sector, symbol = null) => {
    const store = getLocalStore();
    const activeSym = symbol || store.activeSymbol || '';
    let activeStock = activeSym ? store.stocks[activeSym] : null;
    if (!activeStock && store.stocks) {
      const keys = Object.keys(store.stocks);
      if (keys.length > 0) activeStock = store.stocks[keys[0]];
    }

    try {
      const res = await fetch('/api/events/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, sector, symbol: activeSym })
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        return await res.json();
      }
    } catch (e) {}

    const apiKey = activeStock?.profile?.apiKey || '';
    const currentPrice = activeStock?.profile?.currentPrice || 100;

    const aiResult = await analyzeLifeEvent(title, description, sector, apiKey);
    const multiplier = 1 + (aiResult.impactPercent / 100);
    const estimatedNewPrice = Math.max(Number((currentPrice * multiplier).toFixed(2)), 1.00);

    return {
      ...aiResult,
      currentPrice,
      estimatedNewPrice,
      estimatedPriceChange: Number((estimatedNewPrice - currentPrice).toFixed(2))
    };
  },

  commitEvent: async ({ title, description, sector, customImpact, date, symbol }) => {
    const store = getLocalStore();
    const sym = symbol || store.activeSymbol || '';

    // Attempt Express server POST first if connected to backend
    try {
      const res = await fetch('/api/events/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, sector, customImpact, date, symbol: sym })
      });
      if (res.ok) {
        const serverData = await res.json();
        // Sync local storage store if stock exists locally
        const stockKey = sym || store.activeSymbol;
        if (stockKey && store.stocks[stockKey]) {
          const stock = store.stocks[stockKey];
          if (serverData.event) stock.events.unshift(serverData.event);
          if (serverData.newPrice) {
            stock.profile.currentPrice = serverData.newPrice;
            stock.priceTicks.push({
              timestamp: serverData.event?.timestamp || new Date().toISOString(),
              price: serverData.newPrice,
              eventId: serverData.event?.id || `evt-${Date.now()}`,
              label: title
            });
          }
          if (serverData.updatedSectors) stock.sectors = serverData.updatedSectors;
          saveLocalStore(store);
        }
        return serverData;
      } else {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.error) {
          return { success: false, error: errJson.error };
        }
      }
    } catch (e) {
      console.warn('Backend server commitEvent unavailable, falling back to local store:', e);
    }

    // LocalStorage Fallback Logic
    let stockKey = sym;
    if (!stockKey || !store.stocks[stockKey]) {
      stockKey = store.activeSymbol;
    }
    if (!stockKey || !store.stocks[stockKey]) {
      const keys = Object.keys(store.stocks || {});
      if (keys.length > 0) stockKey = keys[0];
    }

    const stock = store.stocks ? store.stocks[stockKey] : null;
    if (!stock) {
      return { success: false, error: 'No stock available to commit event. Please create a stock first.' };
    }

    const aiResult = await analyzeLifeEvent(title, description, sector, stock.profile?.apiKey || '');
    const impactPercent = customImpact !== undefined && customImpact !== null ? Number(customImpact) : aiResult.impactPercent;

    const previousPrice = stock.profile.currentPrice || 100;
    const newPrice = Math.max(Number((previousPrice * (1 + impactPercent / 100)).toFixed(2)), 1.00);

    if (aiResult.primarySector && stock.sectors && stock.sectors[aiResult.primarySector] !== undefined) {
      stock.sectors[aiResult.primarySector] = Math.min(Math.max(stock.sectors[aiResult.primarySector] + aiResult.sectorDelta, 0), 100);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const eventTimestamp = (date && date !== todayStr)
      ? new Date(date).toISOString()
      : new Date().toISOString();

    const newEvent = {
      id: `life-${Date.now()}`,
      title,
      description: description || '',
      sector: aiResult.primarySector,
      sentiment: aiResult.sentiment,
      confidence: aiResult.confidence,
      importance: aiResult.importance,
      impactPercent,
      previousPrice,
      newPrice,
      timestamp: eventTimestamp
    };

    stock.events.unshift(newEvent);
    stock.priceTicks.push({
      timestamp: newEvent.timestamp,
      price: newPrice,
      eventId: newEvent.id,
      label: title
    });
    stock.profile.currentPrice = newPrice;

    saveLocalStore(store);

    return {
      success: true,
      event: newEvent,
      newPrice,
      updatedSectors: stock.sectors
    };
  },

  tick: async () => {
    const store = getLocalStore();
    const sym = store.activeSymbol || '';
    const stock = store.stocks[sym];
    if (!stock) return null;

    const noise = Number((Math.random() * 0.7 - 0.35).toFixed(2));
    const newPrice = Math.max(Number((stock.profile.currentPrice * (1 + noise / 100)).toFixed(2)), 1.00);

    stock.profile.currentPrice = newPrice;
    stock.priceTicks.push({
      timestamp: new Date().toISOString(),
      price: newPrice,
      eventId: null,
      label: noise >= 0 ? '📈 Investor Buying Movement' : '📉 Market Sentiment Noise'
    });

    saveLocalStore(store);

    try {
      await fetch('/api/stock/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym })
      });
    } catch (e) {}

    return {
      currentPrice: newPrice,
      noise,
      priceTicks: stock.priceTicks,
      metrics: computeMetrics(stock.priceTicks)
    };
  },

  deleteEvent: async (id) => {
    const store = getLocalStore();
    const sym = store.activeSymbol || '';
    const stock = store.stocks[sym];
    if (!stock) return store;

    stock.events = stock.events.filter(e => e.id !== id);
    stock.priceTicks = stock.priceTicks.filter(t => t.eventId !== id);

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

    saveLocalStore(store);

    try {
      await fetch('/api/events/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, symbol: sym })
      });
    } catch (e) {}

    return store;
  },

  clearEvents: async () => {
    const store = getLocalStore();
    const sym = store.activeSymbol || '';
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
    saveLocalStore(store);

    try {
      await fetch('/api/events/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym })
      });
    } catch (e) {}

    return store;
  },

  reset: async () => {
    localStorage.removeItem(STORAGE_KEY);
    saveLocalStore(DEFAULT_STORE);

    try {
      await fetch('/api/reset', { method: 'POST' });
    } catch (e) {}

    return DEFAULT_STORE;
  }
};
