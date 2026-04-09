import type { TradingBot } from "../bot.js";
/**
 * Example strategy for testing the simulator: reacts to **current** situation each second.
 *
 * - **HOLD**: no edge, no cash, missing prices, or first bar (warm-up).
 * - **BUY UP / BUY DOWN**: short-term momentum on the token mid + optional **BTC drift** bias.
 * - **SELL**: take-profit when mid moves against a large position; **flatten** in the last ~15s.
 *
 * Sizing: scales with signal strength and caps by `maxSharesPerTrade` (sim default 50).
 */
export declare const exampleSituationBot: TradingBot;
//# sourceMappingURL=exampleSituation.d.ts.map