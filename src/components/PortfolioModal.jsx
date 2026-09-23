import React, { useState, useEffect } from 'react';
import { X, Briefcase, TrendingUp, TrendingDown, DollarSign, PieChart, Clock, ShieldCheck, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { API } from '../utils/api.js';

export function PortfolioModal({ isOpen, onClose, onSelectStock, onOpenTradeModal }) {
  const [stocks, setStocks] = useState([]);
  const [activeTab, setActiveTab] = useState('HOLDINGS'); // HOLDINGS, ORDERS
  const [tradesHistory, setTradesHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadPortfolioData();
    }
  }, [isOpen]);

  const loadPortfolioData = async () => {
    try {
      const allStocks = await API.getAllStocks();
      setStocks(allStocks);

      try {
        const res = await fetch('/api/trades');
        if (res.ok) {
          const data = await res.json();
          setTradesHistory(Array.isArray(data) ? data : []);
        }
      } catch (e) {}
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Filter stocks where user owns shares (> 0)
  const holdings = stocks.filter(s => (s.sharesOwned || 0) > 0);

  // Financial calculations
  let totalInvested = 0;
  let currentValue = 0;
  let availableWallet = 10000;

  stocks.forEach(s => {
    if (s.walletBalance !== undefined) availableWallet = Math.max(availableWallet, s.walletBalance);
    const shares = s.sharesOwned || 0;
    const avgPrice = s.avgBuyPrice || s.startingPrice;
    const currPrice = s.currentPrice || s.startingPrice;

    totalInvested += shares * avgPrice;
    currentValue += shares * currPrice;
  });

  const totalPnL = currentValue - totalInvested;
  const totalPnLPct = totalInvested > 0 ? ((totalPnL / totalInvested) * 100) : 0;
  const netWorth = availableWallet + currentValue;
  const isPnLPositive = totalPnL >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#151923] border border-[#232936] rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#232936] flex items-center justify-between bg-gradient-to-r from-[#1B212D] to-[#121B2B]">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-xl text-white shadow-lg shadow-emerald-500/20">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                ValueFolio Asset Portfolio & Holdings
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                  Live Asset Ledger
                </span>
              </h2>
              <p className="text-xs text-slate-400">Track your virtual stock investments, returns, and order history across human tickers</p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-[#232936]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Portfolio Summary Metric Cards */}
        <div className="p-6 bg-[#0B0E14] border-b border-[#232936] grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-[#151923] border border-[#232936] p-3.5 rounded-xl">
            <span className="text-xs text-slate-400 block mb-0.5 font-medium">Total Net Worth</span>
            <span className="text-xl font-black text-white font-mono">₹{netWorth.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>

          <div className="bg-[#151923] border border-[#232936] p-3.5 rounded-xl">
            <span className="text-xs text-slate-400 block mb-0.5 font-medium">Total Invested</span>
            <span className="text-xl font-bold text-slate-200 font-mono">₹{totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>

          <div className="bg-[#151923] border border-[#232936] p-3.5 rounded-xl">
            <span className="text-xs text-slate-400 block mb-0.5 font-medium">Current Value</span>
            <span className="text-xl font-bold text-white font-mono">₹{currentValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>

          <div className="bg-[#151923] border border-[#232936] p-3.5 rounded-xl">
            <span className="text-xs text-slate-400 block mb-0.5 font-medium">Total P&L</span>
            <div className={`text-xl font-black font-mono flex items-center ${isPnLPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isPnLPositive ? <ArrowUpRight className="w-4 h-4 mr-0.5" /> : <ArrowDownRight className="w-4 h-4 mr-0.5" />}
              <span>{isPnLPositive ? '+' : ''}₹{totalPnL.toFixed(2)} ({isPnLPositive ? '+' : ''}{totalPnLPct.toFixed(2)}%)</span>
            </div>
          </div>
        </div>

        {/* Navigation Sub-Tabs */}
        <div className="flex items-center space-x-2 px-6 pt-4 border-b border-[#232936] bg-[#151923]">
          <button
            onClick={() => setActiveTab('HOLDINGS')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all px-2 ${
              activeTab === 'HOLDINGS'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            My Holdings ({holdings.length})
          </button>
          <button
            onClick={() => setActiveTab('ORDERS')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all px-2 ${
              activeTab === 'ORDERS'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Order Book Ledger ({tradesHistory.length})
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          
          {/* TAB 1: Holdings */}
          {activeTab === 'HOLDINGS' && (
            holdings.length > 0 ? (
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#232936] text-slate-400 uppercase font-mono text-[11px]">
                        <th className="py-2.5 px-3">Stock Ticker</th>
                        <th className="py-2.5 px-3 text-right">Shares</th>
                        <th className="py-2.5 px-3 text-right">Avg Buy (₹)</th>
                        <th className="py-2.5 px-3 text-right">CMP (₹)</th>
                        <th className="py-2.5 px-3 text-right">Invested (₹)</th>
                        <th className="py-2.5 px-3 text-right">Current (₹)</th>
                        <th className="py-2.5 px-3 text-right">Returns P&L</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#232936]/60">
                      {holdings.map(stock => {
                        const shares = stock.sharesOwned || 0;
                        const avgPrice = stock.avgBuyPrice || stock.startingPrice;
                        const currPrice = stock.currentPrice || stock.startingPrice;
                        const inv = shares * avgPrice;
                        const val = shares * currPrice;
                        const pnl = val - inv;
                        const pnlPct = inv > 0 ? (pnl / inv) * 100 : 0;
                        const isGain = pnl >= 0;

                        return (
                          <tr key={stock.symbol} className="hover:bg-[#1C2230] transition-colors font-mono">
                            <td className="py-3 px-3">
                              <div className="font-bold text-white text-sm">{stock.symbol}</div>
                              <div className="text-[11px] text-slate-400 line-clamp-1 font-sans">{stock.name}</div>
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-slate-200">{shares}</td>
                            <td className="py-3 px-3 text-right text-slate-300">₹{avgPrice.toFixed(2)}</td>
                            <td className="py-3 px-3 text-right font-bold text-white">₹{currPrice.toFixed(2)}</td>
                            <td className="py-3 px-3 text-right text-slate-300">₹{inv.toFixed(2)}</td>
                            <td className="py-3 px-3 text-right font-bold text-white">₹{val.toFixed(2)}</td>
                            <td className={`py-3 px-3 text-right font-bold ${isGain ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isGain ? '+' : ''}₹{pnl.toFixed(2)} ({isGain ? '+' : ''}{pnlPct.toFixed(2)}%)
                            </td>
                            <td className="py-3 px-3 text-center">
                              <button
                                onClick={() => {
                                  API.setActiveSymbol(stock.symbol);
                                  onSelectStock(stock.symbol);
                                  onOpenTradeModal();
                                  onClose();
                                }}
                                className="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 px-3 py-1 rounded-lg text-xs font-bold font-sans transition-all"
                              >
                                Trade
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 font-mono space-y-2">
                <Briefcase className="w-10 h-10 mx-auto text-slate-600" />
                <p className="text-base font-bold text-slate-300 font-sans">No Stock Holdings Yet</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto font-sans">
                  Execute virtual BUY orders on listed stocks or bid for IPOs to build your human stock portfolio!
                </p>
              </div>
            )
          )}

          {/* TAB 2: Order Book History */}
          {activeTab === 'ORDERS' && (
            tradesHistory.length > 0 ? (
              <div className="space-y-2">
                {tradesHistory.map(trade => (
                  <div
                    key={trade.id}
                    className="bg-[#0B0E14] border border-[#232936] p-3.5 rounded-xl flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center space-x-3">
                      <span className={`px-2.5 py-1 rounded-lg font-extrabold text-xs ${
                        trade.type === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}>
                        {trade.type}
                      </span>
                      <div>
                        <span className="font-bold text-white text-sm">{trade.shares} Shares</span>
                        <span className="text-slate-400 text-[11px] block">
                          Executed @ ₹{Number(trade.price).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-bold text-white text-sm block">₹{Number(trade.totalAmount).toFixed(2)}</span>
                      <span className="text-slate-500 text-[10px]">
                        {new Date(trade.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 font-mono space-y-2">
                <Clock className="w-10 h-10 mx-auto text-slate-600" />
                <p className="text-base font-bold text-slate-300 font-sans">No Order History Logged</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto font-sans">
                  All executed trade orders will be recorded here in real-time.
                </p>
              </div>
            )
          )}

        </div>
      </div>
    </div>
  );
}
