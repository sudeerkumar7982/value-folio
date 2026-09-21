/**
 * Robust Client API Layer with LocalStorage Fallback
 * Ensures 100% smooth operation whether Express server is running on port 5000 or offline.
 */
import { analyzeLifeEvent } from '../../server/ai/sentimentEngine.js';

const STORAGE_KEY = 'VALUEFOLIO_HUMAN_STOCK_V2';

const DEFAULT_STOCK = {
  profile: {
    symbol: 'SUDK',
    name: 'KALLA SUDEER KUMAR',
    bio: 'Software Engineer & Personal Life Ticker. Building human stock assets.',
    startingPrice: 100.00,
    currentPrice: 100.00,
    walletBalance: 10000.00,
    sharesOwned: 0,
    avgBuyPrice: 0.00,
    apiKey: '',
    createdAt: new Date().toISOString()
  },
  sectors: {
    Career: 0,
    Education: 0,
    Skills: 0,
    Projects: 0,
    Finance: 0,
    Social: 0,
    Wellbeing: 0
  },
  events: [],
  priceTicks: [
    {
      timestamp: new Date().toISOString(),
      price: 100.00,
      eventId: null,
      label: 'SUDK Initial Public Offering (IPO)'
    }
  ],
  trades: []
};

function getLocalStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_STOCK));
      return DEFAULT_STOCK;
    }
    const parsed = JSON.parse(raw);
    
    // Auto-wipe legacy sample events (evt-1, evt-2, ..., evt-N) if present in browser storage
    const hasLegacyEvents = parsed.events && parsed.events.some(e => {
      const id = String(e.id);
      return /^evt-\d+$/.test(id) && Number(id.replace('evt-', '')) <= 9999;
    });
    if (hasLegacyEvents) {
      parsed.events = [];
      parsed.sectors = { Career: 0, Education: 0, Skills: 0, Projects: 0, Finance: 0, Social: 0, Wellbeing: 0 };
      parsed.priceTicks = (parsed.priceTicks || []).filter(t => t.eventId === null);
      if (parsed.priceTicks.length === 0) {
        parsed.priceTicks.push({
          timestamp: new Date().toISOString(),
          price: parsed.profile?.startingPrice || 100,
          eventId: null,
          label: `${parsed.profile?.symbol || 'SUDK'} Initial Public Offering (IPO)`
        });
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
    
    return parsed;
  } catch (e) {
    return DEFAULT_STOCK;
  }
}

function saveLocalStore(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('LocalStorage write error:', e);
  }
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
  getProfile: async () => {
    // localStorage is the authoritative source for sectors, price, and priceTicks
    // (all mutations happen locally first before server sync)
    const store = getLocalStore();

    return {
      profile: store.profile,
      sectors: store.sectors,
      metrics: computeMetrics(store.priceTicks),
      priceTicks: store.priceTicks,
      eventsCount: store.events.length
    };
  },

  getEvents: async () => {
    // Return from localStorage — it is always up to date after every commit/delete
    const store = getLocalStore();
    return store.events || [];
  },

  createStock: async ({ symbol, name, bio, startingPrice = 100, walletBalance = 10000, initialSectors }) => {
    const freshStore = {
      profile: {
        symbol: symbol ? symbol.toUpperCase() : 'SUDK',
        name: name || 'Sudeer Kumar',
        bio: bio || 'Personal Human Life Ticker.',
        startingPrice: Number(startingPrice),
        currentPrice: Number(startingPrice),
        walletBalance: Number(walletBalance),
        sharesOwned: 0,
        avgBuyPrice: 0.00,
        apiKey: '',
        createdAt: new Date().toISOString()
      },
      sectors: initialSectors || {
        Career: 0, Education: 0, Skills: 0, Projects: 0, Finance: 0, Social: 0, Wellbeing: 0
      },
      events: [],
      priceTicks: [
        {
          timestamp: new Date().toISOString(),
          price: Number(startingPrice),
          eventId: null,
          label: `${symbol ? symbol.toUpperCase() : 'SUDK'} Initial Public Offering (IPO)`
        }
      ],
      trades: []
    };

    saveLocalStore(freshStore);

    try {
      await fetch('/api/stock/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, name, bio, startingPrice, walletBalance, initialSectors })
      });
    } catch (e) {}

    return freshStore;
  },

  analyzeEvent: async (title, description, sector) => {
    try {
      const res = await fetch('/api/events/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, sector })
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        return await res.json();
      }
    } catch (e) {}

    // Local Fallback AI Evaluation
    const store = getLocalStore();
    const aiResult = await analyzeLifeEvent(title, description, sector, store.profile.apiKey);
    const multiplier = 1 + (aiResult.impactPercent / 100);
    const estimatedNewPrice = Math.max(Number((store.profile.currentPrice * multiplier).toFixed(2)), 1.00);

    return {
      ...aiResult,
      currentPrice: store.profile.currentPrice,
      estimatedNewPrice,
      estimatedPriceChange: Number((estimatedNewPrice - store.profile.currentPrice).toFixed(2))
    };
  },

  commitEvent: async ({ title, description, sector, customImpact, date }) => {
    const store = getLocalStore();
    const aiResult = await analyzeLifeEvent(title, description, sector, store.profile.apiKey);
    const impactPercent = customImpact !== undefined && customImpact !== null ? Number(customImpact) : aiResult.impactPercent;

    const previousPrice = store.profile.currentPrice;
    const newPrice = Math.max(Number((previousPrice * (1 + impactPercent / 100)).toFixed(2)), 1.00);

    // Update sector
    if (aiResult.primarySector && store.sectors[aiResult.primarySector] !== undefined) {
      store.sectors[aiResult.primarySector] = Math.min(Math.max(store.sectors[aiResult.primarySector] + aiResult.sectorDelta, 0), 100);
    }

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
      timestamp: date ? new Date(date).toISOString() : new Date().toISOString()
    };

    store.events.unshift(newEvent);
    store.priceTicks.push({
      timestamp: newEvent.timestamp,
      price: newPrice,
      eventId: newEvent.id,
      label: title
    });
    store.profile.currentPrice = newPrice;

    saveLocalStore(store);

    try {
      await fetch('/api/events/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, sector, customImpact, date })
      });
    } catch (e) {}

    return {
      success: true,
      event: newEvent,
      newPrice,
      updatedSectors: store.sectors
    };
  },

  tick: async () => {
    const store = getLocalStore();
    const noise = Number((Math.random() * 0.7 - 0.35).toFixed(2));
    const newPrice = Math.max(Number((store.profile.currentPrice * (1 + noise / 100)).toFixed(2)), 1.00);

    store.profile.currentPrice = newPrice;
    store.priceTicks.push({
      timestamp: new Date().toISOString(),
      price: newPrice,
      eventId: null,
      label: noise >= 0 ? '📈 Investor Buying Movement' : '📉 Market Sentiment Noise'
    });

    if (store.priceTicks.length > 150) store.priceTicks.shift();
    saveLocalStore(store);

    try {
      await fetch('/api/stock/tick', { method: 'POST' });
    } catch (e) {}

    return {
      currentPrice: newPrice,
      noise,
      priceTicks: store.priceTicks,
      metrics: computeMetrics(store.priceTicks)
    };
  },

  deleteEvent: async (id) => {
    const store = getLocalStore();
    store.events = store.events.filter(e => e.id !== id);
    store.priceTicks = store.priceTicks.filter(t => t.eventId !== id);

    if (store.priceTicks.length > 0) {
      store.profile.currentPrice = store.priceTicks[store.priceTicks.length - 1].price;
    } else {
      store.profile.currentPrice = store.profile.startingPrice;
      store.priceTicks.push({
        timestamp: new Date().toISOString(),
        price: store.profile.startingPrice,
        eventId: null,
        label: `${store.profile.symbol} Initial Public Offering (IPO)`
      });
    }

    saveLocalStore(store);

    try {
      await fetch('/api/events/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
    } catch (e) {}

    return store;
  },

  clearEvents: async () => {
    const store = getLocalStore();
    store.events = [];
    store.priceTicks = store.priceTicks.filter(t => t.eventId === null);
    if (store.priceTicks.length === 0) {
      store.priceTicks.push({
        timestamp: new Date().toISOString(),
        price: store.profile.startingPrice,
        eventId: null,
        label: `${store.profile.symbol} Initial Public Offering (IPO)`
      });
    }
    store.profile.currentPrice = store.profile.startingPrice;
    saveLocalStore(store);

    try {
      await fetch('/api/events/clear', { method: 'POST' });
    } catch (e) {}

    return store;
  },

  reset: async () => {
    localStorage.removeItem(STORAGE_KEY);
    saveLocalStore(DEFAULT_STOCK);

    try {
      await fetch('/api/reset', { method: 'POST' });
    } catch (e) {}

    return DEFAULT_STOCK;
  }
};
