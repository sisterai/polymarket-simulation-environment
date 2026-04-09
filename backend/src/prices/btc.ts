import { fetchJson, withQuery } from "../polymarket/http.js";

type CoinGeckoMarketChartRange = {
  prices: [number, number][]; // [ms, price]
};

type CoinbaseCandle = [
  number, // time (sec)
  number, // low
  number, // high
  number, // open
  number, // close
  number, // volume
];

export class BtcPriceClient {
  constructor(private readonly baseUrl = "https://api.coingecko.com/api/v3/") {}

  private async getBtcUsdRangeCoinbase(params: { fromSec: number; toSec: number }): Promise<[number, number][]> {
    const out: [number, number][] = [];
    const stepSec = 60 * 300; // 300 minutes (~5 hours) per request chunk
    for (let a = params.fromSec; a < params.toSec; a += stepSec) {
      const b = Math.min(params.toSec, a + stepSec);
      const startIso = new Date(a * 1000).toISOString();
      const endIso = new Date(b * 1000).toISOString();
      const cbUrl = withQuery("https://api.exchange.coinbase.com", "/products/BTC-USD/candles", {
        granularity: 60,
        start: startIso,
        end: endIso,
      });
      const candles = await fetchJson<CoinbaseCandle[]>(cbUrl, { headers: { accept: "application/json" } });
      for (const c of candles ?? []) {
        const tMs = c[0] * 1000;
        const close = Number(c[4]);
        if (!Number.isFinite(close)) continue;
        out.push([tMs, close]);
      }
    }
    out.sort((x, y) => x[0] - y[0]);
    const dedup: [number, number][] = [];
    let lastT = -1;
    for (const p of out) {
      if (p[0] === lastT) continue;
      dedup.push(p);
      lastT = p[0];
    }
    return dedup;
  }

  async getBtcUsdRange(params: { fromSec: number; toSec: number }): Promise<[number, number][]> {
    // Important: do not start path with "/" or URL() will drop "/api/v3".
    const url = withQuery(this.baseUrl, "coins/bitcoin/market_chart/range", {
      vs_currency: "usd",
      from: params.fromSec,
      to: params.toSec,
    });
    const res = await fetchJson<CoinGeckoMarketChartRange>(url, { headers: { accept: "application/json" } });
    const prices = res.prices ?? [];
    if (prices.length) {
      // CoinGecko can downsample heavily on multi-day ranges, which makes per-campaign
      // slices come back empty. If spacing is too coarse, prefer Coinbase 1m candles.
      if (prices.length >= 2) {
        const dt = prices[1]![0] - prices[0]![0];
        if (dt > 120_000) {
          return await this.getBtcUsdRangeCoinbase(params);
        }
      }
      return prices;
    }

    // Fallback (no auth): Coinbase Exchange candles (1m), use close.
    return await this.getBtcUsdRangeCoinbase(params);
  }
}

