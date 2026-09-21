import React from 'react';
import { TrendingUp, TrendingDown, PlusCircle, ShoppingBag, RotateCcw, Settings, Activity, Radio, Rocket } from 'lucide-react';

export default function StockHeader({ 
  profile, 
  metrics, 
  onOpenCreateModal,
  onOpenAddModal, 
  onOpenTradeModal, 
  onOpenSettingsModal, 
  onReset,
  isLiveActive,
  onToggleLive
}) {
  if (!profile || !metrics) return null;

  const isPositive = metrics.changePercent >= 0;

  return (
    <header className="bg-[#151923] border-b border-[#232936] sticky top-0 z-30 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Left: Ticker Symbol & Price */}
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
              <Activity className="w-6 h-6 text-white" />
            </div>

            <div>
              <div className="flex items-center space-x-2.5">
                <span className="text-2xl font-black tracking-tight text-white font-mono">{profile.symbol}</span>
                
                {/* Live Ticker Status Badge */}
                <button
                  onClick={onToggleLive}
                  className={`text-xs px-2.5 py-0.5 rounded-md font-mono font-bold flex items-center space-x-1.5 transition-all ${
                    isLiveActive
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
                  }`}
                  title="Toggle live price fluctuations"
                >
                  <Radio className={`w-3 h-3 ${isLiveActive ? 'text-rose-500 animate-ping' : ''}`} />
                  <span>{isLiveActive ? 'LIVE MARKET' : 'PAUSED'}</span>
                </button>

                <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-medium hidden sm:inline">
                  {profile.name}
                </span>
              </div>

              {/* Price & Changes */}
              <div className="flex items-baseline space-x-3 mt-0.5">
                <span className="text-3xl font-extrabold text-white font-mono tracking-tight transition-all duration-300">
                  ₹{profile.currentPrice.toFixed(2)}
                </span>
                
                <div className={`flex items-center font-mono font-bold text-sm px-2 py-0.5 rounded-md transition-colors ${
                  isPositive 
                    ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' 
                    : 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                }`}>
                  {isPositive ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                  <span>{isPositive ? '+' : ''}{metrics.changeAmount.toFixed(2)} ({isPositive ? '+' : ''}{metrics.changePercent.toFixed(2)}%)</span>
                </div>

                <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                  All-time: <strong className={metrics.totalChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {metrics.totalChangePercent >= 0 ? '+' : ''}{metrics.totalChangePercent}%
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Center: High/Low Ticker Stats */}
          <div className="hidden lg:flex items-center space-x-6 text-xs font-mono text-slate-400 bg-[#0B0E14] px-4 py-2 rounded-lg border border-[#232936]">
            <div>
              <span className="text-slate-500 block">START</span>
              <span className="text-slate-200 font-bold">₹{metrics.startingPrice.toFixed(2)}</span>
            </div>
            <div className="border-r border-[#232936] h-6"></div>
            <div>
              <span className="text-slate-500 block">ALL HIGH</span>
              <span className="text-emerald-400 font-bold">₹{metrics.highPrice.toFixed(2)}</span>
            </div>
            <div className="border-r border-[#232936] h-6"></div>
            <div>
              <span className="text-slate-500 block">ALL LOW</span>
              <span className="text-rose-400 font-bold">₹{metrics.lowPrice.toFixed(2)}</span>
            </div>
            <div className="border-r border-[#232936] h-6"></div>
            <div>
              <span className="text-slate-500 block">EVENTS</span>
              <span className="text-blue-400 font-bold">{metrics.totalEvents}</span>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center space-x-2 flex-wrap">
            <button
              onClick={onOpenCreateModal}
              className="flex-1 md:flex-none flex items-center justify-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-3 py-2.5 rounded-xl border border-blue-400/30 transition-all transform active:scale-95"
              title="Issue a fresh Human Stock IPO"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>New IPO</span>
            </button>

            <button
              onClick={onOpenAddModal}
              className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-xs px-3.5 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 transition-all transform active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Log Life Event</span>
            </button>

            <button
              onClick={onOpenTradeModal}
              className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-[#1E2536] hover:bg-[#283248] text-white font-semibold text-xs px-3 py-2.5 rounded-xl border border-[#2B354C] transition-all transform active:scale-95"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-blue-400" />
              <span>Trade Ticker</span>
            </button>

            <button
              onClick={onOpenSettingsModal}
              className="p-2.5 bg-[#1E2536] hover:bg-[#283248] text-slate-300 hover:text-white rounded-xl border border-[#2B354C] transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            <button
              onClick={onReset}
              className="p-2.5 bg-[#1E2536] hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-xl border border-[#2B354C] hover:border-rose-500/30 transition-colors"
              title="Reset Stock Data"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </header>
  );
}
