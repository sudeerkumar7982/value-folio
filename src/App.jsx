import React, { useState, useEffect, useRef } from 'react';
import StockHeader from './components/StockHeader.jsx';
import { StockChart } from './components/StockChart.jsx';
import { TodayHighlights } from './components/TodayHighlights.jsx';
import { SectorBreakdown } from './components/SectorBreakdown.jsx';
import { LifeNewsFeed } from './components/LifeNewsFeed.jsx';
import { AddEventModal } from './components/AddEventModal.jsx';
import { TradingExchange } from './components/TradingExchange.jsx';
import { SettingsModal } from './components/SettingsModal.jsx';
import { CreateStockModal } from './components/CreateStockModal.jsx';
import { Activity, ShieldCheck } from 'lucide-react';
import { API } from './utils/api.js';

export default function App() {
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isLiveActive, setIsLiveActive] = useState(true);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isTradeOpen, setIsTradeOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Fetch complete stock profile & data
  const loadData = async () => {
    try {
      const [profileData, eventsData] = await Promise.all([
        API.getProfile(),
        API.getEvents()
      ]);

      setData(profileData);
      setEvents(eventsData);
    } catch (err) {
      console.error('Failed to load stock data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Live Market Fluctuation Loop (Fires every 1.5s for continuous lively motion)
  useEffect(() => {
    if (!isLiveActive || loading) return;

    const interval = setInterval(async () => {
      try {
        const tickResult = await API.tick();
        if (tickResult && tickResult.currentPrice) {
          setData(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              profile: {
                ...prev.profile,
                currentPrice: tickResult.currentPrice
              },
              priceTicks: tickResult.priceTicks,
              metrics: tickResult.metrics
            };
          });
        }
      } catch (e) {
        console.warn('Live tick update error:', e.message);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [isLiveActive, loading]);

  const handleDeleteSingleEvent = async (id) => {
    if (window.confirm('Delete this single news event?')) {
      await API.deleteEvent(id);
      loadData();
    }
  };

  const handleClearEvents = async () => {
    if (window.confirm('Delete all human news feed events? Stock price will return to base IPO listing price.')) {
      await API.clearEvents();
      loadData();
    }
  };

  const handleResetData = async () => {
    if (window.confirm('Reset all stock events and price history back to initial IPO state?')) {
      await API.reset();
      loadData();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0E14] flex items-center justify-center text-slate-400 font-mono">
        <div className="flex flex-col items-center space-y-3">
          <Activity className="w-8 h-8 text-blue-500 animate-spin" />
          <span>Connecting to Human Life Stock Exchange...</span>
        </div>
      </div>
    );
  }

  const { profile, sectors, metrics, priceTicks } = data || {};

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-100 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      
      {/* Top Navigation / Stock Header */}
      <StockHeader
        profile={profile}
        metrics={metrics}
        onOpenCreateModal={() => setIsCreateOpen(true)}
        onOpenAddModal={() => setIsAddOpen(true)}
        onOpenTradeModal={() => setIsTradeOpen(true)}
        onOpenSettingsModal={() => setIsSettingsOpen(true)}
        onReset={handleResetData}
        isLiveActive={isLiveActive}
        onToggleLive={() => setIsLiveActive(!isLiveActive)}
      />

      {/* Main Dashboard Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Row 1: Main Interactive Timeline Chart & Sector Pillars Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <StockChart priceTicks={priceTicks} profile={profile} symbol={profile?.symbol || 'SUDK'} />
          </div>
          <div>
            <SectorBreakdown sectors={sectors} />
          </div>
        </div>

        {/* Row 2: Today's Top Catalysts & Setbacks Highlights */}
        <TodayHighlights events={events} />

        {/* Row 3: Chronological Life Events Newsfeed */}
        <LifeNewsFeed
          events={events}
          onClearEvents={handleClearEvents}
          onDeleteSingleEvent={handleDeleteSingleEvent}
        />

      </main>

      {/* Footer */}
      <footer className="bg-[#151923] border-t border-[#232936] py-5 px-4 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span>ValueFolio Human Life Stock Exchange • Ticker: <strong className="text-white">{profile?.symbol}</strong></span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="flex items-center text-rose-400">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping mr-1.5"></span>
              Live Price Ticker Active
            </span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <CreateStockModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreateSuccess={() => loadData()}
      />

      <AddEventModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        currentPrice={profile?.currentPrice || 100}
        onCommitSuccess={() => loadData()}
      />

      <TradingExchange
        isOpen={isTradeOpen}
        onClose={() => setIsTradeOpen(false)}
        profile={profile}
        priceTicks={priceTicks}
        onTradeSuccess={() => loadData()}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        profile={profile}
        onSaveSettings={() => loadData()}
      />

    </div>
  );
}
