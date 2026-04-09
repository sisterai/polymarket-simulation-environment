import type { TradingBot } from "../bot.js";
/**
 * Follow BTC over ~30s when `btc_usd` is present; otherwise use UP **mid** change as a stand-in
 * so backtests still trade on typical campaign CSVs (often empty BTC column).
 */
export declare const btcMomentumBot: TradingBot;
//# sourceMappingURL=btcMomentum.d.ts.map