import React, { useState, useEffect } from 'react';
import { X, Bell, Bookmark, BarChart2 } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip
} from 'recharts';

const TIME_RANGES = ['1D', '1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', 'All'];
const QTY_PRESETS = [1, 5, 10];

function getCalendarBounds(timeRange) {
  const now = new Date();
  if (timeRange === '1D') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start, end };
  }
  if (timeRange === '1W') {
    const dayOfWeek = now.getDay();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0, 0);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    return { start, end };
  }
  if (timeRange === '1M') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }
  if (timeRange === '3M') return { start: new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0), end: now };
  if (timeRange === '6M') return { start: new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0), end: now };
  if (timeRange === '1Y') return { start: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0), end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999) };
  if (timeRange === '3Y') return { start: new Date(now.getFullYear() - 3, 0, 1, 0, 0, 0, 0), end: now };
  if (timeRange === '5Y') return { start: new Date(now.getFullYear() - 5, 0, 1, 0, 0, 0, 0), end: now };
  return { start: null, end: null };
}

export function TradingExchange({ isOpen, onClose, profile, priceTicks = [], onTradeSuccess }) {
  const [tradeType, setTradeType]     = useState('BUY');
  const [orderMode, setOrderMode]     = useState('Delivery');
  const [shares, setShares]           = useState('');
  const [timeRange, setTimeRange]     = useState('1D');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg]       = useState('');
  const [tradesHistory, setTradesHistory] = useState([]);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/trades')
        .then(r => r.json())
        .then(d => setTradesHistory(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen || !profile) return null;

  const currentPrice = Number(profile.currentPrice || 0);
  const walletBalance = Number(profile.walletBalance || 0);
  const sharesOwned   = Number(profile.sharesOwned || 0);
  const sharesNum     = Number(shares) || 0;
  const approxReq     = Number((sharesNum * currentPrice).toFixed(2));

  // Build calendar-bounded chart ticks
  const getFilteredTicks = () => {
    const { start, end } = getCalendarBounds(timeRange);
    if (!start) return priceTicks;
    const startMs = start.getTime();
    const endMs = end ? end.getTime() : Infinity;

    const ticksInWindow = (priceTicks || []).filter(t => {
      const tMs = new Date(t.timestamp).getTime();
      return tMs >= startMs && tMs <= endMs;
    });

    const ticksBefore = (priceTicks || []).filter(t => new Date(t.timestamp).getTime() < startMs);
    const prevBaseline = ticksBefore.length > 0 ? ticksBefore[ticksBefore.length - 1] : null;
    const openingPrice = prevBaseline ? prevBaseline.price : (priceTicks[0]?.price || currentPrice);

    const windowStartAnchor = {
      timestamp: start.toISOString(),
      price: openingPrice,
      eventId: null
    };

    let res = [windowStartAnchor, ...ticksInWindow];
    if (ticksInWindow.length === 0) {
      res.push({ timestamp: new Date().toISOString(), price: openingPrice, eventId: null });
    }
    return res;
  };

  const filteredTicks = getFilteredTicks();

  const chartData = filteredTicks.map((tick, i) => {
    const d = new Date(tick.timestamp);
    let label;
    if (timeRange === '1D') {
      label = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } else if (timeRange === '1W') {
      label = d.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return {
      label,
      price: tick.price,
      idx: i
    };
  });

  const isUp = chartData.length > 1
    ? chartData[chartData.length - 1].price >= chartData[0].price
    : true;
  const lineColor = isUp ? '#22c55e' : '#ef4444';

  // Change from start of day (first tick)
  const firstPrice  = chartData.length ? chartData[0].price : currentPrice;
  const changeAmt   = Number((currentPrice - firstPrice).toFixed(2));
  const changePct   = firstPrice ? Number(((changeAmt / firstPrice) * 100).toFixed(2)) : 0;

  const handleTrade = async (e) => {
    e.preventDefault();
    if (!sharesNum || sharesNum <= 0) { setErrorMsg('Enter a valid quantity'); return; }
    setErrorMsg('');
    setIsProcessing(true);
    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: tradeType, shares: sharesNum })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trade failed');
      onTradeSuccess && onTradeSuccess(data);
      const updated = await fetch('/api/trades').then(r => r.json());
      setTradesHistory(Array.isArray(updated) ? updated : []);
      setShares('');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="bg-white rounded-xl shadow-2xl w-full overflow-hidden flex flex-col"
        style={{ maxWidth: 960, maxHeight: '92vh' }}
      >
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <span className="text-sm font-bold text-emerald-700 tracking-widest uppercase">
            {profile.symbol}
          </span>
          <div className="flex items-center gap-4 text-gray-400">
            <Bell className="w-4 h-4 cursor-pointer hover:text-gray-600" />
            <Bookmark className="w-4 h-4 cursor-pointer hover:text-gray-600" />
            <button onClick={onClose} className="hover:text-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Body: chart left + order right ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ════ LEFT — Chart Panel ════ */}
          <div className="flex flex-col flex-1 px-6 py-4 overflow-y-auto border-r border-gray-100">
            {/* Stock info */}
            <p className="text-xs text-gray-400 mb-0.5">
              {profile.symbol} &bull; HLSE
            </p>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">{profile.name}</h2>
            <div className="flex items-baseline gap-2 mb-5">
              <span className="text-3xl font-bold text-gray-900">
                ₹{currentPrice.toFixed(2)}
              </span>
              <span className={`text-sm font-semibold ${changeAmt >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {changeAmt >= 0 ? '+' : ''}{changeAmt} ({changePct >= 0 ? '+' : ''}{changePct}%) 1D
              </span>
            </div>

            {/* Chart */}
            <div className="flex-1" style={{ minHeight: 260 }}>
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData} margin={{ top: 10, right: 5, left: -30, bottom: 0 }}>
                    <defs>
                      <linearGradient id="kiteGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={lineColor} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={lineColor} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-lg text-xs">
                            <div className="text-gray-500 mb-0.5">{d.label}</div>
                            <div className="font-bold text-gray-900 text-sm">₹{d.price.toFixed(2)}</div>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke={lineColor}
                      strokeWidth={2}
                      fill="url(#kiteGrad)"
                      dot={false}
                      activeDot={{ r: 5, fill: lineColor, stroke: '#fff', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                  <BarChart2 className="w-6 h-6 mr-2 opacity-40" />
                  Log events to build your price chart
                </div>
              )}
            </div>

            {/* Time range tabs */}
            <div className="flex items-center gap-1 mt-4 flex-wrap">
              {TIME_RANGES.map(r => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
                    timeRange === r
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {r}
                </button>
              ))}
              <button className="ml-auto px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 flex items-center gap-1">
                <BarChart2 className="w-3.5 h-3.5" /> Terminal
              </button>
            </div>

            {/* Trade history strip */}
            {tradesHistory.length > 0 && (
              <div className="mt-5 border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Order History</p>
                <div className="space-y-1.5 max-h-28 overflow-y-auto">
                  {tradesHistory.map(t => (
                    <div key={t.id} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5">
                      <span className={`font-bold ${t.type === 'BUY' ? 'text-emerald-600' : 'text-red-500'}`}>{t.type}</span>
                      <span>{t.shares} shares @ ₹{Number(t.price).toFixed(2)}</span>
                      <span className="text-gray-400">₹{Number(t.totalAmount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ════ RIGHT — Order Panel ════ */}
          <div className="flex flex-col w-72 px-5 py-5 bg-white overflow-y-auto" style={{ minWidth: 260 }}>
            {/* Stock name + price header */}
            <div className="mb-4">
              <p className="text-sm font-bold text-gray-900">{profile.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                HLSE &nbsp;₹{currentPrice.toFixed(2)}&nbsp;
                <span className={changePct >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                  ({changePct >= 0 ? '+' : ''}{changePct}%)
                </span>
                &nbsp;&bull;&nbsp;
                <span className="text-blue-500 cursor-pointer hover:underline">Depth</span>
              </p>
            </div>

            {/* BUY / SELL tabs */}
            <div className="flex border-b border-gray-200 mb-4">
              {['BUY', 'SELL'].map(t => (
                <button
                  key={t}
                  onClick={() => { setTradeType(t); setErrorMsg(''); }}
                  className={`flex-1 py-2 text-sm font-bold transition-all border-b-2 -mb-px ${
                    tradeType === t
                      ? t === 'BUY'
                        ? 'text-blue-600 border-blue-600'
                        : 'text-red-500 border-red-500'
                      : 'text-gray-400 border-transparent hover:text-gray-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Delivery / Intraday mode */}
            <div className="flex items-center gap-2 mb-4">
              {['Delivery', 'Intraday', 'MTF'].map(m => (
                <button
                  key={m}
                  onClick={() => setOrderMode(m)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${
                    orderMode === m
                      ? 'border-gray-800 bg-white text-gray-800'
                      : 'border-gray-200 text-gray-400 hover:border-gray-400'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Qty preset pills */}
            <div className="flex items-center gap-1.5 mb-4">
              <div className="flex items-center bg-gray-800 text-white rounded-full overflow-hidden text-xs font-bold">
                {QTY_PRESETS.map((q, i) => (
                  <button
                    key={q}
                    onClick={() => setShares(String(q))}
                    className={`px-3 py-1.5 hover:bg-gray-600 transition-colors ${
                      i < QTY_PRESETS.length - 1 ? 'border-r border-gray-600' : ''
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleTrade} className="flex flex-col gap-3 flex-1">
              {/* Qty input */}
              <div>
                <label className="text-xs text-gray-500 flex items-center justify-between mb-1">
                  <span>Qty HLSE</span>
                  <span className="text-gray-300">⇅</span>
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="0"
                  value={shares}
                  onChange={e => { setShares(e.target.value); setErrorMsg(''); }}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                />
              </div>

              {/* Price Limit */}
              <div>
                <label className="text-xs text-gray-500 flex items-center justify-between mb-1">
                  <span>Price Limit</span>
                  <span className="text-gray-300">⇅</span>
                </label>
                <div className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-800 font-semibold bg-gray-50">
                  {currentPrice.toFixed(2)}
                </div>
              </div>

              {errorMsg && (
                <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                  ⚠ {errorMsg}
                </div>
              )}

              <div className="mt-auto pt-3 border-t border-gray-100">
                {/* Balance row */}
                <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                  <span>Balance : ₹{walletBalance.toFixed(0)}</span>
                  <span>Approx req. : {approxReq > 0 ? `₹${approxReq.toFixed(0)}` : '₹0'}</span>
                </div>

                {/* Action button */}
                <button
                  type="submit"
                  disabled={isProcessing}
                  className={`w-full py-3 rounded-md text-sm font-bold text-white transition-all ${
                    tradeType === 'BUY'
                      ? 'bg-emerald-500 hover:bg-emerald-600'
                      : 'bg-red-500 hover:bg-red-600'
                  } ${isProcessing ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {isProcessing ? 'Processing...' : tradeType === 'BUY' ? 'Buy' : 'Sell'}
                </button>

                {tradeType === 'SELL' && sharesOwned > 0 && (
                  <p className="text-center text-xs text-gray-400 mt-2">
                    Holdings: {sharesOwned} shares (avg ₹{Number(profile.avgBuyPrice).toFixed(2)})
                  </p>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
