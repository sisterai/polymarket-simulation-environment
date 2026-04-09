import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "../storage/campaignCsv.js";
import type { CampaignSources } from "../sim/buildCampaign.js";

export function campaignAssetDir(dataDir: string, conditionId: string, startMs: number) {
  return path.join(dataDir, "campaign-assets", conditionId, String(startMs));
}

export async function writeCampaignSources(dataDir: string, conditionId: string, startMs: number, sources: CampaignSources) {
  const dir = campaignAssetDir(dataDir, conditionId, startMs);
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, "trades.json"), JSON.stringify(sources.trades, null, 2), "utf-8");
  await fs.writeFile(path.join(dir, "btcRange.json"), JSON.stringify(sources.btcRange, null, 2), "utf-8");
  if (sources.upTokenId || sources.downTokenId) {
    await fs.writeFile(
      path.join(dir, "tokens.json"),
      JSON.stringify({ upTokenId: sources.upTokenId, downTokenId: sources.downTokenId }, null, 2),
      "utf-8",
    );
  }
}

