export type DataApiTrade = {
    proxyWallet: string;
    side: "BUY" | "SELL";
    asset: string;
    conditionId: string;
    size: number;
    price: number;
    timestamp: number;
    title?: string;
    slug?: string;
    outcome?: string;
    outcomeIndex?: number;
    transactionHash?: string;
    [k: string]: unknown;
};
export declare class DataApiClient {
    private readonly baseUrl;
    constructor(baseUrl: string);
    private normalizeTrade;
    getTrades(params: {
        market?: string | string[];
        limit?: number;
        offset?: number;
        takerOnly?: boolean;
    }): Promise<DataApiTrade[]>;
    getAllTradesForMarket(conditionId: string, max: {
        pages: number;
        pageSize: number;
    }): Promise<DataApiTrade[]>;
}
//# sourceMappingURL=dataApi.d.ts.map