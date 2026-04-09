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

let chartUpDown;
let campaignsCache = [];

function floorTo5m(ms) {
  const step = 300000;
  return Math.floor(ms / step) * step;
}

function campaignKey(c) {
  return `${c.conditionId}::${c.startMs}`;
}

function renderCampaignSelect(campaigns, filterText = "") {
  const sel = $("btCampaignSelect");
  const needle = (filterText ?? "").trim().toLowerCase();
  const filtered = needle
    ? campaigns.filter((c) => String(c.conditionId).toLowerCase().includes(needle))
    : campaigns;

  sel.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = filtered.length ? "Select a saved campaign…" : "No campaigns found";
  sel.appendChild(placeholder);

  for (const c of filtered.slice().reverse().slice(0, 500)) {
    const opt = document.createElement("option");
    opt.value = campaignKey(c);
    opt.textContent = `${fmtTs(c.startMs)} • ${c.conditionId.slice(0, 10)}… • rows=${c.rowCount}`;
    sel.appendChild(opt);
  }

  $("btCampaignCount").textContent = `${filtered.length} campaign(s)`;
}

function selectCampaign(c) {
  $("btConditionId").value = c.conditionId;
  $("btStartMs").value = String(c.startMs);
}

function openCampaignPage(c) {
  const url = `/campaign.html?conditionId=${encodeURIComponent(c.conditionId)}&startMs=${encodeURIComponent(String(c.startMs))}`;
  location.href = url;
}

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

  // Add fills as scatter points on top
  if (fills.length) {
    const buyUp = fills.filter((f) => f.outcome === "UP" && f.side === "BUY").map((f) => ({ x: labels[rows.findIndex((r) => r.t === f.t)], y: f.price }));
    const sellUp = fills.filter((f) => f.outcome === "UP" && f.side === "SELL").map((f) => ({ x: labels[rows.findIndex((r) => r.t === f.t)], y: f.price }));
    const buyDown = fills.filter((f) => f.outcome === "DOWN" && f.side === "BUY").map((f) => ({ x: labels[rows.findIndex((r) => r.t === f.t)], y: f.price }));
    const sellDown = fills.filter((f) => f.outcome === "DOWN" && f.side === "SELL").map((f) => ({ x: labels[rows.findIndex((r) => r.t === f.t)], y: f.price }));

    chartUpDown.data.datasets.push(
      { type: "scatter", label: "BUY UP", data: buyUp, borderColor: "#7aa2ff", backgroundColor: "#7aa2ff", pointRadius: 3 },
      { type: "scatter", label: "SELL UP", data: sellUp, borderColor: "#b7c9ff", backgroundColor: "#b7c9ff", pointRadius: 3 },
      { type: "scatter", label: "BUY DOWN", data: buyDown, borderColor: "#ff7aa2", backgroundColor: "#ff7aa2", pointRadius: 3 },
      { type: "scatter", label: "SELL DOWN", data: sellDown, borderColor: "#ffc2d3", backgroundColor: "#ffc2d3", pointRadius: 3 },
    );
  }

  chartUpDown.update();
}

async function refreshCampaignList() {
  const conditionId = $("campaignConditionFilter").value.trim() || undefined;
  const campaigns = await api(`/campaigns${conditionId ? `?conditionId=${encodeURIComponent(conditionId)}` : ""}`);
  campaignsCache = campaigns;
  renderCampaignSelect(campaignsCache, $("btCampaignSearch")?.value ?? "");
  const list = $("campaignList");
  list.innerHTML = "";
  for (const c of campaigns.slice().reverse().slice(0, 50)) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <div class="main">${c.conditionId}</div>
        <div class="meta">${fmtTs(c.startMs)} → ${fmtTs(c.endMs)} • rows=${c.rowCount}</div>
      </div>
      <div class="row">
        <button data-load="1" class="primary">Open</button>
        <button data-use="1">Details</button>
      </div>
    `;
    el.querySelector("[data-load]").onclick = async () => {
      openCampaignPage(c);
    };
    el.querySelector("[data-use]").onclick = () => {
      openCampaignPage(c);
    };
    list.appendChild(el);
  }

  // Default selection: most recent saved campaign
  if (campaignsCache.length && (!$("btConditionId").value.trim() || !$("btStartMs").value.trim())) {
    const mostRecent = campaignsCache.slice().sort((a, b) => b.startMs - a.startMs)[0];
    if (mostRecent) selectCampaign(mostRecent);
  }
}

$("refresh").onclick = () => refreshCampaignList().catch((e) => alert(e.message));
$("loadCampaigns").onclick = () => refreshCampaignList().catch((e) => alert(e.message));

$("discover").onclick = async () => {
  try {
    const markets = await api("/discover");
    $("markets").textContent = JSON.stringify(markets.slice(0, 20), null, 2);
    if (markets[0]) {
      $("dlConditionId").value = markets[0].conditionId;
    }
  } catch (e) {
    alert(e.message);
  }
};

$("download").onclick = async () => {
  try {
    const conditionId = $("dlConditionId").value.trim();
    const startMs = Number($("dlStartMs").value.trim());
    if (!conditionId || !Number.isFinite(startMs)) throw new Error("Provide conditionId and startMs (ms)");
    $("downloadStatus").textContent = "Downloading...";
    const out = await api("/download", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conditionId, startMs, durationSec: 300 }),
    });
    $("downloadStatus").textContent = JSON.stringify(out, null, 2);
    await refreshCampaignList();
  } catch (e) {
    alert(e.message);
  }
};

async function refreshBots() {
  const bots = await api("/bots");
  const sel = $("btBot");
  sel.innerHTML = "";
  const list = Array.isArray(bots) && bots.length ? bots : ["btc-momentum-v1"];
  for (const b of list) {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    sel.appendChild(opt);
  }
}

function numInput(el, def) {
  const n = Number(String(el?.value ?? "").trim());
  return Number.isFinite(n) ? n : def;
}

$("backtest").onclick = async () => {
  try {
    const conditionId = $("btConditionId").value.trim();
    const startMs = Number(String($("btStartMs").value ?? "").trim());
    const bot = $("btBot").value || "btc-momentum-v1";
    const initialCash = numInput($("btCash"), 1000);
    const feeRate = numInput($("btFee"), 0);
    const slippageBps = numInput($("btSlip"), 0);
    if (!conditionId || !Number.isFinite(startMs)) throw new Error("Pick a saved campaign (conditionId + startMs)");
    const out = await api("/backtest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conditionId, startMs, bot, params: { initialCash, feeRate, slippageBps } }),
    });
    const { result, meta } = out;
    $("btSummary").textContent =
      `Bot: ${result.bot}\n` +
      `Campaign: ${meta.conditionId} (${fmtTs(meta.startMs)})\n` +
      `Trades: ${result.totals.trades}  Fees: ${result.totals.fees.toFixed(4)}\n` +
      `Final equity: ${result.final.equity.toFixed(4)}  PnL: ${result.final.pnl.toFixed(4)}\n` +
      `Final pos: cash=${result.final.cash.toFixed(4)} up=${result.final.up} down=${result.final.down}\n`;

    const camp = await api(`/campaigns/${encodeURIComponent(conditionId)}/${startMs}`);
    renderCharts(camp.rows, result.fills);
  } catch (e) {
    alert(e.message);
  }
};

$("btCampaignSearch").oninput = () => {
  renderCampaignSelect(campaignsCache, $("btCampaignSearch").value);
};

$("btCampaignSelect").onchange = () => {
  const key = $("btCampaignSelect").value;
  if (!key) return;
  const c = campaignsCache.find((x) => campaignKey(x) === key);
  if (c) selectCampaign(c);
};

const openDetails = $("openCampaignDetails");
if (openDetails) {
  openDetails.onclick = (e) => {
    e.preventDefault();
    const conditionId = $("btConditionId").value.trim();
    const startMs = Number(String($("btStartMs").value ?? "").trim());
    if (!conditionId || !Number.isFinite(startMs)) {
      alert("Select a campaign or enter conditionId + startMs first.");
      return;
    }
    location.href = `/campaign.html?conditionId=${encodeURIComponent(conditionId)}&startMs=${encodeURIComponent(String(startMs))}`;
  };
}

function applyDefaultInputs() {
  // Download defaults: 5m-aligned startMs (previous 5m bucket)
  if ($("dlStartMs") && !$("dlStartMs").value.trim()) {
    $("dlStartMs").value = String(floorTo5m(Date.now()) - 300000);
  }
  // Backtest defaults already set in HTML, but ensure sane numbers if cleared
  if ($("btCash") && !$("btCash").value.trim()) $("btCash").value = "1000";
  if ($("btFee") && !$("btFee").value.trim()) $("btFee").value = "0";
  if ($("btSlip") && !$("btSlip").value.trim()) $("btSlip").value = "0";
}

// initial load
applyDefaultInputs();
refreshBots()
  .then(() => refreshCampaignList())
  .catch(() => {});

