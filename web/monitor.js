// ComfyUI Advanced Monitor — sleek toolbar resource monitors
// CPU / RAM / GPU / VRAM / Temp / Disk pills with live sparklines.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EVENT_NAME = "cam.monitor";
const HISTORY_LEN = 48;

const COLORS = {
  cpu: "#38bdf8", // sky
  ram: "#a78bfa", // violet
  gpu: "#34d399", // emerald
  vram: "#fb923c", // orange
  temp: "#f472b6", // pink
  hdd: "#94a3b8", // slate
  danger: "#f87171", // red
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const STYLE = `
.cam-group {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0 8px;
  -webkit-user-select: none;
  user-select: none;
}
.cam-pill {
  position: relative;
  width: 112px;
  height: 42px;
  border-radius: 9px;
  overflow: hidden;
  background: color-mix(in srgb, var(--comfy-menu-bg, #1a1a1e) 60%, black 40%);
  border: 1px solid color-mix(in srgb, var(--border-color, #4e4e55) 55%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  cursor: default;
  flex: none;
  transition: border-color 0.25s ease;
}
.cam-pill:hover {
  border-color: color-mix(in srgb, var(--border-color, #4e4e55) 100%, transparent);
}
.cam-pill.cam-danger {
  border-color: color-mix(in srgb, ${COLORS.danger} 55%, transparent);
}
.cam-pill canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.cam-pill.cam-wide {
  width: 136px;
}
.cam-pill .cam-overlay {
  position: absolute;
  inset: 0 10px 4px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  pointer-events: none;
}
.cam-pill .cam-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  color: color-mix(in srgb, var(--input-text, #ddd) 72%, transparent);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.cam-pill .cam-value {
  font-size: 15px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: var(--input-text, #e8e8ec);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  flex: none;
}
.cam-pill.cam-danger .cam-value {
  color: ${COLORS.danger};
}
.cam-pill .cam-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  width: 0%;
  border-radius: 0 3px 3px 0;
  transition: width 0.4s ease, background 0.4s ease;
}
.cam-tooltip {
  position: fixed;
  z-index: 10000;
  padding: 7px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--comfy-menu-bg, #16161a) 88%, black 12%);
  border: 1px solid var(--border-color, #4e4e55);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
  color: var(--input-text, #e8e8ec);
  font-size: 11px;
  line-height: 1.5;
  pointer-events: none;
  white-space: pre;
  opacity: 0;
  transform: translateY(-2px);
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.cam-tooltip.cam-show {
  opacity: 1;
  transform: translateY(0);
}
.cam-tooltip .cam-tip-title {
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.65;
  margin-bottom: 2px;
}
.cam-tooltip .cam-tip-action {
  margin-top: 4px;
  font-size: 9.5px;
  opacity: 0.5;
}
.cam-pill.cam-clickable {
  cursor: pointer;
}
.cam-pill.cam-clickable:active {
  transform: scale(0.97);
}
.cam-menu {
  position: fixed;
  z-index: 10001;
  min-width: 220px;
  padding: 5px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--comfy-menu-bg, #16161a) 90%, black 10%);
  border: 1px solid var(--border-color, #4e4e55);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
}
.cam-menu .cam-menu-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  opacity: 0.55;
  color: var(--input-text, #e8e8ec);
  padding: 5px 9px 3px 9px;
}
.cam-menu .cam-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 7px 9px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--input-text, #e8e8ec);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}
.cam-menu .cam-menu-item:hover {
  background: color-mix(in srgb, var(--input-text, #e8e8ec) 10%, transparent);
}
.cam-menu .cam-menu-hint {
  display: block;
  font-size: 10px;
  font-weight: 400;
  opacity: 0.55;
  margin-top: 1px;
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes) {
  if (!bytes || bytes < 0) return "—";
  const gb = bytes / 1024 ** 3;
  if (gb >= 100) return `${gb.toFixed(0)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// "NVIDIA GeForce RTX 4090" -> "RTX 4090", "AMD Radeon RX 7900 XTX" -> "RX 7900 XTX"
function shortGpuName(name) {
  if (!name) return "GPU";
  const short = name
    .replace(/NVIDIA|GeForce|AMD|Radeon|Intel\(R\)|Intel|\(TM\)|\(R\)|Graphics/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return short || name;
}

// ---------------------------------------------------------------------------
// Shared tooltip
// ---------------------------------------------------------------------------

const tooltip = document.createElement("div");
tooltip.className = "cam-tooltip";

function showTooltip(anchor, title, body, hasActions = false) {
  if (!tooltip.isConnected) document.body.appendChild(tooltip);
  tooltip.innerHTML = "";
  const t = document.createElement("div");
  t.className = "cam-tip-title";
  t.textContent = title;
  const b = document.createElement("div");
  b.textContent = body;
  tooltip.append(t, b);
  if (hasActions) {
    const a = document.createElement("div");
    a.className = "cam-tip-action";
    a.textContent = "Click for actions";
    tooltip.appendChild(a);
  }
  const rect = anchor.getBoundingClientRect();
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";
  tooltip.classList.add("cam-show");
  const tw = tooltip.offsetWidth;
  const x = Math.min(
    Math.max(6, rect.left + rect.width / 2 - tw / 2),
    window.innerWidth - tw - 6
  );
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${rect.bottom + 7}px`;
}

function hideTooltip() {
  tooltip.classList.remove("cam-show");
}

// ---------------------------------------------------------------------------
// Click-action menu (VRAM / RAM purge)
// ---------------------------------------------------------------------------

function toast(severity, summary, detail) {
  try {
    app.extensionManager.toast.add({ severity, summary, detail, life: 3500 });
  } catch {
    console.log(`[AdvancedMonitor] ${summary}: ${detail}`);
  }
}

async function runAction(action, label) {
  try {
    const res = await api.fetchApi("/advanced_monitor/free", {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    toast(
      "success",
      label,
      action === "purge_vram"
        ? "CUDA cache emptied"
        : "Applied (runs between jobs if one is active)"
    );
  } catch (err) {
    toast("error", `${label} failed`, String(err?.message ?? err));
  }
}

let openMenuEl = null;

function closeMenu() {
  if (openMenuEl) {
    openMenuEl.remove();
    openMenuEl = null;
  }
}

document.addEventListener(
  "mousedown",
  (e) => {
    if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu();
  },
  true
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

function openActionMenu(pill, actions) {
  closeMenu();
  hideTooltip();
  const menu = document.createElement("div");
  menu.className = "cam-menu";

  const title = document.createElement("div");
  title.className = "cam-menu-title";
  title.textContent = pill.tipTitle;
  menu.appendChild(title);

  for (const a of actions) {
    const btn = document.createElement("button");
    btn.className = "cam-menu-item";
    const label = document.createElement("span");
    label.textContent = a.label;
    const hint = document.createElement("span");
    hint.className = "cam-menu-hint";
    hint.textContent = a.hint;
    btn.append(label, hint);
    btn.addEventListener("click", () => {
      closeMenu();
      runAction(a.action, a.label);
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  const rect = pill.el.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const x = Math.min(
    Math.max(6, rect.left + rect.width / 2 - mw / 2),
    window.innerWidth - mw - 6
  );
  menu.style.left = `${x}px`;
  menu.style.top = `${rect.bottom + 7}px`;
  openMenuEl = menu;
}

const VRAM_ACTIONS = [
  {
    label: "Unload models",
    hint: "Move all loaded models out of VRAM",
    action: "unload_models",
  },
  {
    label: "Purge VRAM cache",
    hint: "Empty the CUDA allocator cache",
    action: "purge_vram",
  },
];

const RAM_ACTIONS = [
  {
    label: "Purge RAM",
    hint: "Clear execution cache, unload models & garbage-collect",
    action: "purge_ram",
  },
];

// ---------------------------------------------------------------------------
// Monitor pill
// ---------------------------------------------------------------------------

class MonitorPill {
  constructor(
    label,
    color,
    { unit = "%", dangerAt = 90, wide = false, actions = null } = {}
  ) {
    this.color = color;
    this.unit = unit;
    this.dangerAt = dangerAt;
    this.actions = actions;
    this.history = new Array(HISTORY_LEN).fill(0);
    this.value = -1;
    this.tipTitle = label;
    this.tipBody = "";

    this.el = document.createElement("div");
    this.el.className = wide ? "cam-pill cam-wide" : "cam-pill";

    this.canvas = document.createElement("canvas");
    this.el.appendChild(this.canvas);

    const overlay = document.createElement("div");
    overlay.className = "cam-overlay";
    this.labelEl = document.createElement("span");
    this.labelEl.className = "cam-label";
    this.labelEl.textContent = label;
    this.valueEl = document.createElement("span");
    this.valueEl.className = "cam-value";
    this.valueEl.textContent = "—";
    overlay.append(this.labelEl, this.valueEl);
    this.el.appendChild(overlay);

    this.barEl = document.createElement("div");
    this.barEl.className = "cam-bar";
    this.el.appendChild(this.barEl);

    this.el.addEventListener("mouseenter", () => {
      if (openMenuEl) return;
      showTooltip(
        this.el,
        this.tipTitle,
        this.tipBody || "No data yet",
        !!this.actions
      );
    });
    this.el.addEventListener("mouseleave", hideTooltip);

    if (this.actions) {
      this.el.classList.add("cam-clickable");
      this.el.addEventListener("click", (e) => {
        e.stopPropagation();
        openActionMenu(this, this.actions);
      });
    }
  }

  setVisible(visible) {
    this.el.style.display = visible ? "" : "none";
  }

  update(value, tipBody) {
    this.value = value;
    this.tipBody = tipBody ?? this.tipBody;

    if (value < 0) {
      this.valueEl.textContent = "—";
      this.barEl.style.width = "0%";
      return;
    }

    const pct = Math.max(0, Math.min(100, value));
    this.history.push(pct);
    if (this.history.length > HISTORY_LEN) this.history.shift();

    const danger = value >= this.dangerAt;
    this.el.classList.toggle("cam-danger", danger);
    const color = danger ? COLORS.danger : this.color;

    this.valueEl.textContent =
      this.unit === "°"
        ? `${Math.round(value)}°`
        : `${Math.round(value)}%`;

    this.barEl.style.width = `${pct}%`;
    this.barEl.style.background = color;
    this.barEl.style.boxShadow = `0 0 6px ${hexToRgba(color, 0.7)}`;

    this.drawSparkline(color);
  }

  drawSparkline(color) {
    const dpr = window.devicePixelRatio || 1;
    const w = this.el.clientWidth || 112;
    const h = this.el.clientHeight || 42;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
    }
    const ctx = this.canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const n = this.history.length;
    const stepX = w / (n - 1);
    const pad = 3; // keep the line off the very top/bottom
    const yFor = (v) => h - pad - (v / 100) * (h - pad * 2);

    ctx.beginPath();
    ctx.moveTo(0, yFor(this.history[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(i * stepX, yFor(this.history[i]));

    // Area fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, hexToRgba(color, 0.32));
    grad.addColorStop(1, hexToRgba(color, 0.02));
    ctx.save();
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Line
    ctx.beginPath();
    ctx.moveTo(0, yFor(this.history[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(i * stepX, yFor(this.history[i]));
    ctx.strokeStyle = hexToRgba(color, 0.85);
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Main UI
// ---------------------------------------------------------------------------

const container = document.createElement("div");
container.className = "cam-group";

const pills = {
  cpu: new MonitorPill("CPU", COLORS.cpu),
  ram: new MonitorPill("RAM", COLORS.ram, { actions: RAM_ACTIONS }),
  hdd: new MonitorPill("DISK", COLORS.hdd, { dangerAt: 95 }),
};
container.append(pills.cpu.el, pills.ram.el);

// GPU pills are created lazily once we know how many GPUs exist
let gpuPills = null;

function ensureGpuPills(gpus) {
  if (gpuPills) return;
  gpuPills = [];
  const shortNames = gpus.map((gpu) => shortGpuName(gpu.name));
  for (const gpu of gpus) {
    // Label the utilization pill with the actual GPU model; disambiguate
    // identical models (e.g. 2x 4090) with the device index.
    let label = shortNames[gpu.index];
    const dupes = shortNames.filter((n) => n === label).length > 1;
    const suffix = gpus.length > 1 ? String(gpu.index) : "";
    if (dupes) label = `${label} #${gpu.index}`;
    const set = {
      util: new MonitorPill(label, COLORS.gpu, { wide: true }),
      vram: new MonitorPill(`VRAM${suffix}`, COLORS.vram, {
        actions: VRAM_ACTIONS,
      }),
      temp: new MonitorPill(`TEMP${suffix}`, COLORS.temp, {
        unit: "°",
        dangerAt: 85,
      }),
    };
    gpuPills.push(set);
    // Keep DISK as the last pill
    container.insertBefore(set.util.el, pills.hdd.el);
    container.insertBefore(set.vram.el, pills.hdd.el);
    container.insertBefore(set.temp.el, pills.hdd.el);
  }
  container.appendChild(pills.hdd.el);
  applyVisibility();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const SETTING_IDS = {
  rate: "AdvancedMonitor.RefreshRate",
  cpu: "AdvancedMonitor.ShowCPU",
  ram: "AdvancedMonitor.ShowRAM",
  gpu: "AdvancedMonitor.ShowGPU",
  vram: "AdvancedMonitor.ShowVRAM",
  temp: "AdvancedMonitor.ShowTemp",
  hdd: "AdvancedMonitor.ShowDisk",
};

function getSetting(id, fallback) {
  try {
    return app.ui.settings.getSettingValue(id) ?? fallback;
  } catch {
    return fallback;
  }
}

function applyVisibility() {
  pills.cpu.setVisible(getSetting(SETTING_IDS.cpu, true));
  pills.ram.setVisible(getSetting(SETTING_IDS.ram, true));
  pills.hdd.setVisible(getSetting(SETTING_IDS.hdd, false));
  if (gpuPills) {
    for (const set of gpuPills) {
      set.util.setVisible(getSetting(SETTING_IDS.gpu, true));
      set.vram.setVisible(getSetting(SETTING_IDS.vram, true));
      set.temp.setVisible(getSetting(SETTING_IDS.temp, true));
    }
  }
}

let rateTimer = null;
function patchRate(rate) {
  // Debounce slider drags
  clearTimeout(rateTimer);
  rateTimer = setTimeout(() => {
    api
      .fetchApi("/advanced_monitor/config", {
        method: "PATCH",
        body: JSON.stringify({ rate }),
      })
      .catch(() => {});
  }, 250);
}

// ---------------------------------------------------------------------------
// Data feed
// ---------------------------------------------------------------------------

function onMonitorData(data) {
  if (!data) return;

  pills.cpu.update(data.cpu ?? -1, `Utilization  ${(data.cpu ?? 0).toFixed(1)}%`);

  if (data.ram) {
    pills.ram.update(
      data.ram.percent,
      `${formatBytes(data.ram.used)} / ${formatBytes(data.ram.total)}`
    );
  }

  if (data.hdd) {
    pills.hdd.update(
      data.hdd.percent,
      `${formatBytes(data.hdd.used)} / ${formatBytes(data.hdd.total)}`
    );
  }

  if (Array.isArray(data.gpus) && data.gpus.length) {
    ensureGpuPills(data.gpus);
    for (const gpu of data.gpus) {
      const set = gpuPills[gpu.index];
      if (!set) continue;
      set.util.update(gpu.utilization, `${gpu.name}\nUtilization  ${gpu.utilization}%`);
      set.vram.update(
        gpu.vram_percent,
        `${gpu.name}\n${formatBytes(gpu.vram_used)} / ${formatBytes(gpu.vram_total)}`
      );
      set.temp.update(gpu.temperature, `${gpu.name}\nCore  ${gpu.temperature}°C`);
    }
  }
}

// ---------------------------------------------------------------------------
// Toolbar injection — tries the modern menu API first, then DOM fallbacks.
// Re-checks periodically in case the menu gets re-rendered.
// ---------------------------------------------------------------------------

function tryInject() {
  if (container.isConnected) return true;

  // Modern UI: place just before the settings button group (right side)
  const settingsGroup = app.menu?.settingsGroup?.element;
  if (settingsGroup?.parentElement) {
    settingsGroup.before(container);
    return true;
  }

  // Fallbacks for newer/other frontend layouts
  const right = document.querySelector(".comfyui-menu-right");
  if (right) {
    right.before(container);
    return true;
  }
  const menu = document.querySelector(".comfyui-menu");
  if (menu) {
    menu.appendChild(container);
    return true;
  }

  // Legacy floating menu
  const legacy = document.querySelector(".comfy-menu");
  if (legacy) {
    container.style.flexWrap = "wrap";
    container.style.margin = "6px 0";
    container.style.justifyContent = "center";
    legacy.prepend(container);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Extension registration
// ---------------------------------------------------------------------------

app.registerExtension({
  name: "AdvancedMonitor",
  settings: [
    {
      id: SETTING_IDS.rate,
      name: "Refresh rate (seconds)",
      type: "slider",
      attrs: { min: 0.25, max: 5, step: 0.25 },
      defaultValue: 1,
      onChange: (value) => patchRate(Number(value) || 1),
    },
    {
      id: SETTING_IDS.cpu,
      name: "Show CPU monitor",
      type: "boolean",
      defaultValue: true,
      onChange: applyVisibility,
    },
    {
      id: SETTING_IDS.ram,
      name: "Show RAM monitor",
      type: "boolean",
      defaultValue: true,
      onChange: applyVisibility,
    },
    {
      id: SETTING_IDS.gpu,
      name: "Show GPU utilization monitor",
      type: "boolean",
      defaultValue: true,
      onChange: applyVisibility,
    },
    {
      id: SETTING_IDS.vram,
      name: "Show VRAM monitor",
      type: "boolean",
      defaultValue: true,
      onChange: applyVisibility,
    },
    {
      id: SETTING_IDS.temp,
      name: "Show GPU temperature monitor",
      type: "boolean",
      defaultValue: true,
      onChange: applyVisibility,
    },
    {
      id: SETTING_IDS.hdd,
      name: "Show disk usage monitor",
      type: "boolean",
      defaultValue: false,
      onChange: applyVisibility,
    },
  ],

  setup() {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    container.appendChild(pills.hdd.el);
    applyVisibility();

    api.addEventListener(EVENT_NAME, (event) => {
      if (event?.detail) onMonitorData(event.detail);
    });

    // Sync the persisted refresh rate to the backend on load
    patchRate(Number(getSetting(SETTING_IDS.rate, 1)) || 1);

    tryInject();
    // The Vue menu can re-render and drop our element; keep it alive.
    setInterval(tryInject, 2000);
  },
});
