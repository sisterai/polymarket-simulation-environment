import type { CampaignRow } from "../storage/campaignCsv.js";
export type Side = "BUY" | "SELL";
export type Outcome = "UP" | "DOWN";
export type BotAction = {
    type: "HOLD";
} | {
    type: "MARKET";
    outcome: Outcome;
    side: Side;
    shares: number;
};
export type BotContext = {
    t: number;
    i: number;
    campaignStartMs: number;
    campaignEndMs: number;
    position: {
        up: number;
        down: number;
        cash: number;
    };
    lastAction?: BotAction;
};
export interface TradingBot {
    name: string;
    decide(row: CampaignRow, ctx: BotContext): BotAction;
}
//# sourceMappingURL=bot.d.ts.map