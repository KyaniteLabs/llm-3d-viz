/**
 * OSS-only simple decision surface (Liani / average-user path).
 * Not mounted on product (Forgejo) builds — edition gate in main.ts.
 *
 * Flow: pick a need → nudge affordability / smarts / speed sliders →
 * "spin" picks among the top shortlist by weighted score.
 */
import type { AppStore } from "../state";
import { presets, type ScoreWeights } from "../lib/score";
import { normalizedScores, weightedOptimum } from "../lib/score";
import { displayName } from "../lib/display-name";
import type { Model } from "../data/models";

/** Friendly needs → technical weight presets */
const NEEDS: { id: string; label: string; blurb: string; weights: ScoreWeights; cute: string }[] = [
  {
    id: "chat",
    label: "Just talk",
    blurb: "Everyday chat and answers",
    weights: presets.chat,
    cute: "friendly housecat",
  },
  {
    id: "code",
    label: "Write code",
    blurb: "Harder reasoning & programming",
    weights: presets.coding,
    cute: "clever lynx",
  },
  {
    id: "budget",
    label: "Keep costs low",
    blurb: "Good enough for less money",
    weights: presets.RAG,
    cute: "thrifty tabby",
  },
  {
    id: "fast",
    label: "Answer fast",
    blurb: "Low latency over peak smarts",
    weights: presets.speed,
    cute: "zippy cheetah",
  },
];

function sharesFromSliders(afford: number, smarts: number, speed: number): ScoreWeights {
  // afford high → cost weight high; smarts → intelligence; speed → speed
  const cost = Math.max(0.05, afford);
  const intelligence = Math.max(0.05, smarts);
  const sp = Math.max(0.05, speed);
  const t = cost + intelligence + sp;
  return { cost: cost / t, intelligence: intelligence / t, speed: sp / t };
}

export class SimpleDecision {
  private readonly root: HTMLElement;
  private readonly store: AppStore;
  private models: readonly Model[] = [];
  private afford = 0.35;
  private smarts = 0.35;
  private speed = 0.3;
  private cute = true;
  private lastPick: string | null = null;

  constructor(host: HTMLElement, store: AppStore) {
    this.store = store;
    this.root = document.createElement("section");
    this.root.className = "simple-decision";
    this.root.setAttribute("aria-label", "Simple model picker");
    host.prepend(this.root);
    this.renderShell();
    this.store.subscribe(() => this.refreshOutcome());
  }

  setModels(models: readonly Model[]) {
    this.models = models;
    this.refreshOutcome();
  }

  private applyWeights(w: ScoreWeights) {
    this.store.update({ weights: { ...w }, decideMode: false });
  }

  private renderShell() {
    this.root.innerHTML = `
      <div class="simple-decision-card">
        <p class="eyebrow">START HERE</p>
        <h2 class="simple-decision-title">What do you need it to do?</h2>
        <p class="simple-decision-blurb">
          Pick a goal, nudge what matters, then spin for a ranked pick.
          No need to touch Advanced unless you want to.
        </p>
        <div class="simple-need-row" data-need-row></div>
        <div class="simple-sliders">
          <label class="simple-slider">
            <span>Affordability <em data-aff-out>35%</em></span>
            <input type="range" min="5" max="90" step="1" value="35" data-aff />
          </label>
          <label class="simple-slider">
            <span>Smarts / ability <em data-smart-out>35%</em></span>
            <input type="range" min="5" max="90" step="1" value="35" data-smart />
          </label>
          <label class="simple-slider">
            <span>Speed <em data-speed-out>30%</em></span>
            <input type="range" min="5" max="90" step="1" value="30" data-speed />
          </label>
        </div>
        <label class="simple-cute">
          <input type="checkbox" data-cute checked />
          <span>Cute labels (fun names for the top picks)</span>
        </label>
        <div class="simple-actions">
          <button type="button" class="simple-spin" data-spin>Spin the shortlist</button>
          <button type="button" class="text-link" data-open-advanced>Open advanced controls</button>
        </div>
        <div class="simple-outcome" data-simple-outcome aria-live="polite"></div>
      </div>
    `;

    const needRow = this.root.querySelector("[data-need-row]")!;
    needRow.innerHTML = NEEDS.map(
      (n) => `
      <button type="button" class="simple-need" data-need="${n.id}" title="${n.blurb}">
        <strong>${n.label}</strong>
        <span>${n.blurb}</span>
      </button>`,
    ).join("");

    needRow.querySelectorAll<HTMLButtonElement>("[data-need]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const need = NEEDS.find((n) => n.id === btn.dataset.need);
        if (!need) return;
        needRow.querySelectorAll(".simple-need").forEach((el) => el.classList.remove("is-active"));
        btn.classList.add("is-active");
        // seed sliders from preset proportions
        this.afford = need.weights.cost;
        this.smarts = need.weights.intelligence;
        this.speed = need.weights.speed;
        this.syncSliderInputs();
        this.applyWeights(need.weights);
        this.refreshOutcome();
      });
    });

    const bind = (sel: string, key: "afford" | "smarts" | "speed", outSel: string) => {
      const input = this.root.querySelector<HTMLInputElement>(sel)!;
      const out = this.root.querySelector<HTMLElement>(outSel)!;
      input.addEventListener("input", () => {
        const v = Number(input.value) / 100;
        this[key] = v;
        out.textContent = `${Math.round(v * 100)}%`;
        this.applyWeights(sharesFromSliders(this.afford, this.smarts, this.speed));
        this.refreshOutcome();
      });
    };
    bind("[data-aff]", "afford", "[data-aff-out]");
    bind("[data-smart]", "smarts", "[data-smart-out]");
    bind("[data-speed]", "speed", "[data-speed-out]");

    this.root.querySelector<HTMLInputElement>("[data-cute]")?.addEventListener("change", (e) => {
      this.cute = (e.target as HTMLInputElement).checked;
      this.refreshOutcome();
    });

    this.root.querySelector("[data-spin]")?.addEventListener("click", () => this.spin());
    this.root.querySelector("[data-open-advanced]")?.addEventListener("click", () => {
      const d = document.querySelector<HTMLDetailsElement>("[data-advanced-panel]");
      if (d) {
        d.open = true;
        d.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });

    // default need: just talk
    const first = needRow.querySelector<HTMLButtonElement>('[data-need="chat"]');
    first?.click();
  }

  private syncSliderInputs() {
    const set = (sel: string, v: number, out: string) => {
      const input = this.root.querySelector<HTMLInputElement>(sel);
      const o = this.root.querySelector<HTMLElement>(out);
      if (input) input.value = String(Math.round(v * 100));
      if (o) o.textContent = `${Math.round(v * 100)}%`;
    };
    set("[data-aff]", this.afford, "[data-aff-out]");
    set("[data-smart]", this.smarts, "[data-smart-out]");
    set("[data-speed]", this.speed, "[data-speed-out]");
  }

  private topList(n = 5) {
    const state = this.store.getState();
    const scores = normalizedScores(this.models, state.weights, this.models)
      .slice()
      .sort((a, b) => b.score - a.score);
    return scores.slice(0, n);
  }

  private cuteLabel(index: number): string {
    const pets = ["housecat", "lynx", "tabby", "cheetah", "panther", "ocelot"];
    return pets[index % pets.length];
  }

  private refreshOutcome() {
    const box = this.root.querySelector("[data-simple-outcome]");
    if (!box) return;
    const top = this.topList(5);
    if (!top.length) {
      box.innerHTML = `<p class="console-note">No models in view — relax filters or open Advanced.</p>`;
      return;
    }
    const opt = weightedOptimum(top) ?? top[0];
    const pickName = this.lastPick
      ? top.find((t) => t.model.model === this.lastPick) || opt
      : opt;
    const cuteBit = this.cute
      ? ` · spirit animal: <em>${this.cuteLabel(top.findIndex((t) => t.model.model === pickName.model.model))}</em>`
      : "";
    box.innerHTML = `
      <p class="eyebrow">YOUR SHORTLIST</p>
      <p class="simple-pick">
        <strong>${displayName(pickName.model.model)}</strong>
        <span>${pickName.score.toFixed(3)} fit score${cuteBit}</span>
      </p>
      <ol class="simple-rank">
        ${top
          .map((t, i) => {
            const label = this.cute
              ? `${displayName(t.model.model)} <small>(${this.cuteLabel(i)})</small>`
              : displayName(t.model.model);
            const on = t.model.model === pickName.model.model ? " is-pick" : "";
            return `<li class="${on}" data-model-id="${t.model.model}"><span>${label}</span><strong>${t.score.toFixed(3)}</strong></li>`;
          })
          .join("")}
      </ol>
    `;
    box.querySelectorAll<HTMLElement>("[data-model-id]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset.modelId || null;
        this.store.update({ pinnedModelId: id, hoveredModelId: id });
      });
    });
  }

  private spin() {
    const top = this.topList(5);
    if (!top.length) return;
    // Weighted random: higher score → more chance
    const weights = top.map((t) => Math.max(0.01, t.score));
    const sum = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    let pick = top[0];
    for (let i = 0; i < top.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        pick = top[i];
        break;
      }
    }
    this.lastPick = pick.model.model;
    this.store.update({ pinnedModelId: pick.model.model, hoveredModelId: pick.model.model });
    this.root.classList.remove("is-spinning");
    void this.root.offsetWidth;
    this.root.classList.add("is-spinning");
    this.refreshOutcome();
  }
}
