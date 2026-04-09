import { z } from "zod";
const EnvSchema = z.object({
    PORT: z.coerce.number().int().positive().default(3001),
    DATA_DIR: z.string().default("data"),
    // Polymarket APIs
    GAMMA_BASE_URL: z.string().default("https://gamma-api.polymarket.com"),
    CLOB_BASE_URL: z.string().default("https://clob.polymarket.com"),
    /** Public CLOB market channel (order book + best bid/ask). See Polymarket WSS market docs. */
    CLOB_WSS_URL: z.string().default("wss://ws-subscriptions-clob.polymarket.com/ws/market"),
    DATA_API_BASE_URL: z.string().default("https://data-api.polymarket.com"),
    // The BTC 5m Up/Down market is a *series* of markets (one per campaign).
    // We discover campaigns by searching Gamma for markets by query + tags.
    MARKET_SEARCH_QUERY: z.string().default("BTC"),
    MARKET_TYPE_HINT: z.string().default("5m"),
    // If you know the exact market slug(s) you want, you can pin them (comma-separated).
    PINNED_MARKET_SLUGS: z.string().optional(),
});
export function loadConfig() {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
        // zod error is already structured; throw a readable message
        throw new Error(`Invalid env: ${parsed.error.message}`);
    }
    return parsed.data;
}
//# sourceMappingURL=config.js.map