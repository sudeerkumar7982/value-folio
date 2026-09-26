import React, { useState } from 'react';
import { Rocket, Flame, TrendingUp, Clock, CheckCircle2, ShieldCheck, Plus, Sparkles, UserCheck, AlertCircle, BarChart2, Trash2 } from 'lucide-react';
import { API } from '../utils/api.js';

export function IPOHub({ ipos = [], onRefresh, onSelectStock, onOpenCreateIPO }) {
  const [filter, setFilter] = useState('ALL'); // ALL, OPEN, UPCOMING, LISTED
  const [biddingIPO, setBiddingIPO] = useState(null);
  const [bidShares, setBidShares] = useState(1);
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);

  const handleDeleteIPO = async (ipoId, symbol) => {
    if (window.confirm(`Delete ${symbol} IPO from the IPO Hub?`)) {
      await API.deleteIPO(ipoId);
      onRefresh();
    }
  };

  const filteredIPOs = ipos.filter(ipo => {
    if (filter === 'OPEN') return ipo.status === 'OPEN';
    if (filter === 'UPCOMING') return ipo.status === 'UPCOMING';
    if (filter === 'LISTED') return ipo.status === 'LISTED';
    return true;
  });

  const openCount = ipos.filter(i => i.status === 'OPEN').length;
  const upcomingCount = ipos.filter(i => i.status === 'UPCOMING').length;
  const listedCount = ipos.filter(i => i.status === 'LISTED').length;

  const handleListStock = async (ipo) => {
    if (window.confirm(`Allot shares and list ${ipo.symbol} on the live Human Stock Exchange?`)) {
      try {
        await API.listIPOOnExchange(ipo.id);
        await API.setActiveSymbol(ipo.symbol);
        onRefresh();
        onSelectStock(ipo.symbol);
      } catch (err) {
        alert(`Unable to list ${ipo.symbol}: ${err.message}`);
      }
    }
  };

  const handleBidSubmit = async (e) => {
    e.preventDefault();
    if (!biddingIPO) return;

    setIsSubmittingBid(true);
    try {
      await API.bidIPO(biddingIPO.id, Number(bidShares) * biddingIPO.lotSize);
      alert(`🎉 Bid placed successfully for ${biddingIPO.symbol}! Registered ${Number(bidShares) * biddingIPO.lotSize} shares bid.`);
      setBiddingIPO(null);
      onRefresh();
    } catch (err) {
      alert('Error submitting bid: ' + err.message);
    } finally {
      setIsSubmittingBid(false);
    }
  };

  const getSentimentBadge = (sentiment, score) => {
    if (sentiment === 'VERY_BULLISH' || score >= 80) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-300">
          <Flame className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
          <span>Very Bullish ({score}%)</span>
        </span>
      );
    }
    if (sentiment === 'BULLISH' || score >= 60) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
          <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
          <span>Bullish ({score}%)</span>
        </span>
      );
    }
    if (sentiment === 'BEARISH' || score <= 40) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-300">
          <TrendingUp className="w-3.5 h-3.5 text-rose-600 rotate-180" />
          <span>Bearish ({score}%)</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300">
        <span>Neutral ({score}%)</span>
      </span>
    );
  };

  const getStatusBadge = (status) => {
    if (status === 'OPEN') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
          <span>Bidding Open</span>
        </span>
      );
    }
    if (status === 'UPCOMING') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300 flex items-center space-x-1">
          <Clock className="w-3 h-3 text-blue-600" />
          <span>Upcoming</span>
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300 flex items-center space-x-1">
        <CheckCircle2 className="w-3 h-3 text-purple-600" />
        <span>Listed</span>
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Header Banner - ValueFolio IPO Overview */}
      <div className="bg-white border border-[#E2E0D8] rounded-2xl p-6 shadow-sm relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/25 text-white">
                <Rocket className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
                  ValueFolio Human IPO Launchpad
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-mono">
                    Live Offering Engine
                  </span>
                </h1>
                <p className="text-sm text-slate-500">
                  Discover upcoming human stock offerings, check Grey Market Premium (GMP), bid, and list new stocks onto the market.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onOpenCreateIPO}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold px-5 py-3 rounded-xl shadow-lg shadow-blue-500/25 transition-all text-sm flex items-center space-x-2 shrink-0"
          >
            <Plus className="w-5 h-5" />
            <span>Launch New Human IPO</span>
          </button>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-[#E2E0D8]">
          <div className="bg-[#F7F6F1] border border-[#E2E0D8] p-3.5 rounded-xl">
            <span className="text-xs text-slate-500 font-medium block mb-0.5">Open IPO Bids</span>
            <span className="text-xl font-bold text-emerald-600 font-mono">{openCount} Active</span>
          </div>
          <div className="bg-[#F7F6F1] border border-[#E2E0D8] p-3.5 rounded-xl">
            <span className="text-xs text-slate-500 font-medium block mb-0.5">Upcoming IPOs</span>
            <span className="text-xl font-bold text-blue-600 font-mono">{upcomingCount} Scheduled</span>
          </div>
          <div className="bg-[#F7F6F1] border border-[#E2E0D8] p-3.5 rounded-xl">
            <span className="text-xs text-slate-500 font-medium block mb-0.5">Avg GMP Expected Gain</span>
            <span className="text-xl font-bold text-amber-600 font-mono">+28.5%</span>
          </div>
          <div className="bg-[#F7F6F1] border border-[#E2E0D8] p-3.5 rounded-xl">
            <span className="text-xs text-slate-500 font-medium block mb-0.5">Recently Listed Stocks</span>
            <span className="text-xl font-bold text-purple-600 font-mono">{listedCount} Listed</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center bg-white border border-[#E2E0D8] p-1 rounded-xl space-x-1">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filter === 'ALL' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
          >
            All IPOs ({ipos.length})
          </button>
          <button
            onClick={() => setFilter('OPEN')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filter === 'OPEN' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
          >
            🔥 Open Bids ({openCount})
          </button>
          <button
            onClick={() => setFilter('UPCOMING')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filter === 'UPCOMING' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
          >
            ⏳ Upcoming ({upcomingCount})
          </button>
          <button
            onClick={() => setFilter('LISTED')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filter === 'LISTED' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
          >
            ✅ Listed ({listedCount})
          </button>
        </div>
      </div>

      {/* IPO Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredIPOs.map(ipo => (
          <div
            key={ipo.id}
            className="bg-white border border-[#E2E0D8] hover:border-blue-400 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4 transition-all hover:translate-y-[-2px]"
          >
            {/* Top Info */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-extrabold font-mono text-base shadow-md">
                    {ipo.symbol.slice(0, 4)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                      {ipo.symbol}
                      <span className="text-xs text-slate-500 font-normal">({ipo.name})</span>
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-1">{ipo.bio}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1.5">
                  {getStatusBadge(ipo.status)}
                  <button
                    onClick={() => handleDeleteIPO(ipo.id, ipo.symbol)}
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Delete IPO"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Sentiment & GMP pill */}
              <div className="flex items-center justify-between bg-[#F7F6F1] p-2.5 rounded-xl border border-[#E2E0D8]">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-500">AI Sentiment:</span>
                  {getSentimentBadge(ipo.sentiment, ipo.sentimentScore || 75)}
                </div>
                {ipo.gmpPercent !== undefined && (
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase block font-semibold">Grey Market Premium</span>
                    <span className="text-xs font-bold text-emerald-600 font-mono">
                      +{ipo.gmpPercent}% (₹{ipo.gmpValue})
                    </span>
                  </div>
                )}
              </div>

              {/* IPO Key Metrics Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-[#F7F6F1] p-3 rounded-xl border border-[#E2E0D8]">
                <div>
                  <span className="text-slate-500 text-[11px] block">Price Range</span>
                  <span className="font-mono font-bold text-slate-800">{ipo.priceRange}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Min Lot Size</span>
                  <span className="font-mono font-bold text-slate-800">{ipo.lotSize} Shares</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Issue Size</span>
                  <span className="font-mono font-bold text-slate-800">{ipo.issueSize}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Subscription</span>
                  <span className="font-mono font-bold text-amber-600">{ipo.subscriptionRatio || '1.0x'}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-[#E2E0D8] flex items-center space-x-2">
              {ipo.status === 'OPEN' && (
                <>
                  <button
                    onClick={() => setBiddingIPO(ipo)}
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow-md"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Apply / Bid</span>
                  </button>

                  <button
                    onClick={() => handleListStock(ipo)}
                    className="bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center space-x-1 border border-purple-200"
                  >
                    <Rocket className="w-3.5 h-3.5" />
                    <span>List Stock</span>
                  </button>
                </>
              )}

              {ipo.status === 'UPCOMING' && (
                <button
                  onClick={() => handleListStock(ipo)}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow-md"
                >
                  <Rocket className="w-3.5 h-3.5" />
                  <span>Early Allot & List Stock</span>
                </button>
              )}

              {ipo.status === 'LISTED' && (
                <button
                  onClick={() => {
                    API.setActiveSymbol(ipo.symbol);
                    onSelectStock(ipo.symbol);
                  }}
                  className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 border border-blue-200"
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  <span>View Trading Dashboard</span>
                </button>
              )}
            </div>

          </div>
        ))}
      </div>

      {/* Virtual Bidding Modal */}
      {biddingIPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md animate-fadeIn">
          <div className="bg-white border border-[#E2E0D8] rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E0D8] pb-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-emerald-600" />
                <span>Bid for {biddingIPO.symbol} IPO</span>
              </h3>
              <button onClick={() => setBiddingIPO(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleBidSubmit} className="space-y-4">
              <div className="bg-[#F7F6F1] p-3 rounded-xl border border-[#E2E0D8] space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Issue Price:</span>
                  <span className="font-mono font-bold text-slate-800">₹{biddingIPO.issuePrice}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Lot Size:</span>
                  <span className="font-mono font-bold text-slate-800">{biddingIPO.lotSize} Shares / Lot</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Expected Listing Gain:</span>
                  <span className="font-mono font-bold text-emerald-600">+{biddingIPO.gmpPercent}%</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Number of Lots to Bid</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={bidShares}
                  onChange={(e) => setBidShares(e.target.value)}
                  className="w-full bg-[#F7F6F1] border border-[#E2E0D8] rounded-xl px-4 py-2.5 text-slate-800 font-mono font-bold text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="bg-[#F7F6F1] p-3 rounded-xl border border-[#E2E0D8] flex justify-between items-center text-sm">
                <span className="text-slate-500 text-xs">Total Bid Value:</span>
                <span className="font-mono font-bold text-emerald-600 text-base">
                  ₹{(biddingIPO.issuePrice * biddingIPO.lotSize * bidShares).toLocaleString()}
                </span>
              </div>

              <button
                type="submit"
                disabled={isSubmittingBid}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-bold py-3 rounded-xl text-sm shadow-md"
              >
                {isSubmittingBid ? 'Submitting Bid...' : 'Confirm Virtual IPO Bid'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
