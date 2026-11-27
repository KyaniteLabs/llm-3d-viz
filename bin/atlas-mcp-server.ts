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
import packageMetadata from "../package.json";
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

const FULL = process.env.ATLAS_MCP_FULL === "1";
const fullModeTools = [
  "set_filters",
  "set_decide",
  "set_view",
  "set_axes",
  "set_weights",
  "focus_model",
  "reset_scope",
  "finish_turn",
  "get_app_state",
];
const exposedTools = ATLAS_TOOL_DEFINITIONS
  .filter(({ name }) => FULL || !fullModeTools.includes(name))
  .map(({ name, description, parameters }) => ({
    name,
    description: name === "rank_eligible" ? `${description} The max_speed objective requires measured speed.` : description,
    inputSchema: parameters,
  }));

type JsonRpc = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

function isRequest(value: unknown): value is JsonRpc {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { jsonrpc, id, method, params } = value as Record<string, unknown>;
  return jsonrpc === "2.0" && typeof method === "string" && method.length > 0 &&
    (id === undefined || id === null || typeof id === "string" || typeof id === "number") &&
    (params === undefined || (typeof params === "object" && params !== null && !Array.isArray(params)));
}

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

function handle({ method, id, params }: JsonRpc) {
  // The stdio server has no notification state and notifications receive no response.
  if (id === undefined) return;

  try {
    switch (method) {
      case "initialize": {
        const requested = String(
          params?.protocolVersion ??
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
            name: packageMetadata.name,
            version: "0.1.0",
          },
        });
        return;
      }
      case "ping":
        respond(id, {});
        return;
      case "tools/list":
        respond(id, { tools: exposedTools });
        return;
      case "tools/call": {
        const name = String(params?.name ?? "");
        if (!exposedTools.some((tool) => tool.name === name)) {
          respondError(id, -32602, `Unknown tool: ${name}`);
          return;
        }
        const args = (params?.arguments ?? {}) as Record<string, unknown>;
        const floor =
          typeof args.floor === "number" ? args.floor : baseCtx.floor;
        const ctx: AtlasAgentContext = { ...baseCtx, floor };
        const outcome = dispatchAtlasTool(name, args, ctx, { requireMeasuredSpeed: true });
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
        const uri = String(params?.uri ?? "");
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
        respondError(id, -32601, `Method not found: ${method}`);
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
  let message: unknown;
  try {
    message = JSON.parse(trimmed);
  } catch {
    respondError(null, -32700, "Parse error");
    return;
  }
  if (!isRequest(message)) {
    respondError(null, -32600, "Invalid Request");
    return;
  }
  handle(message);
});

// stderr banner (never stdout — stdio is JSON-RPC only)
console.error(
  `[atlas-mcp] ready catalog=${catalog.length} path=${CATALOG_PATH} full=${FULL ? "1" : "0"}`,
);
