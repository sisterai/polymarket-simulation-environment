import type { GammaClient, GammaMarket } from "../polymarket/gamma.js";
export declare function getConditionId(m: GammaMarket): string | null;
export declare function isLikely5mUpDownMarket(m: GammaMarket, hint: string): boolean;
export declare function startMsFromUpDownSlug(slug: string | undefined): number | null;
export type DiscoveredCampaign = {
    conditionId: string;
    slug?: string;
    startMs: number;
    upTokenId?: string;
    downTokenId?: string;
};
/**
 * Discover BTC 5m up/down campaigns in [now-days, now] using Gamma /markets.
 *
 * Notes:
 * - Do not require `closed: true` — many recent rows are still "open" in Gamma while the 5m window already passed.
 * - Widen the Gamma date query vs the strict window so API timezone/indexing mismatches still return rows; we filter by slug startMs locally.
 */
export declare function discoverBtc5mCampaigns(opts: {
    gamma: GammaClient;
    days: number;
    maxCampaigns: number;
    marketSearchQuery: string;
    marketTypeHint: string;
}): Promise<DiscoveredCampaign[]>;
//# sourceMappingURL=discoverBtc5m.d.ts.map