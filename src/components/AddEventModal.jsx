import React, { useState, useEffect } from 'react';
import { X, Sparkles, AlertCircle, ArrowUpRight, ArrowDownRight, CheckCircle2, ShieldAlert, User } from 'lucide-react';
import { API } from '../utils/api.js';

export function AddEventModal({ isOpen, onClose, onCommitSuccess, currentPrice, stocks = [], activeSymbol }) {
  const [selectedSymbol, setSelectedSymbol] = useState(activeSymbol || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sector, setSector] = useState('Auto');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);

  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customImpact, setCustomImpact] = useState('');
  const [overrideImpact, setOverrideImpact] = useState(false);

  // Sync selectedSymbol when activeSymbol changes
  useEffect(() => {
    if (activeSymbol) setSelectedSymbol(activeSymbol);
  }, [activeSymbol]);

  // Debounced Live AI Sentiment Analysis Preview
  useEffect(() => {
    if (!title || title.trim().length < 3) {
      setAiAnalysis(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsAnalyzing(true);
      try {
        const data = await API.analyzeEvent(title, description, sector);
        setAiAnalysis(data);
        if (!overrideImpact) {
          setCustomImpact(data.impactPercent);
        }
      } catch (err) {
        console.error('Failed to analyze event:', err);
      } finally {
        setIsAnalyzing(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [title, description, sector]);

  if (!isOpen) return null;

  const selectedStock = stocks.find(s => s.symbol === selectedSymbol);
  const displayPrice = selectedStock?.currentPrice || currentPrice || 100;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (!selectedSymbol) {
      alert('Please select a stock to log this event for.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Temporarily set the active symbol on the server/local store so commitEvent targets correct stock
      await API.setActiveSymbol(selectedSymbol);

      const finalImpact = overrideImpact ? Number(customImpact) : (aiAnalysis ? aiAnalysis.impactPercent : 0);

      const data = await API.commitEvent({
        title,
        description,
        sector,
        customImpact: finalImpact,
        date: eventDate
      });

      if (data.success) {
        onCommitSuccess(data);
        onClose();
        // Reset form
        setTitle('');
        setDescription('');
        setAiAnalysis(null);
        setOverrideImpact(false);
      }
    } catch (err) {
      alert('Error committing life event: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };


  const isPos = aiAnalysis ? aiAnalysis.impactPercent >= 0 : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#151923] border border-[#232936] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#232936] flex items-center justify-between bg-[#1B212D]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Log Human Life Event</h2>
              <p className="text-xs text-slate-400">AI sentiment model evaluates life events and calculates stock impact</p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-[#232936]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">

          {/* Stock Selector — required */}
          <div className="bg-[#0B0E14] border border-[#2B354C] rounded-xl p-3.5 space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
              <User className="w-3.5 h-3.5 text-blue-400" />
              <span>Log Event For Which Stock? <span className="text-rose-400">*</span></span>
            </label>
            {stocks.length === 0 ? (
              <div className="text-xs text-slate-500 italic">No stocks listed yet. Create a stock first.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {stocks.map(s => (
                  <button
                    key={s.symbol}
                    type="button"
                    onClick={() => setSelectedSymbol(s.symbol)}
                    className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                      selectedSymbol === s.symbol
                        ? 'bg-blue-600/20 border-blue-500/60 ring-1 ring-blue-500/30'
                        : 'bg-[#151923] border-[#232936] hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 w-full">
                      <span className={`font-mono font-black text-xs ${selectedSymbol === s.symbol ? 'text-blue-300' : 'text-white'}`}>{s.symbol}</span>
                      {selectedSymbol === s.symbol && (
                        <span className="ml-auto text-[9px] font-extrabold bg-blue-500 text-white px-1.5 py-0.5 rounded">SELECTED</span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{s.name}</span>
                    <span className={`text-[10px] font-mono font-bold mt-1 ${(s.changePercent || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      ₹{s.currentPrice?.toFixed(2)} {(s.changePercent || 0) >= 0 ? '▲' : '▼'}{Math.abs(s.changePercent || 0)}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Preset Buttons */}
          <div>

            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Quick Life Event Ideas
            </label>
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                "🎓 Good exam result",
                "💼 Got software engineering job offer",
                "🚀 Deployed major full-stack AI project",
                "🏆 Won 1st place hackathon award",
                "❌ Rejected after final interview round",
                "🐛 Critical production outage failure"
              ].map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setTitle(sample)}
                  className="bg-[#1E2536] hover:bg-blue-600/20 hover:border-blue-500/40 text-slate-300 hover:text-blue-300 px-2.5 py-1 rounded-lg border border-[#2B354C] transition-colors"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>

          {/* Event Title Input */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Event Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Sudeer received a software engineering offer"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#232936] focus:border-blue-500 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm outline-none transition-all"
            />
          </div>

          {/* Description & Sector Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Description / Details (Optional)
              </label>
              <input
                type="text"
                placeholder="Details, context, or magnitude of event..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#0B0E14] border border-[#232936] focus:border-blue-500 rounded-xl px-4 py-2 text-white placeholder-slate-500 text-sm outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Life Sector
              </label>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full bg-[#0B0E14] border border-[#232936] focus:border-blue-500 rounded-xl px-3 py-2 text-white text-sm outline-none cursor-pointer"
              >
                <option value="Auto">Auto-Detect AI</option>
                <option value="Career">Career</option>
                <option value="Education">Education</option>
                <option value="Skills">Skills</option>
                <option value="Projects">Projects</option>
                <option value="Finance">Finance</option>
                <option value="Social">Social</option>
                <option value="Wellbeing">Wellbeing</option>
              </select>
            </div>
          </div>

          {/* Live AI Analysis Card */}
          <div className="bg-[#0B0E14] border border-[#232936] rounded-xl p-4 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-blue-400 flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Sentiment & Market Impact Model</span>
              </span>
              {isAnalyzing && (
                <span className="text-xs text-amber-400 font-mono animate-pulse">
                  Evaluating sentiment...
                </span>
              )}
            </div>

            {aiAnalysis ? (
              <div className="space-y-3 font-mono">
                
                {/* AI Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-[#151923] p-2 rounded-lg border border-[#232936]">
                    <span className="text-slate-500 block text-[10px]">SENTIMENT</span>
                    <span className={`font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {aiAnalysis.sentiment}
                    </span>
                  </div>

                  <div className="bg-[#151923] p-2 rounded-lg border border-[#232936]">
                    <span className="text-slate-500 block text-[10px]">CONFIDENCE</span>
                    <span className="font-bold text-blue-300">{aiAnalysis.confidence}%</span>
                  </div>

                  <div className="bg-[#151923] p-2 rounded-lg border border-[#232936]">
                    <span className="text-slate-500 block text-[10px]">IMPORTANCE</span>
                    <span className="font-bold text-indigo-300">{aiAnalysis.importance}</span>
                  </div>

                  <div className="bg-[#151923] p-2 rounded-lg border border-[#232936]">
                    <span className="text-slate-500 block text-[10px]">PRIMARY SECTOR</span>
                    <span className="font-bold text-slate-200">{aiAnalysis.primarySector}</span>
                  </div>
                </div>

                {/* Stock Price Preview Box */}
                <div className={`p-3 rounded-xl border flex items-center justify-between ${
                  isPos 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  <div>
                    <span className="text-xs font-semibold block">Calculated Price Impact</span>
                    <div className="flex items-center space-x-2 text-lg font-bold">
                      <span>₹{currentPrice.toFixed(2)}</span>
                      <span>➔</span>
                      <span>₹{aiAnalysis.estimatedNewPrice.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-2xl font-black">
                      {isPos ? '+' : ''}{aiAnalysis.impactPercent}%
                    </span>
                    <span className="text-xs block opacity-80">
                      ({isPos ? '+' : ''}₹{aiAnalysis.estimatedPriceChange.toFixed(2)})
                    </span>
                  </div>
                </div>

                {/* AI Explanation summary */}
                <p className="text-xs text-slate-400 font-sans leading-relaxed">
                  {aiAnalysis.summary}
                </p>

              </div>
            ) : (
              <div className="text-center py-4 text-xs text-slate-500">
                Type an event title above to see real-time AI sentiment analysis and price reaction
              </div>
            )}
          </div>

          {/* Override Impact Checkbox */}
          {aiAnalysis && (
            <div className="pt-1">
              <label className="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overrideImpact}
                  onChange={(e) => setOverrideImpact(e.target.checked)}
                  className="rounded border-[#232936] bg-[#0B0E14] text-blue-600 focus:ring-0"
                />
                <span>Manually override calculated market impact percentage (%)</span>
              </label>

              {overrideImpact && (
                <div className="mt-2 flex items-center space-x-3">
                  <input
                    type="number"
                    step="0.1"
                    value={customImpact}
                    onChange={(e) => setCustomImpact(e.target.value)}
                    className="w-32 bg-[#0B0E14] border border-[#232936] rounded-lg px-3 py-1.5 text-white font-mono text-sm"
                  />
                  <span className="text-xs text-slate-400">% impact</span>
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-3">
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-500/20 transition-all text-sm flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <span>Executing Market Reaction...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Commit Event & Update Stock Price</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
