import React, { useState } from 'react';
import { Newspaper, Search, Filter, ArrowUpRight, ArrowDownRight, Tag, Trash2 } from 'lucide-react';

export function LifeNewsFeed({ events, onClearEvents, onDeleteSingleEvent }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [sentimentFilter, setSentimentFilter] = useState('ALL');

  if (!events) return null;

  const filtered = events.filter((evt) => {
    const matchesSearch = evt.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (evt.description && evt.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesSector = sectorFilter === 'ALL' || evt.sector === sectorFilter;
    const matchesSentiment = sentimentFilter === 'ALL' || evt.sentiment === sentimentFilter;
    return matchesSearch && matchesSector && matchesSentiment;
  });

  return (
    <div className="bg-[#151923] border border-[#232936] rounded-2xl p-5 shadow-xl">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Newspaper className="w-5 h-5 text-emerald-400" />
            <span>Human Life Events Newsfeed</span>
          </h2>
          <p className="text-xs text-slate-400">Chronological ledger of real-life catalysts impacting stock valuation</p>
        </div>

        {/* Filter Controls & Clear Button */}
        <div className="flex flex-wrap items-center gap-2">
          {events.length > 0 && (
            <button
              onClick={onClearEvents}
              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs px-2.5 py-2 rounded-xl flex items-center space-x-1.5 transition-colors font-medium"
              title="Delete all news feed events"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All Events</span>
            </button>
          )}

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search life events..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#0B0E14] border border-[#232936] text-xs text-white placeholder-slate-500 rounded-xl pl-8 pr-3 py-2 outline-none focus:border-blue-500"
            />
          </div>

          {/* Sector Select */}
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="bg-[#0B0E14] border border-[#232936] text-xs text-slate-300 rounded-xl px-3 py-2 outline-none cursor-pointer"
          >
            <option value="ALL">All Sectors</option>
            <option value="Career">Career</option>
            <option value="Education">Education</option>
            <option value="Skills">Skills</option>
            <option value="Projects">Projects</option>
            <option value="Finance">Finance</option>
            <option value="Social">Social</option>
            <option value="Wellbeing">Wellbeing</option>
          </select>

          {/* Sentiment Filter */}
          <select
            value={sentimentFilter}
            onChange={(e) => setSentimentFilter(e.target.value)}
            className="bg-[#0B0E14] border border-[#232936] text-xs text-slate-300 rounded-xl px-3 py-2 outline-none cursor-pointer"
          >
            <option value="ALL">All Sentiment</option>
            <option value="POSITIVE">Positive 📈</option>
            <option value="NEGATIVE">Negative 📉</option>
          </select>
        </div>
      </div>

      {/* Events List */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
        {filtered.length > 0 ? (
          filtered.map((evt) => {
            const isPos = evt.impactPercent >= 0;
            const dateStr = new Date(evt.timestamp).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            return (
              <div
                key={evt.id}
                className="bg-[#0B0E14] border border-[#232936] hover:border-[#3B82F6]/50 rounded-xl p-4 transition-all group relative"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  
                  {/* Event Information */}
                  <div className="flex-1 pr-2">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      {/* Sentiment Badge */}
                      <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md flex items-center ${
                        isPos
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}>
                        {isPos ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                        {isPos ? '+' : ''}{evt.impactPercent}%
                      </span>

                      {/* Sector Badge */}
                      <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {evt.sector}
                      </span>

                      {/* AI Confidence */}
                      <span className="text-[10px] font-mono text-slate-400">
                        AI Confidence: <strong className="text-slate-200">{evt.confidence}%</strong>
                      </span>

                      <span className="text-[10px] font-mono text-slate-500 ml-auto">
                        {dateStr}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors">
                      {evt.title}
                    </h4>

                    {evt.description && (
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {evt.description}
                      </p>
                    )}
                  </div>

                  {/* Price Movement Box & Delete Button */}
                  <div className="flex items-center space-x-2 self-start">
                    <div className="bg-[#151923] border border-[#232936] px-3 py-2 rounded-xl text-right font-mono min-w-[110px]">
                      <span className="text-[10px] text-slate-500 block">PRICE IMPACT</span>
                      <div className="text-xs font-bold text-slate-400">
                        ₹{evt.previousPrice?.toFixed(2)} ➔
                      </div>
                      <div className={`text-sm font-extrabold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ₹{evt.newPrice?.toFixed(2)}
                      </div>
                    </div>

                    {/* Delete Single Event Button */}
                    <button
                      onClick={() => onDeleteSingleEvent && onDeleteSingleEvent(evt.id)}
                      className="p-2 text-slate-500 hover:text-rose-400 bg-[#151923] hover:bg-rose-500/20 border border-[#232936] hover:border-rose-500/30 rounded-xl transition-all"
                      title="Delete this news event"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-xs text-slate-500">
            No life events match the selected filters.
          </div>
        )}
      </div>

    </div>
  );
}
