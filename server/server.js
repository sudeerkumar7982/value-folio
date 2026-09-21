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

// Get complete stock profile and overview
app.get('/api/stock/profile', (req, res) => {
  try {
    const profile = DB.getProfile();
    const sectors = DB.getSectors();
    const priceTicks = DB.getPriceTicks();
    const events = DB.getEvents();
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

// Delete single news event
app.post('/api/events/delete', (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Event ID required' });
    const data = DB.deleteEvent(id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all newsfeed events
app.post('/api/events/clear', (req, res) => {
  try {
    const data = DB.clearEvents();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get life newsfeed events
app.get('/api/events', (req, res) => {
  try {
    const events = DB.getEvents();
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Live AI Preview endpoint for life event analysis
app.post('/api/events/analyze', async (req, res) => {
  try {
    const { title, description, sector } = req.body;
    const profile = DB.getProfile();

    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Event title is required' });
    }

    const aiResult = await analyzeLifeEvent(title, description, sector, profile.apiKey);
    const estimatedNewPrice = calculateNewPrice(profile.currentPrice, aiResult.impactPercent);

    res.json({
      ...aiResult,
      currentPrice: profile.currentPrice,
      estimatedNewPrice,
      estimatedPriceChange: Number((estimatedNewPrice - profile.currentPrice).toFixed(2))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Commit life event to market history
app.post('/api/events/commit', async (req, res) => {
  try {
    const { title, description, sector, customImpact, date } = req.body;
    const profile = DB.getProfile();

    if (!title) return res.status(400).json({ error: 'Title required' });

    // Analyze AI sentiment
    const aiResult = await analyzeLifeEvent(title, description, sector, profile.apiKey);
    const impactPercent = customImpact !== undefined && customImpact !== null ? Number(customImpact) : aiResult.impactPercent;

    const previousPrice = profile.currentPrice;
    const newPrice = calculateNewPrice(previousPrice, impactPercent);

    // Update Sector Scores
    const currentSectors = DB.getSectors();
    const updatedSectors = calculateSectorUpdates(currentSectors, aiResult.primarySector, aiResult.sectorDelta);
    DB.updateSectors(updatedSectors);

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
      timestamp: date ? new Date(date).toISOString() : new Date().toISOString()
    };

    DB.addEvent(newEvent);

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
    const { type, shares } = req.body;
    const profile = DB.getProfile();

    if (!['BUY', 'SELL'].includes(type)) return res.status(400).json({ error: 'Invalid trade type' });
    if (!shares || shares <= 0) return res.status(400).json({ error: 'Shares must be > 0' });

    const result = DB.executeTrade(type, Number(shares), profile.currentPrice);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get user trades
app.get('/api/trades', (req, res) => {
  try {
    res.json(DB.getTrades());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Profile settings
app.post('/api/settings', (req, res) => {
  try {
    const updated = DB.updateProfile(req.body);
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
    const profile = DB.getProfile();
    // Random subtle market noise between -0.35% and +0.35%
    const noise = (Math.random() * 0.7 - 0.35);
    const newPrice = calculateNewPrice(profile.currentPrice, noise);
    
    DB.addMarketTick(newPrice, noise >= 0 ? '📈 Investor Buying Pressure' : '📉 Market Sentiment Noise');
    
    const priceTicks = DB.getPriceTicks();
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
  console.log(`🚀 SUDK Human Life Stock Server running on port ${PORT}`);
});
