# ValueFolio — Human Life Stock Exchange Platform

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/sudeerkumar7982/value-folio)

A full-stack Human Life Stock Market platform where personal life events are analyzed by AI to dynamically fluctuate your human stock price, sector scores, and virtual trading portfolio.

## 🚀 Live Links
- **GitHub Pages Frontend**: [https://sudeerkumar7982.github.io/value-folio/](https://sudeerkumar7982.github.io/value-folio/)
- **1-Click Backend Cloud Deployment**: Click the **Deploy to Render** button above to launch your live Node.js Express backend server in 1 click.

## 🛠️ Features
- **Zerodha/Dixon Technologies Trading UI**: Complete stock overview, large price deltas, dashed opening baseline `ReferenceLine`, and centered time range pills (`1D`, `1W`, `1M`, `3M`, `6M`, `1Y`, `3Y`, `5Y`, `All`).
- **AI Sentiment Classifier**: Evaluates personal life events, determines stock price impact %, and updates 7 human life sector scores (Career, Education, Skills, Projects, Finance, Social, Wellbeing).
- **Virtual Share Trading Exchange**: Full BUY / SELL order execution, wallet balance tracking, and order history ledger.
- **Permanent Data Retention**: 100% price tick and event logging retention without limit caps.

## 💻 Local Setup
```bash
# Install dependencies
npm install

# Run frontend dev server
npm run dev

# Run full-stack production server
npm start
```

## Free PostgreSQL Storage
Render's free PostgreSQL databases expire after 30 days. For a no-cost database that is not a trial, use Neon Free and set its connection string as the Render service's `DATABASE_URL`:

1. Create a project on [Neon](https://neon.com/) using the Free plan and copy its PostgreSQL connection string.
2. In the Render Dashboard, open the `value-folio` service, go to **Environment**, and add or update `DATABASE_URL` with that string. Keep it secret.
3. Save the change and redeploy the service. On first connection, the app creates its state table and seeds it from `server/db/store.json` only if the database is empty.

Neon currently describes Free as a permanent plan, not a trial, with limits including 0.5 GB storage per project, 100 compute-unit hours per month, and 5 GB monthly public network transfer. Free compute scales to zero when idle. Provider plans and limits can change; Render may also restrict free web services that generate unusually high external database traffic.

If you already deployed the Render Postgres Blueprint, changing this file does not delete that database or automatically replace an existing `DATABASE_URL` reference. Set `DATABASE_URL` to Neon manually in the Render Dashboard. Export and import any existing data you need before deleting the old database.

Without `DATABASE_URL`, local development uses the JSON file; production startup requires the variable to avoid silently using Render's ephemeral filesystem.
