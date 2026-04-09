import express from "express";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { GammaClient, extractUpDownTokenIds } from "../polymarket/gamma.js";
import { DataApiClient } from "../polymarket/dataApi.js";
import { ClobClientPublic, clobHistoryToMsPairs } from "../polymarket/clob.js";
import { BtcPriceClient } from "../prices/btc.js";
import {
  buildCampaignRowsFromSources,
  discoverPinnedMarkets,
  fetchCampaignSources,
  makeCampaignMeta,
} from "../sim/buildCampaign.js";
import { listCampaigns, readCampaign, writeCampaign } from "../storage/campaignCsv.js";
import { simulate } from "../sim/simulate.js";
import { btcMomentumBot } from "../sim/bots/btcMomentum.js";
import { exampleSituationBot } from "../sim/bots/exampleSituation.js";
import { ladder053Bot } from "../sim/bots/ladder053.js";

const Bots = {
  "btc-momentum-v1": btcMomentumBot,
  "example-situation-v1": exampleSituationBot,
  "ladder-053-v1": ladder053Bot,
} as const;

export function buildRouter(config: AppConfig) {
  const router = express.Router();
  const gamma = new GammaClient(config.GAMMA_BASE_URL);
  const dataApi = new DataApiClient(config.DATA_API_BASE_URL);
  const clob = new ClobClientPublic(config.CLOB_BASE_URL);
  const btc = new BtcPriceClient();

  router.get("/health", (_req, res) => res.json({ ok: true }));

  router.get("/bots", (_req, res) => res.json(Object.keys(Bots)));

  router.get("/campaigns", async (req, res) => {
    const conditionId = typeof req.query.conditionId === "string" ? req.query.conditionId : undefined;
    const campaigns = await listCampaigns(config.DATA_DIR, conditionId);
    res.json(campaigns);
  });

  router.get("/campaigns/:conditionId/:startMs", async (req, res) => {
    const conditionId = req.params.conditionId!;
    const startMs = Number(req.params.startMs);
    const data = await readCampaign(config.DATA_DIR, conditionId, startMs);
    res.json(data);
  });

  router.post("/download", express.json(), async (req, res) => {
    const Body = z.object({
      conditionId: z.string(),
      startMs: z.number().int().positive(),
      durationSec: z.number().int().positive().default(300),
      slug: z.string().optional(),
    });
    const body = Body.parse(req.body);
    const sources = await fetchCampaignSources(
      { conditionId: body.conditionId, startMs: body.startMs, durationSec: body.durationSec },
      { dataApi, btc },
    );
    const tok = extractUpDownTokenIds(await gamma.getMarketByConditionId(body.conditionId));
    if (tok) {
      sources.upTokenId = tok.upTokenId;
      sources.downTokenId = tok.downTokenId;
      const windowEnd = body.startMs + body.durationSec * 1000;
      const startSec = Math.floor(body.startMs / 1000) - 120;
      const endSec = Math.ceil(windowEnd / 1000) + 120;
      const [rawUp, rawDown] = await Promise.all([
        clob.getPricesHistory({ market: tok.upTokenId, startTs: startSec, endTs: endSec, fidelity: 1 }).catch(() => []),
        clob.getPricesHistory({ market: tok.downTokenId, startTs: startSec, endTs: endSec, fidelity: 1 }).catch(() => []),
      ]);
      sources.clobUpHistory = clobHistoryToMsPairs(rawUp);
      sources.clobDownHistory = clobHistoryToMsPairs(rawDown);
    }
    const built = buildCampaignRowsFromSources(
      { conditionId: body.conditionId, startMs: body.startMs, durationSec: body.durationSec },
      sources,
    );
    const meta = makeCampaignMeta({
      conditionId: body.conditionId,
      startMs: body.startMs,
      endMs: built.endMs,
      rowCount: built.rows.length,
      slug: body.slug,
    });
    await writeCampaign(config.DATA_DIR, meta, built.rows);
    res.json({ meta });
  });

  router.get("/discover", async (_req, res) => {
    const markets = await discoverPinnedMarkets(
      config.PINNED_MARKET_SLUGS
        ? { gamma, pinnedSlugs: config.PINNED_MARKET_SLUGS, search: config.MARKET_SEARCH_QUERY }
        : { gamma, search: config.MARKET_SEARCH_QUERY },
    );
    res.json(markets);
  });

  router.post("/backtest", express.json(), async (req, res) => {
    const Body = z.object({
      conditionId: z.string().min(1),
      startMs: z.coerce.number(),
      bot: z.string().default("btc-momentum-v1"),
      params: z.record(z.string(), z.unknown()).optional(),
    });
    let body: z.infer<typeof Body>;
    try {
      body = Body.parse(req.body);
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message ?? e) });
    }
    const startMs = Math.trunc(Number(body.startMs));
    if (!Number.isFinite(startMs) || startMs <= 0) {
      return res.status(400).json({ error: "Invalid startMs" });
    }
    const bot = (Bots as Record<string, any>)[body.bot];
    if (!bot) return res.status(400).json({ error: `Unknown bot '${body.bot}'` });

    const p = (body.params ?? {}) as Record<string, unknown>;
    const initialCash = Number(p.initialCash);
    const feeRate = Number(p.feeRate);
    const slippageBps = Number(p.slippageBps);
    const maxSharesPerTrade = Number(p.maxSharesPerTrade);
    const simParams = {
      initialCash: Number.isFinite(initialCash) && initialCash > 0 ? initialCash : 1000,
      feeRate: Number.isFinite(feeRate) ? Math.max(0, Math.min(0.1, feeRate)) : 0,
      slippageBps: Number.isFinite(slippageBps) ? Math.max(0, Math.min(500, Math.trunc(slippageBps))) : 0,
      ...(Number.isFinite(maxSharesPerTrade) && maxSharesPerTrade > 0 ? { maxSharesPerTrade } : {}),
    };

    let rows: Awaited<ReturnType<typeof readCampaign>>["rows"];
    let meta: Awaited<ReturnType<typeof readCampaign>>["meta"];
    try {
      const camp = await readCampaign(config.DATA_DIR, body.conditionId, startMs);
      rows = camp.rows;
      meta = camp.meta;
    } catch (e: any) {
      return res.status(404).json({ error: `Campaign not found: ${String(e?.message ?? e)}` });
    }
    const result = simulate(rows, bot, simParams);
    res.json({ meta, result });
  });

  return router;
}

