import React, { useState } from 'react';
import { TrendingUp, TrendingDown, PlusCircle, ShoppingBag, RotateCcw, Settings, Activity, Radio, Rocket, ChevronDown, Layers, Flame, BarChart2, Briefcase } from 'lucide-react';

export default function StockHeader({ 
  profile, 
  metrics, 
  stocks = [],
  activeSymbol,
  onSelectStock,
  activeTab,
  onTabChange,
  onOpenCreateModal,
  onOpenAddModal, 
  onOpenTradeModal, 
  onOpenPortfolioModal,
  onOpenSettingsModal, 
  onReset,
  isLiveActive,
  onToggleLive
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const isPositive = metrics ? metrics.changePercent >= 0 : true;

  // Nav tabs
  const navTabs = (
    <div className="flex items-center space-x-2 pt-3 mt-3 border-t border-[#E2E0D8]">
      <button
        onClick={() => onTabChange('DASHBOARD')}
        className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
          activeTab === 'DASHBOARD'
            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
        }`}
      >
        <BarChart2 className="w-4 h-4" />
        <span>Stock Dashboard</span>
      </button>

      <button
        onClick={() => onTabChange('IPO_HUB')}
        className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
          activeTab === 'IPO_HUB'
            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
        }`}
      >
        <Rocket className="w-4 h-4 text-emerald-500" />
        <span>Human IPO Launchpad</span>
      </button>

      <button
        onClick={() => onTabChange('WATCHLIST')}
        className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
          activeTab === 'WATCHLIST'
            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/20'
            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
        }`}
      >
        <Flame className="w-4 h-4 text-amber-500" />
        <span>Market Screener &amp; Watchlist</span>
      </button>
    </div>
  );

  if (!profile || !metrics) {
    return (
      <header className="bg-white border-b border-[#E2E0D8] sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            {/* Brand */}
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-lg font-black text-slate-800 tracking-tight">ValueFolio</div>
                <div className="text-xs text-slate-400 font-mono">Human Life Stock Exchange</div>
              </div>
            </div>

            {/* Launch IPO Button */}
            <div className="flex items-center space-x-2">
              <button
                onClick={onOpenCreateModal}
                className="flex items-center space-x-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md transition-all"
              >
                <Rocket className="w-3.5 h-3.5" />
                <span>Launch IPO / Create Stock</span>
              </button>
              <button
                onClick={onReset}
                className="p-2 bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-xl border border-[#E2E0D8] hover:border-rose-200 transition-colors"
                title="Reset All Data"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
          {navTabs}
        </div>
      </header>
    );
  }

  return (
    <header className="bg-white border-b border-[#E2E0D8] sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        
        {/* Top Row: Brand, Stock Switcher, Live Price & Action Buttons */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Left: Ticker Symbol with Dropdown Switcher & Price */}
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
              <Activity className="w-6 h-6 text-white" />
            </div>

            <div className="relative">
              <div className="flex items-center space-x-2.5">
                
                {/* Stock Switcher Dropdown Toggle */}
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center space-x-1.5 bg-[#F7F6F1] border border-[#E2E0D8] hover:border-blue-400 px-3 py-1 rounded-xl transition-all"
                >
                  <span className="text-xl font-black tracking-tight text-slate-800 font-mono">{profile.symbol}</span>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </button>

                {/* Stock Switcher Dropdown Menu */}
                {isDropdownOpen && (
                  <div className="absolute top-11 left-0 z-50 w-72 bg-white border border-[#E2E0D8] rounded-2xl shadow-xl p-2 space-y-1 animate-fadeIn">
                    <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Select Listed Stock
                    </div>
                    {stocks.map(s => (
                      <button
                        key={s.symbol}
                        onClick={() => {
                          onSelectStock(s.symbol);
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all ${
                          s.symbol === activeSymbol
                            ? 'bg-blue-50 border border-blue-300 text-slate-800 font-bold'
                            : 'hover:bg-[#F7F6F1] text-slate-600'
                        }`}
                      >
                        <div>
                          <div className="font-mono text-sm font-bold text-slate-800">{s.symbol}</div>
                          <div className="text-xs text-slate-400 line-clamp-1">{s.name}</div>
                        </div>
                        <div className="text-right font-mono text-xs">
                          <div className="text-slate-800 font-bold">₹{Number(s.currentPrice || 0).toFixed(2)}</div>
                          <div className={(s.changePercent || 0) >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-500 font-bold'}>
                            {(s.changePercent || 0) >= 0 ? '+' : ''}{s.changePercent || 0}%
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                
                {/* Live Ticker Status Badge */}
                <button
                  onClick={onToggleLive}
                  className={`text-xs px-2.5 py-0.5 rounded-md font-mono font-bold flex items-center space-x-1.5 transition-all ${
                    isLiveActive
                      ? 'bg-rose-100 text-rose-600 border border-rose-300 animate-pulse'
                      : 'bg-slate-100 text-slate-500 border border-slate-200 hover:text-slate-800'
                  }`}
                  title="Toggle live price fluctuations"
                >
                  <Radio className={`w-3 h-3 ${isLiveActive ? 'text-rose-500 animate-ping' : ''}`} />
                  <span>{isLiveActive ? 'LIVE TICK' : 'PAUSED'}</span>
                </button>

                <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200 font-medium hidden sm:inline">
                  {profile?.name || 'STOCK'}
                </span>
              </div>

              {/* Price & Circuit Limits */}
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-800 font-mono tracking-tight transition-all duration-300">
                  ₹{Number(metrics?.currentPrice || profile?.currentPrice || 0).toFixed(2)}
                </span>
                
                <div className={`flex items-center font-mono font-bold text-xs px-2 py-0.5 rounded-md transition-colors ${
                  isPositive 
                    ? 'text-emerald-600 bg-emerald-50 border border-emerald-200' 
                    : 'text-rose-500 bg-rose-50 border border-rose-200'
                }`}>
                  {isPositive ? <TrendingUp className="w-3.5 h-3.5 mr-1" /> : <TrendingDown className="w-3.5 h-3.5 mr-1" />}
                  <span>{isPositive ? '+' : ''}{Number(metrics?.changeAmount || 0).toFixed(2)} ({isPositive ? '+' : ''}{Number(metrics?.changePercent || 0).toFixed(2)}%)</span>
                </div>

                {/* Dynamic Circuit Limits Badges based on Sentiment */}
                {(() => {
                  const activeStock = (stocks || []).find(s => s.symbol === (profile?.symbol || activeSymbol)) || {};
                  const currentSentiment = activeStock.sentiment || metrics?.sentiment || profile?.sentiment || 'NEUTRAL';
                  const currentScore = activeStock.sentimentScore ?? metrics?.sentimentScore ?? profile?.sentimentScore ?? 50;

                  let sentimentUpperPct = 10;
                  let sentimentLowerPct = 10;

                  if (currentSentiment === 'VERY_BULLISH' || currentScore >= 80) {
                    sentimentUpperPct = 20; sentimentLowerPct = 5;
                  } else if (currentSentiment === 'BULLISH' || currentScore >= 60) {
                    sentimentUpperPct = 15; sentimentLowerPct = 8;
                  } else if (currentSentiment === 'BEARISH' || (currentScore >= 20 && currentScore < 40)) {
                    sentimentUpperPct = 8; sentimentLowerPct = 15;
                  } else if (currentSentiment === 'VERY_BEARISH' || currentScore < 20) {
                    sentimentUpperPct = 5; sentimentLowerPct = 20;
                  }

                  const basePrice = profile?.startingPrice || 100;
                  const displayUpperPct = metrics?.upperCircuitPct ?? sentimentUpperPct;
                  const displayLowerPct = metrics?.lowerCircuitPct ?? sentimentLowerPct;
                  const upperCircuitVal = metrics?.upperCircuit || Number((basePrice * (1 + displayUpperPct / 100)).toFixed(2));
                  const lowerCircuitVal = metrics?.lowerCircuit || Number((basePrice * (1 - displayLowerPct / 100)).toFixed(2));

                  return (
                    <div className="flex items-center space-x-2 font-mono text-[11px]">
                      <span 
                        className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold transition-all hover:scale-105" 
                        title={`Upper Circuit (+${displayUpperPct}%) limit based on ${currentSentiment.replace('_', ' ')} sentiment`}
                      >
                        UC (+{displayUpperPct}%): ₹{Number(upperCircuitVal).toFixed(2)}
                      </span>
                      <span 
                        className="px-2 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200 font-bold transition-all hover:scale-105" 
                        title={`Lower Circuit (-${displayLowerPct}%) limit based on ${currentSentiment.replace('_', ' ')} sentiment`}
                      >
                        LC (-{displayLowerPct}%): ₹{Number(lowerCircuitVal).toFixed(2)}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center space-x-2 flex-wrap">
            <button
              onClick={onOpenPortfolioModal}
              className="flex-1 md:flex-none flex items-center justify-center space-x-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-md transition-all active:scale-95"
              title="View your holdings & portfolio returns"
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Portfolio</span>
            </button>

            <button
              onClick={onOpenCreateModal}
              className="flex-1 md:flex-none flex items-center justify-center space-x-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-md transition-all active:scale-95"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>Launch IPO</span>
            </button>

            <button
              onClick={onOpenAddModal}
              className="flex-1 md:flex-none flex items-center justify-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-3.5 py-2 rounded-xl border border-[#E2E0D8] transition-all active:scale-95"
            >
              <PlusCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span>Log Event</span>
            </button>

            <button
              onClick={onOpenTradeModal}
              className="flex-1 md:flex-none flex items-center justify-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-3 py-2 rounded-xl border border-[#E2E0D8] transition-all active:scale-95"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-blue-500" />
              <span>Trade</span>
            </button>

            <button
              onClick={onOpenSettingsModal}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-xl border border-[#E2E0D8] transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            <button
              onClick={onReset}
              className="p-2 bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-xl border border-[#E2E0D8] hover:border-rose-200 transition-colors"
              title="Reset Stock Data"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

        </div>

        {navTabs}

      </div>
    </header>
  );
}
