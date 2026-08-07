import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

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
