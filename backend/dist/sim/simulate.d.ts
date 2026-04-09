import type { CampaignRow } from "../storage/campaignCsv.js";
import type { TradingBot } from "./bot.js";
export type Fill = {
    t: number;
    outcome: "UP" | "DOWN";
    side: "BUY" | "SELL";
    shares: number;
    price: number;
    notional: number;
    fee: number;
    post: {
        cash: number;
        up: number;
        down: number;
        /** Mark-to-market equity using the campaign mark at this second. */
        mtmEquity: number;
        /** Mark-to-market PnL = mtmEquity - initialCash. */
        mtmPnl: number;
        /** The marks used for MTM at this second (probability prices). */
        markUp: number;
        markDown: number;
    };
};
export type SimulationResult = {
    bot: string;
    startMs: number;
    endMs: number;
    initialCash: number;
    final: {
        cash: number;
        up: number;
        down: number;
        markUp: number | null;
        markDown: number | null;
        equity: number;
        pnl: number;
    };
    totals: {
        boughtUp: number;
        soldUp: number;
        boughtDown: number;
        soldDown: number;
        fees: number;
        trades: number;
    };
    fills: Fill[];
};
export type SimParams = {
    initialCash?: number;
    maxSharesPerTrade?: number;
    feeRate?: number;
    slippageBps?: number;
};
export declare function simulate(rows: CampaignRow[], bot: TradingBot, params?: SimParams): SimulationResult;
//# sourceMappingURL=simulate.d.ts.map