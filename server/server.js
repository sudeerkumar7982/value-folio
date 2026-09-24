import express from 'express';
import cors from 'cors';
import { DB } from './db/database.js';
import { analyzeLifeEvent } from './ai/sentimentEngine.js';
import { calculateNewPrice, calculateSectorUpdates, computeStockMetrics } from './engine/priceEngine.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve static frontend assets from Vite build dist folder
app.use(express.static(path.join(__dirname, '../dist')));

// Get all listed stocks with sentiment scores & metrics
app.get('/api/stocks', (req, res) => {
  try {
    const stocks = DB.getAllStocks();
    res.json(stocks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get/Set active stock symbol
app.get('/api/stocks/active', (req, res) => {
  try {
    res.json({ activeSymbol: DB.getActiveSymbol() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stocks/active', (req, res) => {
  try {
    const { symbol } = req.body;
    if (!symbol) return res.status(400).json({ error: 'Symbol required' });
    const active = DB.setActiveSymbol(symbol);
    res.json({ activeSymbol: active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stocks/delete', (req, res) => {
  try {
    const { symbol } = req.body;
    if (!symbol) return res.status(400).json({ error: 'Symbol required' });
    const result = DB.deleteStock(symbol);
    res.json({ success: true, store: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get complete profile for active or specific stock
app.get('/api/stock/profile', (req, res) => {
  try {
    const symbol = req.query.symbol || DB.getActiveSymbol();
    const profile = DB.getProfile(symbol);
    const sectors = DB.getSectors(symbol);
    const priceTicks = DB.getPriceTicks(symbol);
    const events = DB.getEvents(symbol);
    const metrics = computeStockMetrics(priceTicks);

    res.json({
      profile,
      sectors,
      metrics,
      priceTicks,
      eventsCount: events.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- IPO ENDPOINTS (ValueFolio Launchpad) ---
app.get('/api/ipos', (req, res) => {
  try {
    res.json(DB.getIPOs());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ipos/create', (req, res) => {
  try {
    const newIPO = DB.createIPO(req.body);
    res.json(newIPO);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ipos/list', (req, res) => {
  try {
    const { ipoId } = req.body;
    if (!ipoId) return res.status(400).json({ error: 'ipoId is required' });
    const result = DB.listIPOOnExchange(ipoId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ipos/bid', (req, res) => {
  try {
    const { ipoId, bidsCount } = req.body;
    if (!ipoId) return res.status(400).json({ error: 'ipoId is required' });
    const updated = DB.bidIPO(ipoId, bidsCount || 1);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ipos/delete', (req, res) => {
  try {
    const { ipoId } = req.body;
    if (!ipoId) return res.status(400).json({ error: 'ipoId is required' });
    const ipos = DB.deleteIPO(ipoId);
    res.json({ success: true, ipos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete single news event
app.post('/api/events/delete', (req, res) => {
  try {
    const { id, symbol } = req.body;
    if (!id) return res.status(400).json({ error: 'Event ID required' });
    const data = DB.deleteEvent(id, symbol);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all newsfeed events
app.post('/api/events/clear', (req, res) => {
  try {
    const { symbol } = req.body;
    const data = DB.clearEvents(symbol);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get life newsfeed events
app.get('/api/events', (req, res) => {
  try {
    const symbol = req.query.symbol || DB.getActiveSymbol();
    const events = DB.getEvents(symbol);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Live AI Preview endpoint for life event analysis
app.post('/api/events/analyze', async (req, res) => {
  try {
    const { title, description, sector, symbol } = req.body;
    let targetSym = symbol || DB.getActiveSymbol();
    let profile = DB.getProfile(targetSym);

    if (!profile) {
      const all = DB.getAllStocks();
      if (all.length > 0) {
        targetSym = all[0].symbol;
        profile = DB.getProfile(targetSym);
      }
    }

    const currentPrice = profile ? profile.currentPrice : 100;
    const apiKey = profile ? profile.apiKey : '';

    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Event title is required' });
    }

    const aiResult = await analyzeLifeEvent(title, description, sector, apiKey);
    const estimatedNewPrice = calculateNewPrice(currentPrice, aiResult.impactPercent);

    res.json({
      ...aiResult,
      currentPrice,
      estimatedNewPrice,
      estimatedPriceChange: Number((estimatedNewPrice - currentPrice).toFixed(2))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Commit life event to market history
app.post('/api/events/commit', async (req, res) => {
  try {
    const { title, description, sector, customImpact, date, symbol } = req.body;
    let targetSym = symbol || DB.getActiveSymbol();
    let profile = DB.getProfile(targetSym);

    if (!targetSym || !profile) {
      const allStocks = DB.getAllStocks();
      if (allStocks.length > 0) {
        targetSym = allStocks[0].symbol;
        profile = DB.getProfile(targetSym);
      }
    }

    if (!targetSym || !profile) {
      return res.status(400).json({ error: 'No active stock found on exchange. Please create or list a stock first.' });
    }

    if (!title) return res.status(400).json({ error: 'Title required' });

    // Analyze AI sentiment
    const aiResult = await analyzeLifeEvent(title, description, sector, profile.apiKey || '');
    const impactPercent = customImpact !== undefined && customImpact !== null ? Number(customImpact) : aiResult.impactPercent;

    const previousPrice = profile.currentPrice;
    const newPrice = calculateNewPrice(previousPrice, impactPercent);

    // Update Sector Scores
    const currentSectors = DB.getSectors(targetSym);
    const updatedSectors = calculateSectorUpdates(currentSectors, aiResult.primarySector, aiResult.sectorDelta);
    DB.updateSectors(updatedSectors, targetSym);

    const todayStr = new Date().toISOString().split('T')[0];
    const eventTimestamp = (date && date !== todayStr)
      ? new Date(date).toISOString()
      : new Date().toISOString();

    // Save Event
    const newEvent = {
      id: `evt-${Date.now()}`,
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

    DB.addEvent(newEvent, targetSym);

    res.json({
      success: true,
      event: newEvent,
      newPrice,
      updatedSectors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Execute virtual trading order
app.post('/api/trade', (req, res) => {
  try {
    const { type, shares, symbol } = req.body;
    const targetSym = symbol || DB.getActiveSymbol();
    const profile = DB.getProfile(targetSym);

    if (!['BUY', 'SELL'].includes(type)) return res.status(400).json({ error: 'Invalid trade type' });
    if (!shares || shares <= 0) return res.status(400).json({ error: 'Shares must be > 0' });

    const result = DB.executeTrade(type, Number(shares), profile.currentPrice, targetSym);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get user trades
app.get('/api/trades', (req, res) => {
  try {
    const symbol = req.query.symbol || DB.getActiveSymbol();
    res.json(DB.getTrades(symbol));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Profile settings
app.post('/api/settings', (req, res) => {
  try {
    const { symbol, ...updates } = req.body;
    const targetSym = symbol || DB.getActiveSymbol();
    const updated = DB.updateProfile(updates, targetSym);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Issue New Human Stock IPO Endpoint
app.post('/api/stock/create', (req, res) => {
  try {
    const { symbol, name, bio, startingPrice, walletBalance, initialSectors } = req.body;
    if (!symbol || !name) {
      return res.status(400).json({ error: 'Ticker symbol and name are required' });
    }

    const freshStock = DB.createNewStock({
      symbol,
      name,
      bio,
      startingPrice: startingPrice || 100,
      walletBalance: walletBalance || 10000,
      initialSectors
    });

    res.json(freshStock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Live Market Fluctuation Tick Endpoint
app.post('/api/stock/tick', (req, res) => {
  try {
    const symbol = req.body.symbol || DB.getActiveSymbol();
    const profile = DB.getProfile(symbol);
    const sectors = DB.getSectors(symbol);
    const events = DB.getEvents(symbol);
    const stockData = { profile, sectors, events };
    
    // Import or compute stock sentiment score
    const eventsArr = events || [];
    let posCount = 0;
    eventsArr.forEach(e => {
      if (e.sentiment === 'POSITIVE' || e.impactPercent > 0) posCount++;
    });
    const positiveRatio = eventsArr.length > 0 ? Math.round((posCount / eventsArr.length) * 100) : 50;
    const priceChangePercent = profile ? ((profile.currentPrice - profile.startingPrice) / profile.startingPrice) * 100 : 0;
    let sentimentScore = Math.round(50 + (positiveRatio - 50) * 0.4 + Math.min(Math.max(priceChangePercent * 1.2, -25), 25));
    sentimentScore = Math.min(Math.max(sentimentScore, 5), 98);

    const sentimentBias = (sentimentScore - 50) / 100 * 0.4;
    const randomNoise = (Math.random() * 0.5 - 0.25);
    const noise = Number((sentimentBias + randomNoise).toFixed(3));

    const newPrice = calculateNewPrice(profile ? profile.currentPrice : 100, noise);
    const label = noise > 0.1 ? '🔥 Bullish Sentiment Buying' : noise < -0.1 ? '🔻 Bearish Market Selling' : '⚖️ Neutral Fluctuation';

    DB.addMarketTick(newPrice, label, symbol);

    const priceTicks = DB.getPriceTicks(symbol);
    const metrics = computeStockMetrics(priceTicks);

    res.json({
      currentPrice: newPrice,
      noise,
      priceTicks,
      metrics
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset Stock Data
app.post('/api/reset', (req, res) => {
  try {
    const fresh = DB.resetData();
    res.json(fresh);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SPA Fallback Route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 ValueFolio Human Life Stock Server running on port ${PORT}`);
});
