import React, { useState } from 'react';
import { Search, Flame, TrendingUp, TrendingDown, ArrowUpDown, CheckCircle2, BarChart2, DollarSign, Activity, Layers, Star, Trash2 } from 'lucide-react';
import { API } from '../utils/api.js';

export function MarketScreener({ stocks = [], activeSymbol, onSelectStock, onOpenTradeModal, onDeleteStock }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState('ALL'); // ALL, VERY_BULLISH, BULLISH, NEUTRAL, BEARISH
  const [sortBy, setSortBy] = useState('SENTIMENT'); // SENTIMENT, GAINERS, LOSERS, PRICE, ALPHABETICAL

  // Filter stocks by sentiment & search term
  const filteredStocks = stocks.filter(stock => {
    const matchesSearch = stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          stock.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (stock.bio && stock.bio.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (sentimentFilter === 'VERY_BULLISH') return stock.sentiment === 'VERY_BULLISH';
    if (sentimentFilter === 'BULLISH') return stock.sentiment === 'BULLISH';
    if (sentimentFilter === 'NEUTRAL') return stock.sentiment === 'NEUTRAL';
    if (sentimentFilter === 'BEARISH') return stock.sentiment === 'BEARISH' || stock.sentiment === 'VERY_BEARISH';

    return true;
  });

  // Sort stocks
  const sortedStocks = [...filteredStocks].sort((a, b) => {
    if (sortBy === 'SENTIMENT') return (b.sentimentScore || 0) - (a.sentimentScore || 0);
    if (sortBy === 'GAINERS') return (b.changePercent || 0) - (a.changePercent || 0);
    if (sortBy === 'LOSERS') return (a.changePercent || 0) - (b.changePercent || 0);
    if (sortBy === 'PRICE') return (b.currentPrice || 0) - (a.currentPrice || 0);
    if (sortBy === 'ALPHABETICAL') return a.symbol.localeCompare(b.symbol);
    return 0;
  });

  const getSentimentPill = (sentiment, score) => {
    if (sentiment === 'VERY_BULLISH' || score >= 80) {
      return (
        <div className="flex items-center space-x-1.5">
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 flex items-center space-x-1">
            <Flame className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            <span>Very Bullish</span>
          </span>
          <span className="font-mono text-xs font-bold text-emerald-700">{score}%</span>
        </div>
      );
    }
    if (sentiment === 'BULLISH' || score >= 60) {
      return (
        <div className="flex items-center space-x-1.5">
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200 flex items-center space-x-1">
            <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
            <span>Bullish</span>
          </span>
          <span className="font-mono text-xs font-bold text-blue-700">{score}%</span>
        </div>
      );
    }
    if (sentiment === 'BEARISH' || sentiment === 'VERY_BEARISH' || score <= 40) {
      return (
        <div className="flex items-center space-x-1.5">
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-300 flex items-center space-x-1">
            <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
            <span>Bearish</span>
          </span>
          <span className="font-mono text-xs font-bold text-rose-700">{score}%</span>
        </div>
      );
    }
    return (
      <div className="flex items-center space-x-1.5">
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300">
          <span>Neutral</span>
        </span>
        <span className="font-mono text-xs font-bold text-amber-700">{score}%</span>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Header Overview Banner */}
      <div className="bg-white border border-[#E2E0D8] rounded-2xl p-6 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
              ValueFolio Listed Stocks Watchlist
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-mono">
                Sentiment Screener
              </span>
            </h1>
            <p className="text-sm text-slate-500">
              Filter and analyze all listed human stock tickers based on AI sentiment rating, gain % and sector strength.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search ticker or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#F7F6F1] border border-[#E2E0D8] focus:border-blue-500 rounded-xl pl-9 pr-4 py-2 text-slate-800 text-sm outline-none"
            />
          </div>
        </div>
      </div>

      {/* Filter Pills & Sorting Strip */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        
        {/* Sentiment Filters */}
        <div className="flex items-center bg-white border border-[#E2E0D8] p-1 rounded-xl space-x-1 overflow-x-auto max-w-full">
          <button
            onClick={() => setSentimentFilter('ALL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${sentimentFilter === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
          >
            All Stocks ({stocks.length})
          </button>
          <button
            onClick={() => setSentimentFilter('VERY_BULLISH')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${sentimentFilter === 'VERY_BULLISH' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
          >
            🔥 Very Bullish
          </button>
          <button
            onClick={() => setSentimentFilter('BULLISH')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${sentimentFilter === 'BULLISH' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
          >
            📈 Bullish
          </button>
          <button
            onClick={() => setSentimentFilter('NEUTRAL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${sentimentFilter === 'NEUTRAL' ? 'bg-amber-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
          >
            ⚖️ Neutral
          </button>
          <button
            onClick={() => setSentimentFilter('BEARISH')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${sentimentFilter === 'BEARISH' ? 'bg-rose-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
          >
            📉 Bearish
          </button>
        </div>

        {/* Sort Selector */}
        <div className="flex items-center space-x-2 text-xs text-slate-500 shrink-0">
          <ArrowUpDown className="w-3.5 h-3.5 text-blue-500" />
          <span>Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-white border border-[#E2E0D8] text-slate-800 font-bold rounded-lg px-3 py-1.5 text-xs outline-none"
          >
            <option value="SENTIMENT">Highest Sentiment Score</option>
            <option value="GAINERS">Top % Gainers</option>
            <option value="LOSERS">Top % Losers</option>
            <option value="PRICE">Share Price (High to Low)</option>
            <option value="ALPHABETICAL">Ticker (A-Z)</option>
          </select>
        </div>

      </div>

      {/* Stock Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5">
        {sortedStocks.map(stock => {
          const isSelected = stock.symbol === activeSymbol;
          const isGain = (stock.changePercent || 0) >= 0;

          return (
            <div
              key={stock.symbol}
              className={`bg-white border rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4 transition-all ${
                isSelected ? 'border-blue-500 ring-1 ring-blue-300' : 'border-[#E2E0D8] hover:border-slate-300'
              }`}
            >
              {/* Header Info */}
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-extrabold font-mono text-base shadow-md">
                      {stock.symbol}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-lg font-bold text-slate-800">{stock.symbol}</h3>
                        {isSelected && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 font-semibold">{stock.name}</p>
                    </div>
                  </div>

                  {/* Price & Change */}
                  <div className="text-right">
                    <div className="text-lg font-extrabold font-mono text-slate-800">
                      ₹{stock.currentPrice?.toFixed(2)}
                    </div>
                    <div className={`text-xs font-bold font-mono ${isGain ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {isGain ? '+' : ''}{stock.changeAmount} ({isGain ? '+' : ''}{stock.changePercent}%)
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2">{stock.bio}</p>

                {/* Sentiment Meter Bar */}
                <div className="bg-[#F7F6F1] p-3 rounded-xl border border-[#E2E0D8] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-semibold">AI Sentiment Grade</span>
                    {getSentimentPill(stock.sentiment, stock.sentimentScore || 70)}
                  </div>

                  {/* Sentiment Bar */}
                  <div className="w-full bg-white h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        (stock.sentimentScore || 70) >= 80 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' :
                        (stock.sentimentScore || 70) >= 60 ? 'bg-gradient-to-r from-blue-500 to-cyan-400' :
                        (stock.sentimentScore || 70) >= 40 ? 'bg-gradient-to-r from-amber-500 to-yellow-400' :
                        'bg-gradient-to-r from-rose-500 to-red-400'
                      }`}
                      style={{ width: `${stock.sentimentScore || 70}%` }}
                    ></div>
                  </div>
                </div>

              </div>

              {/* Stock Footer Actions */}
              <div className="pt-3 border-t border-[#E2E0D8] flex items-center justify-between gap-3">
                <button
                  onClick={() => {
                    API.setActiveSymbol(stock.symbol);
                    onSelectStock(stock.symbol);
                  }}
                  className={`flex-1 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center space-x-1.5 transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-[#E2E0D8]'
                  }`}
                >
                  <BarChart2 className="w-4 h-4" />
                  <span>{isSelected ? 'Viewing Chart' : 'Select Stock'}</span>
                </button>

                <button
                  onClick={() => {
                    API.setActiveSymbol(stock.symbol);
                    onSelectStock(stock.symbol);
                    onOpenTradeModal();
                  }}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center space-x-1 shadow-md"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Trade</span>
                </button>

                {onDeleteStock && (
                  <button
                    onClick={() => onDeleteStock(stock.symbol)}
                    className="p-2.5 bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl border border-[#E2E0D8] hover:border-rose-200 transition-colors"
                    title="Delete Stock"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
