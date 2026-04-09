import WebSocket from "ws";

export type TopOfBook = { bid: number | null; ask: number | null };

function fin(x: number | null | undefined): number | null {
  if (x === null || x === undefined) return null;
  return Number.isFinite(x) ? x : null;
}

/**
 * Polymarket CLOB public market WebSocket: subscribe with `{ assets_ids, type: "market" }`,
 * then consume `book`, `best_bid_ask`, and `price_change` payloads.
 */
export function connectClobMarketWs(
  url: string,
  assetIds: string[],
  onUpdate?: (assetId: string, top: TopOfBook) => void,
): {
  close: () => void;
  ready: Promise<void>;
  getTop: (assetId: string) => TopOfBook;
} {
  const tops = new Map<string, TopOfBook>();
  const ws = new WebSocket(url);

  let resolveReady!: () => void;
  const ready = new Promise<void>((r) => {
    resolveReady = r;
  });
  let opened = false;

  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({}));
  }, 25_000);

  const bump = (assetId: string, top: TopOfBook) => {
    tops.set(assetId, top);
    onUpdate?.(assetId, top);
  };

  ws.on("open", () => {
    ws.send(JSON.stringify({ assets_ids: assetIds, type: "market" }));
    if (!opened) {
      opened = true;
      resolveReady();
    }
  });

  ws.on("message", (data) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data.toString()) as Record<string, unknown>;
    } catch {
      return;
    }
    const eventType = msg.event_type;
    if (eventType === "book" && typeof msg.asset_id === "string") {
      const bids = msg.bids as { price?: string }[] | undefined;
      const asks = msg.asks as { price?: string }[] | undefined;
      const bid = bids?.[0]?.price != null ? Number(bids[0].price) : null;
      const ask = asks?.[0]?.price != null ? Number(asks[0].price) : null;
      bump(msg.asset_id, { bid: fin(bid), ask: fin(ask) });
      return;
    }
    if (eventType === "best_bid_ask" && typeof msg.asset_id === "string") {
      const bid = msg.best_bid != null ? Number(msg.best_bid) : null;
      const ask = msg.best_ask != null ? Number(msg.best_ask) : null;
      bump(msg.asset_id, { bid: fin(bid), ask: fin(ask) });
      return;
    }
    if (eventType === "price_change" && Array.isArray(msg.price_changes)) {
      for (const ch of msg.price_changes as Record<string, unknown>[]) {
        const aid = ch?.asset_id;
        if (typeof aid !== "string") continue;
        const bid = ch.best_bid != null ? Number(ch.best_bid) : null;
        const ask = ch.best_ask != null ? Number(ch.best_ask) : null;
        if (bid === null && ask === null) continue;
        bump(aid, { bid: fin(bid), ask: fin(ask) });
      }
    }
  });

  ws.on("error", () => {
    if (!opened) {
      opened = true;
      resolveReady();
    }
  });

  return {
    close: () => {
      clearInterval(ping);
      ws.close();
    },
    ready,
    getTop: (id) => tops.get(id) ?? { bid: null, ask: null },
  };
}
