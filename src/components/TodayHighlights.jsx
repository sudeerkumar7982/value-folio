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
      <div className="bg-gradient-to-br from-white to-emerald-50/60 border border-emerald-200 rounded-2xl p-4.5 shadow-sm relative overflow-hidden group">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-emerald-700 flex items-center space-x-1.5 uppercase tracking-wider">
            <Flame className="w-4 h-4 text-emerald-600 fill-emerald-100" />
            <span>Top Positive Catalyst</span>
          </span>
          {topPositive && (
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
              +{topPositive.impactPercent}%
            </span>
          )}
        </div>

        {topPositive ? (
          <div>
            <h3 className="text-base font-extrabold text-slate-800 group-hover:text-emerald-700 transition-colors">
              "{topPositive.title}"
            </h3>
            <p className="text-xs text-slate-600 mt-1 line-clamp-1">
              {topPositive.description || 'Major breakthrough boosted human stock evaluation.'}
            </p>
            <div className="mt-2.5 flex items-center space-x-3 text-[11px] font-mono text-slate-500">
              <span>Sector: <strong className="text-emerald-700">{topPositive.sector}</strong></span>
              <span>•</span>
              <span>AI Confidence: <strong className="text-slate-700">{topPositive.confidence}%</strong></span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 py-2">No positive events recorded yet</p>
        )}
      </div>

      {/* Biggest Negative Highlight Card */}
      <div className="bg-gradient-to-br from-white to-rose-50/60 border border-rose-200 rounded-2xl p-4.5 shadow-sm relative overflow-hidden group">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-rose-700 flex items-center space-x-1.5 uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-rose-600 fill-rose-100" />
            <span>Market Setback / Challenge</span>
          </span>
          {topNegative && (
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
              {topNegative.impactPercent}%
            </span>
          )}
        </div>

        {topNegative ? (
          <div>
            <h3 className="text-base font-extrabold text-slate-800 group-hover:text-rose-700 transition-colors">
              "{topNegative.title}"
            </h3>
            <p className="text-xs text-slate-600 mt-1 line-clamp-1">
              {topNegative.description || 'Setback caused market price correction.'}
            </p>
            <div className="mt-2.5 flex items-center space-x-3 text-[11px] font-mono text-slate-500">
              <span>Sector: <strong className="text-rose-700">{topNegative.sector}</strong></span>
              <span>•</span>
              <span>Importance: <strong className="text-slate-700">{topNegative.importance}</strong></span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 py-2">No negative events recorded yet</p>
        )}
      </div>

    </div>
  );
}
