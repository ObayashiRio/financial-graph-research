import "./styles.css";
import { endpointId, neighborhood, normalizeDataset, validateDataset } from "./data.js";

const SECTOR_COLORS = {
  自動車: "#67e8cf",
  電機: "#7aa7ff",
  素材: "#f0b66d",
  物流: "#d99cff",
  金融: "#ff7f8d",
  情報通信: "#78d8ff",
  エネルギー: "#c4dc72",
  小売: "#ff9fc9",
  未分類: "#aab6b3",
};

const state = {
  dataset: null,
  familyKey: null,
  view: "3d",
  minWeight: 0.2,
  maxEdges: 80,
  hop: 1,
  selectedNodeId: null,
  selectedEdgeId: null,
  focusId: null,
  graph: null,
};

let renderToken = 0;

const elements = {
  familySelect: document.getElementById("familySelect"),
  familyDefinition: document.getElementById("familyDefinition"),
  viewSwitch: document.getElementById("viewSwitch"),
  hopSelect: document.getElementById("hopSelect"),
  companySearch: document.getElementById("companySearch"),
  clearSearch: document.getElementById("clearSearch"),
  searchResults: document.getElementById("searchResults"),
  weightRange: document.getElementById("weightRange"),
  weightOutput: document.getElementById("weightOutput"),
  edgeRange: document.getElementById("edgeRange"),
  edgeOutput: document.getElementById("edgeOutput"),
  focusButton: document.getElementById("focusButton"),
  resetButton: document.getElementById("resetButton"),
  graphViewport: document.getElementById("graphViewport"),
  stageTitle: document.getElementById("stageTitle"),
  datasetName: document.getElementById("datasetName"),
  metrics: document.getElementById("metrics"),
  legend: document.getElementById("legend"),
  emptyState: document.getElementById("emptyState"),
  fitButton: document.getElementById("fitButton"),
  shareButton: document.getElementById("shareButton"),
  importButton: document.getElementById("importButton"),
  fileInput: document.getElementById("fileInput"),
  detailPlaceholder: document.getElementById("detailPlaceholder"),
  detailContent: document.getElementById("detailContent"),
  statusText: document.getElementById("statusText"),
};

function currentFamily() {
  return state.dataset.families.find((family) => family.key === state.familyKey) || state.dataset.families[0];
}

function nodeById(id) {
  return state.dataset.nodes.find((node) => node.id === id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function familyEdges() {
  return currentFamily().edges
    .filter((edge) => edge.weight >= state.minWeight)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, state.maxEdges);
}

function visibleGraphData() {
  let edges = familyEdges();
  if (state.focusId) {
    const visibleIds = neighborhood(edges, state.focusId, state.hop);
    edges = edges.filter((edge) => visibleIds.has(endpointId(edge.source)) && visibleIds.has(endpointId(edge.target)));
  }
  const nodeIds = new Set();
  edges.forEach((edge) => {
    nodeIds.add(endpointId(edge.source));
    nodeIds.add(endpointId(edge.target));
  });
  if (state.focusId) nodeIds.add(state.focusId);
  const nodes = state.dataset.nodes.filter((node) => nodeIds.has(node.id));
  return {
    nodes: nodes.map((node) => ({ ...node })),
    links: edges.map((edge) => ({ ...edge })),
  };
}

function degreeMap(data) {
  const degree = new Map(data.nodes.map((node) => [node.id, 0]));
  data.links.forEach((edge) => {
    const source = endpointId(edge.source);
    const target = endpointId(edge.target);
    degree.set(source, (degree.get(source) || 0) + 1);
    degree.set(target, (degree.get(target) || 0) + 1);
  });
  return degree;
}

function nodeColor(node) {
  if (node.id === state.selectedNodeId) return "#fff4b8";
  if (node.id === state.focusId) return "#ffffff";
  return SECTOR_COLORS[node.sector] || SECTOR_COLORS.未分類;
}

function edgeColor(edge) {
  if (edge.id === state.selectedEdgeId) return "#fff4b8";
  const source = endpointId(edge.source);
  const target = endpointId(edge.target);
  if (state.selectedNodeId && (source === state.selectedNodeId || target === state.selectedNodeId)) return "rgba(255,255,255,0.86)";
  return "rgba(133, 173, 166, 0.34)";
}

function nodeTooltip(node) {
  return `<strong>${escapeHtml(node.name)}</strong><br>${escapeHtml(node.code)} · ${escapeHtml(node.sector)}`;
}

function linkTooltip(link) {
  const source = nodeById(endpointId(link.source));
  const target = nodeById(endpointId(link.target));
  return `<strong>${escapeHtml(source?.name)} → ${escapeHtml(target?.name)}</strong><br>${escapeHtml(link.relationType)} · weight ${link.weight.toFixed(2)}`;
}

async function createGraph(data, token) {
  const family = currentFamily();
  const degree = degreeMap(data);
  let graphFactory;
  let SpriteText;
  if (state.view === "3d") {
    const [graphModule, spriteModule] = await Promise.all([import("3d-force-graph"), import("three-spritetext")]);
    graphFactory = graphModule.default;
    SpriteText = spriteModule.default;
  } else {
    graphFactory = (await import("force-graph")).default;
  }
  if (token !== renderToken) return;
  elements.graphViewport.replaceChildren();
  const rect = elements.graphViewport.getBoundingClientRect();

  if (state.view === "3d") {
    state.graph = graphFactory({ controlType: "orbit" })(elements.graphViewport)
      .width(Math.max(320, rect.width))
      .height(Math.max(360, rect.height))
      .backgroundColor("#07100f")
      .showNavInfo(false)
      .graphData(data)
      .nodeLabel(nodeTooltip)
      .nodeColor(nodeColor)
      .nodeVal((node) => 3.5 + Math.sqrt(degree.get(node.id) || 1) * 2.2)
      .nodeResolution(16)
      .nodeThreeObjectExtend(true)
      .nodeThreeObject((node) => {
        const label = new SpriteText(node.name.replace("DEMO", ""));
        label.color = node.id === state.selectedNodeId ? "#fff4b8" : "#dcebe7";
        label.textHeight = node.id === state.selectedNodeId ? 3.6 : 2.65;
        label.backgroundColor = "rgba(7,16,15,0.68)";
        label.padding = 1.4;
        label.borderRadius = 2;
        return label;
      })
      .linkLabel(linkTooltip)
      .linkColor(edgeColor)
      .linkWidth((edge) => (edge.id === state.selectedEdgeId ? 3.2 : 0.6 + edge.weight * 2.1))
      .linkOpacity(0.72)
      .linkDirectionalArrowLength(family.direction === "directed" ? 4 : 0)
      .linkDirectionalArrowRelPos(0.78)
      .linkDirectionalParticles((edge) => (family.direction === "directed" && edge.id === state.selectedEdgeId ? 3 : 0))
      .linkDirectionalParticleWidth(2.4)
      .onNodeClick((node) => selectNode(node.id))
      .onLinkClick((edge) => selectEdge(edge.id))
      .onNodeHover((node) => {
        document.body.style.cursor = node ? "pointer" : "default";
      })
      .onLinkHover((edge) => {
        document.body.style.cursor = edge ? "pointer" : "default";
      });
    state.graph.d3Force("charge")?.strength(-72);
    state.graph.d3Force("link")?.distance((edge) => 50 + (1 - edge.weight) * 70);
  } else {
    state.graph = graphFactory()(elements.graphViewport)
      .width(Math.max(320, rect.width))
      .height(Math.max(360, rect.height))
      .backgroundColor("#07100f")
      .graphData(data)
      .nodeLabel(nodeTooltip)
      .nodeRelSize(5.5)
      .nodeVal((node) => 1 + Math.sqrt(degree.get(node.id) || 1) * 0.9)
      .nodeColor(nodeColor)
      .linkLabel(linkTooltip)
      .linkColor(edgeColor)
      .linkWidth((edge) => (edge.id === state.selectedEdgeId ? 3 : 0.7 + edge.weight * 2))
      .linkDirectionalArrowLength(family.direction === "directed" ? 5 : 0)
      .linkDirectionalArrowRelPos(0.82)
      .nodeCanvasObjectMode(() => "after")
      .nodeCanvasObject((node, ctx, globalScale) => {
        const shouldLabel = data.nodes.length <= 32 || node.id === state.selectedNodeId || node.id === state.focusId;
        if (!shouldLabel) return;
        const label = node.name.replace("DEMO", "");
        const fontSize = Math.max(10 / globalScale, 3.2);
        ctx.font = `600 ${fontSize}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = node.id === state.selectedNodeId ? "#07100f" : "rgba(232,244,240,0.86)";
        ctx.fillText(label, node.x, node.y + 7 / globalScale);
      })
      .onNodeClick((node) => selectNode(node.id))
      .onLinkClick((edge) => selectEdge(edge.id))
      .onNodeHover((node) => {
        document.body.style.cursor = node ? "pointer" : "default";
      })
      .onLinkHover((edge) => {
        document.body.style.cursor = edge ? "pointer" : "default";
      });
    state.graph.d3Force("charge")?.strength(-130);
    state.graph.d3Force("link")?.distance((edge) => 65 + (1 - edge.weight) * 80);
  }

  if (data.nodes.length > 0) {
    window.setTimeout(() => fitGraph(550), 500);
  }
}

function fitGraph(duration = 450) {
  if (!state.graph) return;
  if (state.view === "3d") state.graph.zoomToFit(duration, 70);
  else state.graph.zoomToFit(duration, 64);
}

async function render() {
  const token = ++renderToken;
  const family = currentFamily();
  const data = visibleGraphData();
  elements.familyDefinition.textContent = family.description;
  elements.stageTitle.textContent = family.title;
  elements.datasetName.textContent = state.dataset.metadata.name.toUpperCase();
  elements.weightOutput.textContent = state.minWeight.toFixed(2);
  elements.edgeOutput.textContent = String(state.maxEdges);
  elements.emptyState.hidden = data.links.length > 0;
  elements.metrics.innerHTML = [
    ["企業", data.nodes.length],
    ["edge", data.links.length],
    ["方向", family.direction === "directed" ? "有向" : "無向"],
  ]
    .map(([label, value]) => `<div><strong>${escapeHtml(value)}</strong><span>${label}</span></div>`)
    .join("");
  renderLegend(data.nodes);
  await createGraph(data, token);
  if (token !== renderToken) return;
  updateUrl();
}

function renderLegend(nodes) {
  const sectors = [...new Set(nodes.map((node) => node.sector))];
  elements.legend.innerHTML = sectors
    .map((sector) => `<span><i style="--legend-color:${SECTOR_COLORS[sector] || SECTOR_COLORS.未分類}"></i>${escapeHtml(sector)}</span>`)
    .join("");
}

function selectNode(id) {
  state.selectedNodeId = id;
  state.selectedEdgeId = null;
  elements.focusButton.disabled = false;
  showNodeDetail(id);
  refreshGraphStyle();
  updateUrl();
}

function selectEdge(id) {
  const edge = currentFamily().edges.find((candidate) => candidate.id === id);
  if (!edge) return;
  state.selectedEdgeId = id;
  state.selectedNodeId = null;
  elements.focusButton.disabled = true;
  showEdgeDetail(edge);
  refreshGraphStyle();
  updateUrl();
}

function refreshGraphStyle() {
  if (!state.graph) return;
  state.graph.nodeColor(nodeColor).linkColor(edgeColor).linkWidth((edge) => (edge.id === state.selectedEdgeId ? 3.2 : 0.6 + edge.weight * 2.1));
}

function showNodeDetail(id) {
  const node = nodeById(id);
  const family = currentFamily();
  const connected = family.edges.filter((edge) => endpointId(edge.source) === id || endpointId(edge.target) === id);
  const incoming = connected.filter((edge) => endpointId(edge.target) === id).length;
  const outgoing = connected.filter((edge) => endpointId(edge.source) === id).length;
  const counterparties = new Set(
    connected.map((edge) => (endpointId(edge.source) === id ? endpointId(edge.target) : endpointId(edge.source))),
  ).size;
  const metricCells =
    family.direction === "directed"
      ? [
          [connected.length, "接続edge"],
          [incoming, "incoming"],
          [outgoing, "outgoing"],
        ]
      : [
          [connected.length, "接続edge"],
          [counterparties, "接続企業"],
          ["—", "方向なし"],
        ];
  elements.detailPlaceholder.hidden = true;
  elements.detailContent.hidden = false;
  elements.detailContent.innerHTML = `
    <div class="detail-kicker"><span style="--node-color:${nodeColor(node)}"></span>${escapeHtml(node.sector)}</div>
    <h2>${escapeHtml(node.name)}</h2>
    <p class="detail-code">${escapeHtml(node.code)}</p>
    <p class="detail-description">${escapeHtml(node.description || "企業説明は登録されていません．")}</p>
    <div class="detail-metrics">
      ${metricCells.map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join("")}
    </div>
    <section class="detail-section">
      <h3>${escapeHtml(family.title)}での接続</h3>
      <div class="relation-list">
        ${connected
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 12)
          .map((edge) => {
            const sourceId = endpointId(edge.source);
            const targetId = endpointId(edge.target);
            const other = nodeById(sourceId === id ? targetId : sourceId);
            const arrow = family.direction === "directed" ? (sourceId === id ? "→" : "←") : "—";
            return `<button type="button" data-edge-id="${escapeHtml(edge.id)}"><span>${arrow}</span><strong>${escapeHtml(other?.name)}</strong><em>${edge.weight.toFixed(2)}</em></button>`;
          })
          .join("") || "<p>接続はありません．</p>"}
      </div>
    </section>`;
  elements.detailContent.querySelectorAll("[data-edge-id]").forEach((button) => {
    button.addEventListener("click", () => selectEdge(button.dataset.edgeId));
  });
}

function showEdgeDetail(edge) {
  const family = currentFamily();
  const source = nodeById(endpointId(edge.source));
  const target = nodeById(endpointId(edge.target));
  const connector = family.direction === "directed" ? "→" : "—";
  elements.detailPlaceholder.hidden = true;
  elements.detailContent.hidden = false;
  elements.detailContent.innerHTML = `
    <div class="detail-kicker"><span class="edge-dot"></span>${escapeHtml(family.title)}</div>
    <h2 class="edge-title">${escapeHtml(source?.name)} <b>${connector}</b> ${escapeHtml(target?.name)}</h2>
    <p class="detail-code">${escapeHtml(edge.relationType)}</p>
    <div class="weight-card"><span>edge weight</span><strong>${edge.weight.toFixed(2)}</strong><i style="--weight:${edge.weight * 100}%"></i></div>
    <section class="detail-section">
      <h3>このedgeの意味</h3>
      <p>${escapeHtml(edge.evidence || "根拠文は登録されていません．")}</p>
    </section>
    <dl class="source-list">
      <div><dt>観測日</dt><dd>${escapeHtml(edge.observedAt || "未登録")}</dd></div>
      <div><dt>出典</dt><dd>${escapeHtml(edge.sourceLabel || "未登録")}</dd></div>
      <div><dt>方向</dt><dd>${family.direction === "directed" ? "sourceからtarget" : "方向なし"}</dd></div>
    </dl>
    <p class="detail-caveat">${escapeHtml(family.sourceNote)}</p>`;
}

function renderSearchResults() {
  const query = elements.companySearch.value.trim().toLowerCase();
  if (!query) {
    elements.searchResults.replaceChildren();
    return;
  }
  const matches = state.dataset.nodes.filter((node) => node.searchText.includes(query)).slice(0, 7);
  elements.searchResults.innerHTML = matches
    .map(
      (node) => `<button type="button" data-node-id="${escapeHtml(node.id)}"><strong>${escapeHtml(node.name)}</strong><span>${escapeHtml(node.code)} · ${escapeHtml(node.sector)}</span></button>`,
    )
    .join("");
  elements.searchResults.querySelectorAll("[data-node-id]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.companySearch.value = nodeById(button.dataset.nodeId).name;
      elements.searchResults.replaceChildren();
      selectNode(button.dataset.nodeId);
    });
  });
}

function resetSelection() {
  state.focusId = null;
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  elements.focusButton.disabled = true;
  elements.companySearch.value = "";
  elements.detailPlaceholder.hidden = false;
  elements.detailContent.hidden = true;
  render();
}

function populateFamilySelect() {
  elements.familySelect.innerHTML = state.dataset.families
    .map((family) => `<option value="${escapeHtml(family.key)}">${escapeHtml(family.title)}</option>`)
    .join("");
  elements.familySelect.value = state.familyKey;
}

function updateUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("family", state.familyKey);
  url.searchParams.set("view", state.view);
  url.searchParams.set("weight", state.minWeight.toFixed(2));
  url.searchParams.set("edges", String(state.maxEdges));
  url.searchParams.set("hop", String(state.hop));
  if (state.selectedNodeId) url.searchParams.set("node", state.selectedNodeId);
  else url.searchParams.delete("node");
  if (state.selectedEdgeId) url.searchParams.set("edge", state.selectedEdgeId);
  else url.searchParams.delete("edge");
  if (state.focusId) url.searchParams.set("focus", state.focusId);
  else url.searchParams.delete("focus");
  window.history.replaceState({}, "", url);
}

function applyUrlState() {
  const params = new URLSearchParams(window.location.search);
  const family = params.get("family");
  const view = params.get("view");
  const node = params.get("node");
  const edge = params.get("edge");
  const focus = params.get("focus");
  const minWeight = Number(params.get("weight"));
  const maxEdges = Number(params.get("edges"));
  const hop = Number(params.get("hop"));
  if (state.dataset.families.some((item) => item.key === family)) state.familyKey = family;
  if (["2d", "3d"].includes(view)) state.view = view;
  if (state.dataset.nodes.some((item) => item.id === node)) state.selectedNodeId = node;
  if (currentFamily().edges.some((item) => item.id === edge)) {
    state.selectedEdgeId = edge;
    state.selectedNodeId = null;
  }
  if (state.dataset.nodes.some((item) => item.id === focus)) state.focusId = focus;
  if (Number.isFinite(minWeight) && minWeight >= 0 && minWeight <= 1) state.minWeight = minWeight;
  if (Number.isFinite(maxEdges) && maxEdges >= 10 && maxEdges <= 200) state.maxEdges = maxEdges;
  if ([1, 2].includes(hop)) state.hop = hop;
}

async function importDataset(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const errors = validateDataset(parsed);
    if (errors.length > 0) throw new Error(errors.slice(0, 5).join(" / "));
    state.dataset = normalizeDataset(parsed);
    state.familyKey = state.dataset.families[0].key;
    state.selectedNodeId = null;
    state.selectedEdgeId = null;
    state.focusId = null;
    populateFamilySelect();
    await render();
    elements.statusText.textContent = `${file.name}を読み込みました`;
  } catch (error) {
    elements.statusText.textContent = `読込失敗: ${error.message}`;
    window.alert(`JSONを読み込めませんでした．\n${error.message}`);
  }
}

function bindEvents() {
  elements.familySelect.addEventListener("change", () => {
    state.familyKey = elements.familySelect.value;
    state.selectedEdgeId = null;
    if (state.selectedNodeId) showNodeDetail(state.selectedNodeId);
    render();
  });
  elements.viewSwitch.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if (!button) return;
    state.view = button.dataset.view;
    elements.viewSwitch.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
  elements.hopSelect.addEventListener("change", () => {
    state.hop = Number(elements.hopSelect.value);
    if (state.focusId) render();
  });
  elements.companySearch.addEventListener("input", renderSearchResults);
  elements.clearSearch.addEventListener("click", () => {
    elements.companySearch.value = "";
    elements.searchResults.replaceChildren();
  });
  elements.weightRange.addEventListener("input", () => {
    state.minWeight = Number(elements.weightRange.value);
    render();
  });
  elements.edgeRange.addEventListener("input", () => {
    state.maxEdges = Number(elements.edgeRange.value);
    render();
  });
  elements.focusButton.addEventListener("click", () => {
    if (!state.selectedNodeId) return;
    state.focusId = state.selectedNodeId;
    render();
  });
  elements.resetButton.addEventListener("click", resetSelection);
  elements.fitButton.addEventListener("click", () => fitGraph());
  elements.shareButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(window.location.href);
    elements.statusText.textContent = "現在の表示URLをコピーしました";
  });
  elements.importButton.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", () => {
    const [file] = elements.fileInput.files;
    if (file) importDataset(file);
    elements.fileInput.value = "";
  });
  window.addEventListener("resize", () => {
    if (!state.graph) return;
    const rect = elements.graphViewport.getBoundingClientRect();
    state.graph.width(Math.max(320, rect.width)).height(Math.max(360, rect.height));
  });
}

async function init() {
  const response = await fetch(`${import.meta.env.BASE_URL}data/demo-graphs.json`);
  if (!response.ok) throw new Error(`demo data load failed: ${response.status}`);
  const raw = await response.json();
  const errors = validateDataset(raw);
  if (errors.length > 0) throw new Error(errors.join(" / "));
  state.dataset = normalizeDataset(raw);
  state.familyKey = state.dataset.families[0].key;
  applyUrlState();
  populateFamilySelect();
  elements.weightRange.value = String(state.minWeight);
  elements.edgeRange.value = String(state.maxEdges);
  elements.hopSelect.value = String(state.hop);
  elements.viewSwitch.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  bindEvents();
  if (state.selectedEdgeId) {
    showEdgeDetail(currentFamily().edges.find((edge) => edge.id === state.selectedEdgeId));
  } else if (state.selectedNodeId) {
    elements.focusButton.disabled = false;
    showNodeDetail(state.selectedNodeId);
  }
  await render();
}

init().catch((error) => {
  elements.statusText.textContent = error.message;
  elements.emptyState.hidden = false;
  elements.emptyState.querySelector("strong").textContent = "初期化できませんでした";
  elements.emptyState.querySelector("span").textContent = error.message;
});
