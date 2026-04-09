export type CampaignRow = {
    t: number;
    up_last: number | null;
    down_last: number | null;
    best_up_bid: number | null;
    best_up_ask: number | null;
    best_down_bid: number | null;
    best_down_ask: number | null;
    up_mid: number | null;
    down_mid: number | null;
    spread_up: number | null;
    spread_down: number | null;
    btc_usd: number | null;
};
export type CampaignMeta = {
    conditionId: string;
    startMs: number;
    endMs: number;
    intervalSec: number;
    rowCount: number;
    createdAtMs: number;
    slug?: string;
};
export declare function campaignDir(dataDir: string, conditionId: string): string;
export declare function campaignCsvPath(dataDir: string, conditionId: string, startMs: number): string;
export declare function campaignMetaPath(dataDir: string, conditionId: string, startMs: number): string;
export declare function ensureDir(dir: string): Promise<void>;
export declare function writeCampaign(dataDir: string, meta: CampaignMeta, rows: CampaignRow[]): Promise<void>;
export declare function listCampaigns(dataDir: string, conditionId?: string): Promise<CampaignMeta[]>;
export declare function readCampaign(dataDir: string, conditionId: string, startMs: number): Promise<{
    meta: CampaignMeta;
    rows: CampaignRow[];
}>;
//# sourceMappingURL=campaignCsv.d.ts.map