/**
 * Persistent Data Store for Human Life Stock Platform
 * Stores profiles, price tick history, life events, sector scores, and virtual trading portfolios.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'store.json');

// Clean Initial Public Offering (IPO) state for SUDK — Sudeer Kumar Stock
const INITIAL_DATA = {
  profile: {
    symbol: 'SUDK',
    name: 'Sudeer Kumar',
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

function readStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_DATA, null, 2));
      return INITIAL_DATA;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading store.json, re-initializing:', err);
    return INITIAL_DATA;
  }
}

function writeStore(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing store.json:', err);
  }
}

export const DB = {
  getProfile: () => readStore().profile,
  
  updateProfile: (updates) => {
    const data = readStore();
    data.profile = { ...data.profile, ...updates };
    writeStore(data);
    return data.profile;
  },

  getSectors: () => readStore().sectors,

  updateSectors: (newSectors) => {
    const data = readStore();
    data.sectors = newSectors;
    writeStore(data);
    return data.sectors;
  },

  getEvents: () => readStore().events,

  addEvent: (event) => {
    const data = readStore();
    data.events.unshift(event);
    
    // Also record stock price tick
    data.priceTicks.push({
      timestamp: event.timestamp,
      price: event.newPrice,
      eventId: event.id,
      label: event.title
    });

    data.profile.currentPrice = event.newPrice;
    writeStore(data);
    return event;
  },

  deleteEvent: (eventId) => {
    const data = readStore();
    data.events = data.events.filter(e => e.id !== eventId);
    data.priceTicks = data.priceTicks.filter(t => t.eventId !== eventId);
    
    if (data.priceTicks.length > 0) {
      data.profile.currentPrice = data.priceTicks[data.priceTicks.length - 1].price;
    } else {
      data.profile.currentPrice = data.profile.startingPrice;
      data.priceTicks.push({
        timestamp: new Date().toISOString(),
        price: data.profile.startingPrice,
        eventId: null,
        label: `${data.profile.symbol} Initial Public Offering (IPO)`
      });
    }

    writeStore(data);
    return data;
  },

  getPriceTicks: () => readStore().priceTicks,

  getTrades: () => readStore().trades,

  executeTrade: (type, shares, currentPrice) => {
    const data = readStore();
    const cost = Number((shares * currentPrice).toFixed(2));
    
    if (type === 'BUY') {
      if (data.profile.walletBalance < cost) {
        throw new Error('Insufficient virtual cash balance');
      }
      const totalCostBefore = data.profile.sharesOwned * data.profile.avgBuyPrice;
      const newTotalShares = data.profile.sharesOwned + shares;
      data.profile.walletBalance = Number((data.profile.walletBalance - cost).toFixed(2));
      data.profile.avgBuyPrice = Number(((totalCostBefore + cost) / newTotalShares).toFixed(2));
      data.profile.sharesOwned = newTotalShares;
    } else if (type === 'SELL') {
      if (data.profile.sharesOwned < shares) {
        throw new Error('Not enough shares to sell');
      }
      data.profile.walletBalance = Number((data.profile.walletBalance + cost).toFixed(2));
      data.profile.sharesOwned -= shares;
      if (data.profile.sharesOwned === 0) data.profile.avgBuyPrice = 0;
    }

    const trade = {
      id: `trd-${Date.now()}`,
      type,
      shares,
      price: currentPrice,
      totalAmount: cost,
      timestamp: new Date().toISOString()
    };

    data.trades.unshift(trade);
    writeStore(data);
    return { profile: data.profile, trade };
  },

  addMarketTick: (newPrice, label = 'Live Market Sentiment') => {
    const data = readStore();
    data.profile.currentPrice = newPrice;
    data.priceTicks.push({
      timestamp: new Date().toISOString(),
      price: newPrice,
      eventId: null,
      label
    });
    
    writeStore(data);
    return data.profile;
  },

  createNewStock: ({ symbol, name, bio, startingPrice = 100, walletBalance = 10000, initialSectors }) => {
    const freshStock = {
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
          price: Number(startingPrice),
          eventId: null,
          label: `${symbol ? symbol.toUpperCase() : 'SUDK'} Initial Public Offering (IPO)`
        }
      ],
      trades: []
    };

    writeStore(freshStock);
    return freshStock;
  },

  clearEvents: () => {
    const data = readStore();
    data.events = [];
    data.priceTicks = data.priceTicks.filter(t => t.eventId === null);
    if (data.priceTicks.length === 0) {
      data.priceTicks.push({
        timestamp: new Date().toISOString(),
        price: data.profile.startingPrice,
        eventId: null,
        label: `${data.profile.symbol} Initial Public Offering (IPO)`
      });
    }
    data.profile.currentPrice = data.profile.startingPrice;
    writeStore(data);
    return data;
  },

  resetData: () => {
    writeStore(INITIAL_DATA);
    return INITIAL_DATA;
  }
};
