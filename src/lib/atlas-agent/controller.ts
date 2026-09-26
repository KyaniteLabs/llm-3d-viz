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

  if (cfg && isAtlasLlmReady(cfg)) {
    try {
      proposal = await runLlmAtlas(utterance, ctx, cfg, {
        fetchImpl: opts.fetchImpl,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const offline = runOfflineAtlas(utterance, ctx);
      proposal = {
        ...offline,
        summary: `${offline.summary} (LLM failed — offline fallback: ${detail.slice(0, 120)})`,
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
