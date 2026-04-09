import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "../storage/campaignCsv.js";
export function campaignAssetDir(dataDir, conditionId, startMs) {
    return path.join(dataDir, "campaign-assets", conditionId, String(startMs));
}
export async function writeCampaignSources(dataDir, conditionId, startMs, sources) {
    const dir = campaignAssetDir(dataDir, conditionId, startMs);
    await ensureDir(dir);
    await fs.writeFile(path.join(dir, "trades.json"), JSON.stringify(sources.trades, null, 2), "utf-8");
    await fs.writeFile(path.join(dir, "btcRange.json"), JSON.stringify(sources.btcRange, null, 2), "utf-8");
    if (sources.upTokenId || sources.downTokenId) {
        await fs.writeFile(path.join(dir, "tokens.json"), JSON.stringify({ upTokenId: sources.upTokenId, downTokenId: sources.downTokenId }, null, 2), "utf-8");
    }
}
//# sourceMappingURL=campaignStore.js.map