import { fetchJson, withQuery } from "./http.js";

export type OrderBookLevel = { price: string; size: string };
export type OrderBookSummary = {
  asset_id: string;
  timestamp: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  last_trade_price?: string;
  [k: string]: unknown;
};

export class ClobClientPublic {
  constructor(private readonly baseUrl: string) {}

  async getBook(tokenId: string): Promise<OrderBookSummary> {
    const url = withQuery(this.baseUrl, "/book", { token_id: tokenId });
    return await fetchJson<OrderBookSummary>(url);
  }

  /**
   * Historical mark prices for an outcome token (`market` = asset id per CLOB docs).
   * https://docs.polymarket.com/api-reference/markets/get-prices-history
   */
  async getPricesHistory(params: {
    market: string;
    startTs?: number;
    endTs?: number;
    fidelity?: number;
    interval?: string;
  }): Promise<{ t: number; p: number }[]> {
    const url = withQuery(this.baseUrl, "/prices-history", {
      market: params.market,
      startTs: params.startTs,
      endTs: params.endTs,
      fidelity: params.fidelity,
      interval: params.interval,
    });
    const res = await fetchJson<{ history?: { t: number; p: number }[] }>(url);
    return Array.isArray(res.history) ? res.history : [];
  }
}

export function bestBidAsk(book: OrderBookSummary): { bid: number | null; ask: number | null } {
  const bid = book.bids?.length ? Number(book.bids[0]!.price) : null;
  const ask = book.asks?.length ? Number(book.asks[0]!.price) : null;
  return {
    bid: Number.isFinite(bid as any) ? bid : null,
    ask: Number.isFinite(ask as any) ? ask : null,
  };
}

/** Normalize CLOB `prices-history` timestamps to epoch ms (API uses unix seconds). */
export function clobHistoryToMsPairs(pts: { t: number; p: number }[]): [number, number][] {
  const out: [number, number][] = [];
  for (const pt of pts) {
    const t = pt.t < 1_000_000_000_000 ? pt.t * 1000 : pt.t;
    const p = pt.p;
    if (Number.isFinite(t) && Number.isFinite(p)) out.push([t, p]);
  }
  return out;
}

