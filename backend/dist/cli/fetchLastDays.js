import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { GammaClient, extractUpDownTokenIds } from "../polymarket/gamma.js";
import { DataApiClient } from "../polymarket/dataApi.js";
import { ClobClientPublic, clobHistoryToMsPairs } from "../polymarket/clob.js";
import { BtcPriceClient } from "../prices/btc.js";
import { buildCampaignRowsFromSources, makeCampaignMeta } from "../sim/buildCampaign.js";
import { ensureDir, writeCampaign } from "../storage/campaignCsv.js";
import { writeCampaignSources } from "../fetch/campaignStore.js";
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
function getConditionId(m) {
    const c = m.conditionId ?? m.condition_id;
    return c ? String(c) : null;
}
function isLikely5mUpDownMarket(m, hint) {
    const slug = String(m.slug ?? "").toLowerCase().trim();
    // For this project we only treat *campaign markets* as valid if the slug encodes the window start.
    // Avoid substring bugs like "15m" matching "5m".
    if (hint.toLowerCase() === "5m")
        return /^btc-updown-5m-\d+$/.test(slug);
    if (hint.toLowerCase() === "15m")
        return /^btc-updown-15m-\d+$/.test(slug);
    return slug.includes("btc-updown") && slug.includes(`-${hint.toLowerCase()}-`);
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
async function main() {
    const config = loadConfig();
    const days = argNum("days", 3);
    const fromArg = arg("from");
    const toArg = arg("to");
    const maxCampaigns = argNum("maxCampaigns", 1200);
    const gamma = new GammaClient(config.GAMMA_BASE_URL);
    const dataApi = new DataApiClient(config.DATA_API_BASE_URL);
    const clob = new ClobClientPublic(config.CLOB_BASE_URL);
    const btc = new BtcPriceClient();
    const now = Date.now();
    const toMs = toArg ? parseRangeArgToMs(toArg) : now;
    const fromMs = fromArg ? parseRangeArgToMs(fromArg) : toMs - days * 24 * 60 * 60 * 1000;
    if (toMs <= fromMs)
        throw new Error(`Invalid range: to (${toMs}) must be > from (${fromMs}).`);
    const pageSize = 200;
    const discovered = [];
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
        // Since we order by startDate descending, once an entire page is older than our range,
        // further pages will be even older and can be skipped.
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
            const hay = `${m.slug ?? ""} ${m.question ?? ""}`.toLowerCase();
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
            // If the page includes only markets outside the range, and we're already past the range, stop.
            const oldest = res
                .map((m) => startMsFromUpDownSlug(m.slug) ?? parseMsMaybe(m.startDate) ?? parseMsMaybe(m.start_date) ?? Infinity)
                .reduce((a, b) => Math.min(a, b), Infinity);
            if (oldest !== Infinity && oldest < fromMs)
                break;
        }
    }
    const uniq = new Set();
    const campaigns = discovered
        .sort((a, b) => a.startMs - b.startMs)
        .filter((c) => {
        const k = `${c.conditionId}:${c.startMs}`;
        if (uniq.has(k))
            return false;
        uniq.add(k);
        return true;
    })
        .slice(0, maxCampaigns);
    if (!campaigns.length) {
        const hint = fromArg || toArg ? `range ${new Date(fromMs).toISOString()} → ${new Date(toMs).toISOString()}` : `last ${days} day(s)`;
        throw new Error(`No campaigns found for ${hint}.`);
    }
    // Fetch BTC range once for entire window to avoid rate limits.
    let btcAll = [];
    try {
        btcAll = await btc.getBtcUsdRange({ fromSec: Math.floor(fromMs / 1000) - 120, toSec: Math.floor(toMs / 1000) + 120 });
        btcAll.sort((a, b) => a[0] - b[0]);
    }
    catch (e) {
        // BTC is a contextual feature; campaign fetch/backtest can proceed without it.
        // eslint-disable-next-line no-console
        console.warn(`BTC range fetch failed; continuing with btc_usd=null. ${String(e?.message ?? e)}`);
        btcAll = [];
    }
    // Persist discovery list for traceability
    const discoveryDir = path.join(config.DATA_DIR, "discovery");
    await ensureDir(discoveryDir);
    await fs.writeFile(path.join(discoveryDir, `last-${days}d.json`), JSON.stringify({ generatedAtMs: Date.now(), days, fromMs, toMs, from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), campaigns }, null, 2), "utf-8");
    for (let i = 0; i < campaigns.length; i++) {
        const c = campaigns[i];
        // eslint-disable-next-line no-console
        console.log(`[${i + 1}/${campaigns.length}] fetch conditionId=${c.conditionId} start=${new Date(c.startMs).toISOString()}`);
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
        await writeCampaignSources(config.DATA_DIR, c.conditionId, c.startMs, sources);
        const built = buildCampaignRowsFromSources({ conditionId: c.conditionId, startMs: c.startMs, durationSec: 300 }, sources);
        const meta = makeCampaignMeta({
            conditionId: c.conditionId,
            startMs: c.startMs,
            endMs: built.endMs,
            rowCount: built.rows.length,
            slug: c.slug,
        });
        await writeCampaign(config.DATA_DIR, meta, built.rows);
    }
    // eslint-disable-next-line no-console
    console.log(`Done. Fetched ${campaigns.length} campaigns into ${config.DATA_DIR}/`);
}
main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=fetchLastDays.js.map