#!/usr/bin/env npx tsx
/**
 * Atlas MCP server (stdio, JSON-RPC 2.0).
 * Exposes the same pure catalog tools as Atlas in-app and atlas-cli.
 *
 * Client config example (Claude / Cursor):
 * {
 *   "mcpServers": {
 *     "atlas": {
 *       "command": "npx",
 *       "args": ["tsx", "bin/atlas-mcp-server.ts"],
 *       "cwd": "/path/to/llm-3d-viz"
 *     }
 *   }
 * }
 */

import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Model } from "../src/data/models";
import { DEFAULT_FILTERS } from "../src/lib/filters";
import { catalogSnapshotIdSyncForTests } from "../src/lib/decide";
import type { AtlasAgentContext } from "../src/lib/atlas-agent/types";
import {
  ATLAS_TOOL_DEFINITIONS,
  dispatchAtlasTool,
} from "../src/lib/atlas-agent/tool-dispatch";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_PATH = (() => {
  const preferred =
    process.env.ATLAS_CATALOG_PATH?.trim() ||
    resolve(ROOT, "data/atlas-catalog-snapshot.json");
  const fallback = resolve(ROOT, "data/models.v0.draft.json");
  try {
    readFileSync(preferred);
    return preferred;
  } catch {
    return fallback;
  }
})();

const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as Model[];
const snapshotId = catalogSnapshotIdSyncForTests(catalog);
const baseCtx: AtlasAgentContext = {
  catalog,
  visible: catalog,
  floor: 50,
  costSpeedBias: 0,
  catalogSnapshotId: snapshotId,
  filters: { ...DEFAULT_FILTERS },
};

function toolsList() {
  return {
    tools: ATLAS_TOOL_DEFINITIONS.filter((t) =>
      ![
        "set_filters",
        "set_decide",
        "set_view",
        "set_axes",
        "set_weights",
        "focus_model",
        "reset_scope",
        "finish_turn",
        "get_app_state",
      ].includes(t.name),
    ).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters,
    })),
  };
}

// Also expose control tools for local hosts that want full surface
function toolsListFull() {
  return {
    tools: ATLAS_TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters,
    })),
  };
}

const FULL = process.env.ATLAS_MCP_FULL === "1";

type JsonRpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function respond(id: string | number | null | undefined, result: unknown) {
  const msg = { jsonrpc: "2.0", id: id ?? null, result };
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function respondError(
  id: string | number | null | undefined,
  code: number,
  message: string,
) {
  const msg = {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  };
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

async function handle(msg: JsonRpc) {
  const method = msg.method ?? "";
  const id = msg.id;

  // Notifications (no id response)
  if (id === undefined && method.startsWith("notifications/")) {
    return;
  }

  try {
    switch (method) {
      case "initialize": {
        const requested = String(
          (msg.params as { protocolVersion?: string } | undefined)?.protocolVersion ??
            "2024-11-05",
        );
        // Echo client version when present; fall back to stable baseline.
        const protocolVersion =
          requested.startsWith("2024-") ||
          requested.startsWith("2025-") ||
          requested.startsWith("2026-")
            ? requested
            : "2024-11-05";
        respond(id, {
          protocolVersion,
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
          },
          serverInfo: {
            name: "atlas-observatory",
            version: "0.1.0",
          },
        });
        return;
      }
      case "ping":
        respond(id, {});
        return;
      case "tools/list":
        respond(id, FULL ? toolsListFull() : toolsList());
        return;
      case "tools/call": {
        const name = String(msg.params?.name ?? "");
        const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
        const floor =
          typeof args.floor === "number" ? args.floor : baseCtx.floor;
        const ctx: AtlasAgentContext = { ...baseCtx, floor };
        const outcome = dispatchAtlasTool(name, args, ctx);
        if (outcome.kind === "finish") {
          respond(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify(outcome.proposal, null, 2),
              },
            ],
            isError: false,
          });
        } else {
          respond(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify(outcome.content, null, 2),
              },
            ],
            isError: !outcome.trace.ok,
          });
        }
        return;
      }
      case "resources/list":
        respond(id, {
          resources: [
            {
              uri: "catalog://snapshot",
              name: "LLM catalog snapshot",
              mimeType: "application/json",
              description: `Curated models (${catalog.length}); nulls preserved`,
            },
            {
              uri: "catalog://meta",
              name: "Catalog meta",
              mimeType: "application/json",
              description: "model_count + FNV snapshot id",
            },
          ],
        });
        return;
      case "resources/read": {
        const uri = String((msg.params as { uri?: string })?.uri ?? "");
        if (uri === "catalog://meta") {
          respond(id, {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify({
                  model_count: catalog.length,
                  catalog_snapshot_id: snapshotId,
                  path: CATALOG_PATH,
                }),
              },
            ],
          });
          return;
        }
        if (uri !== "catalog://snapshot") {
          respondError(id, -32002, `Unknown resource: ${uri}`);
          return;
        }
        respond(id, {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(catalog),
            },
          ],
        });
        return;
      }
      default:
        if (method) {
          respondError(id, -32601, `Method not found: ${method}`);
        }
    }
  } catch (err) {
    respondError(
      id,
      -32603,
      err instanceof Error ? err.message : String(err),
    );
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    void handle(JSON.parse(trimmed) as JsonRpc);
  } catch {
    respondError(null, -32700, "Parse error");
  }
});

// stderr banner (never stdout — stdio is JSON-RPC only)
console.error(
  `[atlas-mcp] ready catalog=${catalog.length} path=${CATALOG_PATH} full=${FULL ? "1" : "0"}`,
);
