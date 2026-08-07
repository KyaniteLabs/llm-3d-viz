/**
 * Atlas agent dock: type or talk → tools → confirm → apply to store.
 */

import type { Model } from "../data/models";
import type { AppStore } from "../state";
import {
  type AtlasAgentContext,
  type AtlasProposal,
  type AtlasLlmConfig,
  runAtlasTurn,
  isAtlasVoiceMuted,
  setAtlasVoiceMuted,
  speechRecognitionSupported,
  speechSynthesisSupported,
  listenAtlasOnce,
  stopAtlasSpeech,
  warmAtlasVoices,
  getActiveAtlasVoiceName,
  loadAtlasVoices,
  validateProposal,
  shouldAutoApplyProposal,
  proposalHasApplyableChanges,
  applyProposalToStore,
  loadAtlasLlmConfig,
  saveAtlasLlmConfig,
  clearAtlasLlmConfig,
  describeAtlasLlmConfig,
  normalizeAtlasLlmConfig,
  isAtlasLlmReady,
  applyAtlasLlmPreset,
  ATLAS_PRESET_NUCBOX_UNSLOTH,
} from "../lib/atlas-agent";
import { displayName } from "../lib/display-name";
import type { AppState } from "../state";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

export class AtlasAgentPanel {
  private readonly root: HTMLElement;
  private readonly store: AppStore;
  private catalog: readonly Model[] = [];
  private visible: readonly Model[] = [];
  private snapshotId = "cat_local";
  private pending: AtlasProposal | null = null;
  private undoState: AppState | null = null;
  private listening = false;
  private listenHandle: { stop: () => void } | null = null;

  constructor(root: HTMLElement, store: AppStore) {
    this.root = root;
    this.store = store;
    this.root.classList.add("atlas-dock");
    this.root.setAttribute("aria-label", "Atlas agent");
    this.renderShell();
    warmAtlasVoices();
    // Prefetch Kokoro in background (dynamic import — free OSS neural male).
    window.setTimeout(() => {
      void import("../lib/atlas-agent/kokoro-tts")
        .then((m) => m.warmKokoroTts())
        .catch(() => undefined);
    }, 2000);
    void loadAtlasVoices().then(() => this.refreshVoiceLabel());
    this.store.subscribe(() => this.syncFromStore());
  }

  setCatalog(models: readonly Model[], snapshotId: string) {
    this.catalog = models;
    this.snapshotId = snapshotId;
  }

  setVisible(models: readonly Model[]) {
    this.visible = models;
  }

  private ctx(): AtlasAgentContext {
    const s = this.store.getState();
    return {
      catalog: this.catalog,
      visible: this.visible.length ? this.visible : this.catalog,
      floor: s.intelligenceFloor,
      costSpeedBias: s.costSpeedBias,
      catalogSnapshotId: this.snapshotId,
      filters: s.filters,
      decideMode: s.decideMode,
      cinemaMode: s.cinemaMode,
      pinnedModelId: s.pinnedModelId,
      hoveredModelId: s.hoveredModelId,
      axisMapping: s.axisMapping,
      weights: s.weights,
      floorAnchorModelId: s.floorAnchorModelId,
      floorSource: s.floorSource,
    };
  }

  private renderShell() {
    const stt = speechRecognitionSupported();
    const tts = speechSynthesisSupported();
    const llm = loadAtlasLlmConfig();
    this.root.innerHTML = `
      <details class="atlas-details" open>
        <summary class="atlas-summary">
          <span class="atlas-title">ATLAS</span>
          <span class="atlas-sub">decision agent · navigate · talk</span>
        </summary>
        <div class="atlas-body">
          <p class="atlas-hint">Decision surface: <em>floor 50</em> · <em>cheapest eligible</em> · <em>cinema on</em> · <em>pin Claude</em> · <em>open weights only</em> · <em>task economy</em> · <em>reset scope</em>. Navigation auto-applies; floor/filters need Apply. Optional BYOK LLM / NUCBox (local Vite). Voice: <strong>Kokoro</strong>. <span data-atlas-voice-name></span></p>
          <p class="atlas-llm-status" data-atlas-llm-status>${esc(describeAtlasLlmConfig(llm))}</p>
          <div class="atlas-row">
            <input type="text" class="atlas-input" data-atlas-input placeholder="Ask Atlas…" autocomplete="off" aria-label="Atlas command" />
            <button type="button" class="atlas-btn" data-atlas-run title="Run">Go</button>
            <button type="button" class="atlas-btn atlas-mic" data-atlas-mic ${stt ? "" : "disabled"} title="${stt ? "Hold to talk" : "Mic not supported"}" aria-pressed="false">Mic</button>
            <button type="button" class="atlas-btn atlas-speak" data-atlas-mute title="Toggle male voice replies" aria-pressed="${isAtlasVoiceMuted() ? "true" : "false"}">${tts ? (isAtlasVoiceMuted() ? "Muted" : "Talk") : "No TTS"}</button>
          </div>
          <details class="atlas-llm-details">
            <summary class="atlas-llm-summary">LLM endpoint (BYOK / NUCBox)</summary>
            <div class="atlas-llm-form">
              <div class="atlas-actions">
                <button type="button" class="atlas-btn primary" data-atlas-llm-nucbox title="Same-origin proxy → NUCBox Unsloth Ornith">NUCBox Unsloth</button>
              </div>
              <label class="atlas-field">
                <span>Use LLM</span>
                <input type="checkbox" data-atlas-llm-enabled ${llm.enabled ? "checked" : ""} />
              </label>
              <label class="atlas-field">
                <span>Protocol</span>
                <select data-atlas-llm-protocol aria-label="API protocol">
                  <option value="openai" ${llm.protocol === "openai" ? "selected" : ""}>OpenAI-compatible</option>
                  <option value="anthropic" ${llm.protocol === "anthropic" ? "selected" : ""}>Anthropic-compatible</option>
                </select>
              </label>
              <label class="atlas-field">
                <span>Base URL</span>
                <input type="text" class="atlas-input atlas-input-full" data-atlas-llm-base placeholder="/api/atlas/llm/v1 or https://openrouter.ai/api/v1" value="${esc(llm.baseUrl)}" autocomplete="off" spellcheck="false" />
              </label>
              <label class="atlas-field">
                <span>Model</span>
                <input type="text" class="atlas-input atlas-input-full" data-atlas-llm-model placeholder="SC117/Ornith-1.0-35B-MTP-APEX-GGUF" value="${esc(llm.model)}" autocomplete="off" spellcheck="false" />
              </label>
              <label class="atlas-field">
                <span>API key</span>
                <input type="password" class="atlas-input atlas-input-full" data-atlas-llm-key placeholder="proxy (Vite) or your key" value="${esc(llm.apiKey)}" autocomplete="off" spellcheck="false" />
              </label>
              <p class="atlas-llm-help">NUCBox Unsloth uses same-origin <code>/api/atlas/llm/v1</code> (Vite injects the agent key from <code>.env.local</code> — run <code>node scripts/wire-atlas-nucbox.mjs</code> once). Direct browser→:8890 is blocked (no CORS). Any other OpenAI/Anthropic-compatible host still works with BYOK.</p>
              <div class="atlas-actions">
                <button type="button" class="atlas-btn primary" data-atlas-llm-save>Save</button>
                <button type="button" class="atlas-btn" data-atlas-llm-clear>Clear</button>
              </div>
            </div>
          </details>
          <div class="atlas-trace" data-atlas-trace hidden></div>
          <div class="atlas-proposal" data-atlas-proposal hidden></div>
        </div>
      </details>
    `;
    this.bind();
  }

  private bind() {
    const input = this.root.querySelector<HTMLInputElement>("[data-atlas-input]");
    const run = this.root.querySelector("[data-atlas-run]");
    const mic = this.root.querySelector<HTMLButtonElement>("[data-atlas-mic]");
    const mute = this.root.querySelector<HTMLButtonElement>("[data-atlas-mute]");
    const saveLlm = this.root.querySelector("[data-atlas-llm-save]");
    const clearLlm = this.root.querySelector("[data-atlas-llm-clear]");
    const nucbox = this.root.querySelector("[data-atlas-llm-nucbox]");

    run?.addEventListener("click", () => void this.submit(input?.value ?? ""));
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void this.submit(input.value);
      }
    });

    mute?.addEventListener("click", () => {
      const next = !isAtlasVoiceMuted();
      setAtlasVoiceMuted(next);
      if (next) stopAtlasSpeech();
      mute.setAttribute("aria-pressed", String(next));
      mute.textContent = next ? "Muted" : "Talk";
    });

    saveLlm?.addEventListener("click", () => this.saveLlmFromForm());
    clearLlm?.addEventListener("click", () => {
      clearAtlasLlmConfig();
      this.renderShell();
      void loadAtlasVoices().then(() => this.refreshVoiceLabel());
    });
    nucbox?.addEventListener("click", () => {
      applyAtlasLlmPreset("nucbox-unsloth");
      // Re-render so form fields show preset (apiKey stays "proxy").
      this.renderShell();
      void loadAtlasVoices().then(() => this.refreshVoiceLabel());
      const status = this.root.querySelector("[data-atlas-llm-status]");
      if (status) {
        status.textContent = `Saved · ${describeAtlasLlmConfig(ATLAS_PRESET_NUCBOX_UNSLOTH)}`;
      }
    });

    // Push-to-talk: mousedown start, mouseup stop
    mic?.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this.startListen(mic);
    });
    mic?.addEventListener("mouseup", () => this.stopListen(mic));
    mic?.addEventListener("mouseleave", () => this.stopListen(mic));
    mic?.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.startListen(mic);
    }, { passive: false });
    mic?.addEventListener("touchend", () => this.stopListen(mic));
  }

  private readLlmForm(): AtlasLlmConfig {
    const enabled = this.root.querySelector<HTMLInputElement>("[data-atlas-llm-enabled]")?.checked ?? false;
    const protocolRaw =
      this.root.querySelector<HTMLSelectElement>("[data-atlas-llm-protocol]")?.value ?? "openai";
    const baseUrl =
      this.root.querySelector<HTMLInputElement>("[data-atlas-llm-base]")?.value ?? "";
    const model =
      this.root.querySelector<HTMLInputElement>("[data-atlas-llm-model]")?.value ?? "";
    const apiKey =
      this.root.querySelector<HTMLInputElement>("[data-atlas-llm-key]")?.value ?? "";
    return normalizeAtlasLlmConfig({
      enabled,
      protocol: protocolRaw === "anthropic" ? "anthropic" : "openai",
      baseUrl,
      model,
      apiKey,
    });
  }

  private saveLlmFromForm() {
    const cfg = this.readLlmForm();
    saveAtlasLlmConfig(cfg);
    const status = this.root.querySelector("[data-atlas-llm-status]");
    if (status) {
      status.textContent = isAtlasLlmReady(cfg)
        ? `Saved · ${describeAtlasLlmConfig(cfg)}`
        : `Saved · ${describeAtlasLlmConfig(cfg)} (offline until complete)`;
    }
  }

  private startListen(mic: HTMLButtonElement) {
    if (this.listening) return;
    this.listening = true;
    mic.classList.add("is-listening");
    mic.setAttribute("aria-pressed", "true");
    this.listenHandle = listenAtlasOnce(
      (t) => {
        const input = this.root.querySelector<HTMLInputElement>("[data-atlas-input]");
        if (input) input.value = t;
        this.stopListen(mic);
        void this.submit(t);
      },
      (err) => {
        this.showTrace([{ name: "mic", ok: false, detail: err }]);
        this.stopListen(mic);
      },
    );
  }

  private stopListen(mic: HTMLButtonElement) {
    this.listenHandle?.stop();
    this.listenHandle = null;
    this.listening = false;
    mic.classList.remove("is-listening");
    mic.setAttribute("aria-pressed", "false");
  }

  private async submit(raw: string) {
    const text = raw.trim();
    if (!text) return;
    const proposal = await runAtlasTurn(text, this.ctx(), { speak: !isAtlasVoiceMuted() });
    this.showTrace(proposal.tool_trace ?? []);
    if (!validateProposal(proposal)) {
      this.pending = null;
      this.showProposal(proposal as AtlasProposal);
      return;
    }
    this.pending = proposal;
    this.showTrace(proposal.tool_trace);
    // Host owns impact — ignore model-supplied auto_apply for floor/filters.
    if (shouldAutoApplyProposal(proposal)) {
      this.applyPending({ auto: true });
    } else {
      this.showProposal(proposal);
    }
  }

  private showTrace(trace: { name: string; ok: boolean; detail?: string }[]) {
    const el = this.root.querySelector<HTMLElement>("[data-atlas-trace]");
    if (!el) return;
    if (!trace.length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = trace
      .map(
        (t) =>
          `<span class="atlas-chip ${t.ok ? "ok" : "bad"}" title="${esc(t.detail ?? "")}">${esc(t.name)}${t.detail ? ` · ${esc(t.detail)}` : ""}</span>`,
      )
      .join("");
  }

  private showProposal(p: AtlasProposal) {
    const el = this.root.querySelector<HTMLElement>("[data-atlas-proposal]");
    if (!el) return;
    el.hidden = false;
    const shortlist =
      p.shortlist_ids?.map((id) => esc(displayName(id))).join(" · ") ?? "";
    const canApply = proposalHasApplyableChanges(p);
    el.innerHTML = `
      <p class="atlas-summary-text">${esc(p.summary)}</p>
      ${p.refuse_reason ? `<p class="atlas-refuse">${esc(p.refuse_reason)}</p>` : ""}
      ${shortlist ? `<p class="atlas-shortlist"><strong>Shortlist</strong> ${shortlist}</p>` : ""}
      ${p.floor != null ? `<p class="atlas-meta">Floor → <strong>${p.floor}</strong></p>` : ""}
      <div class="atlas-actions">
        <button type="button" class="atlas-btn primary" data-atlas-apply ${canApply ? "" : "disabled"}>Apply</button>
        <button type="button" class="atlas-btn" data-atlas-dismiss>Dismiss</button>
      </div>
    `;
    el.querySelector("[data-atlas-apply]")?.addEventListener("click", () => this.applyPending());
    el.querySelector("[data-atlas-dismiss]")?.addEventListener("click", () => {
      this.pending = null;
      el.hidden = true;
      stopAtlasSpeech();
    });
  }

  private applyPending(opts?: { auto?: boolean }) {
    const p = this.pending;
    if (!p || !validateProposal(p)) return;
    const prev = this.store.getState();
    this.undoState = {
      ...prev,
      weights: { ...prev.weights },
      axisMapping: { ...prev.axisMapping },
      filters: {
        ...prev.filters,
        providers: [...prev.filters.providers],
        families: [...prev.filters.families],
      },
    };
    const { appliedKeys } = applyProposalToStore(this.store, p);
    this.pending = null;
    const box = this.root.querySelector<HTMLElement>("[data-atlas-proposal]");
    if (box) {
      box.hidden = false;
      const mode = opts?.auto ? "Applied" : "Applied";
      box.innerHTML = `
        <p class="atlas-summary-text">${mode}. ${esc(p.summary)}</p>
        ${appliedKeys.length ? `<p class="atlas-meta">Changed: ${esc(appliedKeys.join(", "))}</p>` : ""}
        <div class="atlas-actions">
          <button type="button" class="atlas-btn" data-atlas-undo>Undo</button>
          <button type="button" class="atlas-btn" data-atlas-dismiss>Dismiss</button>
        </div>`;
      box.querySelector("[data-atlas-undo]")?.addEventListener("click", () => this.undoLast());
      box.querySelector("[data-atlas-dismiss]")?.addEventListener("click", () => {
        box.hidden = true;
        stopAtlasSpeech();
      });
    }
  }

  private undoLast() {
    if (!this.undoState) return;
    const u = this.undoState;
    this.store.replace({
      weights: u.weights,
      axisMapping: u.axisMapping,
      filters: u.filters,
      hoveredModelId: u.hoveredModelId,
      pinnedModelId: u.pinnedModelId,
      cinemaMode: u.cinemaMode,
      decideMode: u.decideMode,
      intelligenceFloor: u.intelligenceFloor,
      costSpeedBias: u.costSpeedBias,
      floorAnchorModelId: u.floorAnchorModelId,
      floorSource: u.floorSource,
      floorUserSet: u.floorUserSet,
    });
    this.undoState = null;
    const box = this.root.querySelector<HTMLElement>("[data-atlas-proposal]");
    if (box) {
      box.hidden = false;
      box.innerHTML = `<p class="atlas-summary-text">Undid last Atlas apply.</p>`;
    }
  }

  private syncFromStore() {
    /* reserved for live floor badge */
  }

  private refreshVoiceLabel() {
    const el = this.root.querySelector("[data-atlas-voice-name]");
    if (!el) return;
    el.textContent =
      getActiveAtlasVoiceName() ??
      "Kokoro OSS neural male (free, first load downloads model) · browser fallback";
  }
}
