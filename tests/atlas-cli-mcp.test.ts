import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function mcp(lines: unknown[], { full = false, catalogPath = "" } = {}) {
  const input = lines.map((line) => typeof line === "string" ? line : JSON.stringify(line)).join("\n");
  const result = spawnSync(process.execPath, ["--import", "tsx", "bin/atlas-mcp-server.ts"], {
    cwd: root,
    encoding: "utf8",
    input: `${input}\n`,
    env: { ...process.env, ATLAS_CATALOG_PATH: catalogPath, ATLAS_MCP_FULL: full ? "1" : "0" },
    timeout: 10_000,
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim().split("\n").map((line) => JSON.parse(line));
}

function request(id: string | number, method: string, params?: object) {
  return { jsonrpc: "2.0", id, method, params };
}

describe("atlas CLI", () => {
  it(
    "meta returns model_count and cat_ snapshot id",
    () => {
      const r = spawnSync("npx", ["tsx", "bin/atlas-cli.ts", "meta"], {
        cwd: root,
        encoding: "utf8",
        timeout: 60_000,
      });
      expect(r.status).toBe(0);
      const j = JSON.parse(r.stdout);
      expect(j.model_count).toBeGreaterThan(10);
      expect(String(j.snapshot)).toMatch(/^cat_/);
    },
    60_000,
  );

  it(
    "get missing exits 2",
    () => {
      const r = spawnSync(
        "npx",
        ["tsx", "bin/atlas-cli.ts", "get", "definitely-not-a-model-xyz-999"],
        { cwd: root, encoding: "utf8", timeout: 60_000 },
      );
      expect(r.status).toBe(2);
    },
    60_000,
  );
});

describe("atlas MCP stdio", () => {
  it("returns protocol errors for invalid requests and continues answering pings", () => {
    const messages = mcp([
      "null", "8", [], {}, { jsonrpc: "2.0", method: 1 },
      { jsonrpc: "2.0", method: "ping", id: true },
      { jsonrpc: "1.0", method: "ping", id: 2 },
      { jsonrpc: "2.0", method: "ping", id: 3, params: "wrong shape" },
      "{",
      { jsonrpc: "2.0", method: "notifications/initialized" },
      request("ping", "ping"),
    ]);
    expect(messages.map((message) => message.error?.code)).toEqual([
      -32600, -32600, -32600, -32600, -32600, -32600, -32600, -32600, -32700, undefined,
    ]);
    expect(messages.at(-1)).toEqual({ jsonrpc: "2.0", id: "ping", result: {} });
  });

  it.each([false, true])("dispatches control tools only when full mode is %s", (full) => {
    const [list, call, ping] = mcp([
      request(1, "tools/list"),
      request(2, "tools/call", { name: "set_view", arguments: { cinema: true } }),
      request(3, "ping"),
    ], { full });
    expect(list.result.tools.some((tool: { name: string }) => tool.name === "set_view")).toBe(full);
    if (full) expect(call.result.isError).toBe(false);
    else expect(call.error.code).toBe(-32602);
    expect(ping.result).toEqual({});
  });

  it("lists the price and intelligence pool and requires measured speed for max_speed", () => {
    const dir = mkdtempSync(join(tmpdir(), "iolite-mcp-"));
    try {
      const catalogPath = join(dir, "catalog.json");
      writeFileSync(catalogPath, JSON.stringify([
        { model: "Measured", provider: "Fixture", aa_intelligence_index: 65, tps: 20, blended_price_per_M: 2 },
        { model: "Speed unknown", provider: "Fixture", aa_intelligence_index: 70, tps: null, blended_price_per_M: 1 },
      ]));
      const results = mcp([
        request(1, "tools/call", { name: "list_eligible", arguments: { floor: 50 } }),
        request(2, "tools/call", { name: "rank_eligible", arguments: { floor: 50, objective: "max_speed" } }),
        request(3, "tools/call", { name: "rank_eligible", arguments: { floor: 70, objective: "max_speed" } }),
        request(4, "tools/call", { name: "rank_eligible", arguments: { floor: 50, objective: "balanced" } }),
      ], { catalogPath });
      const [list, speed, noSpeed, balanced] = results.map(({ result }) => {
        expect(result.isError).toBe(false);
        return JSON.parse(result.content[0].text);
      });
      expect(list.eligible.map((row: { id: string }) => row.id)).toEqual(["Measured", "Speed unknown"]);
      expect(list.excluded_sample).toEqual([]);
      expect(speed).toMatchObject({
        shortlist: [{ id: "Measured", tps: 20 }],
        mode: "cost_speed",
        missing_speed_count: 1,
        message: expect.stringMatching(/excluded.*missing speed/i),
      });
      expect(noSpeed).toMatchObject({
        shortlist: [],
        mode: null,
        missing_speed_count: 1,
        message: expect.stringMatching(/no eligible models have measured speed/i),
      });
      expect(balanced).toMatchObject({
        shortlist: [{ id: "Speed unknown", tps: null }],
        mode: "cost",
        missing_speed_count: 1,
        message: expect.stringMatching(/price and intelligence/i),
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it(
    "initialize + tools/list + rank_eligible",
    () => {
    const input = [
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "vitest", version: "0" },
        },
      }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "rank_eligible",
          arguments: { floor: 50, objective: "min_cost", n: 2 },
        },
      }),
      "",
    ].join("\n");

    const r = spawnSync("npx", ["tsx", "bin/atlas-mcp-server.ts"], {
      cwd: root,
      encoding: "utf8",
      input,
      timeout: 45_000,
    });
    expect(r.status).toBe(0);
    const lines = r.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const init = lines.find((m) => m.id === 1);
    expect(init?.result?.protocolVersion).toBe("2025-06-18");
    expect(init?.result?.serverInfo).toMatchObject({ name: "iolite", version: "0.1.0" });
    const list = lines.find((m) => m.id === 2);
    expect(list?.result?.tools?.some((t: { name: string }) => t.name === "rank_eligible")).toBe(
      true,
    );
    const call = lines.find((m) => m.id === 3);
    const text = call?.result?.content?.[0]?.text ?? "";
    expect(text).toMatch(/shortlist/i);
  },
  60_000,
  );
});
