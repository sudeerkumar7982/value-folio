import React from 'react';
import { Briefcase, GraduationCap, Code, Rocket, DollarSign, Users, HeartPulse, Layers } from 'lucide-react';

const SECTOR_ICONS = {
  Career: <Briefcase className="w-4 h-4 text-blue-400" />,
  Education: <GraduationCap className="w-4 h-4 text-amber-400" />,
  Skills: <Code className="w-4 h-4 text-purple-400" />,
  Projects: <Rocket className="w-4 h-4 text-emerald-400" />,
  Finance: <DollarSign className="w-4 h-4 text-teal-400" />,
  Social: <Users className="w-4 h-4 text-pink-400" />,
  Wellbeing: <HeartPulse className="w-4 h-4 text-rose-400" />
};

export function SectorBreakdown({ sectors }) {
  if (!sectors) return null;

  const entries = Object.entries(sectors);

  return (
    <div className="bg-[#151923] border border-[#232936] rounded-2xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <span>Human Life Sectors</span>
          </h2>
          <p className="text-xs text-slate-400">Fundamental life pillars driving stock valuation</p>
        </div>
        <span className="text-xs font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-1 rounded-lg">
          7 SECTORS ACTIVE
        </span>
      </div>

      <div className="space-y-3.5">
        {entries.map(([sector, score]) => {
          const icon = SECTOR_ICONS[sector] || <Layers className="w-4 h-4 text-slate-400" />;
          
          let barColor = 'bg-blue-500';
          if (score >= 85) barColor = 'bg-gradient-to-r from-emerald-500 to-teal-400';
          else if (score >= 70) barColor = 'bg-gradient-to-r from-blue-500 to-indigo-400';
          else if (score >= 50) barColor = 'bg-gradient-to-r from-amber-500 to-yellow-400';
          else barColor = 'bg-gradient-to-r from-rose-500 to-red-400';

          return (
            <div key={sector} className="group">
              <div className="flex items-center justify-between text-xs mb-1.5 font-mono">
                <div className="flex items-center space-x-2">
                  <div className="p-1 rounded-md bg-[#0B0E14] border border-[#232936]">
                    {icon}
                  </div>
                  <span className="text-slate-200 font-semibold">{sector}</span>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-slate-400 font-bold">{score} / 100</span>
                </div>
              </div>

              {/* Progress Bar Container */}
              <div className="w-full h-2.5 bg-[#0B0E14] border border-[#232936] rounded-full overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
                  style={{ width: `${Math.min(Math.max(score, 5), 100)}%` }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
