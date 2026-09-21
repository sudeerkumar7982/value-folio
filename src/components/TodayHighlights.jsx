import React from 'react';
import { Flame, AlertTriangle, ArrowUpRight, ArrowDownRight, Award } from 'lucide-react';

export function TodayHighlights({ events }) {
  if (!events || events.length === 0) return null;

  // Find biggest positive and biggest negative event
  const positiveEvents = [...events].filter(e => e.impactPercent > 0).sort((a, b) => b.impactPercent - a.impactPercent);
  const negativeEvents = [...events].filter(e => e.impactPercent < 0).sort((a, b) => a.impactPercent - b.impactPercent);

  const topPositive = positiveEvents[0];
  const topNegative = negativeEvents[0];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      
      {/* Biggest Positive Highlight Card */}
      <div className="bg-gradient-to-br from-[#151923] to-[#12231E] border border-emerald-500/30 rounded-2xl p-4.5 shadow-xl relative overflow-hidden group">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1.5 uppercase tracking-wider">
            <Flame className="w-4 h-4 text-emerald-400 fill-emerald-500/20" />
            <span>Top Positive Catalyst</span>
          </span>
          {topPositive && (
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              +{topPositive.impactPercent}%
            </span>
          )}
        </div>

        {topPositive ? (
          <div>
            <h3 className="text-base font-extrabold text-white group-hover:text-emerald-300 transition-colors">
              "{topPositive.title}"
            </h3>
            <p className="text-xs text-slate-300 mt-1 line-clamp-1">
              {topPositive.description || 'Major breakthrough boosted human stock evaluation.'}
            </p>
            <div className="mt-2.5 flex items-center space-x-3 text-[11px] font-mono text-slate-400">
              <span>Sector: <strong className="text-emerald-400">{topPositive.sector}</strong></span>
              <span>•</span>
              <span>AI Confidence: <strong className="text-white">{topPositive.confidence}%</strong></span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-2">No positive events recorded yet</p>
        )}
      </div>

      {/* Biggest Negative Highlight Card */}
      <div className="bg-gradient-to-br from-[#151923] to-[#25151A] border border-rose-500/30 rounded-2xl p-4.5 shadow-xl relative overflow-hidden group">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-rose-400 flex items-center space-x-1.5 uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-rose-400 fill-rose-500/20" />
            <span>Market Setback / Challenge</span>
          </span>
          {topNegative && (
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
              {topNegative.impactPercent}%
            </span>
          )}
        </div>

        {topNegative ? (
          <div>
            <h3 className="text-base font-extrabold text-white group-hover:text-rose-300 transition-colors">
              "{topNegative.title}"
            </h3>
            <p className="text-xs text-slate-300 mt-1 line-clamp-1">
              {topNegative.description || 'Setback caused market price correction.'}
            </p>
            <div className="mt-2.5 flex items-center space-x-3 text-[11px] font-mono text-slate-400">
              <span>Sector: <strong className="text-rose-400">{topNegative.sector}</strong></span>
              <span>•</span>
              <span>Importance: <strong className="text-white">{topNegative.importance}</strong></span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-2">No negative events recorded yet</p>
        )}
      </div>

    </div>
  );
}
