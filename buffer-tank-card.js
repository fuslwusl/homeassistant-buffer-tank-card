/*
 * Buffer Tank Card – clean stratification design
 * Standalone Home Assistant Lovelace card, no external dependencies.
 * Configuration keys: top, middle, extra, bottom, min_temp, max_temp,
 * show_labels, name, unit, height.
 *
 * Typography follows the Home Assistant defaults: the title uses the
 * standard ha-card header, values and labels use the theme font tokens
 * (--ha-font-size-m etc.) and do not scale with the card width.
 */
(() => {
  const VERSION = "1.0.0";
  const REPO_URL = "https://github.com/fuslwusl/homeassistant-buffer-tank-card";

  const POSITIONS = [
    ["top", "Oben"],
    ["middle", "Mitte"],
    ["extra", "Zusatz"],
    ["bottom", "Unten"],
  ];

  // Sensors used for the card picker preview if they exist.
  const STUB_ENTITIES = [
    ["top", "sensor.heating_hotwater_temperature"],
    ["middle", "sensor.heating_dhwtank_mid_temperature"],
    ["bottom", "sensor.heating_solar_dhwtank_temperature"],
  ];

  // Tank height in px (option `height`).
  const DEFAULT_HEIGHT = 160;
  const MIN_HEIGHT = 120;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => Math.round(a + (b - a) * t);
  const hexRgb = (hex) => {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const rgb = (a, b, t) => `rgb(${mix(a[0], b[0], t)},${mix(a[1], b[1], t)},${mix(a[2], b[2], t)})`;
  // Color stops relative to min_temp..max_temp. With the defaults (20..60 °C):
  // 20 °C blue, 30 °C green/turquoise, 40 °C orange, >= 60 °C red.
  // Temperatures outside the range are clamped to the first/last color.
  const RAMP = [
    [0.00, "#2196f3"],
    [0.25, "#1fb5a3"],
    [0.50, "#ff9800"],
    [1.00, "#f44336"],
  ];
  function colorFor(temp, min, max) {
    if (temp == null || !Number.isFinite(temp)) return "#9e9e9e";
    const f = clamp((temp - min) / Math.max(1, max - min), 0, 1);
    for (let i = 1; i < RAMP.length; i++) {
      if (f <= RAMP[i][0]) {
        const t = (f - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]);
        return rgb(hexRgb(RAMP[i - 1][1]), hexRgb(RAMP[i][1]), t);
      }
    }
    return RAMP[RAMP.length - 1][1];
  }
  function offsets(n) {
    if (n <= 1) return [0.5];
    if (n === 2) return [0.3, 0.7];
    if (n === 3) return [0.12, 0.5, 0.88];
    return [0.08, 0.36, 0.64, 0.92];
  }
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);

  const STYLE = `
    :host { display: block; }
    ha-card { height: 100%; overflow: hidden; }
    .card-content { padding: 16px; }
    .card-content.has-header { padding: 0 16px 16px; }
    .tank-body {
      --tank-width: clamp(56px, 22%, 120px);
      position: relative;
      height: 160px;
    }
    .tank {
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: var(--tank-width);
      border-radius: 12px;
    }
    .row {
      position: absolute;
      left: var(--tank-width); right: 0;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      cursor: pointer;
      outline: none;
    }
    .band {
      position: relative;
      flex: 0 0 auto;
      width: clamp(96px, 45%, 240px);
      height: 28px;
      display: flex;
      align-items: center;
    }
    .band::before {
      content: "";
      position: absolute;
      left: 0; right: 0; top: 50%;
      height: 14px;
      transform: translateY(-50%);
      border-radius: 7px;
      background: var(--point-color);
    }
    .value {
      position: relative;
      margin-left: 16px;
      min-width: 56px;
      box-sizing: border-box;
      padding: 2px 10px;
      text-align: center;
      white-space: nowrap;
      border: 2px solid var(--point-color);
      border-radius: 10px;
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--primary-text-color);
      font-size: var(--ha-font-size-m, 14px);
      font-weight: var(--ha-font-weight-medium, 500);
      line-height: var(--ha-line-height-normal, 20px);
    }
    .row:focus-visible .value { border-color: var(--primary-color); }
    .label {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--primary-text-color);
      font-size: var(--ha-font-size-m, 14px);
      font-weight: var(--ha-font-weight-normal, 400);
      line-height: var(--ha-line-height-normal, 20px);
    }
    .empty {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-m, 14px);
      line-height: var(--ha-line-height-normal, 20px);
    }
  `;

  class BufferTankCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._config = null;
      this._hass = null;
    }

    static getStubConfig(hass) {
      const states = hass?.states || {};
      const config = { name: "Pufferspeicher", min_temp: 20, max_temp: 60 };
      let found = STUB_ENTITIES.filter(([, id]) => states[id]);
      if (!found.length) {
        // Fall back to the first temperature sensors of the installation.
        found = Object.keys(states)
          .filter(id => id.startsWith("sensor.") && states[id].attributes?.device_class === "temperature")
          .slice(0, 3)
          .map((id, i) => [STUB_ENTITIES[i][0], id]);
      }
      for (const [key, entity] of found) config[key] = { entity };
      return config;
    }

    setConfig(config) {
      if (!config) throw new Error("Buffer Tank Card: configuration missing");
      this._config = { min_temp: 20, max_temp: 60, show_labels: true, name: "Pufferspeicher", ...config };
      this.render();
    }

    set hass(hass) {
      const old = this._hass;
      this._hass = hass;
      // Only re-render when one of the configured sensors changed; HA
      // replaces a state object whenever that entity changes.
      if (!old || this._entityIds().some(id => old.states?.[id] !== hass?.states?.[id])) {
        this.render();
      }
    }

    get hass() { return this._hass; }

    // Card size in HA's 50px units: tank height + padding (+ header).
    getCardSize() {
      return Math.ceil((this._height() + 32 + (this._config?.name ? 56 : 0)) / 50);
    }

    // Tank height in px; configurable via `height`, never below MIN_HEIGHT
    // so four sensor rows cannot overlap.
    _height() {
      const h = Number(this._config?.height);
      return Number.isFinite(h) && h > 0 ? Math.max(MIN_HEIGHT, h) : DEFAULT_HEIGHT;
    }

    _entityIds() {
      return POSITIONS.map(([key]) => this._config?.[key]?.entity).filter(Boolean);
    }

    _points() {
      const configured = POSITIONS.filter(([key]) => this._config?.[key]?.entity);
      const offs = offsets(configured.length);
      return configured.map(([key, fallback], i) => {
        const cfg = this._config[key];
        const state = this._hass?.states?.[cfg.entity];
        const raw = state && !["unknown", "unavailable"].includes(state.state) ? Number(state.state) : NaN;
        return {
          key, entity: cfg.entity, label: cfg.label || fallback,
          temp: Number.isFinite(raw) ? raw : null,
          unit: cfg.unit || state?.attributes?.unit_of_measurement || this._config.unit || "°C",
          off: offs[i],
        };
      });
    }

    render() {
      if (!this.shadowRoot || !this._config) return;
      const pts = this._points();
      const min = Number(this._config.min_temp ?? 20);
      const max = Math.max(min + 1, Number(this._config.max_temp ?? 60));

      const stops = pts.filter(p => p.temp !== null).sort((a, b) => a.off - b.off);
      let gradientStops;
      if (!stops.length) gradientStops = [[0, RAMP[0][1]], [1, RAMP[RAMP.length - 1][1]]];
      else {
        gradientStops = stops.map(p => [p.off, colorFor(p.temp, min, max)]);
        if (gradientStops[0][0] > 0) gradientStops.unshift([0, gradientStops[0][1]]);
        if (gradientStops[gradientStops.length - 1][0] < 1) gradientStops.push([1, gradientStops[gradientStops.length - 1][1]]);
      }
      const gradient = `linear-gradient(to bottom, ${gradientStops.map(([o, c]) => `${c} ${o * 100}%`).join(", ")})`;

      const rows = pts.map(p => {
        const value = p.temp === null ? "—" : `${Math.round(p.temp)} ${p.unit}`;
        return `
          <div class="row" style="top:${p.off * 100}%; --point-color:${colorFor(p.temp, min, max)}"
               data-entity="${esc(p.entity)}" role="button" tabindex="0" aria-label="${esc(p.label)} ${esc(value)}">
            <div class="band"><span class="value">${esc(value)}</span></div>
            ${this._config.show_labels === false ? "" : `<span class="label">${esc(p.label)}</span>`}
          </div>`;
      }).join("");

      const name = this._config.name;
      const body = pts.length
        ? `<div class="tank-body" style="height:${this._height()}px" role="img" aria-label="Pufferspeicher Temperaturschichtung">
             <div class="tank" style="background:${gradient}"></div>
             ${rows}
           </div>`
        : `<div class="empty">Keine Sensoren konfiguriert (top, middle, extra, bottom).</div>`;

      this.shadowRoot.innerHTML = `
        <style>${STYLE}</style>
        <ha-card ${name ? `header="${esc(name)}"` : ""}>
          <div class="card-content ${name ? "has-header" : ""}">${body}</div>
        </ha-card>`;

      this.shadowRoot.querySelectorAll(".row").forEach(el => {
        el.addEventListener("click", () => {
          this.dispatchEvent(new CustomEvent("hass-more-info", {
            bubbles: true, composed: true, detail: { entityId: el.dataset.entity },
          }));
        });
        el.addEventListener("keydown", ev => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            el.click();
          }
        });
      });
    }
  }

  if (!customElements.get("buffer-tank-card")) customElements.define("buffer-tank-card", BufferTankCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "buffer-tank-card",
    name: "Buffer Tank Card",
    description: "Pufferspeicher mit dynamischer Temperaturschichtung",
    preview: true,
    documentationURL: REPO_URL,
  });
  console.info(
    `%c BUFFER-TANK-CARD %c v${VERSION} `,
    "color:#fff;background:#f44336;font-weight:700;border-radius:3px 0 0 3px",
    "color:#fff;background:#2196f3;font-weight:700;border-radius:0 3px 3px 0",
  );
})();
