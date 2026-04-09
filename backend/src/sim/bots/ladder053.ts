import type { CampaignRow } from "../../storage/campaignCsv.js";
import type { BotAction, Outcome, TradingBot } from "../bot.js";

/** Trigger buys when the relevant outcome mid reaches (or is above) this probability. */
const THRESHOLD = 0.53;

type CampaignState = {
  legIndex: number;
  prevUp: number | null;
  prevDown: number | null;
  /** After a buy on that side, false until mid dips back below THRESHOLD ("reaches 0.53 again"). */
  armedUp: boolean;
  armedDown: boolean;
  /** Cross happened but not enough cash; retry while price stays tradable. */
  pending: { leg: number; outcome: Outcome; usd: number } | null;
};

const byCampaign = new Map<number, CampaignState>();

function stateFor(campaignStartMs: number): CampaignState {
  let s = byCampaign.get(campaignStartMs);
  if (!s) {
    s = {
      legIndex: 0,
      prevUp: null,
      prevDown: null,
      armedUp: true,
      armedDown: true,
      pending: null,
    };
    byCampaign.set(campaignStartMs, s);
  }
  return s;
}

function midUp(row: CampaignRow): number | null {
  const m = row.up_mid ?? row.up_last ?? null;
  return m !== null && Number.isFinite(m) ? m : null;
}

function midDown(row: CampaignRow): number | null {
  const m = row.down_mid ?? row.down_last ?? null;
  return m !== null && Number.isFinite(m) ? m : null;
}

function outcomeForLeg(legIndex: number): Outcome {
  return legIndex % 2 === 0 ? "UP" : "DOWN";
}

/**
 * Alternating ladder on 0.53 touches: UP $1 → DOWN $2 → UP $4 → DOWN $8 → …
 * Each leg waits for an upward cross of THRESHOLD on that outcome after the outcome was
 * re-armed (mid must have gone below THRESHOLD since the last buy on that side).
 *
 * Notional per leg is `2^legIndex` USD; shares = usd / mid. Large legs need a high
 * `maxSharesPerTrade` in the simulator params.
 */
export const ladder053Bot: TradingBot = {
  name: "ladder-053-v1",
  decide(row, ctx): BotAction {
    const st = stateFor(ctx.campaignStartMs);
    const midU = midUp(row);
    const midD = midDown(row);

    if (midU !== null && midU < THRESHOLD) st.armedUp = true;
    if (midD !== null && midD < THRESHOLD) st.armedDown = true;

    const finalizePrev = () => {
      if (midU !== null) st.prevUp = midU;
      if (midD !== null) st.prevDown = midD;
    };

    const tryBuy = (outcome: Outcome, usd: number, px: number): BotAction => {
      const shares = usd / px;
      if (!Number.isFinite(shares) || shares <= 0) {
        finalizePrev();
        return { type: "HOLD" };
      }
      if (outcome === "UP") st.armedUp = false;
      else st.armedDown = false;
      st.pending = null;
      st.legIndex += 1;
      finalizePrev();
      return { type: "MARKET", outcome, side: "BUY", shares };
    };

    // Retry a leg that crossed but was skipped for lack of cash
    if (st.pending && st.pending.leg === st.legIndex) {
      const { outcome, usd } = st.pending;
      const px = outcome === "UP" ? midU : midD;
      if (px !== null && px >= THRESHOLD && ctx.position.cash >= usd) {
        return tryBuy(outcome, usd, px);
      }
      if (px !== null && px < THRESHOLD) {
        st.pending = null;
      }
      finalizePrev();
      return { type: "HOLD" };
    }

    const k = st.legIndex;
    const outcome = outcomeForLeg(k);
    const usd = 2 ** k;
    const mid = outcome === "UP" ? midU : midD;
    const prev = outcome === "UP" ? st.prevUp : st.prevDown;
    const armed = outcome === "UP" ? st.armedUp : st.armedDown;

    const cross =
      mid !== null &&
      armed &&
      (prev === null || prev < THRESHOLD) &&
      mid >= THRESHOLD;

    if (cross && ctx.position.cash >= usd) {
      return tryBuy(outcome, usd, mid);
    }

    if (cross && ctx.position.cash < usd) {
      st.pending = { leg: k, outcome, usd };
    }

    finalizePrev();
    return { type: "HOLD" };
  },
};
