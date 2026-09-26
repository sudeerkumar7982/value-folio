import React, { useState, useCallback } from 'react';
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot, CartesianGrid
} from 'recharts';
import { Bell, Bookmark, Link2, BarChart2, ArrowUpDown } from 'lucide-react';
import { getCircuitLimitsBySentiment } from '../utils/api.js';

// ── Custom Crosshair Cursor (vertical line only, no box) ──
const CrosshairCursor = ({ points, width, height, top }) => {
  if (!points || !points.length) return null;
  const x = points[0].x;
  return (
    <line
      x1={x} y1={top || 0}
      x2={x} y2={(top || 0) + height}
      stroke="#64748B"
      strokeWidth={1}
      strokeDasharray="none"
      style={{ pointerEvents: 'none' }}
    />
  );
};

export function StockChart({ priceTicks = [], profile, symbol = '' }) {
  const [timeRange, setTimeRange] = useState('1D');
  // hoverData: the data point currently under the crosshair
  const [hoverData, setHoverData] = useState(null);

  const ticks = (priceTicks && priceTicks.length > 0)
    ? priceTicks
    : [{ timestamp: new Date().toISOString(), price: profile?.currentPrice || 100, eventId: null, label: `${profile?.symbol || symbol || 'STOCK'} Listing Price` }];

  const getFilteredData = () => {
    const now = new Date();
    const sortedTicks = [...ticks].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (timeRange === '1D') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const startOfDayMs = startOfDay.getTime();

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

      const sentimentData = { sentimentScore: profile?.sentimentScore ?? 50, sentiment: profile?.sentiment || 'NEUTRAL' };
      const circuits = getCircuitLimitsBySentiment(openingPrice, sentimentData);

      const todayTicks = sortedTicks.filter(t => new Date(t.timestamp).getTime() >= startOfDayMs);
      const formattedData = [];

      formattedData.push({
        timeMs: startOfDayMs,
        timestamp: startOfDay.toISOString(),
        dateLabel: '12:00 AM',
        fullDate: startOfDay.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        price: Math.min(Math.max(openingPrice, circuits.lowerCircuit), circuits.upperCircuit),
        label: 'Day Opening Price (12:00 AM)',
        eventId: null, diff: 0, diffPct: 0
      });

      if (todayTicks.length > 0) {
        const firstTickTime = new Date(todayTicks[0].timestamp).getTime();
        if (firstTickTime - startOfDayMs > 60000) {
          const preTickD = new Date(firstTickTime - 1000);
          formattedData.push({
            timeMs: preTickD.getTime(),
            timestamp: preTickD.toISOString(),
            dateLabel: preTickD.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
            fullDate: preTickD.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
            price: Math.min(Math.max(openingPrice, circuits.lowerCircuit), circuits.upperCircuit),
            label: 'Day Opening Baseline', eventId: null, diff: 0, diffPct: 0
          });
        }
      }

      let prevP = openingPrice;
      todayTicks.forEach(tick => {
        const d = new Date(tick.timestamp);
        const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        const clampedP = Math.min(Math.max(tick.price, circuits.lowerCircuit), circuits.upperCircuit);
        const diff = Number((clampedP - prevP).toFixed(2));
        const diffPct = prevP > 0 ? Number(((diff / prevP) * 100).toFixed(2)) : 0;
        prevP = clampedP;
        formattedData.push({
          timeMs: d.getTime(), timestamp: tick.timestamp,
          dateLabel: timeStr,
          fullDate: d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' }),
          price: clampedP, label: tick.label || 'Live Price Tick',
          eventId: tick.eventId, diff, diffPct
        });
      });

      const rawLatestPrice = sortedTicks.length > 0 ? sortedTicks[sortedTicks.length - 1].price : openingPrice;
      const latestPrice = Math.min(Math.max(rawLatestPrice, circuits.lowerCircuit), circuits.upperCircuit);
      const lastPointMs = formattedData.length > 0 ? formattedData[formattedData.length - 1].timeMs : startOfDayMs;
      if (now.getTime() - lastPointMs > 5000) {
        formattedData.push({
          timeMs: now.getTime(), timestamp: now.toISOString(),
          dateLabel: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
          fullDate: now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
          price: latestPrice, label: 'Current Live Market Price',
          eventId: null, diff: 0, diffPct: 0
        });
      }

      return {
        formattedData, openingPrice, circuits, isNumericDomain: true,
        xDomain: [startOfDayMs, Math.max(now.getTime(), startOfDayMs + 3600000)],
        xFormatter: (val) => new Date(val).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
      };
    }

    // ── Multi-period ranges ──
    let daysBack = null;
    if (timeRange === '1W') daysBack = 7;
    else if (timeRange === '1M') daysBack = 30;
    else if (timeRange === '3M') daysBack = 90;
    else if (timeRange === '6M') daysBack = 180;
    else if (timeRange === '1Y') daysBack = 365;
    else if (timeRange === '3Y') daysBack = 3 * 365;
    else if (timeRange === '5Y') daysBack = 5 * 365;
    const windowStartMs = daysBack !== null
      ? now.getTime() - (daysBack * 24 * 60 * 60 * 1000)
      : (sortedTicks[0] ? new Date(sortedTicks[0].timestamp).getTime() : now.getTime() - 86400000);

    let filtered = sortedTicks;
    let openingPrice = sortedTicks[0]?.price || profile?.startingPrice || 100;

    if (daysBack !== null) {
      filtered = sortedTicks.filter(t => new Date(t.timestamp).getTime() >= windowStartMs);
      const beforeWindow = sortedTicks.filter(t => new Date(t.timestamp).getTime() < windowStartMs);
      if (beforeWindow.length > 0) openingPrice = beforeWindow[beforeWindow.length - 1].price;
      else if (sortedTicks.length > 0) openingPrice = sortedTicks[0].price;
      else if (profile?.startingPrice) openingPrice = profile.startingPrice;
    }

    const sentimentData = { sentimentScore: profile?.sentimentScore ?? 50, sentiment: profile?.sentiment || 'NEUTRAL' };
    const circuits = getCircuitLimitsBySentiment(openingPrice, sentimentData);

    let prevP = Math.min(Math.max(openingPrice, circuits.lowerCircuit), circuits.upperCircuit);
    const formattedData = [];

    const startDate = new Date(windowStartMs);
    formattedData.push({
      timeMs: windowStartMs, timestamp: startDate.toISOString(),
      dateLabel: startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullDate: startDate.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
      price: prevP, label: timeRange === 'ALL' ? 'IPO Listing Date' : `${timeRange} Period Opening Baseline`,
      eventId: null, diff: 0, diffPct: 0
    });

    filtered.forEach((tick) => {
      const d = new Date(tick.timestamp);
      if (d.getTime() < windowStartMs) return;

      let dateLabel;
      if (timeRange === '1W') dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      else if (timeRange === '1M' || timeRange === '3M') dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      else dateLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

      const clampedP = Math.min(Math.max(tick.price, circuits.lowerCircuit), circuits.upperCircuit);
      const diff = Number((clampedP - prevP).toFixed(2));
      const diffPct = prevP > 0 ? Number(((diff / prevP) * 100).toFixed(2)) : 0;
      prevP = clampedP;
      formattedData.push({
        timeMs: d.getTime(), timestamp: tick.timestamp, dateLabel,
        fullDate: d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        price: clampedP, label: tick.label || 'Price Tick',
        eventId: tick.eventId, diff, diffPct
      });
    });

    const rawLatest = profile?.currentPrice || (sortedTicks.length > 0 ? sortedTicks[sortedTicks.length - 1].price : openingPrice);
    const latestPrice = Math.min(Math.max(rawLatest, circuits.lowerCircuit), circuits.upperCircuit);
    const lastPointMs = formattedData.length > 0 ? formattedData[formattedData.length - 1].timeMs : windowStartMs;
    if (now.getTime() - lastPointMs > 60000) {
      formattedData.push({
        timeMs: now.getTime(), timestamp: now.toISOString(),
        dateLabel: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        price: latestPrice, label: 'Current Live Market Price',
        eventId: null, diff: 0, diffPct: 0
      });
    }

    return {
      formattedData, openingPrice, circuits, isNumericDomain: true,
      xDomain: [windowStartMs, Math.max(now.getTime(), windowStartMs + 86400000)],
      xFormatter: (val) => {
        const d = new Date(val);
        if (timeRange === '1W') return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        if (timeRange === '1M' || timeRange === '3M') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }
    };
  };

  const { formattedData, openingPrice, circuits, isNumericDomain, xDomain, xFormatter } = getFilteredData();

  const validPrices = formattedData.filter(d => d.price !== null && !isNaN(d.price)).map(d => d.price);
  const rawLatestPrice = profile?.currentPrice ?? (validPrices.length > 0 ? validPrices[validPrices.length - 1] : openingPrice);
  const latestPrice = Math.min(Math.max(rawLatestPrice, circuits.lowerCircuit), circuits.upperCircuit);
  const periodChangeAmt = Number((latestPrice - openingPrice).toFixed(2));
  const periodChangePct = openingPrice > 0 ? Number(((periodChangeAmt / openingPrice) * 100).toFixed(2)) : 0;
  const isUpTrend = periodChangeAmt >= 0;
  const strokeColor = isUpTrend ? '#10B981' : '#EF4444';

  const minVal = validPrices.length > 0 ? Math.min(...validPrices, openingPrice) : openingPrice;
  const maxVal = validPrices.length > 0 ? Math.max(...validPrices, openingPrice) : openingPrice;
  const rangePadding = Math.max((maxVal - minVal) * 0.1, 1.5);
  const minPrice = Math.max(Number((minVal - rangePadding).toFixed(2)), 0);
  const maxPrice = Number((maxVal + rangePadding).toFixed(2));

  // ── Format crosshair label (top-left) ──
  const formatCrosshairLabel = (data) => {
    if (!data) return null;
    const d = new Date(data.timeMs);
    const priceStr = `₹${Number(data.price).toFixed(2)}`;
    if (timeRange === '1D') {
      const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `${priceStr} | ${timeStr}`;
    }
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${priceStr} | ${timeStr}, ${dateStr}`;
  };

  // Hover handlers
  const handleMouseMove = useCallback((state) => {
    if (state && state.activePayload && state.activePayload.length) {
      setHoverData(state.activePayload[0].payload);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoverData(null);
  }, []);

  // Display values: hover overrides live
  const displayPrice = hoverData ? hoverData.price : latestPrice;
  const displayChangeAmt = hoverData
    ? Number((hoverData.price - openingPrice).toFixed(2))
    : periodChangeAmt;
  const displayChangePct = openingPrice > 0
    ? Number(((displayChangeAmt / openingPrice) * 100).toFixed(2))
    : periodChangePct;
  const displayIsUp = displayChangeAmt >= 0;

  const crosshairLabel = formatCrosshairLabel(hoverData);

  return (
    <div className="bg-white border border-[#E2E0D8] rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4 font-['Plus_Jakarta_Sans',sans-serif]">

      {/* ── Top Header Section ── */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
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

          {/* Price + Change — updates live as cursor moves */}
          <div className="flex items-baseline space-x-3 pt-1">
            <span className="text-3xl font-extrabold text-slate-800 tracking-tight">
              ₹{Number(displayPrice).toFixed(2)}
            </span>
            <span className={`text-sm font-semibold flex items-center space-x-1 ${displayIsUp ? 'text-emerald-600' : 'text-rose-500'}`}>
              <span>{displayChangeAmt >= 0 ? '+' : ''}{displayChangeAmt.toFixed(2)}</span>
              <span>({displayChangePct >= 0 ? '+' : ''}{displayChangePct.toFixed(2)}%)</span>
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

      {/* ── Chart Area ── */}
      <div className="relative h-72 w-full pt-2 min-h-[280px]">
        {/* Crosshair Price+Time Label — top-left of chart, appears on hover */}
        {hoverData && crosshairLabel && (
          <div className="absolute top-2 left-0 z-10 text-xs font-mono font-semibold text-slate-600 bg-white/90 px-2 py-0.5 rounded pointer-events-none select-none">
            {crosshairLabel}
          </div>
        )}

        <ResponsiveContainer width="100%" height={280}>
          <AreaChart
            data={formattedData}
            margin={{ top: 15, right: 10, left: -20, bottom: 0 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.18} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <XAxis
              type={isNumericDomain ? 'number' : 'category'}
              dataKey="timeMs"
              domain={xDomain}
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

            {/* Invisible tooltip (only used to drive onMouseMove data; no popup box) */}
            <Tooltip
              cursor={<CrosshairCursor />}
              content={() => null}
            />

            {/* Opening baseline */}
            <ReferenceLine
              y={openingPrice}
              stroke="#CBD5E1"
              strokeDasharray="4 4"
              strokeWidth={1}
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
              activeDot={{ r: 5, fill: strokeColor, stroke: '#FFFFFF', strokeWidth: 2 }}
            />

            {/* Event Markers */}
            {formattedData.map((d, i) => d.eventId && d.price !== null && (
              <ReferenceDot
                key={i}
                x={d.timeMs}
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
        <div className="flex items-center justify-center gap-1.5 flex-1 flex-wrap">
          {['1D', '1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', 'All'].map((range) => {
            const rangeKey = range === 'All' ? 'ALL' : range;
            const isActive = timeRange === rangeKey;
            return (
              <button
                key={range}
                onClick={() => { setTimeRange(rangeKey); setHoverData(null); }}
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
