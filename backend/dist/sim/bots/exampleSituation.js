const byCampaign = new Map();
function stateFor(campaignStartMs) {
    let s = byCampaign.get(campaignStartMs);
    if (!s) {
        s = { prevUp: null, prevDown: null, prevBtc: null };
        byCampaign.set(campaignStartMs, s);
    }
    return s;
}
function midUp(row) {
    return row.up_mid ?? row.up_last ?? null;
}
function midDown(row) {
    return row.down_mid ?? row.down_last ?? null;
}
/**
 * Example strategy for testing the simulator: reacts to **current** situation each second.
 *
 * - **HOLD**: no edge, no cash, missing prices, or first bar (warm-up).
 * - **BUY UP / BUY DOWN**: short-term momentum on the token mid + optional **BTC drift** bias.
 * - **SELL**: take-profit when mid moves against a large position; **flatten** in the last ~15s.
 *
 * Sizing: scales with signal strength and caps by `maxSharesPerTrade` (sim default 50).
 */
export const exampleSituationBot = {
    name: "example-situation-v1",
    decide(row, ctx) {
        const up = midUp(row);
        const down = midDown(row);
        const secondsLeft = (ctx.campaignEndMs - ctx.t) / 1000;
        // --- Endgame: reduce inventory (SELL) so PnL is visible in logs ---
        if (secondsLeft <= 15) {
            if (ctx.position.up > 0 && up !== null) {
                return { type: "MARKET", outcome: "UP", side: "SELL", shares: Math.min(25, ctx.position.up) };
            }
            if (ctx.position.down > 0 && down !== null) {
                return { type: "MARKET", outcome: "DOWN", side: "SELL", shares: Math.min(25, ctx.position.down) };
            }
            return { type: "HOLD" };
        }
        if (up === null || down === null)
            return { type: "HOLD" };
        const st = stateFor(ctx.campaignStartMs);
        // Warm-up: establish baselines (no trade on first bar)
        if (ctx.i === 0) {
            st.prevUp = up;
            st.prevDown = down;
            st.prevBtc = row.btc_usd;
            return { type: "HOLD" };
        }
        const dUp = up - (st.prevUp ?? up);
        const dDown = down - (st.prevDown ?? down);
        st.prevUp = up;
        st.prevDown = down;
        let btcBias = "NEUTRAL";
        const btc = row.btc_usd;
        if (btc != null && st.prevBtc != null) {
            const dBtc = btc - st.prevBtc;
            if (dBtc > 1)
                btcBias = "UP";
            else if (dBtc < -1)
                btcBias = "DOWN";
        }
        if (btc != null)
            st.prevBtc = btc;
        const cash = ctx.position.cash;
        const minNotional = 5;
        if (cash < minNotional)
            return { type: "HOLD" };
        // --- Take profit / cut: SELL when large inventory and price ticks against us ---
        const sellChunk = 18;
        if (ctx.position.up >= 40 && dUp < -0.006) {
            return { type: "MARKET", outcome: "UP", side: "SELL", shares: Math.min(sellChunk, ctx.position.up) };
        }
        if (ctx.position.down >= 40 && dDown < -0.006) {
            return { type: "MARKET", outcome: "DOWN", side: "SELL", shares: Math.min(sellChunk, ctx.position.down) };
        }
        // --- Entries: momentum threshold (probability points per second bar) ---
        const momentumTh = 0.007;
        const upSignal = dUp > momentumTh && (btcBias !== "DOWN");
        const downSignal = dDown > momentumTh && (btcBias !== "UP");
        function sizeFromDelta(absDelta) {
            const raw = Math.floor(80 * absDelta + 3);
            return Math.min(45, Math.max(3, raw));
        }
        if (upSignal && !downSignal) {
            const shares = sizeFromDelta(Math.abs(dUp));
            return { type: "MARKET", outcome: "UP", side: "BUY", shares };
        }
        if (downSignal && !upSignal) {
            const shares = sizeFromDelta(Math.abs(dDown));
            return { type: "MARKET", outcome: "DOWN", side: "BUY", shares };
        }
        // --- Soft BTC bias: small probe when momentum is flat but BTC moved ---
        if (!upSignal && !downSignal && btcBias === "UP" && dUp >= -0.003 && cash > 80) {
            return { type: "MARKET", outcome: "UP", side: "BUY", shares: 5 };
        }
        if (!upSignal && !downSignal && btcBias === "DOWN" && dDown >= -0.003 && cash > 80) {
            return { type: "MARKET", outcome: "DOWN", side: "BUY", shares: 5 };
        }
        return { type: "HOLD" };
    },
};
//# sourceMappingURL=exampleSituation.js.map