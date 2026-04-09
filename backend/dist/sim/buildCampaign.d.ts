import { DataApiClient, type DataApiTrade } from "../polymarket/dataApi.js";
import { GammaClient } from "../polymarket/gamma.js";
import { BtcPriceClient } from "../prices/btc.js";
import type { CampaignMeta, CampaignRow } from "../storage/campaignCsv.js";
export type CampaignSources = {
    trades: DataApiTrade[];
    btcRange: [number, number][];
    /** CLOB outcome token ids from Gamma (Data API `trade.asset` matches these). */
    upTokenId?: string;
    downTokenId?: string;
    /** Optional CLOB `/prices-history` points as [ms, price] (e.g. fills thin trade tape). */
    clobUpHistory?: [number, number][];
    clobDownHistory?: [number, number][];
};
export type BuildCampaignParams = {
    conditionId: string;
    startMs: number;
    intervalSec?: number;
    durationSec?: number;
};
export declare function fetchCampaignSources(params: BuildCampaignParams, deps: {
    dataApi: DataApiClient;
    btc: BtcPriceClient;
}): Promise<CampaignSources>;
export declare function buildCampaignRowsFromSources(params: BuildCampaignParams, sources: CampaignSources): {
    rows: CampaignRow[];
    endMs: number;
};
export declare function buildCampaignRows(params: BuildCampaignParams, deps: {
    dataApi: DataApiClient;
    btc: BtcPriceClient;
}): Promise<{
    rows: CampaignRow[];
    endMs: number;
}>;
export declare function discoverPinnedMarkets(config: {
    gamma: GammaClient;
    pinnedSlugs?: string;
    search: string;
}): Promise<{
    slug: string;
    conditionId: string;
}[]>;
export declare function makeCampaignMeta(input: {
    conditionId: string;
    startMs: number;
    endMs: number;
    rowCount: number;
    slug?: string;
}): CampaignMeta;
//# sourceMappingURL=buildCampaign.d.ts.map