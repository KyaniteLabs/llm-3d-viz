/**
 * Left filter shelf — draft scope editor with Apply.
 * Hierarchical Lab ▸ Family membership control for analysts.
 */
import type { Model } from "../data/models";
import { familyIdOf } from "../lib/family";
import {
  DEFAULT_FILTERS,
  applyFilters,
  listMultiEffortFamilies,
  listProviders,
  type ModelFilters,
} from "../lib/filters";
import type { AppStore } from "../state";

function cloneFilters(f: ModelFilters): ModelFilters {
  return {
    ageEnabled: f.ageEnabled,
    ageMonths: f.ageMonths,
    multiEffortOnly: f.multiEffortOnly,
    providers: [...f.providers],
    families: [...f.families],
    openness: f.openness ?? "all",
    vramMaxGb: f.vramMaxGb ?? null,
    excludeNonReasoning: f.excludeNonReasoning ?? true,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

export class FilterShelf {
  private readonly root: HTMLElement;
  private readonly store: AppStore;
  private readonly catalog: readonly Model[];
  private readonly referenceDate: () => Date;
  private draft: ModelFilters;
  private search = "";
  private openLabs = new Set<string>();

  constructor(
    root: HTMLElement,
    store: AppStore,
    catalog: readonly Model[],
    referenceDate: () => Date,
  ) {
    this.root = root;
    this.store = store;
    this.catalog = catalog;
    this.referenceDate = referenceDate;
    this.draft = cloneFilters(store.getState().filters);
    this.root.addEventListener("click", (e) => this.onClick(e));
    this.root.addEventListener("change", (e) => this.onChange(e));
    this.root.addEventListener("input", (e) => this.onInput(e));
  }

  /** Sync draft from applied store filters (e.g. when opening shelf). */
  resetDraftFromStore() {
    this.draft = cloneFilters(this.store.getState().filters);
    this.render();
  }

  apply() {
    this.store.update({
      filters: cloneFilters(this.draft),
      pinnedModelId: null,
      hoveredModelId: null,
    });
  }

  render() {
    const providers = listProviders(this.catalog);
    const multi = new Set(listMultiEffortFamilies(this.catalog).map((m) => m.family));
    const q = this.search.trim().toLowerCase();

    // Build lab → families map
    const byLab = new Map<string, Map<string, number>>();
    for (const m of this.catalog) {
      if (q && !m.model.toLowerCase().includes(q) && !familyIdOf(m).toLowerCase().includes(q) && !m.provider.toLowerCase().includes(q)) {
        continue;
      }
      const lab = m.provider;
      const fam = familyIdOf(m);
      if (!byLab.has(lab)) byLab.set(lab, new Map());
      const fams = byLab.get(lab)!;
      fams.set(fam, (fams.get(fam) ?? 0) + 1);
    }

    const providerSet = this.draft.providers.length ? new Set(this.draft.providers) : null;
    const familySet = this.draft.families.length ? new Set(this.draft.families) : null;

    const preview = applyFilters(this.catalog, this.draft, this.referenceDate()).length;

    const labBlocks = providers
      .filter((lab) => byLab.has(lab))
      .map((lab) => {
        const fams = [...(byLab.get(lab)?.entries() ?? [])].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        const open = this.openLabs.has(lab) || Boolean(q);
        const labChecked =
          !providerSet || providerSet.has(lab)
            ? familySet
              ? fams.some(([f]) => familySet.has(f))
                ? fams.every(([f]) => familySet.has(f))
                  ? "checked"
                  : "indeterminate"
                : ""
              : "checked"
            : "";
        const famRows = fams
          .map(([fam, count]) => {
            const checked =
              (!providerSet || providerSet.has(lab)) &&
              (!familySet || familySet.has(fam));
            const curve = multi.has(fam)
              ? ` · ${count} steps`
              : count === 1
                ? " · single"
                : ` · ${count}`;
            return `<label class="tree-family${multi.has(fam) ? "" : " is-singleton"}">
              <input type="checkbox" data-tree-family="${esc(fam)}" data-tree-lab="${esc(lab)}" ${checked ? "checked" : ""} />
              <span>${esc(fam)}<em>${curve}</em></span>
            </label>`;
          })
          .join("");
        return `<div class="tree-lab" data-lab-block="${esc(lab)}">
          <div class="tree-lab-row">
            <button type="button" class="tree-twist" data-tree-twist="${esc(lab)}" aria-expanded="${open}">${open ? "▾" : "▸"}</button>
            <label class="tree-lab-label">
              <input type="checkbox" data-tree-lab="${esc(lab)}" ${labChecked === "checked" ? "checked" : ""} data-indeterminate="${labChecked === "indeterminate" ? "1" : "0"}" />
              <strong>${esc(lab)}</strong>
              <em>${fams.length}</em>
            </label>
          </div>
          <div class="tree-families" ${open ? "" : "hidden"}>${famRows}</div>
        </div>`;
      })
      .join("");

    this.root.innerHTML = `
      <p class="axis-hint">Draft scope — stage updates only when you <strong>Apply</strong>.</p>
      <p class="filter-count scope-preview">${preview} models in draft</p>
      <div class="filter-toolbar">
        <label class="filter-toggle">
          <input type="checkbox" data-draft-age ${this.draft.ageEnabled ? "checked" : ""} />
          <span>Age ≤ ${this.draft.ageMonths} months</span>
        </label>
        <label class="filter-toggle">
          <input type="checkbox" data-draft-multi ${this.draft.multiEffortOnly ? "checked" : ""} />
          <span>Multi-effort only</span>
        </label>
      </div>
      <label class="axis-control">
        <span>Search</span>
        <input type="search" data-shelf-search value="${esc(this.search)}" placeholder="Lab, family, model…" />
      </label>
      <div class="tree-actions">
        <button type="button" class="text-link" data-tree-all>All labs</button>
        <button type="button" class="text-link" data-tree-none>None</button>
      </div>
      <div class="filter-tree" role="tree" aria-label="Labs and families">${labBlocks || "<p class='console-note'>No rows match search.</p>"}</div>
    `;

    // Set indeterminate on lab checkboxes
    this.root.querySelectorAll<HTMLInputElement>("[data-tree-lab][data-indeterminate='1']").forEach((el) => {
      el.indeterminate = true;
    });
  }

  private onInput(event: Event) {
    const t = event.target as HTMLElement;
    if (t instanceof HTMLInputElement && t.matches("[data-shelf-search]")) {
      this.search = t.value;
      this.render();
      const again = this.root.querySelector<HTMLInputElement>("[data-shelf-search]");
      again?.focus();
      const len = this.search.length;
      again?.setSelectionRange(len, len);
    }
  }

  private onChange(event: Event) {
    const t = event.target as HTMLElement;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.matches("[data-draft-age]")) {
      this.draft.ageEnabled = t.checked;
      this.render();
      return;
    }
    if (t.matches("[data-draft-multi]")) {
      this.draft.multiEffortOnly = t.checked;
      this.render();
      return;
    }
    if (t.matches("[data-tree-lab]") && t.dataset.treeLab && !t.dataset.treeFamily) {
      this.toggleLab(t.dataset.treeLab, t.checked);
      this.render();
      return;
    }
    if (t.matches("[data-tree-family]") && t.dataset.treeFamily && t.dataset.treeLab) {
      this.toggleFamily(t.dataset.treeLab, t.dataset.treeFamily, t.checked);
      this.render();
    }
  }

  private onClick(event: Event) {
    const t = event.target as HTMLElement;
    const twist = t.closest<HTMLElement>("[data-tree-twist]");
    if (twist?.dataset.treeTwist) {
      const lab = twist.dataset.treeTwist;
      if (this.openLabs.has(lab)) this.openLabs.delete(lab);
      else this.openLabs.add(lab);
      this.render();
      return;
    }
    if (t.closest("[data-tree-all]")) {
      this.draft.providers = [];
      this.draft.families = [];
      this.render();
      return;
    }
    if (t.closest("[data-tree-none]")) {
      // Empty selection = nothing visible: set providers to impossible empty by picking no labs
      // Use providers: [] and families: [] means all — so for "none" we need a sentinel.
      // Convention: providers = ["__none__"] filters everything out.
      this.draft.providers = ["__none__"];
      this.draft.families = [];
      this.render();
      return;
    }
  }

  private allFamiliesForLab(lab: string): string[] {
    return [...new Set(this.catalog.filter((m) => m.provider === lab).map((m) => familyIdOf(m)))];
  }

  private toggleLab(lab: string, on: boolean) {
    // Normalize away sentinel
    if (this.draft.providers.includes("__none__")) this.draft.providers = [];

    const labFams = this.allFamiliesForLab(lab);
    if (on) {
      // Ensure lab is included: if providers was restrictive, add lab; clear family-only restrictions for that lab
      if (this.draft.providers.length) {
        if (!this.draft.providers.includes(lab)) this.draft.providers.push(lab);
      }
      // If families restricted, add all of this lab's families
      if (this.draft.families.length) {
        for (const f of labFams) {
          if (!this.draft.families.includes(f)) this.draft.families.push(f);
        }
        // If every family of every selected lab is included, clear family filter (all)
        this.compactFamilyFilter();
      }
    } else {
      // Turn lab off: if providers empty (all), switch to all-other labs; else remove lab
      if (!this.draft.providers.length) {
        this.draft.providers = listProviders(this.catalog).filter((p) => p !== lab);
      } else {
        this.draft.providers = this.draft.providers.filter((p) => p !== lab);
      }
      this.draft.families = this.draft.families.filter((f) => !labFams.includes(f));
      if (!this.draft.providers.length) {
        this.draft.providers = ["__none__"];
      }
      this.compactFamilyFilter();
    }
  }

  private toggleFamily(lab: string, fam: string, on: boolean) {
    if (this.draft.providers.includes("__none__")) this.draft.providers = [];

    // Expand current membership to explicit family list if unrestricted
    if (!this.draft.families.length && !this.draft.providers.length) {
      this.draft.families = listMultiEffortFamilies(this.catalog).map((m) => m.family);
      // include solos too for full explicit list
      const allF = new Set(this.catalog.map((m) => familyIdOf(m)));
      this.draft.families = [...allF];
    } else if (!this.draft.families.length && this.draft.providers.length) {
      this.draft.families = this.catalog
        .filter((m) => this.draft.providers.includes(m.provider))
        .map((m) => familyIdOf(m));
      this.draft.families = [...new Set(this.draft.families)];
    }

    if (on) {
      if (!this.draft.families.includes(fam)) this.draft.families.push(fam);
      if (this.draft.providers.length && !this.draft.providers.includes(lab)) {
        this.draft.providers.push(lab);
      }
    } else {
      this.draft.families = this.draft.families.filter((f) => f !== fam);
      if (!this.draft.families.length) {
        this.draft.providers = ["__none__"];
      }
    }
    this.compactFamilyFilter();
  }

  /** If families cover all catalog families, clear to empty (= all). Same for providers. */
  private compactFamilyFilter() {
    if (this.draft.providers.includes("__none__")) return;
    const allF = new Set(this.catalog.map((m) => familyIdOf(m)));
    if (this.draft.families.length && this.draft.families.length >= allF.size) {
      const set = new Set(this.draft.families);
      if ([...allF].every((f) => set.has(f))) this.draft.families = [];
    }
    const allP = listProviders(this.catalog);
    if (this.draft.providers.length && this.draft.providers.length >= allP.length) {
      const set = new Set(this.draft.providers);
      if (allP.every((p) => set.has(p))) this.draft.providers = [];
    }
  }
}

export function formatScopeSummary(
  filters: ModelFilters,
  visibleCount: number,
  catalogCount: number,
): string {
  const bits: string[] = [filters.vramMaxGb != null ? "Local" : "Cloud"];
  if (filters.ageEnabled) bits.push(`≤${filters.ageMonths}mo`);
  else bits.push("any age");
  if (filters.multiEffortOnly) bits.push("multi-effort");
  if (filters.vramMaxGb != null) bits.push(`≤${filters.vramMaxGb}GB VRAM`);
  else if (filters.openness === "open") bits.push("open weights");
  else if (filters.openness === "closed") bits.push("closed");
  if (filters.excludeNonReasoning) bits.push("reasoning only");
  if (filters.providers.length && !filters.providers.includes("__none__")) {
    bits.push(`${filters.providers.length} lab${filters.providers.length === 1 ? "" : "s"}`);
  }
  if (filters.families.length === 1) bits.push(`solo ${filters.families[0]}`);
  else if (filters.families.length > 1) bits.push(`${filters.families.length} families`);
  bits.push(`${visibleCount}/${catalogCount} models`);
  return bits.join(" · ");
}

export { cloneFilters, DEFAULT_FILTERS };
