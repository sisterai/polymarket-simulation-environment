import { fetchJson, withQuery } from "./http.js";
export class ClobClientPublic {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    async getBook(tokenId) {
        const url = withQuery(this.baseUrl, "/book", { token_id: tokenId });
        return await fetchJson(url);
    }
    /**
     * Historical mark prices for an outcome token (`market` = asset id per CLOB docs).
     * https://docs.polymarket.com/api-reference/markets/get-prices-history
     */
    async getPricesHistory(params) {
        const url = withQuery(this.baseUrl, "/prices-history", {
            market: params.market,
            startTs: params.startTs,
            endTs: params.endTs,
            fidelity: params.fidelity,
            interval: params.interval,
        });
        const res = await fetchJson(url);
        return Array.isArray(res.history) ? res.history : [];
    }
}
export function bestBidAsk(book) {
    const bid = book.bids?.length ? Number(book.bids[0].price) : null;
    const ask = book.asks?.length ? Number(book.asks[0].price) : null;
    return {
        bid: Number.isFinite(bid) ? bid : null,
        ask: Number.isFinite(ask) ? ask : null,
    };
}
/** Normalize CLOB `prices-history` timestamps to epoch ms (API uses unix seconds). */
export function clobHistoryToMsPairs(pts) {
    const out = [];
    for (const pt of pts) {
        const t = pt.t < 1_000_000_000_000 ? pt.t * 1000 : pt.t;
        const p = pt.p;
        if (Number.isFinite(t) && Number.isFinite(p))
            out.push([t, p]);
    }
    return out;
}
//# sourceMappingURL=clob.js.map