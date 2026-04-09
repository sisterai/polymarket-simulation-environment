export type OrderBookLevel = {
    price: string;
    size: string;
};
export type OrderBookSummary = {
    asset_id: string;
    timestamp: string;
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
    last_trade_price?: string;
    [k: string]: unknown;
};
export declare class ClobClientPublic {
    private readonly baseUrl;
    constructor(baseUrl: string);
    getBook(tokenId: string): Promise<OrderBookSummary>;
    /**
     * Historical mark prices for an outcome token (`market` = asset id per CLOB docs).
     * https://docs.polymarket.com/api-reference/markets/get-prices-history
     */
    getPricesHistory(params: {
        market: string;
        startTs?: number;
        endTs?: number;
        fidelity?: number;
        interval?: string;
    }): Promise<{
        t: number;
        p: number;
    }[]>;
}
export declare function bestBidAsk(book: OrderBookSummary): {
    bid: number | null;
    ask: number | null;
};
/** Normalize CLOB `prices-history` timestamps to epoch ms (API uses unix seconds). */
export declare function clobHistoryToMsPairs(pts: {
    t: number;
    p: number;
}[]): [number, number][];
//# sourceMappingURL=clob.d.ts.map