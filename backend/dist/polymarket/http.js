export async function fetchJson(url, init) {
    const maxAttempts = 4;
    const baseDelayMs = 400;
    const timeoutMs = 20_000;
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const ac = new AbortController();
        const to = setTimeout(() => ac.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                ...init,
                signal: ac.signal,
                headers: {
                    accept: "application/json",
                    ...(init?.headers ?? {}),
                },
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                const retryable = res.status === 429 || (res.status >= 500 && res.status <= 599);
                if (retryable && attempt < maxAttempts) {
                    const wait = baseDelayMs * Math.pow(2, attempt - 1);
                    await new Promise((r) => setTimeout(r, wait));
                    continue;
                }
                throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}${text ? `\n${text}` : ""}`);
            }
            return (await res.json());
        }
        catch (e) {
            lastErr = e;
            const msg = String(e?.message ?? e);
            const retryable = msg.includes("fetch failed") ||
                msg.includes("network") ||
                msg.includes("ECONNRESET") ||
                msg.includes("ETIMEDOUT") ||
                msg.includes("aborted") ||
                msg.includes("AbortError");
            if (retryable && attempt < maxAttempts) {
                const wait = baseDelayMs * Math.pow(2, attempt - 1);
                await new Promise((r) => setTimeout(r, wait));
                continue;
            }
            throw e;
        }
        finally {
            clearTimeout(to);
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`fetchJson failed for ${url}`);
}
export function withQuery(baseUrl, path, query) {
    const url = new URL(path, baseUrl);
    if (query) {
        for (const [k, v] of Object.entries(query)) {
            if (v === undefined)
                continue;
            if (Array.isArray(v)) {
                url.searchParams.delete(k);
                for (const item of v)
                    url.searchParams.append(k, String(item));
            }
            else {
                url.searchParams.set(k, String(v));
            }
        }
    }
    return url.toString();
}
//# sourceMappingURL=http.js.map