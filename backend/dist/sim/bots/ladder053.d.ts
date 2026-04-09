import type { TradingBot } from "../bot.js";
/**
 * Alternating ladder on 0.53 touches: UP $1 → DOWN $2 → UP $4 → DOWN $8 → …
 * Each leg waits for an upward cross of THRESHOLD on that outcome after the outcome was
 * re-armed (mid must have gone below THRESHOLD since the last buy on that side).
 *
 * Notional per leg is `2^legIndex` USD; shares = usd / mid. Large legs need a high
 * `maxSharesPerTrade` in the simulator params.
 */
export declare const ladder053Bot: TradingBot;
//# sourceMappingURL=ladder053.d.ts.map