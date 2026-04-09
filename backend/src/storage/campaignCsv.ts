import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { stringify } from "csv-stringify/sync";
import { parse } from "csv-parse/sync";

export type CampaignRow = {
  t: number; // ms timestamp for this 1s bar
  // Trade-derived last price marks (legacy)
  up_last: number | null;
  down_last: number | null;

  // Orderbook-derived top-of-book snapshots (preferred when available)
  best_up_bid: number | null;
  best_up_ask: number | null;
  best_down_bid: number | null;
  best_down_ask: number | null;

  // Derived marks (if we have bid/ask: mid; else: last)
  up_mid: number | null;
  down_mid: number | null;
  spread_up: number | null;
  spread_down: number | null;

  btc_usd: number | null;
};

export type CampaignMeta = {
  conditionId: string;
  startMs: number;
  endMs: number;
  intervalSec: number; // always 1 in our simulation CSVs
  rowCount: number;
  createdAtMs: number;
  // Optional display-only metadata (not used for keys/paths)
  slug?: string;
};

export function campaignDir(dataDir: string, conditionId: string) {
  return path.join(dataDir, "campaigns", conditionId);
}

export function campaignCsvPath(dataDir: string, conditionId: string, startMs: number) {
  return path.join(campaignDir(dataDir, conditionId), `${startMs}.csv`);
}

export function campaignMetaPath(dataDir: string, conditionId: string, startMs: number) {
  return path.join(campaignDir(dataDir, conditionId), `${startMs}.meta.json`);
}

export async function ensureDir(dir: string) {
  await fsp.mkdir(dir, { recursive: true });
}

export async function writeCampaign(dataDir: string, meta: CampaignMeta, rows: CampaignRow[]) {
  const dir = campaignDir(dataDir, meta.conditionId);
  await ensureDir(dir);

  const csv = stringify(
    rows.map((r) => [
      r.t,
      r.up_last,
      r.down_last,
      r.best_up_bid,
      r.best_up_ask,
      r.best_down_bid,
      r.best_down_ask,
      r.up_mid,
      r.down_mid,
      r.spread_up,
      r.spread_down,
      r.btc_usd,
    ]),
    {
      header: true,
      columns: [
        "t",
        "up_last",
        "down_last",
        "best_up_bid",
        "best_up_ask",
        "best_down_bid",
        "best_down_ask",
        "up_mid",
        "down_mid",
        "spread_up",
        "spread_down",
        "btc_usd",
      ],
    },
  );

  await fsp.writeFile(campaignCsvPath(dataDir, meta.conditionId, meta.startMs), csv, "utf-8");
  await fsp.writeFile(campaignMetaPath(dataDir, meta.conditionId, meta.startMs), JSON.stringify(meta, null, 2), "utf-8");
}

export async function listCampaigns(dataDir: string, conditionId?: string): Promise<CampaignMeta[]> {
  const campaignsRoot = path.join(dataDir, "campaigns");
  if (!fs.existsSync(campaignsRoot)) return [];

  const keys = conditionId ? [conditionId] : await fsp.readdir(campaignsRoot);
  const metas: CampaignMeta[] = [];
  for (const k of keys) {
    const dir = path.join(campaignsRoot, k);
    if (!fs.existsSync(dir)) continue;
    const files = await fsp.readdir(dir);
    for (const f of files) {
      if (!f.endsWith(".meta.json")) continue;
      const meta = JSON.parse(await fsp.readFile(path.join(dir, f), "utf-8")) as CampaignMeta;
      metas.push(meta);
    }
  }
  metas.sort((a, b) => a.startMs - b.startMs);
  return metas;
}

export async function readCampaign(
  dataDir: string,
  conditionId: string,
  startMs: number,
): Promise<{ meta: CampaignMeta; rows: CampaignRow[] }> {
  const meta = JSON.parse(await fsp.readFile(campaignMetaPath(dataDir, conditionId, startMs), "utf-8")) as CampaignMeta;
  const csv = await fsp.readFile(campaignCsvPath(dataDir, conditionId, startMs), "utf-8");
  const records = parse(csv, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  const numOrNull = (x: string | undefined) => (x === undefined || x === "" ? null : Number(x));
  const rows: CampaignRow[] = records.map((r) => ({
    t: Number(r.t),
    up_last: numOrNull(r.up_last),
    down_last: numOrNull(r.down_last),
    // Backward compatible: accept old column names (up_bid/up_ask/etc)
    best_up_bid: numOrNull((r as any).best_up_bid ?? (r as any).up_bid),
    best_up_ask: numOrNull((r as any).best_up_ask ?? (r as any).up_ask),
    best_down_bid: numOrNull((r as any).best_down_bid ?? (r as any).down_bid),
    best_down_ask: numOrNull((r as any).best_down_ask ?? (r as any).down_ask),
    up_mid: numOrNull(r.up_mid),
    down_mid: numOrNull(r.down_mid),
    spread_up: numOrNull(r.spread_up),
    spread_down: numOrNull(r.spread_down),
    btc_usd: numOrNull(r.btc_usd),
  }));
  return { meta, rows };
}

