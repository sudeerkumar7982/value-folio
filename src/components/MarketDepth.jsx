import React from 'react';

export function MarketDepth({ currentPrice = 100, symbol = '' }) {
  // Generate realistic Level-2 bids and asks based on current stock price
  const generateLevel2Data = (price) => {
    const bids = [];
    const asks = [];

    for (let i = 1; i <= 5; i++) {
      const bidPrice = Number((price * (1 - i * 0.003)).toFixed(2));
      const bidQty = Math.floor(150 + Math.random() * 450 * (6 - i));
      const bidOrders = Math.floor(1 + Math.random() * 8);
      bids.push({ price: bidPrice, qty: bidQty, orders: bidOrders });

      const askPrice = Number((price * (1 + i * 0.003)).toFixed(2));
      const askQty = Math.floor(120 + Math.random() * 400 * (6 - i));
      const askOrders = Math.floor(1 + Math.random() * 7);
      asks.push({ price: askPrice, qty: askQty, orders: askOrders });
    }

    const totalBidQty = bids.reduce((acc, b) => acc + b.qty, 0);
    const totalAskQty = asks.reduce((acc, a) => acc + a.qty, 0);
    const totalVolume = totalBidQty + totalAskQty;
    const buyPercent = Math.round((totalBidQty / totalVolume) * 100);

    return { bids, asks, totalBidQty, totalAskQty, buyPercent };
  };

  const { bids, asks, totalBidQty, totalAskQty, buyPercent } = generateLevel2Data(currentPrice);

  return (
    <div className="bg-[#0B0E14] border border-[#232936] rounded-2xl p-4 space-y-3 font-mono text-xs text-slate-300">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#232936] pb-2 font-['Plus_Jakarta_Sans',sans-serif]">
        <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
          <span>ValueFolio Level-2 Order Book ({symbol})</span>
        </h4>
        <span className="text-[11px] text-slate-400">Live Order Book</span>
      </div>

      {/* Buy / Sell Pressure Ratio Bar */}
      <div className="space-y-1 font-['Plus_Jakarta_Sans',sans-serif]">
        <div className="flex justify-between text-[11px] font-bold">
          <span className="text-emerald-400">Buyers {buyPercent}%</span>
          <span className="text-rose-400">Sellers {100 - buyPercent}%</span>
        </div>
        <div className="w-full bg-rose-500/30 h-2 rounded-full overflow-hidden flex">
          <div
            className="bg-emerald-500 h-full transition-all duration-500"
            style={{ width: `${buyPercent}%` }}
          ></div>
        </div>
      </div>

      {/* Bids & Asks Dual Table */}
      <div className="grid grid-cols-2 gap-3 text-[11px]">
        
        {/* BIDS Column (BUYERS) */}
        <div>
          <div className="grid grid-cols-3 font-bold text-emerald-400 border-b border-[#232936] pb-1 mb-1">
            <span>Orders</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Bid (₹)</span>
          </div>
          <div className="space-y-1">
            {bids.map((b, idx) => (
              <div key={idx} className="grid grid-cols-3 text-slate-300 hover:bg-emerald-500/10 rounded px-0.5">
                <span className="text-slate-500">{b.orders}</span>
                <span className="text-right text-slate-200">{b.qty}</span>
                <span className="text-right font-bold text-emerald-400">{b.price.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="pt-2 mt-1 border-t border-[#232936] flex justify-between font-bold text-emerald-400">
            <span>Total Bids</span>
            <span>{totalBidQty.toLocaleString()}</span>
          </div>
        </div>

        {/* ASKS Column (SELLERS) */}
        <div>
          <div className="grid grid-cols-3 font-bold text-rose-400 border-b border-[#232936] pb-1 mb-1">
            <span>Ask (₹)</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Orders</span>
          </div>
          <div className="space-y-1">
            {asks.map((a, idx) => (
              <div key={idx} className="grid grid-cols-3 text-slate-300 hover:bg-rose-500/10 rounded px-0.5">
                <span className="font-bold text-rose-400">{a.price.toFixed(2)}</span>
                <span className="text-right text-slate-200">{a.qty}</span>
                <span className="text-right text-slate-500">{a.orders}</span>
              </div>
            ))}
          </div>
          <div className="pt-2 mt-1 border-t border-[#232936] flex justify-between font-bold text-rose-400">
            <span>Total Asks</span>
            <span>{totalAskQty.toLocaleString()}</span>
          </div>
        </div>

      </div>

    </div>
  );
}
