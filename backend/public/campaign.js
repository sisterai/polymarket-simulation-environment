const $ = (id) => document.getElementById(id);

async function api(path, init) {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    const t = await res.text();
    let msg = `API ${res.status}: ${t.slice(0, 500)}`;
    try {
      const j = JSON.parse(t);
      if (typeof j?.error === "string") msg = j.error;
    } catch {
      // not JSON
    }
    throw new Error(msg);
  }
  return await res.json();
}

function fmtTs(ms) {
  const d = new Date(ms);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function qs() {
  return new URLSearchParams(location.search);
}

function needParam(name) {
  const v = qs().get(name);
  if (!v) throw new Error(`Missing query param '${name}'`);
  return v;
}

let chartUpDown;

function ensureCharts() {
  if (!chartUpDown) {
    chartUpDown = new Chart($("chartUpDown"), {
      type: "line",
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        animation: false,
        plugins: { legend: { labels: { color: "#e9edff" } } },
        scales: {
          x: { ticks: { color: "#9fb0ffb0" } },
          y: { ticks: { color: "#9fb0ffb0" }, suggestedMin: 0, suggestedMax: 1 },
        },
      },
    });
  }
}

function renderCharts(rows, fills = []) {
  ensureCharts();
  const labels = rows.map((r) => new Date(r.t).toLocaleTimeString());
  const up = rows.map((r) => r.up_mid);
  const down = rows.map((r) => r.down_mid);

  chartUpDown.data.labels = labels;
  chartUpDown.data.datasets = [
    { label: "UP (mid)", data: up, borderColor: "#7aa2ff", backgroundColor: "transparent", spanGaps: true, pointRadius: 0 },
    { label: "DOWN (mid)", data: down, borderColor: "#ff7aa2", backgroundColor: "transparent", spanGaps: true, pointRadius: 0 },
  ];

  if (fills.length) {
    const idxByT = new Map(rows.map((r, i) => [r.t, i]));
    const toPoints = (pred) =>
      fills
        .filter(pred)
        .map((f) => {
          const i = idxByT.get(f.t);
          if (i === undefined) return null;
          return { x: labels[i], y: f.price };
        })
        .filter(Boolean);

    chartUpDown.data.datasets.push(
      { type: "scatter", label: "BUY UP", data: toPoints((f) => f.outcome === "UP" && f.side === "BUY"), borderColor: "#7aa2ff", backgroundColor: "#7aa2ff", pointRadius: 3 },
      { type: "scatter", label: "SELL UP", data: toPoints((f) => f.outcome === "UP" && f.side === "SELL"), borderColor: "#b7c9ff", backgroundColor: "#b7c9ff", pointRadius: 3 },
      { type: "scatter", label: "BUY DOWN", data: toPoints((f) => f.outcome === "DOWN" && f.side === "BUY"), borderColor: "#ff7aa2", backgroundColor: "#ff7aa2", pointRadius: 3 },
      { type: "scatter", label: "SELL DOWN", data: toPoints((f) => f.outcome === "DOWN" && f.side === "SELL"), borderColor: "#ffc2d3", backgroundColor: "#ffc2d3", pointRadius: 3 },
    );
  }

  chartUpDown.update();
}

function renderFillsTable(fills) {
  const tbody = $("fillsTable").querySelector("tbody");
  tbody.innerHTML = "";
  for (const f of fills) {
    const tr = document.createElement("tr");
    const post = f.post ?? {};
    tr.innerHTML = `
      <td>${fmtTs(f.t)}</td>
      <td>${f.side}</td>
      <td>${f.outcome}</td>
      <td>${f.shares}</td>
      <td>${Number(f.price).toFixed(4)}</td>
      <td>${Number(f.notional).toFixed(4)}</td>
      <td>${Number(f.fee).toFixed(4)}</td>
      <td>${post.cash != null ? Number(post.cash).toFixed(4) : ""}</td>
      <td>${post.up != null ? post.up : ""}</td>
      <td>${post.down != null ? post.down : ""}</td>
      <td>${post.mtmEquity != null ? Number(post.mtmEquity).toFixed(4) : ""}</td>
      <td>${post.mtmPnl != null ? Number(post.mtmPnl).toFixed(4) : ""}</td>
      <td>${post.markUp != null ? Number(post.markUp).toFixed(4) : ""}</td>
      <td>${post.markDown != null ? Number(post.markDown).toFixed(4) : ""}</td>
    `;
    tbody.appendChild(tr);
  }
}

function setFinalKpis(result) {
  $("kpiPnl").textContent = Number(result.final.pnl).toFixed(4);
  $("kpiEquity").textContent = Number(result.final.equity).toFixed(4);
  $("kpiCash").textContent = Number(result.final.cash).toFixed(4);
  $("kpiUp").textContent = String(result.final.up);
  $("kpiDown").textContent = String(result.final.down);
  $("kpiTrades").textContent = String(result.totals.trades);
  $("kpiFees").textContent = Number(result.totals.fees).toFixed(4);
  $("finalHint").textContent = `Bot: ${result.bot} • Window: ${fmtTs(result.startMs)} → ${fmtTs(result.endMs)}`;
}

async function refreshBots() {
  const bots = await api("/bots").catch(() => ["btc-momentum-v1"]);
  const sel = $("bot");
  sel.innerHTML = "";
  const list = Array.isArray(bots) && bots.length ? bots : ["btc-momentum-v1"];
  for (const b of list) {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    sel.appendChild(opt);
  }
}

async function loadCampaign() {
  const conditionId = needParam("conditionId");
  const startMs = Number(needParam("startMs"));
  if (!Number.isFinite(startMs)) throw new Error("startMs must be a number (ms)");

  const camp = await api(`/campaigns/${encodeURIComponent(conditionId)}/${startMs}`);
  $("campSubtitle").textContent = `${conditionId} • ${fmtTs(startMs)}`;
  $("campStatus").textContent = JSON.stringify(camp.meta, null, 2);
  renderCharts(camp.rows, []);
  renderFillsTable([]);
  $("summary").textContent = "";
  $("kpiPnl").textContent = "—";
  $("kpiEquity").textContent = "—";
  $("kpiCash").textContent = "—";
  $("kpiUp").textContent = "—";
  $("kpiDown").textContent = "—";
  $("kpiTrades").textContent = "—";
  $("kpiFees").textContent = "—";
  $("finalHint").textContent = "Run a backtest to populate this.";
  return { conditionId, startMs, camp };
}

function numInput(el, def) {
  const n = Number(String(el?.value ?? "").trim());
  return Number.isFinite(n) ? n : def;
}

async function runBacktest(conditionId, startMs) {
  const bot = $("bot").value || "btc-momentum-v1";
  const initialCash = numInput($("cash"), 1000);
  const feeRate = numInput($("fee"), 0);
  const slippageBps = numInput($("slip"), 0);

  const out = await api("/backtest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conditionId, startMs, bot, params: { initialCash, feeRate, slippageBps } }),
  });
  const { result, meta } = out;
  setFinalKpis(result);
  $("summary").textContent =
    `Bot: ${result.bot}\n` +
    `Campaign: ${meta.conditionId} (${fmtTs(meta.startMs)})\n` +
    `Trades: ${result.totals.trades}  Fees: ${result.totals.fees.toFixed(4)}\n` +
    `Final equity (USD): ${result.final.equity.toFixed(4)}  Total PnL (USD): ${result.final.pnl.toFixed(4)}\n` +
    `Final position: cash=${result.final.cash.toFixed(4)}  upShares=${result.final.up}  downShares=${result.final.down}\n`;

  // Reload rows (so charts always match saved campaign), then overlay fills
  const camp = await api(`/campaigns/${encodeURIComponent(conditionId)}/${startMs}`);
  renderCharts(camp.rows, result.fills);
  renderFillsTable(result.fills);
}

async function main() {
  await refreshBots();
  const state = await loadCampaign();
  $("reload").onclick = () => main().catch((e) => alert(e.message));
  $("run").onclick = () => runBacktest(state.conditionId, state.startMs).catch((e) => alert(e.message));
}

main().catch((e) => alert(e.message));

