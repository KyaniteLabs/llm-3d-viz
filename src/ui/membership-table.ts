import type { Model } from "../data/models";
import { familyIdOf, deriveEffortTier } from "../lib/family";
import { displayName } from "../lib/display-name";
import type { AppStore } from "../state";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

export function renderMembershipTable(
  host: HTMLElement,
  visible: readonly Model[],
  store: AppStore,
) {
  const state = store.getState();
  const active = state.pinnedModelId ?? state.hoveredModelId;
  if (visible.length === 0) {
    host.innerHTML = `<p class="console-note">No models in visible set. Open <strong>Edit scope</strong> to widen membership.</p>`;
    return;
  }
  const rows = visible
    .slice()
    .sort(
      (a, b) =>
        a.provider.localeCompare(b.provider) ||
        familyIdOf(a).localeCompare(familyIdOf(b)) ||
        a.model.localeCompare(b.model),
    )
    .map((m) => {
      const fam = familyIdOf(m);
      const selected = active === m.model ? " is-selected" : "";
      return `<tr class="${selected}" data-model-id="${esc(m.model)}" data-focus-family="${esc(fam)}" tabindex="0">
        <td>${esc(m.provider)}</td>
        <td>${esc(fam)}</td>
        <td>${esc(deriveEffortTier(m))}</td>
        <td>${esc(displayName(m.model))}</td>
        <td class="num">${m.aa_intelligence_index ?? "—"}</td>
        <td class="num">${m.tps != null ? Math.round(m.tps) : "—"}</td>
        <td class="num">${m.blended_price_per_M != null ? m.blended_price_per_M.toFixed(2) : "—"}</td>
      </tr>`;
    })
    .join("");

  host.innerHTML = `
    <p class="eyebrow">MEMBERSHIP · ${visible.length} ROWS</p>
    <div class="membership-scroll">
      <table class="membership-table">
        <thead>
          <tr>
            <th>Lab</th><th>Family</th><th>Effort</th><th>Model</th>
            <th class="num">IQ</th><th class="num">TPS</th><th class="num">$/M</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="axis-hint">Click a row to pin · double-click to solo family</p>`;

  host.querySelectorAll<HTMLElement>("tbody tr[data-model-id]").forEach((tr) => {
    tr.onclick = () => {
      store.update({
        pinnedModelId: tr.dataset.modelId ?? null,
        hoveredModelId: tr.dataset.modelId ?? null,
      });
      renderMembershipTable(host, visible, store);
    };
    tr.ondblclick = () => {
      const fam = tr.dataset.focusFamily;
      if (!fam) return;
      store.update({
        filters: { ...store.getState().filters, families: [fam] },
        pinnedModelId: tr.dataset.modelId ?? null,
        hoveredModelId: tr.dataset.modelId ?? null,
      });
    };
  });
}
