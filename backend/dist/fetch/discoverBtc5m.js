import { extractUpDownTokenIds } from "../polymarket/gamma.js";
function parseMsMaybe(x) {
    if (typeof x !== "string")
        return null;
    const ms = Date.parse(x);
    return Number.isFinite(ms) ? ms : null;
}
export function getConditionId(m) {
    const c = m.conditionId ?? m.condition_id;
    return c ? String(c) : null;
}
export function isLikely5mUpDownMarket(m, hint) {
    const slug = String(m.slug ?? "").toLowerCase().trim();
    if (hint.toLowerCase() === "5m")
        return /^btc-updown-5m-\d+$/.test(slug);
    if (hint.toLowerCase() === "15m")
        return /^btc-updown-15m-\d+$/.test(slug);
    return slug.includes("btc-updown") && slug.includes(`-${hint.toLowerCase()}-`);
}
export function startMsFromUpDownSlug(slug) {
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
/**
 * Discover BTC 5m up/down campaigns in [now-days, now] using Gamma /markets.
 *
 * Notes:
 * - Do not require `closed: true` — many recent rows are still "open" in Gamma while the 5m window already passed.
 * - Widen the Gamma date query vs the strict window so API timezone/indexing mismatches still return rows; we filter by slug startMs locally.
 */
export async function discoverBtc5mCampaigns(opts) {
    const { gamma, days, maxCampaigns, marketSearchQuery, marketTypeHint } = opts;
    const now = Date.now();
    const fromMs = now - days * 24 * 60 * 60 * 1000;
    // Gamma often lists 5m up/down markets whose slug start time is slightly in the future.
    // To avoid “no campaigns” for small windows, include a small forward buffer.
    const toMs = now + 24 * 60 * 60 * 1000;
    const pageSize = 200;
    const discovered = [];
    const seen = new Set();
    const pushFromMarkets = (res) => {
        for (const m of res ?? []) {
            const startMs = startMsFromUpDownSlug(m.slug) ?? parseMsMaybe(m.startDate) ?? parseMsMaybe(m.start_date);
            if (startMs === null)
                continue;
            if (startMs < fromMs || startMs > toMs)
                continue;
            if (!isLikely5mUpDownMarket(m, marketTypeHint))
                continue;
            const q = marketSearchQuery.toLowerCase();
            const hay = `${m.slug ?? ""} ${m.question ?? ""}`.toLowerCase();
            if (q && !hay.includes(q))
                continue;
            const conditionId = getConditionId(m);
            if (!conditionId)
                continue;
            const k = `${conditionId}:${startMs}`;
            if (seen.has(k))
                continue;
            seen.add(k);
            const tok = extractUpDownTokenIds(m);
            discovered.push({
                conditionId,
                slug: m.slug,
                startMs,
                ...(tok ? { upTokenId: tok.upTokenId, downTokenId: tok.downTokenId } : {}),
            });
        }
    };
    // Fast path for BTC 5m up/down: generate candidate slugs and query Gamma with repeated `slug=` batches.
    // This avoids scanning thousands of unrelated markets.
    if (marketTypeHint.toLowerCase() === "5m" && marketSearchQuery.toLowerCase().includes("btc")) {
        const stepSec = 300;
        const fromSec = Math.floor(fromMs / 1000 / stepSec) * stepSec;
        const toSec = Math.ceil(toMs / 1000 / stepSec) * stepSec;
        const slugs = [];
        for (let s = fromSec; s <= toSec; s += stepSec)
            slugs.push(`btc-updown-5m-${s}`);
        const batch = 50;
        for (let i = 0; i < slugs.length; i += batch) {
            const chunk = slugs.slice(i, i + batch);
            // eslint-disable-next-line no-console
            if (i === 0)
                console.log(`[discover] BTC slug-batch query slugs=${slugs.length} batchSize=${batch}`);
            const res = await gamma.listMarkets({ limit: chunk.length, offset: 0, slugs: chunk });
            pushFromMarkets(res);
            if (discovered.length >= maxCampaigns)
                break;
        }
        if (discovered.length) {
            return discovered
                .sort((a, b) => a.startMs - b.startMs)
                .filter((c, i, arr) => arr.findIndex((x) => x.conditionId === c.conditionId && x.startMs === c.startMs) === i)
                .slice(0, maxCampaigns);
        }
    }
    // Primary scan: order by updatedAt (most reliable for “recent activity”),
    // filter by slug-derived startMs locally.
    for (let offset = 0; offset < 20_000; offset += pageSize) {
        if (offset % (pageSize * 5) === 0) {
            // eslint-disable-next-line no-console
            console.log(`[discover] scanning updatedAt offset=${offset} found=${discovered.length}`);
        }
        const res = await gamma.listMarkets({
            limit: pageSize,
            offset,
            enableOrderBook: true,
            // Important: omit `closed` — requiring closed:true often returns 0 rows for "last 1 day" on Gamma.
            order: "updatedAt",
            ascending: false,
        });
        pushFromMarkets(res);
        if (discovered.length >= maxCampaigns)
            break;
        if ((res?.length ?? 0) < pageSize)
            break;
    }
    // Fallback: scan by startDate ordering too (some markets update weirdly).
    if (!discovered.length) {
        for (let offset = 0; offset < 20_000; offset += pageSize) {
            if (offset % (pageSize * 5) === 0) {
                // eslint-disable-next-line no-console
                console.log(`[discover] scanning startDate offset=${offset} found=${discovered.length}`);
            }
            const res = await gamma.listMarkets({
                limit: pageSize,
                offset,
                enableOrderBook: true,
                order: "startDate",
                ascending: false,
            });
            pushFromMarkets(res);
            if (discovered.length >= maxCampaigns)
                break;
            if ((res?.length ?? 0) < pageSize)
                break;
        }
    }
    return discovered
        .sort((a, b) => a.startMs - b.startMs)
        .filter((c, i, arr) => arr.findIndex((x) => x.conditionId === c.conditionId && x.startMs === c.startMs) === i)
        .slice(0, maxCampaigns);
}
//# sourceMappingURL=discoverBtc5m.js.map