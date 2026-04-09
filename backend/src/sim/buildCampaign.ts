import { DataApiClient, type DataApiTrade } from "../polymarket/dataApi.js";
import { GammaClient } from "../polymarket/gamma.js";
import { BtcPriceClient } from "../prices/btc.js";
import type { CampaignMeta, CampaignRow } from "../storage/campaignCsv.js";

function floorToSecondMs(t: number) {
  return Math.floor(t / 1000) * 1000;
}

function lastObservationCarryForward<T>(points: [number, T][], t: number): T | null {
  // points must be sorted by time
  let lo = 0;
  let hi = points.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const tm = points[mid]![0];
    if (tm <= t) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best === -1 ? null : (points[best]![1] ?? null);
}

function locfWithStartAt(points: [number, number][], t: number, fallback: number): number {
  // Desired behavior: at the start of each pool, price is commonly ~0.5.
  // So we hold fallback (0.5) until the first in-window observation arrives,
  // then LOCF forward-fill from there.
  if (!points.length) return fallback;
  const v = lastObservationCarryForward(points, t);
  return v !== null && Number.isFinite(v) ? v : fallback;
}

/** Last observation per second boundary (chronological order: later samples win). */
function lastTradePerSecond(pairs: [number, number][]): [number, number][] {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const bySec = new Map<number, number>();
  for (const [t, p] of sorted) {
    const sec = floorToSecondMs(t);
    if (Number.isFinite(p)) bySec.set(sec, p);
  }
  return [...bySec.entries()].sort((a, b) => a[0] - b[0]);
}

/** Per-second union: trades overwrite CLOB history for the same second. */
function mergeTradesOverClob(tradePairs: [number, number][], clobPairs: [number, number][]): [number, number][] {
  const merged = new Map<number, number>();
  for (const [t, p] of lastTradePerSecond(clobPairs)) merged.set(t, p);
  for (const [t, p] of lastTradePerSecond(tradePairs)) merged.set(t, p);
  return [...merged.entries()].sort((a, b) => a[0] - b[0]);
}

export type CampaignSources = {
  trades: DataApiTrade[];
  btcRange: [number, number][]; // [ms, btcUsd]
  /** CLOB outcome token ids from Gamma (Data API `trade.asset` matches these). */
  upTokenId?: string;
  downTokenId?: string;
  /** Optional CLOB `/prices-history` points as [ms, price] (e.g. fills thin trade tape). */
  clobUpHistory?: [number, number][];
  clobDownHistory?: [number, number][];
};

export type BuildCampaignParams = {
  conditionId: string;
  startMs: number;
  intervalSec?: number; // default 1
  durationSec?: number; // default 300
};

export async function fetchCampaignSources(params: BuildCampaignParams, deps: { dataApi: DataApiClient; btc: BtcPriceClient }): Promise<CampaignSources> {
  const durationSec = params.durationSec ?? 300;
  const windowStart = params.startMs;
  const windowEnd = params.startMs + durationSec * 1000;

  // Data API has a max historical offset of 3000, so we can only page a limited amount.
  // For a 5-minute campaign we typically need far less than this.
  const trades = await deps.dataApi.getAllTradesForMarket(params.conditionId, { pages: 10, pageSize: 500 });
  const btcRange = await deps.btc.getBtcUsdRange({
    fromSec: Math.floor(windowStart / 1000) - 60,
    toSec: Math.floor(windowEnd / 1000) + 60,
  });
  btcRange.sort((a, b) => a[0] - b[0]);
  return { trades, btcRange };
}

export function buildCampaignRowsFromSources(params: BuildCampaignParams, sources: CampaignSources) {
  const intervalSec = params.intervalSec ?? 1;
  const durationSec = params.durationSec ?? 300;
  if (intervalSec !== 1) throw new Error("Only intervalSec=1 supported for CSV output");

  // Prefer matching Data API trades by `asset` (CLOB token id); fall back to outcome labels.
  const windowStart = params.startMs;
  const windowEnd = params.startMs + durationSec * 1000;

  const upByAsset: [number, number][] = [];
  const downByAsset: [number, number][] = [];
  const upByOutcome: [number, number][] = [];
  const downByOutcome: [number, number][] = [];

  for (const tr of sources.trades) {
    if (tr.timestamp < windowStart || tr.timestamp >= windowEnd) continue;
    const t = floorToSecondMs(tr.timestamp);
    const p = tr.price;
    if (!Number.isFinite(p)) continue;

    if (sources.upTokenId && String(tr.asset) === String(sources.upTokenId)) upByAsset.push([t, p]);
    else if (sources.downTokenId && String(tr.asset) === String(sources.downTokenId)) downByAsset.push([t, p]);
    else {
      const outcome = (tr.outcome ?? "").toLowerCase();
      if (outcome.includes("up")) upByOutcome.push([t, p]);
      else if (outcome.includes("down")) downByOutcome.push([t, p]);
    }
  }

  const clobUp = sources.clobUpHistory?.filter(([ts]) => ts >= windowStart && ts < windowEnd) ?? [];
  const clobDown = sources.clobDownHistory?.filter(([ts]) => ts >= windowStart && ts < windowEnd) ?? [];

  let up: [number, number][];
  let down: [number, number][];
  if (sources.upTokenId || sources.downTokenId) {
    up = mergeTradesOverClob(upByAsset, clobUp);
    down = mergeTradesOverClob(downByAsset, clobDown);
    if (!up.length && upByOutcome.length) up = lastTradePerSecond(upByOutcome);
    if (!down.length && downByOutcome.length) down = lastTradePerSecond(downByOutcome);
  } else {
    up = lastTradePerSecond(upByOutcome);
    down = lastTradePerSecond(downByOutcome);
  }

  if (sources.upTokenId && sources.downTokenId) {
    if (up.length && !down.length) down = up.map(([ts, px]) => [ts, 1 - px]);
    else if (down.length && !up.length) up = down.map(([ts, px]) => [ts, 1 - px]);
  }

  const rows: CampaignRow[] = [];
  for (let i = 0; i < durationSec; i += intervalSec) {
    const t = windowStart + i * 1000;
    const upLast = locfWithStartAt(up, t, 0.5);
    const downLast = locfWithStartAt(down, t, 0.5);
    const btcUsd = lastObservationCarryForward(sources.btcRange, t);
    rows.push({
      t,
      up_last: upLast,
      down_last: downLast,
      // Historical backfills (trade-derived) do NOT have true best bid/ask.
      // Leaving these as null avoids misleading data (bid == ask is not a real book).
      best_up_bid: null,
      best_up_ask: null,
      best_down_bid: null,
      best_down_ask: null,
      up_mid: upLast,
      down_mid: downLast,
      spread_up: null,
      spread_down: null,
      btc_usd: btcUsd,
    });
  }

  return {
    rows,
    endMs: windowEnd,
  };
}

export async function buildCampaignRows(params: BuildCampaignParams, deps: { dataApi: DataApiClient; btc: BtcPriceClient }) {
  const sources = await fetchCampaignSources(params, deps);
  return buildCampaignRowsFromSources(params, sources);
}

export async function discoverPinnedMarkets(config: { gamma: GammaClient; pinnedSlugs?: string; search: string }): Promise<{ slug: string; conditionId: string }[]> {
  if (config.pinnedSlugs) {
    const slugs = config.pinnedSlugs.split(",").map((s) => s.trim()).filter(Boolean);
    const out: { slug: string; conditionId: string }[] = [];
    for (const slug of slugs) {
      const m = await config.gamma.getMarketBySlug(slug);
      const conditionId = (m.conditionId as string | undefined) ?? (m.condition_id as string | undefined);
      if (!conditionId) throw new Error(`Market ${slug} missing conditionId`);
      out.push({ slug, conditionId });
    }
    return out;
  }

  // Fallback: list recent markets (Gamma has no `search` param on /markets).
  // We return a small sample; callers can filter further if needed.
  const res = await config.gamma.listMarkets({ limit: 50, offset: 0, enableOrderBook: true, order: "updatedAt", ascending: false });
  const needle = config.search.toLowerCase();
  return res
    .filter((m) => String(m.slug ?? "").toLowerCase().includes(needle) || String(m.question ?? "").toLowerCase().includes(needle))
    .map((m) => {
      const conditionId = (m.conditionId as string | undefined) ?? (m.condition_id as string | undefined);
      return conditionId ? { slug: m.slug, conditionId } : null;
    })
    .filter((x): x is { slug: string; conditionId: string } => x !== null);
}

export function makeCampaignMeta(input: { conditionId: string; startMs: number; endMs: number; rowCount: number; slug?: string }): CampaignMeta {
  return {
    conditionId: input.conditionId,
    startMs: input.startMs,
    endMs: input.endMs,
    intervalSec: 1,
    rowCount: input.rowCount,
    createdAtMs: Date.now(),
    ...(input.slug ? { slug: input.slug } : {}),
  };
}

