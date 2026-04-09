import { loadConfig } from "../config.js";
import { GammaClient, extractUpDownTokenIds } from "../polymarket/gamma.js";
import { ClobClientPublic, bestBidAsk } from "../polymarket/clob.js";
import { connectClobMarketWs } from "../polymarket/clobMarketWs.js";
import { BtcPriceClient } from "../prices/btc.js";
import { makeCampaignMeta } from "../sim/buildCampaign.js";
import { writeCampaign, type CampaignRow } from "../storage/campaignCsv.js";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function argNum(name: string, def: number): number {
  const v = arg(name);
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function floorTo5m(ms: number) {
  const step = 300_000;
  return Math.floor(ms / step) * step;
}

type TokenPair = { upTokenId: string; downTokenId: string; slug?: string };

async function resolveUpDownTokens(gamma: GammaClient, conditionId: string): Promise<TokenPair> {
  const m = await gamma.getMarketByConditionId(conditionId);
  const pair = extractUpDownTokenIds(m);
  if (!pair) throw new Error(`Market ${conditionId} missing clobTokenIds/outcomes`);
  return { upTokenId: pair.upTokenId, downTokenId: pair.downTokenId, slug: m.slug };
}

async function main() {
  const config = loadConfig();
  const conditionId = arg("conditionId");
  const seconds = argNum("seconds", 300);
  const startMsRaw = arg("startMs") ? Number(arg("startMs")) : Date.now();
  const startMs = floorTo5m(startMsRaw);

  if (!conditionId) throw new Error("Usage: npm run collect:live -- --conditionId <conditionId> [--seconds 300] [--startMs <ms>]");
  if (!Number.isFinite(startMsRaw)) throw new Error("--startMs must be a number (ms)");

  const gamma = new GammaClient(config.GAMMA_BASE_URL);
  const clob = new ClobClientPublic(config.CLOB_BASE_URL);
  const btc = new BtcPriceClient();

  const { upTokenId, downTokenId, slug } = await resolveUpDownTokens(gamma, conditionId);

  const ws = connectClobMarketWs(config.CLOB_WSS_URL, [upTokenId, downTokenId]);
  await Promise.race([ws.ready, sleep(15_000)]);

  // Fetch BTC once for the whole collection window to avoid rate limits.
  const endMs = startMs + seconds * 1000;
  const btcAll = await btc.getBtcUsdRange({
    fromSec: Math.floor(startMs / 1000) - 120,
    toSec: Math.floor(endMs / 1000) + 120,
  });
  btcAll.sort((a, b) => a[0] - b[0]);
  const btcAt = (t: number) => {
    let best: number | null = null;
    for (const [ts, px] of btcAll) {
      if (ts <= t) best = px;
      else break;
    }
    return best;
  };

  const rows: CampaignRow[] = [];

  try {
    // Align sampling to whole seconds relative to startMs; CLOB WS provides best bid/ask per docs, REST fills gaps.
    for (let i = 0; i < seconds; i++) {
      const t = startMs + i * 1000;
      const now = Date.now();
      if (now < t) await sleep(t - now);

      let up = ws.getTop(upTokenId);
      let down = ws.getTop(downTokenId);
      if (up.bid === null && up.ask === null) up = bestBidAsk(await clob.getBook(upTokenId));
      if (down.bid === null && down.ask === null) down = bestBidAsk(await clob.getBook(downTokenId));

      const upMid = up.bid !== null && up.ask !== null ? (up.bid + up.ask) / 2 : null;
      const downMid = down.bid !== null && down.ask !== null ? (down.bid + down.ask) / 2 : null;
      const spreadUp = up.bid !== null && up.ask !== null ? up.ask - up.bid : null;
      const spreadDown = down.bid !== null && down.ask !== null ? down.ask - down.bid : null;

      rows.push({
        t,
        up_last: null,
        down_last: null,
        best_up_bid: up.bid,
        best_up_ask: up.ask,
        best_down_bid: down.bid,
        best_down_ask: down.ask,
        up_mid: upMid,
        down_mid: downMid,
        spread_up: spreadUp,
        spread_down: spreadDown,
        btc_usd: btcAt(t),
      });
    }
  } finally {
    ws.close();
  }

  const meta = makeCampaignMeta({
    conditionId,
    startMs,
    endMs,
    rowCount: rows.length,
    slug,
  });

  await writeCampaign(config.DATA_DIR, meta, rows);
  // eslint-disable-next-line no-console
  console.log(`Saved live campaign: conditionId=${conditionId} startMs=${startMs} rows=${rows.length}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

