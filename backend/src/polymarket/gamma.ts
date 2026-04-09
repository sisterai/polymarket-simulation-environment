import { fetchJson, withQuery } from "./http.js";

export type GammaMarket = {
  id: string | number;
  slug: string;
  question?: string;
  enableOrderBook?: boolean;
  closed?: boolean;
  active?: boolean;
  archived?: boolean;
  conditionId?: string;
  outcomes?: string; // JSON string on some responses
  outcomePrices?: string; // JSON string on some responses
  clobTokenIds?: string; // JSON string (array) on some responses
  startDate?: string;
  endDate?: string;
  // ... gamma has more fields; we keep it loose on purpose
  [k: string]: unknown;
};

export class GammaClient {
  constructor(private readonly baseUrl: string) {}

  async listMarkets(params: {
    limit?: number;
    offset?: number;
    order?: string;
    ascending?: boolean;
    start_date_min?: string;
    start_date_max?: string;
    end_date_min?: string;
    end_date_max?: string;
    enableOrderBook?: boolean;
    closed?: boolean;
    condition_ids?: string[];
  }): Promise<GammaMarket[]> {
    const url = withQuery(this.baseUrl, "/markets", {
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
      order: params.order,
      ascending: params.ascending,
      start_date_min: params.start_date_min,
      start_date_max: params.start_date_max,
      end_date_min: params.end_date_min,
      end_date_max: params.end_date_max,
      enableOrderBook: params.enableOrderBook,
      closed: params.closed,
      ...(params.condition_ids?.length ? { "condition_ids[]": params.condition_ids } : {}),
    });
    return await fetchJson<GammaMarket[]>(url);
  }

  async getMarketByConditionId(conditionId: string): Promise<GammaMarket> {
    const res = await this.listMarkets({ limit: 1, offset: 0, condition_ids: [conditionId] });
    const m = res?.[0];
    if (!m) throw new Error(`Gamma market not found for conditionId=${conditionId}`);
    return m;
  }

  async getMarketBySlug(slug: string): Promise<GammaMarket> {
    // Gamma expects `slug` as an array query param: slug[]=...
    const url = withQuery(this.baseUrl, `/markets`, { "slug[]": slug, limit: 1, offset: 0 });
    const res = await fetchJson<GammaMarket[]>(url);
    const m = res?.[0];
    if (!m) throw new Error(`Gamma market not found for slug=${slug}`);
    return m;
  }

  /** Batch lookup by slugs: /markets?slug[]=a&slug[]=b... */
  async listMarketsBySlugs(slugs: string[], params?: { limit?: number; offset?: number }): Promise<GammaMarket[]> {
    const url = withQuery(this.baseUrl, `/markets`, { "slug[]": slugs, limit: params?.limit ?? slugs.length, offset: params?.offset ?? 0 });
    return await fetchJson<GammaMarket[]>(url);
  }
}

export function parseJsonField<T>(value: unknown): T | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

/** Maps Gamma `clobTokenIds` + `outcomes` to UP/DOWN outcome token ids (CLOB `asset_id`). */
export function extractUpDownTokenIds(m: GammaMarket): { upTokenId: string; downTokenId: string } | null {
  const tokenIds =
    parseJsonField<unknown[]>(m.clobTokenIds) ?? parseJsonField<unknown[]>((m as { clob_token_ids?: string }).clob_token_ids);
  const outcomes =
    parseJsonField<unknown[]>(m.outcomes) ?? parseJsonField<unknown[]>((m as { outcome?: string }).outcome);
  if (!Array.isArray(tokenIds) || tokenIds.length < 2) return null;
  let upTokenId = String(tokenIds[0]);
  let downTokenId = String(tokenIds[1]);
  if (Array.isArray(outcomes) && outcomes.length >= 2) {
    for (let i = 0; i < outcomes.length; i++) {
      const label = String(outcomes[i]).trim().toLowerCase();
      const tid = i < tokenIds.length ? String(tokenIds[i]) : "";
      if (label === "up") upTokenId = tid;
      if (label === "down") downTokenId = tid;
    }
  }
  if (!upTokenId || !downTokenId) return null;
  return { upTokenId, downTokenId };
}

