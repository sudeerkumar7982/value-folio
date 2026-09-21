import React, { useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceDot } from 'recharts';
import { Zap } from 'lucide-react';

// Calendar boundary calculator
function getCalendarBounds(timeRange) {
  const now = new Date();

  if (timeRange === '1D') {
    // Today 12:00:00 AM (00:00) to 11:59:59 PM (23:59)
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start, end };
  }

  if (timeRange === '1W') {
    // Current calendar week: Sunday 12:00:00 AM to Sunday 11:59:59 PM
    const dayOfWeek = now.getDay(); // 0 is Sunday
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0, 0);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    return { start, end };
  }

  if (timeRange === '1M') {
    // Current calendar month: 1st of month 12:00:00 AM to last day 11:59:59 PM
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  if (timeRange === '3M') {
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
    const end = now;
    return { start, end };
  }

  if (timeRange === '6M') {
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);
    const end = now;
    return { start, end };
  }

  if (timeRange === '1Y') {
    // Current calendar year: Jan 1st 12:00:00 AM to Dec 31st 11:59:59 PM
    const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { start, end };
  }

  if (timeRange === '3Y') {
    const start = new Date(now.getFullYear() - 3, 0, 1, 0, 0, 0, 0);
    const end = now;
    return { start, end };
  }

  if (timeRange === '5Y') {
    const start = new Date(now.getFullYear() - 5, 0, 1, 0, 0, 0, 0);
    const end = now;
    return { start, end };
  }

  // ALL
  return { start: null, end: null };
}

function formatXAxisTick(dateObj, timeRange) {
  const d = new Date(dateObj);
  if (timeRange === '1D') {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  if (timeRange === '1W') {
    return d.toLocaleDateString('en-US', { weekday: 'short' }); // Sun, Mon, etc.
  }
  if (timeRange === '1M' || timeRange === '3M') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function StockChart({ priceTicks, symbol = 'SUDK' }) {
  const [timeRange, setTimeRange] = useState('1D');

  if (!priceTicks || priceTicks.length === 0) {
    return (
      <div className="bg-[#151923] border border-[#232936] rounded-2xl p-6 text-center text-slate-400">
        No price history recorded yet.
      </div>
    );
  }

  // Filter ticks based on exact calendar boundaries & anchor starting price
  const getFilteredTicks = () => {
    const { start, end } = getCalendarBounds(timeRange);
    if (!start) return priceTicks; // ALL

    const startMs = start.getTime();
    const endMs = end ? end.getTime() : Infinity;

    // Ticks within calendar window
    const ticksInWindow = priceTicks.filter(t => {
      const tMs = new Date(t.timestamp).getTime();
      return tMs >= startMs && tMs <= endMs;
    });

    // Last tick before window start
    const ticksBeforeWindow = priceTicks.filter(t => new Date(t.timestamp).getTime() < startMs);
    const prevBaseline = ticksBeforeWindow.length > 0 ? ticksBeforeWindow[ticksBeforeWindow.length - 1] : null;

    const openingPrice = prevBaseline ? prevBaseline.price : (priceTicks[0]?.price || 100);

    // Anchor at start of calendar window (12:00 AM / Sunday / Month start)
    const windowStartAnchor = {
      timestamp: start.toISOString(),
      price: openingPrice,
      eventId: null,
      label: timeRange === '1D' ? '12:00 AM Day Open' : timeRange === '1W' ? 'Sunday 12:00 AM' : 'Period Start'
    };

    let result = [windowStartAnchor, ...ticksInWindow];

    // If no ticks after start of today, add current timestamp tick to draw flat line at opening price
    if (ticksInWindow.length === 0) {
      result.push({
        timestamp: new Date().toISOString(),
        price: openingPrice,
        eventId: null,
        label: 'Live Market'
      });
    }

    return result;
  };

  const filteredTicks = getFilteredTicks();

  // Format data points for Recharts
  const formattedData = filteredTicks.map((tick, idx) => {
    const d = new Date(tick.timestamp);
    const dateLabel = formatXAxisTick(d, timeRange);
    const prevTick = idx > 0 ? filteredTicks[idx - 1] : tick;
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

  const isUpTrend = formattedData[formattedData.length - 1]?.price >= formattedData[0]?.price;
  const strokeColor = isUpTrend ? '#10B981' : '#EF4444';

  const minPrice = Math.max(Math.floor(Math.min(...formattedData.map(d => d.price)) * 0.95), 0);
  const maxPrice = Math.ceil(Math.max(...formattedData.map(d => d.price)) * 1.05);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isPos = data.diff >= 0;

      return (
        <div className="bg-[#1A202C] border border-[#2D3748] p-3.5 rounded-xl shadow-2xl max-w-xs font-mono">
          <div className="flex items-center justify-between border-b border-[#2D3748] pb-2 mb-2">
            <span className="text-xs text-slate-400 font-semibold">{data.fullDate}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
              {symbol}
            </span>
          </div>

          <div className="text-slate-100 font-bold text-base mb-1">
            {data.label}
          </div>

          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-extrabold text-white">₹{data.price.toFixed(2)}</span>
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
    <div className="bg-[#151923] border border-[#232936] rounded-2xl p-5 shadow-xl">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Zap className="w-5 h-5 text-blue-400" />
            <span>Human Life Price Timeline</span>
          </h2>
          <p className="text-xs text-slate-400">
            Calendar view: 1D (12 AM–11:59 PM), 1W (Sun–Sun), 1M, 1Y & All time
          </p>
        </div>

        {/* Time Period Tabs */}
        <div className="flex bg-[#0B0E14] p-1 rounded-xl border border-[#232936] self-start flex-wrap gap-1">
          {['1D', '1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', 'ALL'].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                timeRange === range
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-72 w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.4} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            
            <XAxis 
              dataKey="dateLabel" 
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
            
            <Area 
              type="monotone" 
              dataKey="price" 
              stroke={strokeColor} 
              strokeWidth={2.5} 
              fillOpacity={1} 
              fill="url(#colorPrice)" 
              dot={{ r: 4, fill: strokeColor, stroke: '#151923', strokeWidth: 2 }}
              activeDot={{ r: 7, fill: strokeColor, stroke: '#FFFFFF', strokeWidth: 2 }}
            />

            {/* Event Markers */}
            {formattedData.map((d, i) => d.eventId && (
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

      {/* Chart Legend Footer */}
      <div className="mt-4 pt-3 border-t border-[#232936] flex flex-wrap items-center justify-between text-xs text-slate-400">
        <div className="flex items-center space-x-4">
          <span className="flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5 inline-block"></span>
            Positive Life Event
          </span>
          <span className="flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mr-1.5 inline-block"></span>
            Negative Life Event
          </span>
        </div>
        <div className="font-mono text-slate-500">
          Hover points to inspect life event metadata
        </div>
      </div>
    </div>
  );
}
