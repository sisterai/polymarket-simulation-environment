import { fetchJson, withQuery } from "./http.js";
export class DataApiClient {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    normalizeTrade(t) {
        // Data API returns `timestamp` in *seconds* (int) in practice.
        // Normalize to milliseconds for our simulation pipeline.
        const ts = typeof t.timestamp === "number" ? t.timestamp : Number(t.timestamp);
        const timestampMs = ts < 1_000_000_000_000 ? ts * 1000 : ts;
        return { ...t, timestamp: timestampMs };
    }
    async getTrades(params) {
        const url = withQuery(this.baseUrl, "/trades", {
            limit: params.limit ?? 1000,
            offset: params.offset ?? 0,
            takerOnly: params.takerOnly ?? true,
            market: Array.isArray(params.market) ? params.market.join(",") : params.market,
        });
        const raw = await fetchJson(url);
        return raw.map((t) => this.normalizeTrade(t));
    }
    async getAllTradesForMarket(conditionId, max) {
        const out = [];
        const maxHistoricalOffset = 3000; // Polymarket Data API constraint
        const maxPagesByOffset = Math.floor(maxHistoricalOffset / max.pageSize) + 1;
        const pages = Math.min(max.pages, maxPagesByOffset);
        for (let page = 0; page < pages; page++) {
            const offset = page * max.pageSize;
            let chunk = [];
            try {
                chunk = await this.getTrades({ market: conditionId, limit: max.pageSize, offset });
            }
            catch (e) {
                // If we hit the historical offset constraint or similar, stop paging.
                const msg = String(e?.message ?? "");
                if (msg.includes("max historical activity offset"))
                    break;
                throw e;
            }
            out.push(...chunk);
            if (chunk.length < max.pageSize)
                break;
        }
        return out;
    }
}
//# sourceMappingURL=dataApi.js.map