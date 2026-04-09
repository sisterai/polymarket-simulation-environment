export type TopOfBook = {
    bid: number | null;
    ask: number | null;
};
/**
 * Polymarket CLOB public market WebSocket: subscribe with `{ assets_ids, type: "market" }`,
 * then consume `book`, `best_bid_ask`, and `price_change` payloads.
 */
export declare function connectClobMarketWs(url: string, assetIds: string[], onUpdate?: (assetId: string, top: TopOfBook) => void): {
    close: () => void;
    ready: Promise<void>;
    getTop: (assetId: string) => TopOfBook;
};
//# sourceMappingURL=clobMarketWs.d.ts.map