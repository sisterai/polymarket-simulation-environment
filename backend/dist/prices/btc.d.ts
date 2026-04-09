export declare class BtcPriceClient {
    private readonly baseUrl;
    constructor(baseUrl?: string);
    private getBtcUsdRangeCoinbase;
    getBtcUsdRange(params: {
        fromSec: number;
        toSec: number;
    }): Promise<[number, number][]>;
}
//# sourceMappingURL=btc.d.ts.map