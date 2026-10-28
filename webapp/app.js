const REQUIRED_COLUMNS = ["Tipo_mantenimiento", "Equipo", "Downtime_h", "Horas_mano_obra", "Costo_total_CLP"];
const CHART_COLORS = {
  correctivo: "#c45b5b",
  preventivo: "#377fa8",
  predictivo: "#26947f",
  default: "#527a99",
};
const TYPE_ALIASES = new Map([
  ["correctivo", "Correctivo"],
  ["correctiva", "Correctivo"],
  ["correctivos", "Correctivo"],
  ["correctivas", "Correctivo"],
  ["mantenimiento correctivo", "Correctivo"],
  ["mantenimiento correctiva", "Correctivo"],
  ["preventivo", "Preventivo"],
  ["preventiva", "Preventivo"],
  ["preventivos", "Preventivo"],
  ["preventivas", "Preventivo"],
  ["mantenimiento preventivo", "Preventivo"],
  ["mantenimiento preventiva", "Preventivo"],
  ["predictivo", "Predictivo"],
  ["predictiva", "Predictivo"],
  ["predictivos", "Predictivo"],
  ["predictivas", "Predictivo"],
  ["mantenimiento predictivo", "Predictivo"],
  ["mantenimiento predictiva", "Predictivo"],
]);
const state = { rows: [], sourceName: "CMMS_grupo_D.csv", filters: { type: "", area: "" } };

const $ = (selector) => document.querySelector(selector);
const numberFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
const integerFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const currencyFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const normalize = (value) => String(value ?? "").trim().replace(/^'+/, "").trim();
const categoryKey = (value) => normalize(value)
  .replace(/\s+/g, " ")
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .toLocaleLowerCase("es");

function normalizeCategory(value, field) {
  const cleaned = normalize(value).replace(/\s+/g, " ");
  const key = categoryKey(cleaned);
  if (field === "Tipo_mantenimiento") return TYPE_ALIASES.get(key) || cleaned;
  if (field === "Estado") {
    if (["cerrada", "cerrado", "cerradas", "cerrados"].includes(key)) return "Cerrada";
    if (key === "en ejecucion") return "En ejecución";
  }
  return cleaned;
}

function groupedCategories(rows, field) {
  const groups = new Map();
  rows.forEach((row) => {
    const label = normalizeCategory(row[field], field) || "Sin especificar";
    const key = categoryKey(label);
    if (!groups.has(key)) groups.set(key, { label, count: 0, variants: new Map() });
    const group = groups.get(key);
    group.count += 1;
    group.variants.set(label, (group.variants.get(label) || 0) + 1);
    if (group.variants.get(label) > (group.variants.get(group.label) || 0)) group.label = label;
  });
  return [...groups].map(([key, group]) => ({ key, label: group.label, count: group.count }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

function chartColor(label) {
  return CHART_COLORS[categoryKey(label)] || CHART_COLORS.default;
}

function parseNumber(value) {
  let text = normalize(value).replace(/\s/g, "");
  if (!text) return 0;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    text = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (comma >= 0) {
    text = text.replace(",", ".");
  }
  const result = Number(text);
  return Number.isFinite(result) ? result : 0;
}

function parseCSV(text) {
  const source = text.replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  if (rows.length < 2) throw new Error("El archivo no contiene filas de datos.");

  const headers = rows[0].map((header) => normalize(header));
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(", ")}.`);
  const seen = new Set();
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, normalize(cells[index])])))
    .filter((record) => Object.values(record).some((value) => value !== ""))
    .map((record) => {
      record.Tipo_mantenimiento = normalizeCategory(record.Tipo_mantenimiento, "Tipo_mantenimiento");
      if (record.Estado) record.Estado = normalizeCategory(record.Estado, "Estado");
      return record;
    })
    .filter((record) => {
      const key = JSON.stringify(headers.map((header) => record[header] || ""));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function parseDate(value) {
  const text = normalize(value);
  if (!text) return null;
  let match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateTime(value) {
  const text = normalize(value);
  if (!text) return null;
  const localMatch = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (localMatch) {
    return new Date(
      Number(localMatch[3]),
      Number(localMatch[2]) - 1,
      Number(localMatch[1]),
      Number(localMatch[4] || 0),
      Number(localMatch[5] || 0),
      Number(localMatch[6] || 0),
    );
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function filteredRows() {
  return state.rows.filter((row) =>
    (!state.filters.type || categoryKey(normalizeCategory(row.Tipo_mantenimiento, "Tipo_mantenimiento")) === state.filters.type) &&
    (!state.filters.area || categoryKey(normalizeCategory(row["Área"], "Área")) === state.filters.area));
}

function uniqueOrderCount(rows) {
  const ids = rows.map((row) => normalize(row.OT)).filter(Boolean);
  return ids.length ? new Set(ids).size : rows.length;
}

function total(rows, key) {
  return rows.reduce((sum, row) => sum + parseNumber(row[key]), 0);
}

function setText(selector, value) { $(selector).textContent = value; }
function fmt(value) { return numberFormat.format(value); }
function fmtMoney(value) { return currencyFormat.format(Math.round(value)); }
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function populateFilters() {
  const types = groupedCategories(state.rows, "Tipo_mantenimiento");
  const areas = groupedCategories(state.rows, "Área");
  const typeFilter = $("#type-filter");
  const areaFilter = $("#area-filter");
  typeFilter.replaceChildren(new Option("Todos los tipos", ""));
  areaFilter.replaceChildren(new Option("Todas las áreas", ""));
  types.forEach(({ key, label }) => typeFilter.add(new Option(label, key)));
  areas.forEach(({ key, label }) => areaFilter.add(new Option(label, key)));
  state.filters = { type: "", area: "" };
}

function setPeriod(rows) {
  const dates = rows.map((row) => parseDate(row.Fecha_creación)).filter(Boolean).sort((a, b) => a - b);
  if (!dates.length) { setText("#period-label", "Sin fechas disponibles"); return; }
  const formatter = new Intl.DateTimeFormat("es-CL", { month: "short", year: "numeric" });
  const from = formatter.format(dates[0]).replace(".", "");
  const to = formatter.format(dates[dates.length - 1]).replace(".", "");
  setText("#period-label", from === to ? from : `${from} — ${to}`);
}

function aggregate(rows, category, metric, unique = false) {
  const groups = new Map();
  rows.forEach((row) => {
    const label = normalizeCategory(row[category], category) || "Sin especificar";
    const key = categoryKey(label);
    if (!groups.has(key)) groups.set(key, { label, value: 0, ids: new Set(), variants: new Map() });
    const group = groups.get(key);
    group.variants.set(label, (group.variants.get(label) || 0) + 1);
    if (group.variants.get(label) > (group.variants.get(group.label) || 0)) group.label = label;
    if (unique && normalize(row.OT)) group.ids.add(normalize(row.OT));
    else if (unique) group.value += 1;
    else group.value += parseNumber(row[metric]);
  });
  return [...groups.values()].map((group) => ({ label: group.label, value: unique && group.ids.size ? group.ids.size : group.value }))
    .sort((a, b) => b.value - a.value);
}

function renderBars(selector, items, options = {}) {
  const host = $(selector);
  if (!items.length || items.every((item) => item.value === 0)) {
    host.innerHTML = '<div class="empty-chart">No hay datos para los filtros seleccionados.</div>';
    return;
  }
  const maxRows = options.maxRows || 5;
  const data = items.slice(0, maxRows);
  const width = 560;
  const rowHeight = options.rowHeight || 34;
  const top = 7;
  const left = options.left || 142;
  const right = options.right || 52;
  const chartWidth = width - left - right;
  const height = top + data.length * rowHeight + 9;
  const max = Math.max(...data.map((item) => item.value), 1);
  const tickCount = 4;
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(options.ariaLabel || "Gráfico de barras")}">`;
  for (let tick = 0; tick <= tickCount; tick += 1) {
    const x = left + (chartWidth * tick) / tickCount;
    svg += `<line class="grid-line" x1="${x}" y1="${top - 2}" x2="${x}" y2="${height - 2}"></line>`;
    svg += `<text class="axis-label" x="${x}" y="${height - 1}" text-anchor="middle">${escapeHTML(options.axisFormat ? options.axisFormat(max * tick / tickCount) : fmt(max * tick / tickCount))}</text>`;
  }
  data.forEach((item, index) => {
    const y = top + index * rowHeight;
    const barWidth = Math.max(1, (item.value / max) * chartWidth);
    const color = chartColor(item.label);
    const label = item.label.length > (options.labelLength || 22) ? `${item.label.slice(0, (options.labelLength || 22) - 1)}…` : item.label;
    const value = options.valueFormat ? options.valueFormat(item.value) : fmt(item.value);
    svg += `<text class="bar-label" x="${left - 9}" y="${y + 13}" text-anchor="end">${escapeHTML(label)}</text>`;
    svg += `<rect x="${left}" y="${y + 2}" width="${barWidth}" height="15" rx="3" fill="${color}"><title>${escapeHTML(item.label)}: ${escapeHTML(value)}</title></rect>`;
    svg += `<text class="bar-value" x="${Math.min(left + barWidth + 6, width - right + 3)}" y="${y + 13}">${escapeHTML(value)}</text>`;
  });
  host.innerHTML = `${svg}</svg>`;
}

function renderFailures(rows) {
  const failures = aggregate(rows.filter((row) => normalize(row.Modo_falla)), "Modo_falla", "", true).slice(0, 6);
  const tbody = $("#failure-table");
  if (!failures.length) {
    tbody.innerHTML = '<tr><td colspan="3">No hay modos de falla registrados en esta selección.</td></tr>';
    return;
  }
  tbody.innerHTML = failures.map((failure, index) => {
    const matching = rows.filter((row) => categoryKey(normalizeCategory(row.Modo_falla, "Modo_falla")) === categoryKey(failure.label));
    return `<tr><td><span class="rank-dot">${String(index + 1).padStart(2, "0")}</span>${escapeHTML(failure.label)}</td><td class="align-right">${integerFormat.format(failure.value)}</td><td class="align-right">${fmt(total(matching, "Downtime_h"))} h</td></tr>`;
  }).join("");
}

function renderTypeSummary(rows, orders, labor, downtime, cost) {
  const tbody = $("#type-summary");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5">No hay datos para los filtros seleccionados.</td></tr>';
    return;
  }
  const types = groupedCategories(rows, "Tipo_mantenimiento")
    .map(({ key, label: type }) => {
      const matching = rows.filter((row) => categoryKey(normalizeCategory(row.Tipo_mantenimiento, "Tipo_mantenimiento")) === key);
      return {
        type,
        color: chartColor(type),
        orders: uniqueOrderCount(matching),
        labor: total(matching, "Horas_mano_obra"),
        downtime: total(matching, "Downtime_h"),
        cost: total(matching, "Costo_total_CLP"),
      };
    })
    .sort((a, b) => b.orders - a.orders);
  const percentage = (value, totalValue) => `${fmt(totalValue ? value / totalValue * 100 : 0)} %`;
  const rowHTML = (type, metrics) => `<tr><td>${metrics.color ? `<span class="category-swatch" style="--category-color:${metrics.color}" aria-hidden="true"></span>` : ""}${escapeHTML(type)}</td><td class="align-right">${percentage(metrics.orders, orders)}</td><td class="align-right">${percentage(metrics.labor, labor)}</td><td class="align-right">${percentage(metrics.downtime, downtime)}</td><td class="align-right">${percentage(metrics.cost, cost)}</td></tr>`;
  tbody.innerHTML = types.map((item) => rowHTML(item.type, item)).join("") +
    rowHTML("Total", { orders, labor, downtime, cost });
}

function renderInsight(rows, orders, labor, downtime, cost) {
  if (!rows.length) { setText("#insight-text", "No hay registros con los filtros seleccionados."); return; }
  const correctives = rows.filter((row) => categoryKey(normalizeCategory(row.Tipo_mantenimiento, "Tipo_mantenimiento")) === "correctivo");
  const correctiveOrders = uniqueOrderCount(correctives);
  const correctiveLabor = total(correctives, "Horas_mano_obra");
  const correctiveDowntime = total(correctives, "Downtime_h");
  const correctiveCost = total(correctives, "Costo_total_CLP");
  const shares = [
    { name: "órdenes", pct: orders ? correctiveOrders / orders * 100 : 0 },
    { name: "horas-hombre", pct: labor ? correctiveLabor / labor * 100 : 0 },
    { name: "downtime", pct: downtime ? correctiveDowntime / downtime * 100 : 0 },
    { name: "costo directo", pct: cost ? correctiveCost / cost * 100 : 0 },
  ];
  const largest = shares.reduce((best, item) => item.pct > best.pct ? item : best, shares[0]);
  if (!correctives.length) {
    const topArea = aggregate(rows, "Área", "Costo_total_CLP")[0];
    setText("#insight-text", topArea ? `${topArea.label} concentra el mayor costo directo, con ${fmtMoney(topArea.value)} CLP en la selección actual.` : "El dataset no contiene órdenes correctivas para comparar.");
    return;
  }
  setText("#insight-text", `El mantenimiento correctivo representa el ${fmt(correctiveOrders / (orders || 1) * 100)} % de las órdenes y concentra el ${fmt(largest.pct)} % del ${largest.name} registrado. El foco de mejora puede priorizar la reducción de fallas reactivas.`);
}

function render() {
  const rows = filteredRows();
  const orders = uniqueOrderCount(rows);
  const labor = total(rows, "Horas_mano_obra");
  const downtime = total(rows, "Downtime_h");
  const cost = total(rows, "Costo_total_CLP");
  const correctives = rows.filter((row) => categoryKey(normalizeCategory(row.Tipo_mantenimiento, "Tipo_mantenimiento")) === "correctivo");
  const validRepairs = correctives
    .filter((row) => categoryKey(normalizeCategory(row.Estado, "Estado")) === "cerrada")
    .map((row) => {
      const start = parseDateTime(row.Fecha_inicio);
      const end = parseDateTime(row.Fecha_fin);
      return start && end ? (end.getTime() - start.getTime()) / 3600000 : 0;
    })
    .filter((hours) => hours > 0);
  const mttr = validRepairs.length ? validRepairs.reduce((sum, hours) => sum + hours, 0) / validRepairs.length : 0;
  const sortedRepairs = [...validRepairs].sort((a, b) => a - b);
  const middle = Math.floor(sortedRepairs.length / 2);
  const medianRepair = sortedRepairs.length
    ? sortedRepairs.length % 2 ? sortedRepairs[middle] : (sortedRepairs[middle - 1] + sortedRepairs[middle]) / 2
    : 0;

  setText("#kpi-orders", integerFormat.format(orders));
  setText("#kpi-orders-note", `${integerFormat.format(rows.length)} registros`);
  setText("#kpi-labor", `${fmt(labor)} h`);
  setText("#kpi-labor-note", "Horas acumuladas");
  setText("#kpi-downtime", `${fmt(downtime)} h`);
  setText("#kpi-downtime-note", rows.length ? `${fmt(downtime / rows.length)} h / registro` : "Sin registros");
  setText("#kpi-cost", `$ ${fmtMoney(cost)}`);
  setText("#kpi-cost-note", "CLP");
  setText("#kpi-mttr", validRepairs.length ? `${fmt(mttr)} h` : "—");
  setText("#kpi-median", validRepairs.length ? `${fmt(medianRepair)} h` : "—");
  setPeriod(rows);

  const byTypeOrders = aggregate(rows, "Tipo_mantenimiento", "", true);
  renderBars("#orders-chart", byTypeOrders, { ariaLabel: "Órdenes por estrategia", valueFormat: (value) => integerFormat.format(value), axisFormat: (value) => integerFormat.format(value) });
  renderBars("#labor-chart", aggregate(rows, "Tipo_mantenimiento", "Horas_mano_obra"), { ariaLabel: "Horas hombre por estrategia" });
  renderBars("#downtime-chart", aggregate(rows, "Tipo_mantenimiento", "Downtime_h"), { ariaLabel: "Downtime por estrategia" });
  renderBars("#cost-chart", aggregate(rows, "Tipo_mantenimiento", "Costo_total_CLP"), { ariaLabel: "Costo por estrategia", valueFormat: (value) => `$${fmtMoney(value)}`, axisFormat: (value) => `$${fmtMoney(value)}`, left: 150, right: 82 });
  renderBars("#equipment-chart", aggregate(rows, "Equipo", "Downtime_h").filter((item) => item.label !== "Sin especificar"), { ariaLabel: "Equipos con más downtime", maxRows: 6, rowHeight: 34, labelLength: 25 });
  renderTypeSummary(rows, orders, labor, downtime, cost);
  renderFailures(rows);
  renderInsight(rows, orders, labor, downtime, cost);
  setText("#dataset-status", `${state.sourceName} · ${integerFormat.format(rows.length)} registros`);
}

function loadRows(rows, name) {
  state.rows = rows;
  state.sourceName = name;
  populateFilters();
  render();
  setText("#updated-label", `Actualizado ${new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date())}`);
  $("#upload-message").textContent = `${integerFormat.format(rows.length)} registros cargados correctamente.`;
  $("#upload-message").style.color = "#398165";
}

async function loadSample() {
  setText("#dataset-status", "Cargando dataset…");
  try {
    const response = await fetch("./data/CMMS_grupo_D.csv");
    if (!response.ok) throw new Error(`No se pudo cargar el dataset de ejemplo (${response.status}).`);
    const rows = parseCSV(await response.text());
    loadRows(rows, "CMMS_grupo_D.csv");
  } catch (error) {
    setText("#dataset-status", "Dataset no disponible");
    $("#upload-message").textContent = `${error.message} Selecciona un archivo CSV para comenzar.`;
  }
}

async function loadFile(file) {
  $("#upload-message").style.color = "";
  $("#upload-message").textContent = "Leyendo archivo…";
  try {
    loadRows(parseCSV(await file.text()), file.name);
  } catch (error) {
    $("#upload-message").style.color = "#b64b4b";
    $("#upload-message").textContent = error instanceof Error ? error.message : "No se pudo leer el archivo CSV.";
  }
}

$("#type-filter").addEventListener("change", (event) => { state.filters.type = event.target.value; render(); });
$("#area-filter").addEventListener("change", (event) => { state.filters.area = event.target.value; render(); });
$("#reset-filters").addEventListener("click", () => {
  $("#type-filter").value = "";
  $("#area-filter").value = "";
  state.filters = { type: "", area: "" };
  render();
});
$("#export-button").addEventListener("click", () => window.print());
$("#sample-button").addEventListener("click", loadSample);
$("#file-input").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  await loadFile(file);
  $("#file-input").value = "";
});

const dataPanel = $(".data-panel");
dataPanel.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  dataPanel.classList.add("is-dragging");
});
dataPanel.addEventListener("dragleave", (event) => {
  if (!dataPanel.contains(event.relatedTarget)) dataPanel.classList.remove("is-dragging");
});
dataPanel.addEventListener("drop", async (event) => {
  event.preventDefault();
  dataPanel.classList.remove("is-dragging");
  const [file] = event.dataTransfer.files;
  if (!file) return;
  if (!file.name.toLocaleLowerCase("es").endsWith(".csv")) {
    $("#upload-message").style.color = "#b64b4b";
    $("#upload-message").textContent = "Selecciona un archivo con extensión .csv.";
    return;
  }
  await loadFile(file);
});

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
  });
});

loadSample();
