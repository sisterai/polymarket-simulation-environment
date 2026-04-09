import fs from "node:fs/promises";
import path from "node:path";
import { stringify } from "csv-stringify/sync";
import { loadConfig } from "../config.js";
import { GammaClient, extractUpDownTokenIds } from "../polymarket/gamma.js";
import { DataApiClient } from "../polymarket/dataApi.js";
import { ClobClientPublic, clobHistoryToMsPairs } from "../polymarket/clob.js";
import { BtcPriceClient } from "../prices/btc.js";
import { buildCampaignRowsFromSources, makeCampaignMeta } from "../sim/buildCampaign.js";
import { btcMomentumBot } from "../sim/bots/btcMomentum.js";
import { exampleSituationBot } from "../sim/bots/exampleSituation.js";
import { ladder053Bot } from "../sim/bots/ladder053.js";
import { simulate } from "../sim/simulate.js";
import { ensureDir, writeCampaign } from "../storage/campaignCsv.js";
function arg(name) {
    const idx = process.argv.indexOf(`--${name}`);
    if (idx === -1)
        return undefined;
    return process.argv[idx + 1];
}
function argNum(name, def) {
    const v = arg(name);
    if (!v)
        return def;
    const n = Number(v);
    if (!Number.isFinite(n))
        return def;
    return n;
}
function parseMsMaybe(x) {
    if (typeof x !== "string")
        return null;
    const ms = Date.parse(x);
    return Number.isFinite(ms) ? ms : null;
}
function isLikely5mUpDownMarket(m, hint) {
    const slug = String(m.slug ?? "").toLowerCase().trim();
    if (hint.toLowerCase() === "5m")
        return /^btc-updown-5m-\d+$/.test(slug);
    if (hint.toLowerCase() === "15m")
        return /^btc-updown-15m-\d+$/.test(slug);
    return slug.includes("btc-updown") && slug.includes(`-${hint.toLowerCase()}-`);
}
function getConditionId(m) {
    const c = m.conditionId ?? m.condition_id;
    return c ? String(c) : null;
}
function startMsFromUpDownSlug(slug) {
    if (!slug)
        return null;
    const m = /^btc-updown-5m-(\d+)$/.exec(slug.trim());
    if (!m)
        return null;
    const startSec = Number(m[1]);
    if (!Number.isFinite(startSec) || startSec <= 0)
        return null;
    return startSec * 1000;
}
function parseRangeArgToMs(input) {
    // Accept ISO strings or a compact form: YYYY-M-D-HH-mm-ss (also works with zero-padded parts).
    // Example: 2025-4-5-00-00-00
    const iso = Date.parse(input);
    if (Number.isFinite(iso))
        return iso;
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})-(\d{1,2})-(\d{1,2})-(\d{1,2})$/.exec(input.trim());
    if (!m)
        throw new Error(`Invalid datetime '${input}'. Use ISO (e.g. 2025-04-05T00:00:00Z) or YYYY-M-D-HH-mm-ss.`);
    const [_, yy, mo, dd, hh, mi, ss] = m;
    const y = Number(yy);
    const month0 = Number(mo) - 1;
    const d = Number(dd);
    const h = Number(hh);
    const minute = Number(mi);
    const sec = Number(ss);
    // Interpret the compact form as *local time* (what users typically mean when typing without a timezone).
    const ms = new Date(y, month0, d, h, minute, sec, 0).getTime();
    if (!Number.isFinite(ms))
        throw new Error(`Invalid datetime '${input}'.`);
    return ms;
}
const Bots = {
    "btc-momentum-v1": btcMomentumBot,
    "example-situation-v1": exampleSituationBot,
    "ladder-053-v1": ladder053Bot,
};
async function main() {
    const config = loadConfig();
    const days = argNum("days", 3);
    const fromArg = arg("from");
    const toArg = arg("to");
    const botName = arg("bot") ?? "btc-momentum-v1";
    const initialCash = arg("initialCash") ? Number(arg("initialCash")) : 1000;
    const feeRate = arg("feeRate") ? Number(arg("feeRate")) : 0;
    const slippageBps = arg("slippageBps") ? Number(arg("slippageBps")) : 0;
    const maxCampaigns = argNum("maxCampaigns", 1200); // 3 days * 288 = 864
    const bot = Bots[botName];
    if (!bot)
        throw new Error(`Unknown bot '${botName}'. Available: ${Object.keys(Bots).join(", ")}`);
    const gamma = new GammaClient(config.GAMMA_BASE_URL);
    const dataApi = new DataApiClient(config.DATA_API_BASE_URL);
    const clob = new ClobClientPublic(config.CLOB_BASE_URL);
    const btc = new BtcPriceClient();
    const now = Date.now();
    const toMs = toArg ? parseRangeArgToMs(toArg) : now;
    const fromMs = fromArg ? parseRangeArgToMs(fromArg) : toMs - days * 24 * 60 * 60 * 1000;
    if (toMs <= fromMs)
        throw new Error(`Invalid range: to (${toMs}) must be > from (${fromMs}).`);
    // 1) Discover markets, then filter locally.
    const discovered = [];
    const pageSize = 200;
    // Page recent markets and filter locally by slug/start time.
    // This works for both --days and --from/--to, and avoids Gamma date-filter instability.
    for (let offset = 0; offset < 20_000; offset += pageSize) {
        let res = [];
        try {
            res = await gamma.listMarkets({
                limit: pageSize,
                offset,
                enableOrderBook: true,
                closed: true,
                order: "startDate",
                ascending: false,
            });
        }
        catch (e) {
            // Gamma occasionally returns 500s at higher offsets; treat this as end-of-pagination.
            // eslint-disable-next-line no-console
            console.warn(`Gamma paging stopped at offset=${offset}: ${String(e?.message ?? e)}`);
            break;
        }
        let pageHasAnyInRange = false;
        for (const m of res ?? []) {
            const startMs = startMsFromUpDownSlug(m.slug) ??
                parseMsMaybe(m.startDate) ??
                parseMsMaybe(m.start_date);
            if (startMs === null)
                continue;
            if (startMs >= fromMs && startMs < toMs)
                pageHasAnyInRange = true;
            if (startMs < fromMs || startMs >= toMs)
                continue;
            if (!isLikely5mUpDownMarket(m, config.MARKET_TYPE_HINT))
                continue;
            const q = config.MARKET_SEARCH_QUERY.toLowerCase();
            const hay = `${m.slug ?? ""} ${(m.question ?? m.title ?? "")}`.toLowerCase();
            if (q && !hay.includes(q))
                continue;
            const conditionId = getConditionId(m);
            if (!conditionId)
                continue;
            const tok = extractUpDownTokenIds(m);
            discovered.push({
                conditionId,
                slug: m.slug,
                startMs,
                ...(tok ? { upTokenId: tok.upTokenId, downTokenId: tok.downTokenId } : {}),
            });
        }
        if ((res?.length ?? 0) < pageSize)
            break;
        if (discovered.length >= maxCampaigns)
            break;
        if (!pageHasAnyInRange && res?.length) {
            const oldest = res
                .map((m) => startMsFromUpDownSlug(m.slug) ?? parseMsMaybe(m.startDate) ?? parseMsMaybe(m.start_date) ?? Infinity)
                .reduce((a, b) => Math.min(a, b), Infinity);
            if (oldest !== Infinity && oldest < fromMs)
                break;
        }
    }
    // De-dupe by (conditionId,startMs)
    const uniqKey = new Set();
    const campaigns = discovered
        .sort((a, b) => a.startMs - b.startMs)
        .filter((c) => {
        const k = `${c.conditionId}:${c.startMs}`;
        if (uniqKey.has(k))
            return false;
        uniqKey.add(k);
        return true;
    })
        .slice(0, maxCampaigns);
    if (!campaigns.length) {
        const hint = fromArg || toArg ? `range ${new Date(fromMs).toISOString()} → ${new Date(toMs).toISOString()}` : `last ${days} day(s)`;
        throw new Error(`No campaigns found for ${hint}. Try changing MARKET_SEARCH_QUERY / MARKET_TYPE_HINT or increase maxCampaigns.`);
    }
    // Fetch BTC once for whole window to avoid rate limits.
    let btcAll = [];
    try {
        btcAll = await btc.getBtcUsdRange({ fromSec: Math.floor(fromMs / 1000) - 120, toSec: Math.floor(toMs / 1000) + 120 });
        btcAll.sort((a, b) => a[0] - b[0]);
    }
    catch (e) {
        // BTC is a contextual feature; backtest can proceed without it.
        // eslint-disable-next-line no-console
        console.warn(`BTC range fetch failed; continuing with btc_usd=null. ${String(e?.message ?? e)}`);
        btcAll = [];
    }
    // 2) Download each campaign into CSV + run backtest.
    const summaries = [];
    for (let i = 0; i < campaigns.length; i++) {
        const c = campaigns[i];
        // eslint-disable-next-line no-console
        console.log(`[${i + 1}/${campaigns.length}] campaign start=${new Date(c.startMs).toISOString()} conditionId=${c.conditionId}`);
        const windowStart = c.startMs;
        const windowEnd = c.startMs + 300_000;
        const trades = await dataApi.getAllTradesForMarket(c.conditionId, { pages: 10, pageSize: 500 });
        const btcRange = btcAll.filter(([t]) => t >= windowStart - 60_000 && t <= windowEnd + 60_000);
        const sources = { trades, btcRange };
        if (c.upTokenId && c.downTokenId) {
            sources.upTokenId = c.upTokenId;
            sources.downTokenId = c.downTokenId;
            const startSec = Math.floor(windowStart / 1000) - 120;
            const endSec = Math.ceil(windowEnd / 1000) + 120;
            const [rawUp, rawDown] = await Promise.all([
                clob.getPricesHistory({ market: c.upTokenId, startTs: startSec, endTs: endSec, fidelity: 1 }).catch(() => []),
                clob.getPricesHistory({ market: c.downTokenId, startTs: startSec, endTs: endSec, fidelity: 1 }).catch(() => []),
            ]);
            sources.clobUpHistory = clobHistoryToMsPairs(rawUp);
            sources.clobDownHistory = clobHistoryToMsPairs(rawDown);
        }
        const built = buildCampaignRowsFromSources({ conditionId: c.conditionId, startMs: c.startMs, durationSec: 300 }, sources);
        const meta = makeCampaignMeta({
            conditionId: c.conditionId,
            startMs: c.startMs,
            endMs: built.endMs,
            rowCount: built.rows.length,
            slug: c.slug,
        });
        await writeCampaign(config.DATA_DIR, meta, built.rows);
        const result = simulate(built.rows, bot, { initialCash, feeRate, slippageBps });
        summaries.push({
            conditionId: c.conditionId,
            slug: c.slug,
            startMs: meta.startMs,
            endMs: meta.endMs,
            trades: result.totals.trades,
            fees: result.totals.fees,
            equity: result.final.equity,
            pnl: result.final.pnl,
        });
    }
    // 3) Write combined output files.
    const outDir = path.join(config.DATA_DIR, "backtests");
    await ensureDir(outDir);
    const stamp = new Date().toISOString().replaceAll(":", "-");
    const outJson = path.join(outDir, `last-${days}d-${botName}-${stamp}.json`);
    const outCsv = path.join(outDir, `last-${days}d-${botName}-${stamp}.csv`);
    await fs.writeFile(outJson, JSON.stringify({
        generatedAtMs: Date.now(),
        days,
        bot: botName,
        params: { initialCash, feeRate, slippageBps },
        campaigns: summaries.length,
        totals: {
            pnl: summaries.reduce((s, r) => s + r.pnl, 0),
            avgPnl: summaries.reduce((s, r) => s + r.pnl, 0) / Math.max(1, summaries.length),
            trades: summaries.reduce((s, r) => s + r.trades, 0),
        },
        summaries,
    }, null, 2), "utf-8");
    const csv = stringify(summaries.map((r) => [r.conditionId, r.slug ?? "", r.startMs, r.endMs, r.trades, r.fees, r.equity, r.pnl]), { header: true, columns: ["conditionId", "slug", "startMs", "endMs", "trades", "fees", "equity", "pnl"] });
    await fs.writeFile(outCsv, csv, "utf-8");
    const totalPnl = summaries.reduce((s, r) => s + r.pnl, 0);
    // eslint-disable-next-line no-console
    console.log(`\nDone. Campaigns=${summaries.length} totalPnL=${totalPnl.toFixed(6)}`);
    // eslint-disable-next-line no-console
    console.log(`JSON: ${outJson}`);
    // eslint-disable-next-line no-console
    console.log(`CSV:  ${outCsv}`);
}
main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=backtestLastDays.js.map