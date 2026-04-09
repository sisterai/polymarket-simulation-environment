import { fetchJson, withQuery } from "./http.js";

export type DataApiTrade = {
  proxyWallet: string;
  side: "BUY" | "SELL";
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number; // ms
  title?: string;
  slug?: string;
  outcome?: string;
  outcomeIndex?: number;
  transactionHash?: string;
  [k: string]: unknown;
};

export class DataApiClient {
  constructor(private readonly baseUrl: string) {}

  private normalizeTrade(t: any): DataApiTrade {
    // Data API returns `timestamp` in *seconds* (int) in practice.
    // Normalize to milliseconds for our simulation pipeline.
    const ts = typeof t.timestamp === "number" ? t.timestamp : Number(t.timestamp);
    const timestampMs = ts < 1_000_000_000_000 ? ts * 1000 : ts;
    return { ...t, timestamp: timestampMs } as DataApiTrade;
  }

  async getTrades(params: {
    market?: string | string[];
    limit?: number;
    offset?: number;
    takerOnly?: boolean;
  }): Promise<DataApiTrade[]> {
    const url = withQuery(this.baseUrl, "/trades", {
      limit: params.limit ?? 1000,
      offset: params.offset ?? 0,
      takerOnly: params.takerOnly ?? true,
      market: Array.isArray(params.market) ? params.market.join(",") : params.market,
    });
    const raw = await fetchJson<any[]>(url);
    return raw.map((t) => this.normalizeTrade(t));
  }

  async getAllTradesForMarket(conditionId: string, max: { pages: number; pageSize: number }): Promise<DataApiTrade[]> {
    const out: DataApiTrade[] = [];
    const maxHistoricalOffset = 3000; // Polymarket Data API constraint
    const maxPagesByOffset = Math.floor(maxHistoricalOffset / max.pageSize) + 1;
    const pages = Math.min(max.pages, maxPagesByOffset);
    for (let page = 0; page < pages; page++) {
      const offset = page * max.pageSize;
      let chunk: DataApiTrade[] = [];
      try {
        chunk = await this.getTrades({ market: conditionId, limit: max.pageSize, offset });
      } catch (e: any) {
        // If we hit the historical offset constraint or similar, stop paging.
        const msg = String(e?.message ?? "");
        if (msg.includes("max historical activity offset")) break;
        throw e;
      }
      out.push(...chunk);
      if (chunk.length < max.pageSize) break;
    }
    return out;
  }
}

