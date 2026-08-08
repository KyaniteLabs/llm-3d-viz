import { describe, expect, it, vi } from "vitest";
import type { Model } from "../src/data/models";
import {
  isAtlasLlmReady,
  normalizeAtlasLlmConfig,
  describeAtlasLlmConfig,
  ATLAS_PRESET_NUCBOX_UNSLOTH,
  usesProxyAuth,
} from "../src/lib/atlas-agent/llm-config";
import { anthropicMessagesUrl, runLlmAtlas } from "../src/lib/atlas-agent/llm-loop";
import { dispatchAtlasTool } from "../src/lib/atlas-agent/tool-dispatch";
import { runAtlasTurn } from "../src/lib/atlas-agent/controller";
import type { AtlasAgentContext } from "../src/lib/atlas-agent/types";
import { validateProposal } from "../src/lib/atlas-agent/types";
import { DEFAULT_FILTERS } from "../src/lib/filters";

function m(
  name: string,
  iq: number | null,
  tps: number | null,
  price: number | null,
): Model {
  return {
    model: name,
    provider: "Test",
    openness: "closed",
    modality: ["text"],
    context_length: 128000,
    release_date: "2026-06-01",
    source_url: "https://example.test",
    tps,
    ttft: 100,
    price_in_per_M: price,
    price_out_per_M: price,
    blended_price_per_M: price,
    aa_intelligence_index: iq,
    arena_elo: null,
    gpqa: null,
    swe_bench: null,
    aider_pct: null,
    data_date: "2026-08-01",
    source: "test",
    reasoning: true,
  };
}

const catalog = [
  m("Fast Cheap", 55, 200, 1),
  m("Slow Smart", 62, 40, 10),
  m("Mid", 48, 100, 3),
];

function ctx(floor = 50): AtlasAgentContext {
  return {
    catalog,
    visible: catalog,
    floor,
    costSpeedBias: 0,
    catalogSnapshotId: "cat_test",
    filters: { ...DEFAULT_FILTERS },
  };
}

// silence TTS during controller tests
vi.mock("../src/lib/atlas-agent/voice", () => ({
  speakAtlas: () => undefined,
}));

describe("atlas llm config", () => {
  it("treats protocol as wire format, not vendor lock-in", () => {
    const openaiish = normalizeAtlasLlmConfig({
      enabled: true,
      protocol: "openai",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "llama3.2",
      apiKey: "ollama",
    });
    expect(isAtlasLlmReady(openaiish)).toBe(true);
    expect(describeAtlasLlmConfig(openaiish)).toMatch(/openai/);
    expect(describeAtlasLlmConfig(openaiish)).toMatch(/llama3\.2/);

    const anth = normalizeAtlasLlmConfig({
      enabled: true,
      protocol: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-20250514",
      apiKey: "sk-ant-test",
    });
    expect(isAtlasLlmReady(anth)).toBe(true);
  });

  it("is not ready without key or base", () => {
    expect(
      isAtlasLlmReady(
        normalizeAtlasLlmConfig({
          enabled: true,
          protocol: "openai",
          baseUrl: "https://openrouter.ai/api/v1",
          model: "x",
          apiKey: "",
        }),
      ),
    ).toBe(false);
  });

  it("NUCBox Unsloth preset is ready via same-origin proxy auth", () => {
    expect(usesProxyAuth(ATLAS_PRESET_NUCBOX_UNSLOTH)).toBe(true);
    expect(isAtlasLlmReady(ATLAS_PRESET_NUCBOX_UNSLOTH)).toBe(true);
    expect(ATLAS_PRESET_NUCBOX_UNSLOTH.baseUrl).toBe("/api/atlas/llm/v1");
    expect(ATLAS_PRESET_NUCBOX_UNSLOTH.protocol).toBe("openai");
    expect(ATLAS_PRESET_NUCBOX_UNSLOTH.model).toMatch(/Ornith/);
  });
});

describe("tool dispatch finish_turn", () => {
  it("builds a confirmable proposal from finish_turn", () => {
    const out = dispatchAtlasTool(
      "finish_turn",
      {
        summary: "Floor 55. Shortlist Fast Cheap.",
        floor: 55,
        shortlist_ids: ["Fast Cheap"],
        decide_mode: true,
        needs_confirm: true,
      },
      ctx(),
    );
    expect(out.kind).toBe("finish");
    if (out.kind !== "finish") return;
    expect(validateProposal(out.proposal)).toBe(true);
    expect(out.proposal.floor).toBe(55);
    expect(out.proposal.shortlist_ids?.[0]).toBe("Fast Cheap");
  });
});

describe("openai-compatible llm loop", () => {
  it("runs tools then finish_turn against any openai-shaped host", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      calls += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages: Array<{ role: string; tool_calls?: unknown[] }>;
      };
      if (calls === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "c1",
                      type: "function",
                      function: {
                        name: "rank_eligible",
                        arguments: JSON.stringify({
                          floor: 50,
                          objective: "min_cost",
                          n: 3,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      // second round: finish
      expect(body.messages.some((m) => m.role === "tool")).toBe(true);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "c2",
                    type: "function",
                    function: {
                      name: "finish_turn",
                      arguments: JSON.stringify({
                        summary: "Cheapest at floor 50: Fast Cheap.",
                        floor: 50,
                        shortlist_ids: ["Fast Cheap"],
                        decide_mode: true,
                        needs_confirm: true,
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const p = await runLlmAtlas(
      "cheapest eligible",
      ctx(50),
      {
        enabled: true,
        protocol: "openai",
        baseUrl: "https://my-proxy.example/v1",
        apiKey: "k",
        model: "any-model",
        maxToolRounds: 6,
      },
      { fetchImpl },
    );
    expect(validateProposal(p)).toBe(true);
    expect(p.shortlist_ids?.[0]).toBe("Fast Cheap");
    expect(p.tool_trace.some((t) => t.name === "rank_eligible" && t.ok)).toBe(true);
    expect(fetchImpl).toHaveBeenCalled();
    const firstUrl = String((fetchImpl.mock.calls[0] as unknown[])[0]);
    expect(firstUrl).toBe("https://my-proxy.example/v1/chat/completions");
  });
});

describe("anthropic URL join", () => {
  it("accepts host root, /v1, or full /messages", () => {
    expect(anthropicMessagesUrl("https://api.anthropic.com")).toBe(
      "https://api.anthropic.com/v1/messages",
    );
    expect(anthropicMessagesUrl("https://api.anthropic.com/v1")).toBe(
      "https://api.anthropic.com/v1/messages",
    );
    expect(anthropicMessagesUrl("https://proxy.example/v1/messages")).toBe(
      "https://proxy.example/v1/messages",
    );
  });
});

describe("anthropic-compatible llm loop", () => {
  it("uses /messages and tool_use / tool_result blocks", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      calls += 1;
      expect(String(url)).toMatch(/\/messages$/);
      if (calls === 1) {
        return new Response(
          JSON.stringify({
            content: [
              {
                type: "tool_use",
                id: "tu1",
                name: "propose_floor",
                input: { floor: 50 },
              },
            ],
            stop_reason: "tool_use",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          content: [
            {
              type: "tool_use",
              id: "tu2",
              name: "finish_turn",
              input: {
                summary: "Floor 50 set.",
                floor: 50,
                needs_confirm: true,
                decide_mode: true,
              },
            },
          ],
          stop_reason: "tool_use",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const p = await runLlmAtlas(
      "floor 50",
      ctx(40),
      {
        enabled: true,
        protocol: "anthropic",
        baseUrl: "https://compat.example/v1",
        apiKey: "k",
        model: "claude-compat",
        maxToolRounds: 6,
      },
      { fetchImpl },
    );
    expect(p.floor).toBe(50);
    expect(p.summary).toMatch(/Floor 50/);
  });
});

describe("runAtlasTurn llm fallback", () => {
  it("falls back to offline when LLM HTTP fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    const p = await runAtlasTurn("floor 50", ctx(40), {
      speak: false,
      llm: {
        enabled: true,
        protocol: "openai",
        baseUrl: "https://dead.example/v1",
        apiKey: "k",
        model: "x",
        maxToolRounds: 4,
      },
      fetchImpl,
    });
    expect(p.floor).toBe(50);
    expect(p.tool_trace.some((t) => t.name === "llm" && !t.ok)).toBe(true);
    expect(p.summary).toMatch(/offline fallback/i);
  });

  it("stays offline when LLM disabled", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const p = await runAtlasTurn("floor 50", ctx(40), {
      speak: false,
      llm: {
        enabled: false,
        protocol: "openai",
        baseUrl: "https://example/v1",
        apiKey: "k",
        model: "x",
        maxToolRounds: 4,
      },
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(p.floor).toBe(50);
  });
});

describe("runAtlasTurn LLM backoff", () => {
  it("skips re-attempting the LLM for the backoff window after a failure", async () => {
    // Fresh controller module → reset module-level backoff state.
    vi.resetModules();
    const { runAtlasTurn: freshTurn } = await import("../src/lib/atlas-agent/controller");
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503})) as unknown as typeof fetch;
    const llm = {
      enabled: true,
      protocol: "openai" as const,
      baseUrl: "https://dead.example/v1",
      apiKey: "k",
      model: "x",
      maxToolRounds: 2,
    };
    // First turn: LLM attempted (and fails) → sets backoff.
    await freshTurn("floor 50", ctx(40), { speak: false, llm, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Second turn within the backoff window → LLM NOT re-attempted (straight to offline).
    await freshTurn("floor 50", ctx(40), { speak: false, llm, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
