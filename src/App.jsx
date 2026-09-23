import React, { useState, useEffect } from 'react';
import StockHeader from './components/StockHeader.jsx';
import { StockChart } from './components/StockChart.jsx';
import { TodayHighlights } from './components/TodayHighlights.jsx';
import { SectorBreakdown } from './components/SectorBreakdown.jsx';
import { LifeNewsFeed } from './components/LifeNewsFeed.jsx';
import { AddEventModal } from './components/AddEventModal.jsx';
import { TradingExchange } from './components/TradingExchange.jsx';
import { SettingsModal } from './components/SettingsModal.jsx';
import { CreateStockModal } from './components/CreateStockModal.jsx';
import { IPOHub } from './components/IPOHub.jsx';
import { MarketScreener } from './components/MarketScreener.jsx';
import { MarketDepth } from './components/MarketDepth.jsx';
import { PortfolioModal } from './components/PortfolioModal.jsx';
import { Activity, ShieldCheck, Flame, TrendingUp, TrendingDown, Plus, BarChart2, DollarSign, Rocket, Trash2 } from 'lucide-react';
import { API } from './utils/api.js';

export default function App() {
  const [activeTab, setActiveTab] = useState('DASHBOARD'); // DASHBOARD, IPO_HUB, WATCHLIST
  const [activeSymbol, setActiveSymbol] = useState('');
  const [data, setData] = useState(null);
  const [events, setEvents] = useState([]);
  const [stocksList, setStocksList] = useState([]);
  const [iposList, setIposList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isLiveActive, setIsLiveActive] = useState(true);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isTradeOpen, setIsTradeOpen] = useState(false);
  const [isPortfolioOpen, setIsPortfolioOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Fetch complete stock profile & data
  const loadData = async (symbolToLoad = null) => {
    try {
      const allStocks = await API.getAllStocks();
      const allIPOs = await API.getIPOs();
      setStocksList(allStocks);
      setIposList(allIPOs);

      const availableSymbols = allStocks.map(s => s.symbol);
      let targetSym = symbolToLoad || activeSymbol;
      if ((!targetSym || !availableSymbols.includes(targetSym)) && allStocks.length > 0) {
        targetSym = allStocks[0].symbol;
      }

      if (targetSym && allStocks.length > 0) {
        let profileData = await API.getProfile(targetSym);
        let eventsData = await API.getEvents(targetSym);

        if ((!profileData || !profileData.profile) && allStocks.length > 0) {
          targetSym = allStocks[0].symbol;
          profileData = await API.getProfile(targetSym);
          eventsData = await API.getEvents(targetSym);
        }

        setData(profileData);
        setEvents(eventsData || []);
        setActiveSymbol(targetSym);
      } else {
        setData(null);
        setEvents([]);
        setActiveSymbol('');
      }
    } catch (err) {
      console.error('Failed to load stock data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectStock = async (symbol) => {
    setLoading(true);
    await API.setActiveSymbol(symbol);
    setActiveSymbol(symbol);
    await loadData(symbol);
    setActiveTab('DASHBOARD');
  };

  const handleDeleteStock = async (symbol) => {
    if (window.confirm(`Delete ${symbol} stock from the live exchange market?`)) {
      await API.deleteStock(symbol);
      const remaining = await API.getAllStocks();
      if (remaining.length > 0) {
        await handleSelectStock(remaining[0].symbol);
      } else {
        setData(null);
        setActiveSymbol('');
        setStocksList([]);
        loadData();
      }
    }
  };

  // Live Market Fluctuation Loop (Fires every 1.5s for continuous lively motion)
  useEffect(() => {
    if (!isLiveActive || loading || !activeSymbol) return;

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

          setStocksList(prev => prev.map(s => s.symbol === activeSymbol ? { ...s, currentPrice: tickResult.currentPrice } : s));
        }
      } catch (e) {
        console.warn('Live tick update error:', e.message);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [isLiveActive, loading, activeSymbol]);

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
    if (window.confirm('Reset all stock events and price history back to initial clean IPO state?')) {
      await API.reset();
      loadData();
    }
  };

  if (loading && stocksList.length > 0 && !data) {
    return (
      <div className="min-h-screen bg-[#0B0E14] flex items-center justify-center text-slate-400 font-mono">
        <div className="flex flex-col items-center space-y-3">
          <Activity className="w-8 h-8 text-blue-500 animate-spin" />
          <span>Connecting to ValueFolio Human Life Stock Exchange...</span>
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
        stocks={stocksList}
        activeSymbol={activeSymbol}
        onSelectStock={handleSelectStock}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenCreateModal={() => setIsCreateOpen(true)}
        onOpenAddModal={() => setIsAddOpen(true)}
        onOpenTradeModal={() => setIsTradeOpen(true)}
        onOpenPortfolioModal={() => setIsPortfolioOpen(true)}
        onOpenSettingsModal={() => setIsSettingsOpen(true)}
        onReset={handleResetData}
        isLiveActive={isLiveActive}
        onToggleLive={() => setIsLiveActive(!isLiveActive)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* TAB 1: Main Active Stock Dashboard */}
        {activeTab === 'DASHBOARD' && (
          stocksList.length > 0 && profile ? (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Homepage All Listed Stocks Bar */}
              <div className="bg-[#151923] border border-[#232936] rounded-2xl p-4 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Flame className="w-5 h-5 text-amber-400" />
                    <h3 className="text-base font-bold text-white">All Listed Human Stocks ({stocksList.length})</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      Live Exchange Watchlist
                    </span>
                  </div>

                  <button
                    onClick={() => setIsCreateOpen(true)}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center space-x-1 shadow"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Stock / Launch IPO</span>
                  </button>
                </div>

                {/* Grid of Listed Stocks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {stocksList.map(stock => {
                    const isSelected = stock.symbol === activeSymbol;
                    const isGain = (stock.changePercent || 0) >= 0;

                    return (
                      <div
                        key={stock.symbol}
                        onClick={() => handleSelectStock(stock.symbol)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                          isSelected
                            ? 'bg-blue-600/10 border-blue-500/60 ring-1 ring-blue-500/30'
                            : 'bg-[#0B0E14] border-[#232936] hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span className="font-mono font-bold text-white text-sm">{stock.symbol}</span>
                              {isSelected && (
                                <span className="text-[10px] font-extrabold bg-blue-500 text-white px-1.5 py-0.2 rounded">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-slate-400 line-clamp-1 font-sans">{stock.name}</span>
                          </div>

                          <div className="text-right font-mono">
                            <div className="text-sm font-bold text-white">₹{stock.currentPrice?.toFixed(2)}</div>
                            <div className={`text-xs font-bold ${isGain ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isGain ? '+' : ''}{stock.changePercent}%
                            </div>
                          </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="flex items-center justify-between pt-1 border-t border-[#232936]/60 text-xs">
                          <span className="text-[11px] text-slate-400">{stock.sentimentLabel || 'Bullish 📈'}</span>
                          <div className="flex space-x-1 items-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectStock(stock.symbol);
                              }}
                              className="px-2 py-1 rounded bg-[#1C2230] text-blue-400 font-bold hover:bg-blue-600 hover:text-white"
                              title="View Stock Chart"
                            >
                              <BarChart2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectStock(stock.symbol);
                                setIsTradeOpen(true);
                              }}
                              className="px-2 py-1 rounded bg-emerald-600/20 text-emerald-400 font-bold hover:bg-emerald-600 hover:text-white"
                              title="Trade Stock"
                            >
                              <DollarSign className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteStock(stock.symbol);
                              }}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                              title="Delete Stock Ticker"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Row 1: Main Interactive Timeline Chart & Sector Pillars Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <StockChart priceTicks={priceTicks} profile={profile} symbol={profile?.symbol || ''} />
                </div>
                <div className="space-y-6">
                  <SectorBreakdown sectors={sectors} />
                  <MarketDepth currentPrice={profile?.currentPrice || 100} symbol={profile?.symbol || ''} />
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
            </div>
          ) : (
            /* Clean Empty State Prompt when 0 stocks are present */
            <div className="py-16 text-center bg-[#151923] border border-[#232936] rounded-2xl p-8 space-y-4 animate-fadeIn">
              <Rocket className="w-12 h-12 text-blue-500 mx-auto animate-bounce" />
              <h2 className="text-xl font-bold text-white">No Human Stocks Currently Listed</h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Launch your first personal human stock offering to start tracking interactive price charts, life newsfeed events, and market sentiment!
              </p>
              <button
                onClick={() => setIsCreateOpen(true)}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold px-6 py-3 rounded-xl text-sm shadow-lg shadow-blue-500/25 flex items-center space-x-2 mx-auto"
              >
                <Rocket className="w-4 h-4" />
                <span>Launch First Human IPO / Create Stock</span>
              </button>
            </div>
          )
        )}

        {/* TAB 2: ValueFolio IPO Launchpad */}
        {activeTab === 'IPO_HUB' && (
          <IPOHub
            ipos={iposList}
            onRefresh={() => loadData()}
            onSelectStock={handleSelectStock}
            onOpenCreateIPO={() => setIsCreateOpen(true)}
          />
        )}

        {/* TAB 3: Market Watchlist & Sentiment Screener */}
        {activeTab === 'WATCHLIST' && (
          <MarketScreener
            stocks={stocksList}
            activeSymbol={activeSymbol}
            onSelectStock={handleSelectStock}
            onOpenTradeModal={() => setIsTradeOpen(true)}
            onDeleteStock={handleDeleteStock}
          />
        )}

      </main>

      {/* Footer */}
      <footer className="bg-[#151923] border-t border-[#232936] py-5 px-4 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span>ValueFolio Human Life Stock Exchange • Active Ticker: <strong className="text-white">{profile?.symbol || 'NONE'}</strong></span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="flex items-center text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping mr-1.5"></span>
              {stocksList.length} Listed Stocks Trading
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
        stocks={stocksList}
        activeSymbol={activeSymbol}
        onCommitSuccess={() => loadData()}
      />

      <TradingExchange
        isOpen={isTradeOpen}
        onClose={() => setIsTradeOpen(false)}
        profile={profile}
        priceTicks={priceTicks}
        onTradeSuccess={() => loadData()}
      />

      <PortfolioModal
        isOpen={isPortfolioOpen}
        onClose={() => setIsPortfolioOpen(false)}
        onSelectStock={handleSelectStock}
        onOpenTradeModal={() => setIsTradeOpen(true)}
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
