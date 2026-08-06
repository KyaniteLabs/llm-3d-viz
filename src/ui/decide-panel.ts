/**
 * Decide-mode inspector: floor, cost×speed SVG, shortlist, JSON export.
 * Production path for SPEC #137 / B′ (no AI button in v1).
 */
import type { Model } from "../data/models";
import {
  buildDecideResponse,
  clampBias,
  clampFloor,
  DEFAULT_INTELLIGENCE_FLOOR,
  floorFromAnchor,
  shortlistFromDecide,
  type DecideResponseV1,
} from "../lib/decide";
import { formatIntelligence, formatPricePerM, formatTps } from "../lib/format";
import { displayName } from "../lib/display-name";
import type { AppState, AppStore } from "../state";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

export class DecidePanel {
  private readonly root: HTMLElement;
  private readonly store: AppStore;
  private models: readonly Model[] = [];
  /** Product catalog (pre shelf filters) for snapshot id. */
  private productCatalog: readonly Model[] = [];
  private catalogSnapshotId = "";
  private lastResponse: DecideResponseV1 | null = null;

  constructor(root: HTMLElement, store: AppStore, productCatalog: readonly Model[], snapshotId: string) {
    this.root = root;
    this.store = store;
    this.productCatalog = productCatalog;
    this.catalogSnapshotId = snapshotId;
    this.root.classList.add("decide-panel");
    this.root.hidden = true;
    this.root.innerHTML = `
      <p class="eyebrow">DECIDE</p>
      <h2 class="decide-title">Intelligence floor → cost × speed</h2>
      <p class="console-note decide-blurb">
        The glowing plane on the 3D stage is your intelligence floor (AA Index; default 50).
        Models below it dim; only models on or above with measured cost + speed enter the pick set.
        Cost × speed chart + Pareto ridge + shortlist of 3 follow the cheap↔fast bias.
      </p>
      <div class="decide-floor">
        <label class="decide-label">
          <span>Intelligence floor (AA Index)</span>
          <input type="range" min="0" max="100" step="1" data-decide-floor value="${DEFAULT_INTELLIGENCE_FLOOR}" />
          <output data-decide-floor-out>${DEFAULT_INTELLIGENCE_FLOOR}</output>
        </label>
        <label class="decide-label">
          <span>Anchor (known-good model)</span>
          <select data-decide-anchor>
            <option value="">— none —</option>
          </select>
        </label>
      </div>
      <div class="decide-bias">
        <label class="decide-label">
          <span>Prefer cheaper ← → Prefer faster</span>
          <input type="range" min="-1" max="1" step="0.05" data-decide-bias value="0" />
        </label>
      </div>
      <div class="decide-chart-host" data-decide-chart aria-label="Cost versus speed of eligible models"></div>
      <section class="decide-shortlist" data-decide-shortlist aria-label="Shortlist"></section>
      <div class="decide-actions">
        <button type="button" class="scope-apply" data-decide-export>Copy decision</button>
        <span class="console-note" data-decide-export-status hidden></span>
      </div>
    `;

    this.root.addEventListener("input", (e) => this.onInput(e));
    this.root.addEventListener("change", (e) => this.onInput(e));
    this.root.addEventListener("click", (e) => this.onClick(e));
    this.store.subscribe((state) => this.syncFromState(state));
  }

  setCatalogSnapshot(productCatalog: readonly Model[], snapshotId: string) {
    this.productCatalog = productCatalog;
    this.catalogSnapshotId = snapshotId;
  }

  setModels(models: readonly Model[]) {
    this.models = models;
    this.fillAnchorOptions();
    this.render(this.store.getState());
  }

  private fillAnchorOptions() {
    const sel = this.root.querySelector<HTMLSelectElement>("[data-decide-anchor]");
    if (!sel) return;
    const current = this.store.getState().floorAnchorModelId ?? "";
    const withIntel = this.models
      .filter((m) => m.aa_intelligence_index != null)
      .slice()
      .sort(
        (a, b) =>
          (b.aa_intelligence_index ?? 0) - (a.aa_intelligence_index ?? 0) ||
          a.model.localeCompare(b.model),
      );
    sel.innerHTML =
      `<option value="">— none —</option>` +
      withIntel
        .map((m) => {
          const label = `${displayName(m.model)} · ${formatIntelligence(m.aa_intelligence_index!)}`;
          return `<option value="${esc(m.model)}">${esc(label)}</option>`;
        })
        .join("");
    sel.value = current;
  }

  private onInput(event: Event) {
    const t = event.target as HTMLElement;
    if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) return;
    if (t.matches("[data-decide-floor]")) {
      const floor = clampFloor(Number((t as HTMLInputElement).value));
      this.store.update({
        intelligenceFloor: floor,
        floorAnchorModelId: null,
        floorSource: "user",
        floorUserSet: true,
      });
      return;
    }
    if (t.matches("[data-decide-bias]")) {
      this.store.update({ costSpeedBias: clampBias(Number((t as HTMLInputElement).value)) });
      return;
    }
    if (t.matches("[data-decide-anchor]")) {
      const id = (t as HTMLSelectElement).value || null;
      if (!id) {
        this.store.update({
          floorAnchorModelId: null,
          floorSource: "user",
          floorUserSet: true,
        });
        return;
      }
      const floor = floorFromAnchor(this.models, id) ?? floorFromAnchor(this.productCatalog, id);
      if (floor == null) return;
      this.store.update({
        floorAnchorModelId: id,
        intelligenceFloor: floor,
        floorSource: "anchor",
        floorUserSet: true,
      });
    }
  }

  private onClick(event: Event) {
    const t = event.target as HTMLElement;
    const btn = t.closest("button");
    if (!btn) return;
    if (btn.matches("[data-decide-export]")) {
      const state = this.store.getState();
      const resp =
        this.lastResponse ??
        buildDecideResponse(this.models, {
          floor: state.intelligenceFloor,
          bias: state.costSpeedBias,
          anchorModelId: state.floorAnchorModelId,
          floorSource: state.floorSource,
          catalogSnapshotId: this.catalogSnapshotId,
        });
      const text = JSON.stringify(resp, null, 2);
      void navigator.clipboard?.writeText(text).then(
        () => this.flashExport("Copied"),
        () => this.flashExport("Copy failed — see console"),
      );
      console.info("[decide] DecideResponse", resp);
      return;
    }
    if (btn.matches("[data-shortlist-pin]")) {
      const id = btn.getAttribute("data-shortlist-pin");
      if (id) this.store.update({ pinnedModelId: id, hoveredModelId: id });
    }
  }

  private flashExport(msg: string) {
    const el = this.root.querySelector<HTMLElement>("[data-decide-export-status]");
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    window.setTimeout(() => {
      el.hidden = true;
    }, 2000);
  }

  private syncFromState(state: Readonly<AppState>) {
    this.root.hidden = !state.decideMode;
    if (!state.decideMode) return;
    this.render(state);
  }

  private render(state: Readonly<AppState>) {
    const floorInput = this.root.querySelector<HTMLInputElement>("[data-decide-floor]");
    const floorOut = this.root.querySelector("[data-decide-floor-out]");
    const biasInput = this.root.querySelector<HTMLInputElement>("[data-decide-bias]");
    const anchor = this.root.querySelector<HTMLSelectElement>("[data-decide-anchor]");
    if (floorInput && document.activeElement !== floorInput) {
      floorInput.value = String(state.intelligenceFloor);
    }
    if (floorOut) floorOut.textContent = String(state.intelligenceFloor);
    if (biasInput && document.activeElement !== biasInput) {
      biasInput.value = String(state.costSpeedBias);
    }
    if (anchor && document.activeElement !== anchor) {
      anchor.value = state.floorAnchorModelId ?? "";
    }

    const { eligible, pareto, shortlist } = shortlistFromDecide(
      this.models,
      state.intelligenceFloor,
      state.costSpeedBias,
      3,
    );
    this.lastResponse = buildDecideResponse(this.models, {
      floor: state.intelligenceFloor,
      bias: state.costSpeedBias,
      anchorModelId: state.floorAnchorModelId,
      floorSource: state.floorSource,
      catalogSnapshotId: this.catalogSnapshotId,
    });

    this.renderChart(eligible, pareto, shortlist);
    this.renderShortlist(shortlist, eligible.length, pareto.length);
  }

  private renderChart(eligible: Model[], pareto: Model[], shortlist: Model[]) {
    const host = this.root.querySelector("[data-decide-chart]");
    if (!host) return;
    if (eligible.length === 0) {
      host.innerHTML = `<p class="console-note">No eligible models at this floor (need Index ≥ floor and cost + speed). Lower the floor or widen scope.</p>`;
      return;
    }
    const W = 280;
    const H = 160;
    const pad = { l: 36, r: 10, t: 10, b: 28 };
    const costs = eligible.map((m) => m.blended_price_per_M!);
    const speeds = eligible.map((m) => m.tps!);
    const minC = Math.min(...costs);
    const maxC = Math.max(...costs);
    const minS = Math.min(...speeds);
    const maxS = Math.max(...speeds);
    const x = (c: number) =>
      pad.l +
      ((Math.log10(c + 0.01) - Math.log10(minC + 0.01)) /
        (Math.log10(maxC + 0.01) - Math.log10(minC + 0.01) || 1)) *
        (W - pad.l - pad.r);
    const y = (s: number) =>
      H -
      pad.b -
      ((Math.log10(s + 0.1) - Math.log10(minS + 0.1)) /
        (Math.log10(maxS + 0.1) - Math.log10(minS + 0.1) || 1)) *
        (H - pad.t - pad.b);

    const paretoIds = new Set(pareto.map((m) => m.model));
    const shortIds = new Set(shortlist.map((m) => m.model));
    const ridge = [...pareto].sort((a, b) => a.blended_price_per_M! - b.blended_price_per_M!);
    const poly = ridge
      .map((m) => `${x(m.blended_price_per_M!).toFixed(1)},${y(m.tps!).toFixed(1)}`)
      .join(" ");

    const dots = eligible
      .map((m) => {
        const cx = x(m.blended_price_per_M!);
        const cy = y(m.tps!);
        const kind = shortIds.has(m.model)
          ? "shortlist"
          : paretoIds.has(m.model)
            ? "pareto"
            : "eligible";
        const r = kind === "shortlist" ? 5 : kind === "pareto" ? 3.5 : 2.2;
        return `<circle class="decide-dot is-${kind}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" data-model="${esc(m.model)}"><title>${esc(displayName(m.model))} · ${formatPricePerM(m.blended_price_per_M!)} · ${formatTps(m.tps!)}</title></circle>`;
      })
      .join("");

    host.innerHTML = `
      <svg class="decide-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Cost versus speed scatter of eligible models">
        <text class="decide-axis-label" x="${pad.l}" y="${H - 6}">← cheaper</text>
        <text class="decide-axis-label" x="${W - pad.r}" y="${H - 6}" text-anchor="end">cost →</text>
        <text class="decide-axis-label" x="8" y="${pad.t + 8}" transform="rotate(-90 8 ${pad.t + 40})">speed</text>
        ${poly ? `<polyline class="decide-ridge" fill="none" points="${poly}" />` : ""}
        ${dots}
      </svg>
      <p class="console-note decide-chart-legend">
        <span class="decide-leg is-eligible">eligible</span>
        <span class="decide-leg is-pareto">Pareto</span>
        <span class="decide-leg is-shortlist">shortlist</span>
        · log scales · ${eligible.length} eligible · ridge ${pareto.length}
      </p>
    `;
  }

  private renderShortlist(shortlist: Model[], eligibleN: number, paretoN: number) {
    const host = this.root.querySelector("[data-decide-shortlist]");
    if (!host) return;
    if (shortlist.length === 0) {
      host.innerHTML = `<p class="console-note">Shortlist empty — lower the floor or widen scope. ${eligibleN} eligible · ${paretoN} on cost×speed ridge.</p>`;
      return;
    }
    if (paretoN === 1) {
      host.innerHTML = `
        <p class="console-note">Only one model sits on the cost×speed Pareto ridge at this floor — shortlist size follows the ridge.</p>
        <p class="weight-heading">SHORTLIST · ${shortlist.length} · ${eligibleN} eligible</p>
        <ol class="decide-shortlist-ol">
          ${shortlist
            .map(
              (m, i) => `
            <li>
              <button type="button" class="decide-shortlist-item" data-shortlist-pin="${esc(m.model)}">
                <span class="decide-rank">${i + 1}</span>
                <span class="decide-name">${esc(displayName(m.model))}</span>
                <span class="decide-meta">${formatIntelligence(m.aa_intelligence_index!)} · ${formatPricePerM(m.blended_price_per_M!)} · ${formatTps(m.tps!)}</span>
              </button>
            </li>`,
            )
            .join("")}
        </ol>`;
      return;
    }
    host.innerHTML = `
      <p class="weight-heading">SHORTLIST · ${shortlist.length} of ${paretoN} on ridge · ${eligibleN} eligible</p>
      <ol class="decide-shortlist-ol">
        ${shortlist
          .map(
            (m, i) => `
          <li>
            <button type="button" class="decide-shortlist-item" data-shortlist-pin="${esc(m.model)}">
              <span class="decide-rank">${i + 1}</span>
              <span class="decide-name">${esc(displayName(m.model))}</span>
              <span class="decide-meta">${formatIntelligence(m.aa_intelligence_index!)} · ${formatPricePerM(m.blended_price_per_M!)} · ${formatTps(m.tps!)}</span>
            </button>
          </li>`,
          )
          .join("")}
      </ol>
    `;
  }
}
