import React, { useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot } from 'recharts';
import { Bell, Bookmark, Link2, BarChart2, ArrowUpDown } from 'lucide-react';
import { getCircuitLimitsBySentiment } from '../utils/api.js';

export function StockChart({ priceTicks = [], profile, symbol = '' }) {
  // Default view: 1D
  const [timeRange, setTimeRange] = useState('1D');

  const ticks = (priceTicks && priceTicks.length > 0)
    ? priceTicks
    : [{ timestamp: new Date().toISOString(), price: profile?.currentPrice || 100, eventId: null, label: `${profile?.symbol || symbol || 'STOCK'} Listing Price` }];

  const getFilteredData = () => {
    const now = new Date();
    // Sort all price ticks chronologically
    const sortedTicks = [...ticks].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (timeRange === '1D') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const startOfDayMs = startOfDay.getTime();

      // Find opening baseline price at 12:00 AM daily
      const ticksBeforeToday = sortedTicks.filter(t => new Date(t.timestamp).getTime() < startOfDayMs);
      let openingPrice;
      if (ticksBeforeToday.length > 0) {
        openingPrice = ticksBeforeToday[ticksBeforeToday.length - 1].price;
      } else if (profile?.startingPrice) {
        openingPrice = profile.startingPrice;
      } else if (sortedTicks.length > 0) {
        openingPrice = sortedTicks[0].price;
      } else {
        openingPrice = 100;
      }

      const sentimentData = {
        sentimentScore: profile?.sentimentScore ?? 50,
        sentiment: profile?.sentiment || 'NEUTRAL'
      };
      const circuits = getCircuitLimitsBySentiment(openingPrice, sentimentData);

      // Today's ticks starting from 12:00 AM
      const todayTicks = sortedTicks.filter(t => new Date(t.timestamp).getTime() >= startOfDayMs);
      const formattedData = [];

      // 1. Start line at 12:00 AM daily at the day's opening price
      formattedData.push({
        timeMs: startOfDayMs,
        timestamp: startOfDay.toISOString(),
        dateLabel: '12:00 AM',
        fullDate: startOfDay.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        price: Math.min(Math.max(openingPrice, circuits.lowerCircuit), circuits.upperCircuit),
        label: 'Day Opening Price (12:00 AM)',
        eventId: null,
        diff: 0,
        diffPct: 0
      });

      // 2. If the first tick of today happened after 12:00 AM, maintain opening baseline up to that moment
      if (todayTicks.length > 0) {
        const firstTickTime = new Date(todayTicks[0].timestamp).getTime();
        if (firstTickTime - startOfDayMs > 60000) {
          const preTickD = new Date(firstTickTime - 1000);
          formattedData.push({
            timeMs: preTickD.getTime(),
            timestamp: preTickD.toISOString(),
            dateLabel: preTickD.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
            fullDate: preTickD.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
            price: Math.min(Math.max(openingPrice, circuits.lowerCircuit), circuits.upperCircuit),
            label: 'Day Opening Baseline',
            eventId: null,
            diff: 0,
            diffPct: 0
          });
        }
      }

      // 3. Continuous price ticks and events throughout the day
      let prevP = openingPrice;
      todayTicks.forEach(tick => {
        const d = new Date(tick.timestamp);
        const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        const clampedP = Math.min(Math.max(tick.price, circuits.lowerCircuit), circuits.upperCircuit);
        const diff = Number((clampedP - prevP).toFixed(2));
        const diffPct = prevP > 0 ? Number(((diff / prevP) * 100).toFixed(2)) : 0;
        prevP = clampedP;

        formattedData.push({
          timeMs: d.getTime(),
          timestamp: tick.timestamp,
          dateLabel: timeStr,
          fullDate: d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' }),
          price: clampedP,
          label: tick.label || 'Live Price Tick',
          eventId: tick.eventId,
          diff,
          diffPct
        });
      });

      // 4. Always extend line continuously to current time right NOW
      const rawLatestPrice = sortedTicks.length > 0 ? sortedTicks[sortedTicks.length - 1].price : openingPrice;
      const latestPrice = Math.min(Math.max(rawLatestPrice, circuits.lowerCircuit), circuits.upperCircuit);
      const lastPointMs = formattedData.length > 0 ? formattedData[formattedData.length - 1].timeMs : startOfDayMs;

      if (now.getTime() - lastPointMs > 5000) {
        formattedData.push({
          timeMs: now.getTime(),
          timestamp: now.toISOString(),
          dateLabel: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
          fullDate: now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
          price: latestPrice,
          label: 'Current Live Market Price',
          eventId: null,
          diff: 0,
          diffPct: 0
        });
      }

      return {
        formattedData,
        openingPrice,
        isNumericDomain: true,
        xDomain: [startOfDayMs, Math.max(now.getTime(), startOfDayMs + 3600000)],
        xTicks: undefined,
        xFormatter: (val) => {
          const d = new Date(val);
          return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        }
      };
    }

    // ── 1W, 1M, 3M, 6M, 1Y, 3Y, 5Y, ALL ──
    let daysBack = null;
    if (timeRange === '1W') daysBack = 7;
    else if (timeRange === '1M') daysBack = 30;
    else if (timeRange === '3M') daysBack = 90;
    else if (timeRange === '6M') daysBack = 180;
    else if (timeRange === '1Y') daysBack = 365;
    else if (timeRange === '3Y') daysBack = 3 * 365;
    else if (timeRange === '5Y') daysBack = 5 * 365;

    let filtered = sortedTicks;
    let openingPrice = sortedTicks[0]?.price || 100;

    if (daysBack !== null) {
      const cutoffMs = now.getTime() - (daysBack * 24 * 60 * 60 * 1000);
      filtered = sortedTicks.filter(t => new Date(t.timestamp).getTime() >= cutoffMs);
      const beforeWindow = sortedTicks.filter(t => new Date(t.timestamp).getTime() < cutoffMs);
      if (beforeWindow.length > 0) {
        openingPrice = beforeWindow[beforeWindow.length - 1].price;
      } else if (filtered.length > 0) {
        openingPrice = filtered[0].price;
      }

      if (filtered.length < 2) {
        filtered = sortedTicks;
        openingPrice = sortedTicks[0]?.price || 100;
      }
    }

    let prevP = openingPrice;
    const formattedData = [];

    // Prepend baseline start point if only 1 tick exists
    if (filtered.length === 1) {
      const firstD = new Date(filtered[0].timestamp);
      const baselineD = new Date(firstD.getTime() - 3600000);
      formattedData.push({
        timeMs: baselineD.getTime(),
        timestamp: baselineD.toISOString(),
        dateLabel: baselineD.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: baselineD.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        price: openingPrice,
        label: 'Base Offering Price',
        eventId: null,
        diff: 0,
        diffPct: 0
      });
    }

    filtered.forEach((tick) => {
      const d = new Date(tick.timestamp);
      let dateLabel;
      if (timeRange === '1W') {
        dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      } else if (timeRange === '1M' || timeRange === '3M') {
        dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        dateLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }

      const diff = Number((tick.price - prevP).toFixed(2));
      const diffPct = prevP > 0 ? Number(((diff / prevP) * 100).toFixed(2)) : 0;
      prevP = tick.price;

      formattedData.push({
        timeMs: d.getTime(),
        timestamp: tick.timestamp,
        dateLabel,
        fullDate: d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        price: tick.price,
        label: tick.label || 'Price Tick',
        eventId: tick.eventId,
        diff,
        diffPct
      });
    });

    // Always extend line to current timestamp right NOW
    const latestPrice = sortedTicks.length > 0 ? sortedTicks[sortedTicks.length - 1].price : openingPrice;
    const lastPointMs = formattedData.length > 0 ? formattedData[formattedData.length - 1].timeMs : 0;

    if (now.getTime() - lastPointMs > 60000) {
      formattedData.push({
        timeMs: now.getTime(),
        timestamp: now.toISOString(),
        dateLabel: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        price: latestPrice,
        label: 'Current Live Market Price',
        eventId: null,
        diff: 0,
        diffPct: 0
      });
    }

    return {
      formattedData,
      openingPrice,
      isNumericDomain: true,
      xDomain: ['dataMin', 'dataMax'],
      xTicks: undefined,
      xFormatter: (val) => {
        const d = new Date(val);
        if (timeRange === '1W') return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    };
  };

  const { formattedData, openingPrice, isNumericDomain, xDomain, xTicks, xFormatter } = getFilteredData();

  // Calculate dynamic Y-axis min/max bounds with padding
  const validPrices = formattedData.filter(d => d.price !== null && !isNaN(d.price)).map(d => d.price);
  const latestPrice = validPrices.length > 0 ? validPrices[validPrices.length - 1] : openingPrice;
  const periodChangeAmt = Number((latestPrice - openingPrice).toFixed(2));
  const periodChangePct = openingPrice > 0 ? Number(((periodChangeAmt / openingPrice) * 100).toFixed(2)) : 0;
  const isUpTrend = periodChangeAmt >= 0;
  const strokeColor = isUpTrend ? '#10B981' : '#EF4444';

  const minVal = validPrices.length > 0 ? Math.min(...validPrices, openingPrice) : openingPrice;
  const maxVal = validPrices.length > 0 ? Math.max(...validPrices, openingPrice) : openingPrice;
  const rangePadding = Math.max((maxVal - minVal) * 0.1, 1.5);

  const minPrice = Math.max(Number((minVal - rangePadding).toFixed(2)), 0);
  const maxPrice = Number((maxVal + rangePadding).toFixed(2));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      if (data.price === null || isNaN(data.price)) return null;
      const isPos = data.diff >= 0;

      return (
        <div className="bg-white border border-[#E2E0D8] p-3 rounded-xl shadow-xl max-w-xs font-mono">
          <div className="flex items-center justify-between border-b border-[#E2E0D8] pb-1.5 mb-1.5">
            <span className="text-xs text-slate-400 font-semibold">{data.fullDate}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-bold">
              {profile?.symbol || symbol}
            </span>
          </div>

          <div className="text-slate-700 font-bold text-sm mb-1">
            {data.label}
          </div>

          <div className="flex items-baseline justify-between mt-1.5">
            <span className="text-lg font-extrabold text-slate-800">₹{data.price.toFixed(2)}</span>
            {data.eventId && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                isPos ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
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

  const xDataKey = 'timeMs';

  return (
    <div className="bg-white border border-[#E2E0D8] rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4 font-['Plus_Jakarta_Sans',sans-serif]">
      
      {/* ── Top Header Section ── */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          {/* Logo Badge + Exchange Selector */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 border border-blue-500/30 flex items-center justify-center shadow">
              <span className="text-white font-extrabold text-sm tracking-wider">
                {(profile?.symbol || symbol).slice(0, 3)}
              </span>
            </div>
            <div>
              <div className="flex items-center space-x-1 text-xs text-slate-400 font-semibold">
                <span>{profile?.symbol || symbol} &bull; HLSE</span>
                <ArrowUpDown className="w-3 h-3 text-slate-400" />
              </div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                {profile?.name || 'HUMAN LIFE TICKER'}
              </h1>
            </div>
          </div>

          {/* Big Price + Percentage Change Row */}
          <div className="flex items-baseline space-x-3 pt-1">
            <span className="text-3xl font-extrabold text-slate-800 tracking-tight">
              ₹{latestPrice.toFixed(2)}
            </span>
            <span className={`text-sm font-semibold flex items-center space-x-1 ${
              isUpTrend ? 'text-emerald-600' : 'text-rose-500'
            }`}>
              <span>{periodChangeAmt >= 0 ? '+' : ''}{periodChangeAmt.toFixed(2)}</span>
              <span>({periodChangePct >= 0 ? '+' : ''}{periodChangePct.toFixed(2)}%)</span>
              <span className="text-slate-400 text-xs font-normal ml-1">{timeRange}</span>
            </span>
          </div>
        </div>

        {/* Top Right Quick Controls */}
        <div className="flex items-center space-x-2 text-slate-400">
          <button className="p-2 rounded-full border border-[#E2E0D8] hover:border-slate-400 hover:text-slate-600 transition-all bg-[#F7F6F1]">
            <Link2 className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-full border border-[#E2E0D8] hover:border-slate-400 hover:text-slate-600 transition-all bg-[#F7F6F1]">
            <Bell className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-full border border-[#E2E0D8] hover:border-slate-400 hover:text-slate-600 transition-all bg-[#F7F6F1]">
            <Bookmark className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Main Line Chart with Horizontal Opening Price Reference Line ── */}
      <div className="h-72 w-full pt-2 min-h-[280px]">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={formattedData} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.18} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            
            <XAxis 
              type={isNumericDomain ? 'number' : 'category'}
              dataKey={xDataKey}
              domain={xDomain}
              ticks={xTicks}
              tickFormatter={xFormatter}
              stroke="#94A3B8" 
              fontSize={11} 
              tickLine={false} 
              axisLine={{ stroke: '#E2E0D8' }} 
            />
            <YAxis 
              domain={[minPrice, maxPrice]} 
              stroke="#94A3B8" 
              fontSize={11} 
              tickLine={false} 
              axisLine={{ stroke: '#E2E0D8' }}
              tickFormatter={(val) => `₹${val}`}
            />
            
            <Tooltip content={<CustomTooltip />} />

            {/* Horizontal Dashed Baseline Reference Line */}
            <ReferenceLine 
              y={openingPrice} 
              stroke="#94A3B8" 
              strokeDasharray="4 4" 
              strokeWidth={1.2}
              label={{ 
                value: timeRange === '1D' ? `Open (12:00 AM): ₹${openingPrice.toFixed(2)}` : `Base: ₹${openingPrice.toFixed(2)}`, 
                fill: '#94A3B8', 
                fontSize: 10, 
                position: 'insideBottomRight' 
              }}
            />

            <Area 
              type="linear" 
              dataKey="price" 
              stroke={strokeColor} 
              strokeWidth={2.5} 
              fillOpacity={1} 
              fill="url(#chartGradient)" 
              dot={false}
              connectNulls={true}
              activeDot={{ r: 6, fill: strokeColor, stroke: '#FFFFFF', strokeWidth: 2 }}
            />

            {/* Event Markers */}
            {formattedData.map((d, i) => d.eventId && d.price !== null && (
              <ReferenceDot
                key={i}
                x={d[xDataKey]}
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
      <div className="pt-3 border-t border-[#E2E0D8] flex flex-wrap items-center justify-between gap-3">
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
                    ? 'border-2 border-slate-400 text-slate-800 bg-slate-100 shadow-sm scale-105'
                    : 'text-slate-400 hover:text-slate-700 border border-transparent hover:border-[#E2E0D8]'
                }`}
              >
                {range}
              </button>
            );
          })}
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <button className="p-1.5 rounded-lg border border-[#E2E0D8] hover:border-slate-400 hover:text-slate-600 bg-[#F7F6F1]">
            <BarChart2 className="w-4 h-4" />
          </button>
          <button className="px-3 py-1.5 rounded-lg border border-[#E2E0D8] hover:border-slate-400 hover:text-slate-600 bg-[#F7F6F1] font-semibold flex items-center space-x-1">
            <span>Terminal</span>
            <span className="text-[10px] ml-0.5">⇂↾</span>
          </button>
        </div>
      </div>
    </div>
  );
}

