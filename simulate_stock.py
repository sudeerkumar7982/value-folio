import os
import csv
import argparse
from datetime import datetime, timedelta
import numpy as np
import matplotlib.pyplot as plt

def generate_50yr_price_series(
    start_price: float = 100.0,
    years: int = 50,
    minutes_per_day: int = 390,
    upper_pct: float = 0.10,
    lower_pct: float = -0.10,
    seed: int = 42,
    mode: str = "daily",  # 'daily' or 'minute'
):
    """Generate high-performance lifetime continuous price data up to 50 years using NumPy.

    * Mode 'daily': Generates 1 OHLC bar + Circuit Limits per day for up to 50 years (18,250 rows).
    * Mode 'minute': Generates minute-by-minute trajectory across 50 years (~7.1 million data points).
    """
    np.random.seed(seed)
    days = years * 365
    
    if mode == "daily":
        # Simulate daily returns with circuit clipping
        daily_returns = np.random.normal(0.0002, 0.02, days)
        # Clip daily returns to upper/lower circuits
        daily_returns = np.clip(daily_returns, lower_pct, upper_pct)
        
        prices = np.zeros(days + 1)
        prices[0] = start_price
        for i in range(days):
            prices[i+1] = round(prices[i] * (1 + daily_returns[i]), 2)
            
        dates = [datetime(2026, 1, 1) + timedelta(days=i) for i in range(days + 1)]
        return dates, prices
        
    else:  # minute mode
        total_minutes = days * minutes_per_day
        print(f"Simulating {years} years ({days:,} trading days / {total_minutes:,} minute ticks)...")
        
        # Pre-allocate numpy array for speed
        prices = np.zeros(total_minutes, dtype=np.float64)
        current_price = start_price
        
        minute_returns = np.random.normal(0.0, 0.001, total_minutes)
        idx = 0
        
        for d in range(days):
            day_start = current_price
            upper_limit = day_start * (1 + upper_pct)
            lower_limit = day_start * (1 + lower_pct)
            
            for m in range(minutes_per_day):
                new_price = current_price * (1 + minute_returns[idx])
                new_price = max(min(new_price, upper_limit), lower_limit)
                prices[idx] = new_price
                current_price = new_price
                idx += 1
                
        base_date = datetime(2026, 1, 1, 9, 30)
        # Generate timestamps efficiently for plotting sample / aggregation
        return base_date, days, minutes_per_day, prices

def plot_50yr_chart(dates_or_base, prices, output_path: str, mode: str = "daily", years: int = 50):
    plt.figure(figsize=(18, 8))
    
    if mode == "daily":
        plt.plot(dates_or_base, prices, linewidth=0.8, color="#1f77b4", label="Stock Price (Daily Close)")
        plt.title(f"50-Year Lifetime Continuous Stock Trajectory ({years} Years / Daily OHLC)", fontsize=14, fontweight="bold")
        plt.xlabel("Year", fontsize=12)
    else:
        # For minute mode plot downsampled representation to maintain crisp rendering & high speed
        step = max(1, len(prices) // 50000)
        sampled_prices = prices[::step]
        time_axis = np.linspace(2026, 2026 + years, len(sampled_prices))
        plt.plot(time_axis, sampled_prices, linewidth=0.5, color="#1f77b4", label="Stock Price (Minute Level)")
        plt.title(f"50-Year Lifetime Continuous Stock Trajectory ({years} Years / Minute Ticks)", fontsize=14, fontweight="bold")
        plt.xlabel("Year", fontsize=12)
        
    plt.ylabel("Stock Price ($)", fontsize=12)
    plt.grid(True, which="both", linestyle="--", linewidth=0.5, alpha=0.7)
    plt.legend(loc="upper left")
    plt.tight_layout()
    plt.savefig(output_path, dpi=300)
    plt.close()

def save_csv(dates_or_base, prices, output_path: str, mode: str = "daily"):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", newline="") as f:
        writer = csv.writer(f)
        if mode == "daily":
            writer.writerow(["date", "day", "close_price", "unlisted"])
            for i, p in enumerate(prices[1:], 1):
                writer.writerow([dates_or_base[i].strftime("%Y-%m-%d"), i, round(p, 2), i > 1])
        else:
            writer.writerow(["minute_index", "price", "unlisted"])
            for i, p in enumerate(prices):
                writer.writerow([i + 1, round(p, 2), i >= 390])

def main():
    parser = argparse.ArgumentParser(description="Simulate continuous 50-year stock price series with daily circuit limits.")
    parser.add_argument("--start-price", type=float, default=100.0, help="Initial listing price (default: 100.0)")
    parser.add_argument("--years", type=int, default=50, help="Number of years to simulate (default: 50)")
    parser.add_argument("--mode", type=str, choices=["daily", "minute"], default="daily", help="Simulation resolution ('daily' or 'minute')")
    parser.add_argument("--upper-pct", type=float, default=0.10, help="Upper circuit limit (default: 0.10)")
    parser.add_argument("--lower-pct", type=float, default=-0.10, help="Lower circuit limit (default: -0.10)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--output-csv", type=str, default="output/stock_prices_50yr.csv", help="Path for CSV output")
    parser.add_argument("--output-plot", type=str, default="output/stock_price_50yr_plot.png", help="Path for PNG plot output")
    args = parser.parse_args()

    if args.mode == "daily":
        dates, prices = generate_50yr_price_series(
            start_price=args.start_price,
            years=args.years,
            upper_pct=args.upper_pct,
            lower_pct=args.lower_pct,
            seed=args.seed,
            mode="daily"
        )
        save_csv(dates, prices, args.output_csv, mode="daily")
        plot_50yr_chart(dates, prices, args.output_plot, mode="daily", years=args.years)
    else:
        base_date, days, minutes_per_day, prices = generate_50yr_price_series(
            start_price=args.start_price,
            years=args.years,
            upper_pct=args.upper_pct,
            lower_pct=args.lower_pct,
            seed=args.seed,
            mode="minute"
        )
        save_csv(base_date, prices, args.output_csv, mode="minute")
        plot_50yr_chart(base_date, prices, args.output_plot, mode="minute", years=args.years)

    print(f"50-Year Simulation Complete ({args.years} years / mode: {args.mode}). Saved CSV to {args.output_csv} and high-res plot to {args.output_plot}")

if __name__ == "__main__":
    main()
