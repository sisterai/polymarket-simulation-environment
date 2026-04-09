import type { CampaignRow } from "../storage/campaignCsv.js";
import type { BotAction, TradingBot } from "./bot.js";

export type Fill = {
  t: number;
  outcome: "UP" | "DOWN";
  side: "BUY" | "SELL";
  shares: number;
  price: number; // probability price [0,1]
  notional: number; // shares * price
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
  initialCash?: number; // USDC
  maxSharesPerTrade?: number;
  feeRate?: number; // e.g. 0.01 for 1%
  slippageBps?: number; // 10 => 0.10%
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function getMark(row: CampaignRow, outcome: "UP" | "DOWN") {
  return outcome === "UP" ? row.up_mid : row.down_mid;
}

function marksAt(row: CampaignRow): { markUp: number; markDown: number } {
  // Prefer mid if available (bid/ask-derived); otherwise fall back to trade-derived last.
  // If both are null (shouldn't happen for our backfilled campaigns), treat as 0 to avoid NaNs.
  const markUp = row.up_mid ?? row.up_last ?? 0;
  const markDown = row.down_mid ?? row.down_last ?? 0;
  return { markUp, markDown };
}

function equityAt(row: CampaignRow, pos: { cash: number; up: number; down: number }) {
  const { markUp, markDown } = marksAt(row);
  return { equity: pos.cash + pos.up * markUp + pos.down * markDown, markUp, markDown };
}

export function simulate(rows: CampaignRow[], bot: TradingBot, params: SimParams = {}): SimulationResult {
  const initialCash = params.initialCash ?? 1000;
  const feeRate = params.feeRate ?? 0.0;
  const slippageBps = params.slippageBps ?? 0;
  const maxSharesPerTrade = params.maxSharesPerTrade ?? 50;

  let cash = initialCash;
  let up = 0;
  let down = 0;
  const fills: Fill[] = [];
  let lastAction: BotAction | undefined;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const ctx = {
      t: row.t,
      i,
      campaignStartMs: rows[0]!.t,
      campaignEndMs: rows.at(-1)!.t,
      position: { up, down, cash },
      ...(lastAction ? { lastAction } : {}),
    };
    const action = bot.decide(row, ctx);
    lastAction = action;
    if (action.type === "HOLD") continue;

    const mark = getMark(row, action.outcome);
    if (mark === null) continue; // can't trade without price

    const shares = clamp(action.shares, 0, maxSharesPerTrade);
    if (shares <= 0) continue;

    const slippage = slippageBps / 10_000;
    const fillPrice = action.side === "BUY" ? mark * (1 + slippage) : mark * (1 - slippage);
    const notional = shares * fillPrice;
    const fee = notional * feeRate;

    if (action.side === "BUY") {
      if (cash < notional + fee) continue;
      cash -= notional + fee;
      if (action.outcome === "UP") up += shares;
      else down += shares;
    } else {
      if (action.outcome === "UP") {
        if (up < shares) continue;
        up -= shares;
      } else {
        if (down < shares) continue;
        down -= shares;
      }
      cash += notional - fee;
    }

    const postCash = cash;
    const postUp = up;
    const postDown = down;
    const mtm = equityAt(row, { cash: postCash, up: postUp, down: postDown });

    fills.push({
      t: row.t,
      outcome: action.outcome,
      side: action.side,
      shares,
      price: fillPrice,
      notional,
      fee,
      post: {
        cash: postCash,
        up: postUp,
        down: postDown,
        mtmEquity: mtm.equity,
        mtmPnl: mtm.equity - initialCash,
        markUp: mtm.markUp,
        markDown: mtm.markDown,
      },
    });
  }

  const last = rows.at(-1)!;
  const markUp = last.up_mid;
  const markDown = last.down_mid;
  const equity = cash + (markUp ?? 0) * up + (markDown ?? 0) * down;
  const pnl = equity - initialCash;

  const totals = {
    boughtUp: fills.filter((f) => f.outcome === "UP" && f.side === "BUY").reduce((s, f) => s + f.shares, 0),
    soldUp: fills.filter((f) => f.outcome === "UP" && f.side === "SELL").reduce((s, f) => s + f.shares, 0),
    boughtDown: fills.filter((f) => f.outcome === "DOWN" && f.side === "BUY").reduce((s, f) => s + f.shares, 0),
    soldDown: fills.filter((f) => f.outcome === "DOWN" && f.side === "SELL").reduce((s, f) => s + f.shares, 0),
    fees: fills.reduce((s, f) => s + f.fee, 0),
    trades: fills.length,
  };

  return {
    bot: bot.name,
    startMs: rows[0]!.t,
    endMs: last.t,
    initialCash,
    final: {
      cash,
      up,
      down,
      markUp,
      markDown,
      equity,
      pnl,
    },
    totals,
    fills,
  };
}

