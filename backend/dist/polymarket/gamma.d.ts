export type GammaMarket = {
    id: string | number;
    slug: string;
    question?: string;
    enableOrderBook?: boolean;
    closed?: boolean;
    active?: boolean;
    archived?: boolean;
    conditionId?: string;
    outcomes?: string;
    outcomePrices?: string;
    clobTokenIds?: string;
    startDate?: string;
    endDate?: string;
    [k: string]: unknown;
};
export declare class GammaClient {
    private readonly baseUrl;
    constructor(baseUrl: string);
    listMarkets(params: {
        limit?: number;
        offset?: number;
        order?: string;
        ascending?: boolean;
        start_date_min?: string;
        start_date_max?: string;
        end_date_min?: string;
        end_date_max?: string;
        enableOrderBook?: boolean;
        closed?: boolean;
        condition_ids?: string[];
    }): Promise<GammaMarket[]>;
    getMarketByConditionId(conditionId: string): Promise<GammaMarket>;
    getMarketBySlug(slug: string): Promise<GammaMarket>;
    /** Batch lookup by slugs: /markets?slug[]=a&slug[]=b... */
    listMarketsBySlugs(slugs: string[], params?: {
        limit?: number;
        offset?: number;
    }): Promise<GammaMarket[]>;
}
export declare function parseJsonField<T>(value: unknown): T | undefined;
/** Maps Gamma `clobTokenIds` + `outcomes` to UP/DOWN outcome token ids (CLOB `asset_id`). */
export declare function extractUpDownTokenIds(m: GammaMarket): {
    upTokenId: string;
    downTokenId: string;
} | null;
//# sourceMappingURL=gamma.d.ts.map