/** 1s bars → 31 samples spans 30s from first to last. */
const RING = 31;
const byCampaign = new Map();
function stateFor(campaignStartMs) {
    let s = byCampaign.get(campaignStartMs);
    if (!s) {
        s = { btc: [], upMid: [] };
        byCampaign.set(campaignStartMs, s);
    }
    return s;
}
function pushRing(ring, v) {
    if (ring.length < RING)
        ring.push(v);
    else {
        ring.shift();
        ring.push(v);
    }
}
/** Oldest vs newest in the ring (≈30s change once full). */
function spanDelta(ring) {
    if (ring.length < 2)
        return null;
    const a = ring[0];
    const b = ring[ring.length - 1];
    if (a == null || b == null)
        return null;
    return b - a;
}
function midUp(row) {
    return row.up_mid ?? row.up_last ?? null;
}
/**
 * Follow BTC over ~30s when `btc_usd` is present; otherwise use UP **mid** change as a stand-in
 * so backtests still trade on typical campaign CSVs (often empty BTC column).
 */
export const btcMomentumBot = {
    name: "btc-momentum-v1",
    decide(row, ctx) {
        const secondsLeft = Math.floor((ctx.campaignEndMs - ctx.t) / 1000);
        if (secondsLeft <= 10) {
            if (ctx.position.up > 0 && row.up_mid !== null) {
                return { type: "MARKET", outcome: "UP", side: "SELL", shares: Math.min(10, ctx.position.up) };
            }
            if (ctx.position.down > 0 && row.down_mid !== null) {
                return { type: "MARKET", outcome: "DOWN", side: "SELL", shares: Math.min(10, ctx.position.down) };
            }
            return { type: "HOLD" };
        }
        const st = stateFor(ctx.campaignStartMs);
        pushRing(st.btc, row.btc_usd);
        pushRing(st.upMid, midUp(row));
        const budget = ctx.position.cash;
        if (budget < 5)
            return { type: "HOLD" };
        const dBtc = spanDelta(st.btc);
        const dUpMid = spanDelta(st.upMid);
        const btcThUsd = 25; // ~$25 move over the window
        const upMidTh = 0.012; // probability points over the window
        let outcome = null;
        if (dBtc !== null && Math.abs(dBtc) >= btcThUsd) {
            outcome = dBtc > 0 ? "UP" : "DOWN";
        }
        else if (dUpMid !== null && Math.abs(dUpMid) >= upMidTh) {
            // UP mid ↑ → lean UP; UP mid ↓ → lean DOWN (complement).
            outcome = dUpMid > 0 ? "UP" : "DOWN";
        }
        if (outcome === null)
            return { type: "HOLD" };
        return { type: "MARKET", outcome, side: "BUY", shares: 5 };
    },
};
//# sourceMappingURL=btcMomentum.js.map