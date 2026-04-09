import { loadConfig } from "../config.js";
import { DataApiClient } from "../polymarket/dataApi.js";
import { GammaClient, extractUpDownTokenIds } from "../polymarket/gamma.js";
import { ClobClientPublic, clobHistoryToMsPairs } from "../polymarket/clob.js";
import { BtcPriceClient } from "../prices/btc.js";
import { buildCampaignRowsFromSources, fetchCampaignSources, makeCampaignMeta } from "../sim/buildCampaign.js";
import { writeCampaign } from "../storage/campaignCsv.js";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const config = loadConfig();
  const conditionId = arg("conditionId");
  const fromMs = Number(arg("fromMs"));
  const toMs = Number(arg("toMs"));

  if (!conditionId || !Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    throw new Error("Usage: npm run download:range -- --conditionId <conditionId> --fromMs <ms> --toMs <ms>");
  }

  const dataApi = new DataApiClient(config.DATA_API_BASE_URL);
  const gamma = new GammaClient(config.GAMMA_BASE_URL);
  const clob = new ClobClientPublic(config.CLOB_BASE_URL);
  const btc = new BtcPriceClient();

  const tok = extractUpDownTokenIds(await gamma.getMarketByConditionId(conditionId));

  const stepMs = 300_000; // 5 minutes
  for (let startMs = fromMs; startMs + stepMs <= toMs; startMs += stepMs) {
    const sources = await fetchCampaignSources({ conditionId, startMs, durationSec: 300 }, { dataApi, btc });
    if (tok) {
      sources.upTokenId = tok.upTokenId;
      sources.downTokenId = tok.downTokenId;
      const windowEnd = startMs + 300_000;
      const startSec = Math.floor(startMs / 1000) - 120;
      const endSec = Math.ceil(windowEnd / 1000) + 120;
      const [rawUp, rawDown] = await Promise.all([
        clob.getPricesHistory({ market: tok.upTokenId, startTs: startSec, endTs: endSec, fidelity: 1 }).catch(() => []),
        clob.getPricesHistory({ market: tok.downTokenId, startTs: startSec, endTs: endSec, fidelity: 1 }).catch(() => []),
      ]);
      sources.clobUpHistory = clobHistoryToMsPairs(rawUp);
      sources.clobDownHistory = clobHistoryToMsPairs(rawDown);
    }
    const built = buildCampaignRowsFromSources({ conditionId, startMs, durationSec: 300 }, sources);
    const meta = makeCampaignMeta({ conditionId, startMs, endMs: built.endMs, rowCount: built.rows.length });
    await writeCampaign(config.DATA_DIR, meta, built.rows);
    // eslint-disable-next-line no-console
    console.log(`Saved ${conditionId} ${startMs}`);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

