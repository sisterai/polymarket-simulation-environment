import { fetchJson, withQuery } from "./http.js";
export class GammaClient {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    async listMarkets(params) {
        const url = withQuery(this.baseUrl, "/markets", {
            limit: params.limit ?? 100,
            offset: params.offset ?? 0,
            order: params.order,
            ascending: params.ascending,
            start_date_min: params.start_date_min,
            start_date_max: params.start_date_max,
            end_date_min: params.end_date_min,
            end_date_max: params.end_date_max,
            enableOrderBook: params.enableOrderBook,
            closed: params.closed,
            ...(params.condition_ids?.length ? { "condition_ids[]": params.condition_ids } : {}),
        });
        return await fetchJson(url);
    }
    async getMarketByConditionId(conditionId) {
        const res = await this.listMarkets({ limit: 1, offset: 0, condition_ids: [conditionId] });
        const m = res?.[0];
        if (!m)
            throw new Error(`Gamma market not found for conditionId=${conditionId}`);
        return m;
    }
    async getMarketBySlug(slug) {
        // Gamma expects `slug` as an array query param: slug[]=...
        const url = withQuery(this.baseUrl, `/markets`, { "slug[]": slug, limit: 1, offset: 0 });
        const res = await fetchJson(url);
        const m = res?.[0];
        if (!m)
            throw new Error(`Gamma market not found for slug=${slug}`);
        return m;
    }
    /** Batch lookup by slugs: /markets?slug[]=a&slug[]=b... */
    async listMarketsBySlugs(slugs, params) {
        const url = withQuery(this.baseUrl, `/markets`, { "slug[]": slugs, limit: params?.limit ?? slugs.length, offset: params?.offset ?? 0 });
        return await fetchJson(url);
    }
}
export function parseJsonField(value) {
    if (typeof value !== "string")
        return undefined;
    try {
        return JSON.parse(value);
    }
    catch {
        return undefined;
    }
}
/** Maps Gamma `clobTokenIds` + `outcomes` to UP/DOWN outcome token ids (CLOB `asset_id`). */
export function extractUpDownTokenIds(m) {
    const tokenIds = parseJsonField(m.clobTokenIds) ?? parseJsonField(m.clob_token_ids);
    const outcomes = parseJsonField(m.outcomes) ?? parseJsonField(m.outcome);
    if (!Array.isArray(tokenIds) || tokenIds.length < 2)
        return null;
    let upTokenId = String(tokenIds[0]);
    let downTokenId = String(tokenIds[1]);
    if (Array.isArray(outcomes) && outcomes.length >= 2) {
        for (let i = 0; i < outcomes.length; i++) {
            const label = String(outcomes[i]).trim().toLowerCase();
            const tid = i < tokenIds.length ? String(tokenIds[i]) : "";
            if (label === "up")
                upTokenId = tid;
            if (label === "down")
                downTokenId = tid;
        }
    }
    if (!upTokenId || !downTokenId)
        return null;
    return { upTokenId, downTokenId };
}
//# sourceMappingURL=gamma.js.map