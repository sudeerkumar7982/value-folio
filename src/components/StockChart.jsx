import React, { useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot } from 'recharts';
import { Bell, Bookmark, Link2, BarChart2, ArrowUpDown } from 'lucide-react';

export function StockChart({ priceTicks = [], profile, symbol = '' }) {
  // Default view: 1D
  const [timeRange, setTimeRange] = useState('1D');

  if (!priceTicks || priceTicks.length === 0) {
    return (
      <div className="bg-[#151923] border border-[#232936] rounded-2xl p-6 text-center text-slate-400 font-mono">
        No price history recorded yet.
      </div>
    );
  }

  const getFilteredData = () => {
    const now = new Date();

    // ── 1D: Clean 24-hour day from 12:00 AM to 11:59 PM ──
    if (timeRange === '1D') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

      // Opening price baseline at 12:00 AM
      const ticksBeforeToday = priceTicks.filter(t => new Date(t.timestamp).getTime() < startOfDay.getTime());
      const prevBaseline = ticksBeforeToday.length > 0 ? ticksBeforeToday[ticksBeforeToday.length - 1] : null;
      const openingPrice = prevBaseline ? prevBaseline.price : (priceTicks[0]?.price || 100);

      // Today's actual recorded ticks up to current time
      const todayTicks = priceTicks.filter(t => {
        const tMs = new Date(t.timestamp).getTime();
        return tMs >= startOfDay.getTime() && tMs <= now.getTime();
      });

      // Fixed 3-hour milestones for uniform X-axis display
      const hourMilestones = [
        { hour: 0,  min: 0,  label: '12:00 AM' },
        { hour: 3,  min: 0,  label: '3:00 AM' },
        { hour: 6,  min: 0,  label: '6:00 AM' },
        { hour: 9,  min: 0,  label: '9:00 AM' },
        { hour: 12, min: 0,  label: '12:00 PM' },
        { hour: 15, min: 0,  label: '3:00 PM' },
        { hour: 18, min: 0,  label: '6:00 PM' },
        { hour: 21, min: 0,  label: '9:00 PM' },
        { hour: 23, min: 59, label: '11:59 PM' }
      ];

      const pointsMap = new Map();

      // 1. Populate major 3-hour milestone anchors
      hourMilestones.forEach(m => {
        const mDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), m.hour, m.min, 0, 0);
        const isFuture = mDate.getTime() > now.getTime();

        if (isFuture) {
          pointsMap.set(m.label, {
            timestamp: mDate.toISOString(),
            dateLabel: m.label,
            fullDate: mDate.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
            price: null, // Blank in future
            label: `${m.label} (Upcoming)`,
            eventId: null,
            diff: 0,
            diffPct: 0
          });
        } else {
          // Find price up to this milestone
          const ticksUpToM = todayTicks.filter(t => new Date(t.timestamp).getTime() <= mDate.getTime());
          const mPrice = ticksUpToM.length > 0 ? ticksUpToM[ticksUpToM.length - 1].price : openingPrice;

          pointsMap.set(m.label, {
            timestamp: mDate.toISOString(),
            dateLabel: m.label,
            fullDate: mDate.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
            price: mPrice,
            label: `${m.label} Market Price`,
            eventId: null,
            diff: 0,
            diffPct: 0
          });
        }
      });

      // 2. Add EVERY single recorded price tick
      let prevP = openingPrice;

      todayTicks.forEach(tick => {
        const d = new Date(tick.timestamp);
        const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        const diff = Number((tick.price - prevP).toFixed(2));
        const diffPct = Number(((diff / prevP) * 100).toFixed(2));
        prevP = tick.price;

        pointsMap.set(tick.timestamp, {
          timestamp: tick.timestamp,
          dateLabel: timeStr,
          fullDate: d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
          price: tick.price,
          label: tick.label || 'Price Tick',
          eventId: tick.eventId,
          diff,
          diffPct
        });
      });

      // Sort points chronologically
      const sortedPoints = Array.from(pointsMap.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      return {
        formattedData: sortedPoints,
        openingPrice,
        xAxisTicks: hourMilestones.map(m => m.label)
      };
    }

    // ── 1W, 1M, 3M, 6M, 1Y, 3Y, 5Y, ALL (Rolling Windows relative to current date) ──
    let daysBack = null;
    if (timeRange === '1W') daysBack = 7;
    else if (timeRange === '1M') daysBack = 30;
    else if (timeRange === '3M') daysBack = 90;
    else if (timeRange === '6M') daysBack = 180;
    else if (timeRange === '1Y') daysBack = 365;
    else if (timeRange === '3Y') daysBack = 3 * 365;
    else if (timeRange === '5Y') daysBack = 5 * 365;

    let filtered = priceTicks;
    let openingPrice = priceTicks[0]?.price || 100;

    if (daysBack !== null) {
      const cutoffMs = now.getTime() - (daysBack * 24 * 60 * 60 * 1000);
      filtered = priceTicks.filter(t => new Date(t.timestamp).getTime() >= cutoffMs);

      // Previous baseline tick before rolling window start
      const ticksBeforeWindow = priceTicks.filter(t => new Date(t.timestamp).getTime() < cutoffMs);
      if (ticksBeforeWindow.length > 0) {
        openingPrice = ticksBeforeWindow[ticksBeforeWindow.length - 1].price;
      } else if (filtered.length > 0) {
        openingPrice = filtered[0].price;
      }

      // If fewer than 2 ticks in rolling window, include all recorded history
      if (filtered.length < 2) {
        filtered = priceTicks;
        openingPrice = priceTicks[0]?.price || 100;
      }
    }

    const formattedData = filtered.map((tick, idx) => {
      const d = new Date(tick.timestamp);
      let dateLabel;
      if (timeRange === '1W') {
        dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      } else if (timeRange === '1M' || timeRange === '3M') {
        dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        dateLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }

      const prevTick = idx > 0 ? filtered[idx - 1] : tick;
      const diff = Number((tick.price - prevTick.price).toFixed(2));
      const diffPct = Number(((diff / prevTick.price) * 100).toFixed(2));

      return {
        timestamp: tick.timestamp,
        dateLabel,
        fullDate: d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        price: tick.price,
        label: tick.label || 'Price Tick',
        eventId: tick.eventId,
        diff,
        diffPct
      };
    });

    return { formattedData, openingPrice, xAxisTicks: undefined };
  };

  const { formattedData, openingPrice, xAxisTicks } = getFilteredData();

  // Find latest non-null price
  const validPrices = formattedData.filter(d => d.price !== null).map(d => d.price);
  const latestPrice = validPrices.length > 0 ? validPrices[validPrices.length - 1] : openingPrice;
  const periodChangeAmt = Number((latestPrice - openingPrice).toFixed(2));
  const periodChangePct = openingPrice > 0 ? Number(((periodChangeAmt / openingPrice) * 100).toFixed(2)) : 0;
  const isUpTrend = periodChangeAmt >= 0;
  const strokeColor = isUpTrend ? '#10B981' : '#EF4444';

  const minPrice = validPrices.length > 0 ? Math.max(Math.floor(Math.min(...validPrices) * 0.96), 0) : 0;
  const maxPrice = validPrices.length > 0 ? Math.ceil(Math.max(...validPrices) * 1.04) : 200;

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      if (data.price === null) return null;
      const isPos = data.diff >= 0;

      return (
        <div className="bg-[#1A202C] border border-[#2D3748] p-3 rounded-xl shadow-2xl max-w-xs font-mono">
          <div className="flex items-center justify-between border-b border-[#2D3748] pb-1.5 mb-1.5">
            <span className="text-xs text-slate-400 font-semibold">{data.fullDate}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
              {profile?.symbol || symbol}
            </span>
          </div>

          <div className="text-slate-100 font-bold text-sm mb-1">
            {data.label}
          </div>

          <div className="flex items-baseline justify-between mt-1.5">
            <span className="text-lg font-extrabold text-white">₹{data.price.toFixed(2)}</span>
            {data.eventId && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                isPos ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
              }`}>
                {isPos ? '+' : ''}{data.diffPct}%
              </span>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-[#151923] border border-[#232936] rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-4 font-['Plus_Jakarta_Sans',sans-serif]">
      
      {/* ── Top Header Section (Matching Dixon Technologies Layout) ── */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          {/* Logo Badge + Exchange Selector */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/60 flex items-center justify-center shadow-inner">
              <span className="text-emerald-400 font-extrabold text-sm tracking-wider">
                {(profile?.symbol || symbol).slice(0, 3)}
              </span>
            </div>
            <div>
              <div className="flex items-center space-x-1 text-xs text-slate-400 font-semibold">
                <span>{profile?.symbol || symbol} &bull; HLSE</span>
                <ArrowUpDown className="w-3 h-3 text-slate-500" />
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                {profile?.name || 'KALLA SUDEER KUMAR'}
              </h1>
            </div>
          </div>

          {/* Big Price + Percentage Change Row */}
          <div className="flex items-baseline space-x-3 pt-1">
            <span className="text-3xl font-extrabold text-white tracking-tight">
              ₹{latestPrice.toFixed(2)}
            </span>
            <span className={`text-sm font-semibold flex items-center space-x-1 ${
              isUpTrend ? 'text-emerald-400' : 'text-rose-500'
            }`}>
              <span>{periodChangeAmt >= 0 ? '+' : ''}{periodChangeAmt.toFixed(2)}</span>
              <span>({periodChangePct >= 0 ? '+' : ''}{periodChangePct.toFixed(2)}%)</span>
              <span className="text-slate-400 text-xs font-normal ml-1">{timeRange}</span>
            </span>
          </div>
        </div>

        {/* Top Right Quick Controls */}
        <div className="flex items-center space-x-2 text-slate-400">
          <button className="p-2 rounded-full border border-slate-800 hover:border-slate-600 hover:text-white transition-all bg-[#0B0E14]">
            <Link2 className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-full border border-slate-800 hover:border-slate-600 hover:text-white transition-all bg-[#0B0E14]">
            <Bell className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-full border border-slate-800 hover:border-slate-600 hover:text-white transition-all bg-[#0B0E14]">
            <Bookmark className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Main Line Chart with Horizontal Opening Price Reference Line ── */}
      <div className="h-72 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.25} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            
            <XAxis 
              dataKey="dateLabel" 
              ticks={xAxisTicks}
              stroke="#475569" 
              fontSize={11} 
              tickLine={false} 
              axisLine={{ stroke: '#232936' }} 
            />
            <YAxis 
              domain={[minPrice, maxPrice]} 
              stroke="#475569" 
              fontSize={11} 
              tickLine={false} 
              axisLine={{ stroke: '#232936' }}
              tickFormatter={(val) => `₹${val}`}
            />
            
            <Tooltip content={<CustomTooltip />} />

            {/* Horizontal Dashed Baseline Reference Line */}
            <ReferenceLine 
              y={openingPrice} 
              stroke="#475569" 
              strokeDasharray="4 4" 
              strokeWidth={1.5}
            />

            <Area 
              type="monotone" 
              dataKey="price" 
              stroke={strokeColor} 
              strokeWidth={2.5} 
              fillOpacity={1} 
              fill="url(#chartGradient)" 
              dot={false}
              connectNulls={false}
              activeDot={{ r: 6, fill: strokeColor, stroke: '#FFFFFF', strokeWidth: 2 }}
            />

            {/* Event Markers */}
            {formattedData.map((d, i) => d.eventId && d.price !== null && (
              <ReferenceDot
                key={i}
                x={d.dateLabel}
                y={d.price}
                r={5}
                fill={d.diff >= 0 ? '#10B981' : '#EF4444'}
                stroke="#FFFFFF"
                strokeWidth={1.5}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Bottom Controls Bar ── */}
      <div className="pt-3 border-t border-[#232936] flex flex-wrap items-center justify-between gap-3">
        {/* Centered Time Range Selector Pills */}
        <div className="flex items-center justify-center gap-1.5 flex-1 flex-wrap">
          {['1D', '1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', 'All'].map((range) => {
            const rangeKey = range === 'All' ? 'ALL' : range;
            const isActive = timeRange === rangeKey;
            return (
              <button
                key={range}
                onClick={() => setTimeRange(rangeKey)}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                  isActive
                    ? 'border-2 border-slate-300 text-white bg-slate-800/80 shadow-md scale-105'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent hover:border-slate-800'
                }`}
              >
                {range}
              </button>
            );
          })}
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <button className="p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 hover:text-white bg-[#0B0E14]">
            <BarChart2 className="w-4 h-4" />
          </button>
          <button className="px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 hover:text-white bg-[#0B0E14] font-semibold flex items-center space-x-1">
            <span>Terminal</span>
            <span className="text-[10px] ml-0.5">⇂↾</span>
          </button>
        </div>
      </div>

    </div>
  );
}
