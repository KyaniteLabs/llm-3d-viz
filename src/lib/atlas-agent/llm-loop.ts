/**
 * Atlas LLM tool loop over OpenAI-compatible or Anthropic-compatible HTTP APIs.
 * Provider-agnostic: only the wire protocol matters.
 */

import type { AtlasLlmConfig } from "./llm-config";
import {
  ATLAS_SYSTEM_PROMPT,
  anthropicToolsPayload,
  dispatchAtlasTool,
  openaiToolsPayload,
} from "./tool-dispatch";
import type { AtlasAgentContext, AtlasProposal, AtlasToolTrace } from "./types";
import { emptyProposal } from "./types";

export interface LlmLoopDeps {
  fetchImpl?: typeof fetch;
}

/** Per-request timeout for the LLM endpoint — fail fast so a dead endpoint
 *  triggers offline fallback instead of hanging the turn. */
const ATLAS_LLM_TIMEOUT_MS = 45_000;

type OpenAiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface OpenAiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type AnthropicContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage =
  | { role: "user"; content: string | AnthropicContent[] }
  | { role: "assistant"; content: AnthropicContent[] };

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  // If base already ends with /v1 and path is /v1/..., don't double.
  if (b.endsWith("/v1") && p.startsWith("/v1/")) {
    return `${b}${p.slice(3)}`;
  }
  return `${b}${p}`;
}

function authHeaders(cfg: AtlasLlmConfig): Record<string, string> {
  const key = cfg.apiKey.trim();
  // Same-origin proxy may inject the real key; still send a Bearer so
  // upstreams that require the header are satisfied when not rewritten.
  if (!key || key.toLowerCase() === "proxy" || key.toLowerCase() === "local") {
    return { Authorization: "Bearer proxy" };
  }
  return { Authorization: `Bearer ${key}` };
}

/** Resolve Anthropic-compatible messages endpoint from a flexible base URL. */
export function anthropicMessagesUrl(base: string): string {
  const b = base.replace(/\/+$/, "");
  if (b.endsWith("/messages")) return b;
  if (b.endsWith("/v1")) return `${b}/messages`;
  return `${b}/v1/messages`;
}

function parseArgsJson(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return { _parse_error: raw };
  }
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 400) || res.statusText;
  } catch {
    return res.statusText;
  }
}

/**
 * Run multi-step tool loop. Throws on transport/protocol errors.
 */
export async function runLlmAtlas(
  utterance: string,
  ctx: AtlasAgentContext,
  cfg: AtlasLlmConfig,
  deps: LlmLoopDeps = {},
): Promise<AtlasProposal> {
  // Wrap the fetch with a per-request timeout so a dead/unreachable endpoint
  // (e.g. NUCBox Unsloth offline) fails fast instead of hanging the turn — the
  // controller then falls back to the offline router.
  const baseFetch = deps.fetchImpl ?? fetch;
  const timedFetch: typeof fetch = (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATLAS_LLM_TIMEOUT_MS);
    return baseFetch(input, { ...init, signal: controller.signal }).finally(() =>
      clearTimeout(timer),
    );
  };
  const traces: AtlasToolTrace[] = [
    {
      name: "llm",
      ok: true,
      detail: `${cfg.protocol} · ${cfg.model}`,
    },
  ];

  if (cfg.protocol === "anthropic") {
    return runAnthropicLoop(utterance, ctx, cfg, timedFetch, traces);
  }
  return runOpenAiLoop(utterance, ctx, cfg, timedFetch, traces);
}

async function runOpenAiLoop(
  utterance: string,
  ctx: AtlasAgentContext,
  cfg: AtlasLlmConfig,
  fetchImpl: typeof fetch,
  traces: AtlasToolTrace[],
): Promise<AtlasProposal> {
  const url = joinUrl(cfg.baseUrl, "/chat/completions");
  const messages: OpenAiMessage[] = [
    { role: "system", content: ATLAS_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Current floor: ${ctx.floor}. Cost/speed bias: ${ctx.costSpeedBias}. Snapshot: ${ctx.catalogSnapshotId}.\nUser: ${utterance}`,
    },
  ];

  for (let round = 0; round < cfg.maxToolRounds; round++) {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(cfg),
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        tools: openaiToolsPayload(),
        tool_choice: "auto",
        temperature: 0.2,
        // Ornith / local servers often need an explicit cap.
        max_tokens: 1024,
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI-compatible HTTP ${res.status}: ${await readErrorBody(res)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          /** Ornith / some Qwen-class servers put draft thinking here. */
          reasoning_content?: string | null;
          tool_calls?: OpenAiToolCall[];
        };
        finish_reason?: string;
      }>;
    };
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error("OpenAI-compatible response missing choices[0].message");

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // Prefer spoken content; fall back to reasoning_content (Ornith sticky path).
      const text = (msg.content ?? msg.reasoning_content ?? "").trim();
      if (!text) {
        throw new Error("Model returned empty content without tools");
      }
      // Soft finish without finish_turn
      return emptyProposal(ctx.catalogSnapshotId, text, {
        needs_confirm: false,
        tool_trace: [
          ...traces,
          { name: "llm_text", ok: true, detail: "no finish_turn" },
        ],
      });
    }

    messages.push({
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const name = call.function?.name ?? "";
      const args = parseArgsJson(call.function?.arguments ?? "{}");
      const outcome = dispatchAtlasTool(name, args, ctx);
      traces.push(outcome.trace);
      if (outcome.kind === "finish") {
        return {
          ...outcome.proposal,
          tool_trace: [...traces.filter((t) => t.name !== "finish_turn"), ...outcome.proposal.tool_trace],
        };
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(outcome.content),
      });
    }
  }

  throw new Error(`Exceeded max tool rounds (${cfg.maxToolRounds})`);
}

async function runAnthropicLoop(
  utterance: string,
  ctx: AtlasAgentContext,
  cfg: AtlasLlmConfig,
  fetchImpl: typeof fetch,
  traces: AtlasToolTrace[],
): Promise<AtlasProposal> {
  // Official Anthropic: {host}/v1/messages. Proxies may already end in /v1 or /messages.
  const url = anthropicMessagesUrl(cfg.baseUrl);

  const messages: AnthropicMessage[] = [
    {
      role: "user",
      content: `Current floor: ${ctx.floor}. Cost/speed bias: ${ctx.costSpeedBias}. Snapshot: ${ctx.catalogSnapshotId}.\nUser: ${utterance}`,
    },
  ];

  for (let round = 0; round < cfg.maxToolRounds; round++) {
    const key = cfg.apiKey.trim();
    const realKey =
      !key || key.toLowerCase() === "proxy" || key.toLowerCase() === "local"
        ? "proxy"
        : key;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": realKey,
        Authorization: `Bearer ${realKey}`,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 2048,
        system: ATLAS_SYSTEM_PROMPT,
        messages,
        tools: anthropicToolsPayload(),
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic-compatible HTTP ${res.status}: ${await readErrorBody(res)}`);
    }
    const data = (await res.json()) as {
      content?: AnthropicContent[];
      stop_reason?: string;
    };
    const content = data.content ?? [];
    const toolUses = content.filter(
      (c): c is Extract<AnthropicContent, { type: "tool_use" }> => c.type === "tool_use",
    );

    if (toolUses.length === 0) {
      const text = content
        .filter((c): c is Extract<AnthropicContent, { type: "text" }> => c.type === "text")
        .map((c) => c.text)
        .join("\n")
        .trim();
      if (!text) throw new Error("Anthropic-compatible response had no tools and no text");
      return emptyProposal(ctx.catalogSnapshotId, text, {
        needs_confirm: false,
        tool_trace: [
          ...traces,
          { name: "llm_text", ok: true, detail: "no finish_turn" },
        ],
      });
    }

    messages.push({ role: "assistant", content });

    const toolResults: AnthropicContent[] = [];
    for (const use of toolUses) {
      const outcome = dispatchAtlasTool(use.name, use.input, ctx);
      traces.push(outcome.trace);
      if (outcome.kind === "finish") {
        return {
          ...outcome.proposal,
          tool_trace: [...traces.filter((t) => t.name !== "finish_turn"), ...outcome.proposal.tool_trace],
        };
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: JSON.stringify(outcome.content),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`Exceeded max tool rounds (${cfg.maxToolRounds})`);
}
