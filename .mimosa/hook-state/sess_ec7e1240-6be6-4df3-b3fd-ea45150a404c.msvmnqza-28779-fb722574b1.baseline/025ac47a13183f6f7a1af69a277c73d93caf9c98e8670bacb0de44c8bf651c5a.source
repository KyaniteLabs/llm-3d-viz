/**
 * Atlas turn runner: offline path default; optional OpenAI/Anthropic-compatible LLM.
 */

import type { AtlasAgentContext, AtlasProposal } from "./types";
import { runOfflineAtlas } from "./offline-router";
import { speakAtlas } from "./voice";
import {
  isAtlasLlmReady,
  loadAtlasLlmConfig,
  type AtlasLlmConfig,
} from "./llm-config";
import { runLlmAtlas } from "./llm-loop";

export interface AtlasTurnOptions {
  /** Speak the summary after the turn. */
  speak?: boolean;
  /**
   * Override LLM config (tests). When omitted, loads from localStorage.
   * Keys must never be committed — runtime/localStorage only.
   */
  llm?: AtlasLlmConfig | null;
  /** Inject fetch for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * After an LLM failure, skip re-attempting the endpoint for this window so a
 * persistently-down host (e.g. NUCBox Unsloth offline) doesn't penalize every
 * turn with a timeout. The offline router (Phase-1 smart) answers meanwhile.
 */
const LLM_BACKOFF_MS = 60_000;
let lastLlmFailureAt = 0;

/**
 * Execute one Atlas turn.
 * - If LLM config is ready (enabled + base URL + model + key): tool-calling loop
 *   over OpenAI-compatible or Anthropic-compatible endpoints (any host).
 * - On LLM failure or incomplete config: offline multi-step router.
 */
export async function runAtlasTurn(
  utterance: string,
  ctx: AtlasAgentContext,
  opts: AtlasTurnOptions = {},
): Promise<AtlasProposal> {
  const cfg = opts.llm === undefined ? loadAtlasLlmConfig() : opts.llm;
  let proposal: AtlasProposal;
  const llmReady = cfg && isAtlasLlmReady(cfg) && Date.now() - lastLlmFailureAt > LLM_BACKOFF_MS;

  if (llmReady) {
    try {
      proposal = await runLlmAtlas(utterance, ctx, cfg!, {
        fetchImpl: opts.fetchImpl,
      });
    } catch (err) {
      lastLlmFailureAt = Date.now();
      const detail = err instanceof Error ? err.message : String(err);
      const offline = runOfflineAtlas(utterance, ctx);
      proposal = {
        ...offline,
        summary: `${offline.summary} (LLM unavailable — offline fallback: ${detail.slice(0, 120)})`,
        tool_trace: [
          { name: "llm", ok: false, detail: detail.slice(0, 200) },
          ...offline.tool_trace,
        ],
      };
    }
  } else {
    proposal = runOfflineAtlas(utterance, ctx);
  }

  if (opts.speak !== false && proposal.summary) {
    speakAtlas(proposal.summary);
  }
  return proposal;
}
