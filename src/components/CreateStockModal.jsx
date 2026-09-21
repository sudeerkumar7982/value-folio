import React, { useState } from 'react';
import { Rocket, Sparkles, X, CheckCircle2, ShieldCheck, Layers, Award } from 'lucide-react';
import { API } from '../utils/api.js';

export function CreateStockModal({ isOpen, onClose, onCreateSuccess }) {
  const [symbol, setSymbol] = useState('SUDK');
  const [name, setName] = useState('KALLA SUDEER KUMAR');
  const [bio, setBio] = useState('Software Engineer & Personal Life Ticker. Building human stock assets.');
  const [startingPrice, setStartingPrice] = useState(95);
  const [walletBalance, setWalletBalance] = useState(10000);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [sectors, setSectors] = useState({
    Career: 0,
    Education: 0,
    Skills: 0,
    Projects: 0,
    Finance: 0,
    Social: 0,
    Wellbeing: 0
  });

  if (!isOpen) return null;

  const handleSectorChange = (sector, val) => {
    setSectors(prev => ({
      ...prev,
      [sector]: Math.min(Math.max(Number(val), 0), 100)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!symbol.trim() || !name.trim()) return;

    setIsSubmitting(true);
    try {
      const data = await API.createStock({
        symbol: symbol.toUpperCase(),
        name,
        bio,
        startingPrice: Number(startingPrice),
        walletBalance: Number(walletBalance),
        initialSectors: sectors
      });

      onCreateSuccess(data);
      onClose();
    } catch (err) {
      alert('Error creating stock: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#151923] border border-[#232936] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#232936] flex items-center justify-between bg-gradient-to-r from-[#1B212D] to-[#121B2B]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl text-white shadow-lg shadow-blue-500/20">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Create Human Stock (IPO Launch)</h2>
              <p className="text-xs text-slate-400">Issue your personal stock ticker and start logging events freshly</p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-[#232936]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          
          {/* Ticker & Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Stock Ticker Symbol <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                maxLength="8"
                placeholder="e.g. SUDK"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="w-full bg-[#0B0E14] border border-[#232936] focus:border-blue-500 rounded-xl px-4 py-2.5 text-white font-mono font-bold text-sm outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Full Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Sudeer Kumar"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#0B0E14] border border-[#232936] focus:border-blue-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none"
              />
            </div>
          </div>

          {/* Headline Bio */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Personal Headline / Bio
            </label>
            <input
              type="text"
              placeholder="e.g. Full Stack Engineer & AI Innovator"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#232936] focus:border-blue-500 rounded-xl px-4 py-2 text-white placeholder-slate-500 text-sm outline-none"
            />
          </div>

          {/* Financial Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#0B0E14] p-3.5 rounded-xl border border-[#232936]">
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                IPO Starting Price (₹)
              </label>
              <input
                type="number"
                step="1"
                min="10"
                value={startingPrice}
                onChange={(e) => setStartingPrice(e.target.value)}
                className="w-full bg-[#151923] border border-[#232936] rounded-lg px-3 py-2 text-white font-mono text-sm font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Starting Virtual Cash Balance (₹)
              </label>
              <input
                type="number"
                step="1000"
                min="1000"
                value={walletBalance}
                onChange={(e) => setWalletBalance(e.target.value)}
                className="w-full bg-[#151923] border border-[#232936] rounded-lg px-3 py-2 text-white font-mono text-sm font-bold"
              />
            </div>
          </div>

          {/* Baseline Sector Ratings */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-2 flex items-center space-x-1.5">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Initial 7 Life Sector Baselines (0–100)</span>
            </label>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {Object.entries(sectors).map(([sec, val]) => (
                <div key={sec} className="bg-[#0B0E14] border border-[#232936] p-2 rounded-lg flex items-center justify-between">
                  <span className="text-slate-400 font-semibold">{sec}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={val}
                    onChange={(e) => handleSectorChange(sec, e.target.value)}
                    className="w-14 bg-[#151923] border border-[#232936] rounded px-1.5 py-0.5 text-center font-mono text-white text-xs font-bold"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-3">
            <button
              type="submit"
              disabled={isSubmitting || !symbol.trim() || !name.trim()}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-500/20 transition-all text-sm flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <span>Issuing IPO...</span>
              ) : (
                <>
                  <Rocket className="w-5 h-5" />
                  <span>Issue IPO & Launch {symbol.toUpperCase()} Human Stock</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
