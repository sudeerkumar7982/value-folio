import React, { useState } from 'react';
import { Settings, Key, Sparkles, X, Check, RefreshCw } from 'lucide-react';

export function SettingsModal({ isOpen, onClose, profile, onSaveSettings }) {
  const [symbol, setSymbol] = useState(profile?.symbol || '');
  const [name, setName] = useState(profile?.name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [startingPrice, setStartingPrice] = useState(profile?.startingPrice || 100);
  const [apiKey, setApiKey] = useState(profile?.apiKey || '');
  const [isSaved, setIsSaved] = useState(false);

  if (!isOpen || !profile) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          name,
          bio,
          startingPrice: Number(startingPrice),
          apiKey
        })
      });
      const updated = await res.json();
      onSaveSettings(updated);
      setIsSaved(true);
      setTimeout(() => {
        setIsSaved(false);
        onClose();
      }, 800);
    } catch (err) {
      alert('Error updating settings: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md animate-fadeIn">
      <div className="bg-white border border-[#E2E0D8] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E0D8] flex items-center justify-between bg-[#F7F6F1]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-50 rounded-xl text-blue-600 border border-blue-200">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Platform Settings</h2>
              <p className="text-xs text-slate-500">Customize stock ticker profile and AI sentiment integrations</p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-2 rounded-lg hover:bg-[#E2E0D8]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Stock Ticker Symbol</label>
              <input
                type="text"
                required
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="w-full bg-[#F7F6F1] border border-[#E2E0D8] rounded-xl px-3 py-2 text-slate-800 font-mono font-bold text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Human Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#F7F6F1] border border-[#E2E0D8] rounded-xl px-3 py-2 text-slate-800 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">IPO Starting Stock Price (₹)</label>
            <input
              type="number"
              step="1"
              value={startingPrice}
              onChange={(e) => setStartingPrice(e.target.value)}
              className="w-full bg-[#F7F6F1] border border-[#E2E0D8] rounded-xl px-3 py-2 text-slate-800 font-mono text-sm"
            />
          </div>

          {/* Gemini LLM API Key Box */}
          <div className="bg-[#F7F6F1] border border-[#E2E0D8] rounded-xl p-3.5 space-y-2">
            <div className="flex items-center space-x-2 text-xs font-bold text-indigo-600">
              <Sparkles className="w-4 h-4" />
              <span>External LLM API Key (Optional)</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              The platform operates with a built-in zero-config offline NLP model. Optionally add your Google Gemini API key for deep contextual AI reasoning.
            </p>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-white border border-[#E2E0D8] rounded-lg px-3 py-2 text-slate-800 font-mono text-xs outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl transition-all text-sm flex items-center justify-center space-x-2"
          >
            {isSaved ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Settings Saved!</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
