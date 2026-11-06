import React, { useState, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot
} from 'recharts';
import { Bell, Bookmark, Link2, SlidersHorizontal, Check, RefreshCw } from 'lucide-react';
import {
  getMarketSessionFor,
  getMarketStatus,
  getTradingSessionsBetween,
  isMarketOpenAt
} from '../../shared/marketCalendar.js';

// ── Custom Crosshair Vertical Cursor ──
const CrosshairCursor = ({ points, height, top }) => {
  if (!points || !points.length) return null;
  const x = points[0].x;
  return (
    <line
      x1={x}
      y1={top || 0}
      x2={x}
      y2={(top || 0) + height}
      stroke="#94A3B8"
      strokeWidth={1}
      strokeDasharray="3 3"
      style={{ pointerEvents: 'none' }}
    />
  );
};

function reduceChartPoints(data, maxPoints = 6000) {
  if (data.length <= maxPoints) return data;

  const eventIndexes = [];
  data.forEach((point, index) => {
    if (point.eventId) eventIndexes.push(index);
  });
  const targetRegularPoints = Math.max(maxPoints - eventIndexes.length, 4);
  const bucketCount = Math.max(1, Math.floor(targetRegularPoints / 4));
  const bucketSize = Math.ceil(data.length / bucketCount);
  const indexes = new Set(eventIndexes);

  for (let start = 0; start < data.length; start += bucketSize) {
    const end = Math.min(start + bucketSize, data.length);
    let minIndex = start;
    let maxIndex = start;
    for (let index = start + 1; index < end; index++) {
      if (data[index].price < data[minIndex].price) minIndex = index;
      if (data[index].price > data[maxIndex].price) maxIndex = index;
    }
    indexes.add(start);
    indexes.add(end - 1);
    indexes.add(minIndex);
    indexes.add(maxIndex);
  }

  return [...indexes].sort((a, b) => a - b).map(index => data[index]);
}

export function StockChart({ priceTicks = [], profile, symbol = '' }) {
  const [timeRange, setTimeRange] = useState('1D');
  const [chartType, setChartType] = useState('line'); // 'line', 'area', 'bar'
  const [hoverData, setHoverData] = useState(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [copied, setCopied] = useState(false);

  const ticks = useMemo(() => {
    if (priceTicks && priceTicks.length > 0) {
      return priceTicks;
    }
    const defaultP = profile?.currentPrice || profile?.startingPrice || 100;
    return [{
      timestamp: new Date().toISOString(),
      price: defaultP,
      eventId: null,
      label: `${profile?.symbol || symbol || 'STOCK'} Listing Price`
    }];
  }, [priceTicks, profile, symbol]);

  const { formattedData, openingPrice, xDomain, xFormatter } = useMemo(() => {
    const now = new Date();
    const sortedTicks = [...ticks].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const profileListingMs = Date.parse(profile?.createdAt || '');
    const firstTickMs = sortedTicks.length > 0 ? Date.parse(sortedTicks[0].timestamp) : NaN;
    const listingTimeMs = Number.isFinite(profileListingMs)
      ? profileListingMs
      : Number.isFinite(firstTickMs) ? firstTickMs : 0;

    if (timeRange === '1D') {
      const currentSession = getMarketSessionFor(now.getTime());
      const latestMarketTick = [...sortedTicks].reverse().find(tick => {
        const timestamp = Date.parse(tick.timestamp);
        return timestamp >= listingTimeMs && isMarketOpenAt(timestamp);
      });
      const session = currentSession ||
        (latestMarketTick && getMarketSessionFor(Date.parse(latestMarketTick.timestamp))) ||
        (() => {
          const status = getMarketStatus(now.getTime());
          return { marketOpen: Date.parse(status.opensAt), marketClose: Date.parse(status.closesAt) };
        })();
      const sessionEndMs = session.marketClose;
      const sessionStartMs = Math.max(session.marketOpen, listingTimeMs);
      const sessionTicks = sortedTicks.filter(tick => {
        const timestamp = Date.parse(tick.timestamp);
        return timestamp >= sessionStartMs && timestamp < sessionEndMs && isMarketOpenAt(timestamp);
      });
      const ticksBeforeSession = sortedTicks.filter(tick => {
        const timestamp = Date.parse(tick.timestamp);
        return timestamp >= listingTimeMs && timestamp < sessionStartMs && isMarketOpenAt(timestamp);
      });
      const openPrice = sessionTicks[0]?.price ??
        ticksBeforeSession[ticksBeforeSession.length - 1]?.price ??
        profile?.listingPrice ??
        profile?.startingPrice ??
        100;

      const dataPoints = [];

      if (sessionStartMs < sessionEndMs) {
        const sessionStartLabel = new Date(sessionStartMs).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata'
        });
        dataPoints.push({
          timeMs: sessionStartMs,
          timestamp: new Date(sessionStartMs).toISOString(),
          dateLabel: sessionStartLabel,
          fullDate: new Date(sessionStartMs).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Kolkata'
          }),
          price: openPrice,
          label: `🔔 Trading Session Baseline (${sessionStartLabel})`,
          eventId: null,
          diff: 0,
          diffPct: 0
        });
      }

      let prevP = openPrice;
      sessionTicks.forEach(tick => {
        if (tick.eventId && String(tick.eventId).startsWith('circuit-reset')) return;

        const d = new Date(tick.timestamp);
        const timeStr = d.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata'
        });
        const price = tick.price;
        const diff = Number((price - prevP).toFixed(2));
        const diffPct = prevP > 0 ? Number(((diff / prevP) * 100).toFixed(2)) : 0;
        prevP = price;

        dataPoints.push({
          timeMs: d.getTime(),
          timestamp: tick.timestamp,
          dateLabel: timeStr,
          fullDate: d.toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'medium',
            timeZone: 'Asia/Kolkata'
          }),
          price,
          label: tick.label || 'Live Price Tick',
          eventId: tick.eventId,
          diff,
          diffPct
        });
      });


      // Only anchor to the live price while the exchange is open.
      const latestPrice = Number(
        isMarketOpenAt(now.getTime())
          ? profile?.currentPrice ?? sessionTicks[sessionTicks.length - 1]?.price ?? openPrice
          : sessionTicks[sessionTicks.length - 1]?.price ?? openPrice
      );
      const lastPointMs = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].timeMs : sessionStartMs;
      if (isMarketOpenAt(now.getTime()) && now.getTime() - lastPointMs > 4000) {
        dataPoints.push({
          timeMs: now.getTime(),
          timestamp: now.toISOString(),
          dateLabel: now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata'
          }),
          fullDate: now.toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Kolkata'
          }),
          price: latestPrice,
          label: 'Current Live Market Price',
          eventId: null,
          diff: 0,
          diffPct: 0
        });
      }

      return {
        formattedData: dataPoints,
        openingPrice: openPrice,
        xDomain: sessionStartMs < sessionEndMs
          ? [sessionStartMs, sessionEndMs]
          : [sessionEndMs, sessionEndMs + 1],
        xFormatter: (val) => new Date(val).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Kolkata'
        })
      };
    }

    // ── Multi-period historical ranges ──
    let daysBack = null;
    if (timeRange === '1W') daysBack = 7;
    else if (timeRange === '1M') daysBack = 30;
    else if (timeRange === '3M') daysBack = 90;
    else if (timeRange === '6M') daysBack = 180;
    else if (timeRange === '1Y') daysBack = 365;
    else if (timeRange === '3Y') daysBack = 3 * 365;
    else if (timeRange === '5Y') daysBack = 5 * 365;

    const marketTicks = sortedTicks.filter(tick => {
      const timestamp = Date.parse(tick.timestamp);
      return timestamp >= listingTimeMs && isMarketOpenAt(timestamp);
    });
    const requestedWindowStartMs = daysBack !== null
      ? now.getTime() - (daysBack * 24 * 60 * 60 * 1000)
      : listingTimeMs;
    let windowStartMs = Math.max(requestedWindowStartMs, listingTimeMs);
    let sessions = getTradingSessionsBetween(windowStartMs, now.getTime());
    if (timeRange === '1W' && sessions.length > 5) {
      sessions = sessions.slice(-5);
      windowStartMs = sessions[0].start;
    }

    const filtered = marketTicks.filter(tick => Date.parse(tick.timestamp) >= windowStartMs);
    let openPrice = profile?.listingPrice || profile?.startingPrice || marketTicks[0]?.price || 100;

    if (daysBack !== null) {
      const beforeWindow = marketTicks.filter(tick => Date.parse(tick.timestamp) < windowStartMs);
      if (beforeWindow.length > 0) openPrice = beforeWindow[beforeWindow.length - 1].price;
    }

    const sessionsByDate = new Map(
      sessions.map(session => [getMarketStatus(session.start).date, session])
    );
    const dailyTicks = new Map();
    filtered.forEach(tick => {
      const timestampMs = Date.parse(tick.timestamp);
      const session = sessionsByDate.get(getMarketStatus(timestampMs).date);
      if (session && timestampMs >= session.start && timestampMs < session.end) {
        dailyTicks.set(getMarketStatus(timestampMs).date, tick);
      }
    });

    let prevP = openPrice;
    const dataPoints = [];
    const currentDate = getMarketStatus(now.getTime()).date;

    sessions.forEach(session => {
      const date = getMarketStatus(session.start).date;
      const tick = dailyTicks.get(date);
      if (!tick) return;

      let dateLabel;
      if (timeRange === '1W') {
        dateLabel = new Date(session.start).toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata'
        });
      } else if (timeRange === '1M' || timeRange === '3M') {
        dateLabel = new Date(session.start).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata'
        });
      } else {
        dateLabel = new Date(session.start).toLocaleDateString('en-US', {
          month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata'
        });
      }

      const price = tick.price;
      const diff = Number((price - prevP).toFixed(2));
      const diffPct = prevP > 0 ? Number(((diff / prevP) * 100).toFixed(2)) : 0;
      prevP = price;

      dataPoints.push({
        timeMs: dataPoints.length,
        timestamp: tick.timestamp,
        dateLabel,
        fullDate: new Date(session.start).toLocaleDateString('en-US', {
          dateStyle: 'full',
          timeZone: 'Asia/Kolkata'
        }),
        price,
        label: date === currentDate && isMarketOpenAt(now.getTime())
          ? 'Live Price (session in progress)'
          : 'Daily Closing Price',
        eventId: tick.eventId,
        diff,
        diffPct
      });
    });

    const dateLabels = dataPoints.map(point => point.dateLabel);

    return {
      formattedData: dataPoints,
      openingPrice: openPrice,
      xDomain: [0, Math.max(dataPoints.length - 1, 1)],
      xFormatter: val => dateLabels[Math.min(Math.max(Math.round(Number(val)), 0), dateLabels.length - 1)] || ''
    };
  }, [ticks, timeRange, profile]);

  const chartData = useMemo(
    () => reduceChartPoints(formattedData, chartType === 'line' ? 1000 : 6000),
    [formattedData, chartType]
  );
  const priceBounds = formattedData.reduce((bounds, point) => {
    if (point.price === null || Number.isNaN(point.price)) return bounds;
    bounds.min = Math.min(bounds.min, point.price);
    bounds.max = Math.max(bounds.max, point.price);
    bounds.latest = point.price;
    return bounds;
  }, { min: openingPrice, max: openingPrice, latest: openingPrice });
  const latestPrice = Number(profile?.currentPrice ?? priceBounds.latest);
  const periodChangeAmt = Number((latestPrice - openingPrice).toFixed(2));
  const periodChangePct = openingPrice > 0 ? Number(((periodChangeAmt / openingPrice) * 100).toFixed(2)) : 0;
  const isUpTrend = periodChangeAmt >= 0;

  // Match the reference chart: a crisp light-green line regardless of direction.
  const strokeColor = '#00B386';

  const minVal = priceBounds.min;
  const maxVal = priceBounds.max;
  const rangePadding = Math.max((maxVal - minVal) * 0.12, 1.2);
  const minPrice = Math.max(Number((minVal - rangePadding).toFixed(2)), 0);
  const maxPrice = Number((maxVal + rangePadding).toFixed(2));

  // Crosshair Mouse Handlers
  const handleMouseMove = useCallback((state) => {
    if (state && state.activePayload && state.activePayload.length) {
      setHoverData(state.activePayload[0].payload);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoverData(null);
  }, []);

  // Display values: hover coordinates override live price dynamically
  const displayPrice = hoverData ? hoverData.price : latestPrice;
  const displayChangeAmt = hoverData
    ? Number((hoverData.price - openingPrice).toFixed(2))
    : periodChangeAmt;
  const displayChangePct = openingPrice > 0
    ? Number(((displayChangeAmt / openingPrice) * 100).toFixed(2))
    : periodChangePct;
  const displayIsUp = displayChangeAmt >= 0;

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4 font-['Plus_Jakarta_Sans',sans-serif] select-none">

      {/* ── Top Header Section (Live Price & Dynamic Delta) ── */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-sm">
              <span className="text-white font-extrabold text-sm tracking-wider">
                {(profile?.symbol || symbol || 'STK').slice(0, 3)}
              </span>
            </div>
            <div>
              <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-semibold uppercase tracking-wider">
                <span>{profile?.symbol || symbol || 'STOCK'}</span>
                <span>&bull;</span>
                <span>HLSE REAL-TIME</span>
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-1" title="Continuous 24/7 Market Active" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {profile?.name || 'HUMAN LIFE VALUE'}
              </h1>
            </div>
          </div>

          {/* Large Price Display + Delta */}
          <div className="flex items-baseline space-x-3 pt-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-mono">
              ₹{Number(displayPrice).toFixed(2)}
            </span>
            <span className={`text-sm font-bold flex items-center space-x-1 ${displayIsUp ? 'text-[#00B386]' : 'text-rose-500'}`}>
              <span>{displayChangeAmt >= 0 ? '+' : ''}{displayChangeAmt.toFixed(2)}</span>
              <span>({displayChangePct >= 0 ? '+' : ''}{displayChangePct.toFixed(2)}%)</span>
              <span className="text-slate-400 text-xs font-normal ml-1.5">{timeRange}</span>
            </span>
          </div>

          {/* Subtitle / Hover Details */}
          <div className="text-xs text-slate-400 pt-0.5 min-h-[18px]">
            {hoverData ? (
              <span className="text-slate-600 font-medium flex items-center space-x-2">
                <span>🕒 {hoverData.fullDate}</span>
                <span>•</span>
                <span className="text-slate-700 font-semibold">{hoverData.label}</span>
              </span>
            ) : (
              <span>
                {timeRange === '1D'
                  ? 'NSE session • 9:15 AM – 3:30 PM IST'
                  : 'Weekday closing prices'} • {formattedData.length} chart data points
              </span>
            )}
          </div>
        </div>

        {/* Top Right Quick Controls */}
        <div className="flex items-center space-x-2 text-slate-400">
          <button
            onClick={handleCopyLink}
            title="Share Stock Link"
            className="p-2 rounded-full border border-slate-200 hover:border-slate-400 hover:text-slate-700 transition-all bg-white shadow-xs"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Link2 className="w-4 h-4" />}
          </button>
          <button
            title="Price Alerts"
            className="p-2 rounded-full border border-slate-200 hover:border-slate-400 hover:text-slate-700 transition-all bg-white shadow-xs"
          >
            <Bell className="w-4 h-4" />
          </button>
          <button
            title="Add to Watchlist"
            className="p-2 rounded-full border border-slate-200 hover:border-slate-400 hover:text-slate-700 transition-all bg-white shadow-xs"
          >
            <Bookmark className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Main Chart Canvas (Zerodha / Dixon Style) ── */}
      <div className="relative h-72 w-full pt-1 min-h-[300px]">

        {/* Floating crosshair pill at top-left when hovered */}
        {hoverData && (
          <div className="absolute top-2 left-2 z-10 text-xs font-mono font-semibold text-slate-700 bg-white/95 border border-slate-200 px-2.5 py-1 rounded-lg shadow-sm pointer-events-none select-none flex items-center space-x-2">
            <span className="font-bold text-slate-900">₹{Number(hoverData.price).toFixed(2)}</span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-500">{hoverData.dateLabel}</span>
          </div>
        )}

        <ResponsiveContainer width="100%" height={300}>
          {chartType === 'area' ? (
            <AreaChart
              data={chartData}
              margin={{ top: 15, right: 10, left: 0, bottom: 0 }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <defs>
                <linearGradient id="stockAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.2} />
                  <stop offset="55%" stopColor={isUpTrend ? '#00B386' : strokeColor} stopOpacity={0.08} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis
                type="number"
                dataKey="timeMs"
                domain={xDomain}
                tickFormatter={xFormatter}
                stroke="#94A3B8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                orientation="right"
                domain={[minPrice, maxPrice]}
                stroke="#94A3B8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `₹${val}`}
              />
              <Tooltip cursor={<CrosshairCursor />} content={() => null} />
              <ReferenceLine
                y={openingPrice}
                stroke="#CBD5E1"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
              <Area
                type="linear"
                dataKey="price"
                stroke={strokeColor}
                strokeWidth={2.6}
                fillOpacity={1}
                fill="url(#stockAreaGradient)"
                dot={false}
                isAnimationActive={false}
              />
              {chartData.length > 0 && (
                <ReferenceDot
                  x={chartData[chartData.length - 1].timeMs}
                  y={chartData[chartData.length - 1].price}
                  r={4}
                  fill={strokeColor}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                />
              )}
            </AreaChart>
          ) : chartType === 'bar' ? (
            <BarChart
              data={chartData}
              margin={{ top: 15, right: 10, left: 0, bottom: 0 }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <XAxis
                type="number"
                dataKey="timeMs"
                domain={xDomain}
                tickFormatter={xFormatter}
                stroke="#94A3B8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                orientation="right"
                domain={[minPrice, maxPrice]}
                stroke="#94A3B8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `₹${val}`}
              />
              <Tooltip cursor={<CrosshairCursor />} content={() => null} />
              <ReferenceLine
                y={openingPrice}
                stroke="#CBD5E1"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
              <Bar
                dataKey="price"
                fill={strokeColor}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          ) : (
            // Pure Crisp Line Chart (Exact Dixon / Zerodha Style)
            <LineChart
              data={chartData}
              margin={{ top: 15, right: 10, left: 0, bottom: 0 }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <XAxis
                type="number"
                dataKey="timeMs"
                domain={xDomain}
                tickFormatter={xFormatter}
                hide
              />
              <YAxis
                orientation="right"
                domain={[minPrice, maxPrice]}
                hide
                tickFormatter={(val) => `₹${val}`}
              />
              <Tooltip cursor={<CrosshairCursor />} content={() => null} />

              {/* Pure High-Density Line */}
              <Line
                type="linear"
                dataKey="price"
                stroke={strokeColor}
                strokeWidth={2.6}
                dot={false}
                isAnimationActive={false}
              />

              {chartData.length > 0 && (
                <ReferenceDot
                  x={chartData[chartData.length - 1].timeMs}
                  y={chartData[chartData.length - 1].price}
                  r={4}
                  fill={strokeColor}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                />
              )}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* ── Bottom Controls Bar (Pixel-Matched to Screenshot) ── */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
        
        {/* Time Range Filter Pills */}
        <div className="flex items-center justify-center gap-2 flex-1 flex-wrap">
          {['1D', '1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', 'All'].map((range) => {
            const rangeKey = range === 'All' ? 'ALL' : range;
            const isActive = timeRange === rangeKey;
            return (
              <button
                key={range}
                onClick={() => { setTimeRange(rangeKey); setHoverData(null); }}
                className={`px-3.5 py-1 text-xs font-semibold rounded-full transition-all ${
                  isActive
                    ? 'border border-slate-700 bg-white text-slate-800 shadow-xs'
                    : 'border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 bg-white'
                }`}
              >
                {range}
              </button>
            );
          })}
        </div>

        {/* Chart View Toggle & Terminal Button */}
        <div className="flex items-center space-x-2 text-xs">
          
          {/* Multi-Colored Bars Icon Button (Candlestick / Line / Area Toggle) */}
          <button
            onClick={() => setChartType(prev => prev === 'line' ? 'area' : prev === 'area' ? 'bar' : 'line')}
            title={`Toggle Chart Style (Current: ${chartType.toUpperCase()})`}
            className="p-1.5 rounded-full border border-slate-200 hover:border-slate-400 bg-white shadow-xs transition-all flex items-center justify-center"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <line x1="5" y1="7" x2="5" y2="15" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round" />
              <line x1="9" y1="3" x2="9" y2="13" stroke="#00B386" strokeWidth="2.2" strokeLinecap="round" />
              <line x1="13" y1="8" x2="13" y2="15" stroke="#0EA5E9" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>

          {/* Terminal Button with Sliders Icon */}
          <button
            onClick={() => setShowTerminal(prev => !prev)}
            className={`px-3.5 py-1.5 rounded-xl border font-semibold text-xs flex items-center space-x-1.5 shadow-xs transition-all ${
              showTerminal
                ? 'border-slate-800 bg-slate-900 text-white'
                : 'border-slate-200 hover:border-slate-400 text-slate-700 bg-white'
            }`}
          >
            <span>Terminal</span>
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Expandable Interactive Terminal Drawer ── */}
      {showTerminal && (
        <div className="mt-3 p-4 bg-slate-900 text-slate-200 rounded-xl border border-slate-800 font-mono text-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-white flex items-center space-x-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>TERMINAL ANALYTICS &bull; {profile?.symbol || symbol || 'STOCK'}</span>
            </span>
            <span className="text-slate-400 text-[11px]">24/7 CONTINUOUS TICK ENGINE</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
            <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50">
              <div className="text-slate-400 text-[10px]">CURRENT PRICE</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">₹{latestPrice.toFixed(2)}</div>
            </div>
            <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50">
              <div className="text-slate-400 text-[10px]">DAY OPEN / BASELINE</div>
              <div className="text-base font-bold text-white mt-0.5">₹{openingPrice.toFixed(2)}</div>
            </div>
            <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50">
              <div className="text-slate-400 text-[10px]">TOTAL TICKS LOGGED</div>
              <div className="text-base font-bold text-blue-400 mt-0.5">{formattedData.length} pts</div>
            </div>
            <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50">
              <div className="text-slate-400 text-[10px]">OFFLINE PERSISTENCE</div>
              <div className="text-base font-bold text-amber-400 mt-0.5">Continuous Active</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
