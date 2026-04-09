# Polymarket 5m UP/DOWN Bot Simulation (Node + TS)

This project provides a **local simulation environment + dashboard** for backtesting a Polymarket UP/DOWN bot on BTC 5‑minute campaigns.

## What’s implemented

- **Backend (TypeScript + Express)** in `backend/`
  - Downloads a single 5‑minute campaign into a **CSV with 300 rows (1 row/sec)**.
  - Stores campaign files in `data/campaigns/<conditionId>/<startMs>.csv` plus `<startMs>.meta.json`.
  - Runs a simple backtest engine and returns **PnL + fills**.
  - Serves a **dashboard UI** from `backend/public/`.

## Data sources (real APIs)

- **Polymarket Gamma**: market discovery (`https://gamma-api.polymarket.com`)
- **Polymarket Data API**: historical trades (`https://data-api.polymarket.com/trades`)
- **BTC price**: CoinGecko range API (used only for BTC/USD series)

> Note: Polymarket’s public historical orderbook snapshots are not available as a 1‑second archive. This prototype uses **historical trades** and converts them into 1‑second snapshots via last-observation-carried-forward.

## Run

From workspace root:

```bash
npm install
npm run dev
```

Then open `http://localhost:3001`.

## CLI: fetch + backtest last 3 days

From `backend/`:

```bash
npm run backtest:last -- --days 3 --bot btc-momentum-v1 --initialCash 1000 --feeRate 0 --slippageBps 0
```

Outputs:
- Campaign CSVs under `data/campaigns/<conditionId>/`
- Combined results under `data/backtests/` (JSON + CSV)

## Configure (optional)

Set env vars before running (PowerShell example):

```powershell
$env:PORT=3001
$env:DATA_DIR="data"
$env:MARKET_SEARCH_QUERY="BTC"
$env:PINNED_MARKET_SLUGS=""
npm run dev
```

