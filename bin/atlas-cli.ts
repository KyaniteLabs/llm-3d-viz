#!/usr/bin/env npx tsx
/**
 * Atlas CLI — same pure catalog tools as the SPA / MCP server.
 *
 * Usage:
 *   npx tsx bin/atlas-cli.ts meta
 *   npx tsx bin/atlas-cli.ts search claude
 *   npx tsx bin/atlas-cli.ts eligible --floor 50
 *   npx tsx bin/atlas-cli.ts rank --floor 50 --objective min_cost
 *   npx tsx bin/atlas-cli.ts get "GPT-4o"
 *   npx tsx bin/atlas-cli.ts compare a b
 *   npx tsx bin/atlas-cli.ts floor --anchor "Claude"
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { Model } from "../src/data/models";
import { DEFAULT_FILTERS } from "../src/lib/filters";
import { catalogSnapshotIdSyncForTests } from "../src/lib/decide";
import type { AtlasAgentContext } from "../src/lib/atlas-agent/types";
import {
  toolCompareModels,
  toolGetCatalogMeta,
  toolGetModel,
  toolListEligible,
  toolProposeFloor,
  toolRankEligible,
  toolSearchModels,
} from "../src/lib/atlas-agent/tools";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FALLBACK_CATALOG = resolve(ROOT, "data/models.v0.draft.json");
const SNAPSHOT_CATALOG = resolve(ROOT, "data/atlas-catalog-snapshot.json");

function resolveCatalogPath(explicit?: string): string {
  if (explicit) return resolve(explicit);
  if (process.env.ATLAS_CATALOG_PATH?.trim()) {
    return resolve(process.env.ATLAS_CATALOG_PATH.trim());
  }
  try {
    readFileSync(SNAPSHOT_CATALOG);
    return SNAPSHOT_CATALOG;
  } catch {
    return FALLBACK_CATALOG;
  }
}

function loadCatalog(path: string): Model[] {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Cannot read catalog at ${path}.`);
  }
  const raw = JSON.parse(content) as Model[];
  if (!Array.isArray(raw)) throw new Error("catalog must be a JSON array");
  return raw;
}

function ctxFrom(catalog: Model[], floor = 50): AtlasAgentContext {
  return {
    catalog,
    visible: catalog,
    floor,
    costSpeedBias: 0,
    catalogSnapshotId: catalogSnapshotIdSyncForTests(catalog),
    filters: { ...DEFAULT_FILTERS },
  };
}

function print(obj: unknown) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

const HELP = `Atlas CLI — catalog tools (read-only)

Commands:
  meta
  search <query>
  get <name>
  eligible [--floor N]
  rank [--floor N] [--objective min_cost|max_speed|balanced] [--n N]
  floor --floor N | --anchor <name>
  compare <a> <b> [c...]

Options:
  --catalog <path>   use an Atlas-format catalog with an AA Index floor;
                     also settable through ATLAS_CATALOG_PATH
  --help             show this help
`;

class UsageError extends Error {}

const commandOptions = {
  meta: [],
  search: [],
  get: [],
  eligible: ["floor"],
  rank: ["floor", "objective", "n"],
  floor: ["floor", "anchor"],
  compare: [],
} as const;

function numericOption(value: string | undefined, name: string, fallback: number, max: number, min = 0) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number) || number < min || number > max ||
      (name === "n" && !Number.isSafeInteger(number))) {
    throw new UsageError(`--${name} requires ${name === "n" ? "an integer" : "a number"} from ${min} to ${max}.`);
  }
  return number;
}

function printLookup(result: unknown, detail?: string) {
  print(result);
  if (result === null) {
    console.error(detail);
    process.exitCode = 2;
  }
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "-h" || cmd === "--help") {
    process.stdout.write(HELP);
    return;
  }
  if (!cmd || !Object.hasOwn(commandOptions, cmd)) {
    throw new UsageError(cmd ? `Unknown command: ${cmd}.` : "A command is required.");
  }
  const command = cmd as keyof typeof commandOptions;
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        catalog: { type: "string" }, floor: { type: "string" },
        objective: { type: "string" }, n: { type: "string" }, anchor: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  const allowed: readonly string[] = commandOptions[command];
  for (const key of Object.keys(values)) {
    if (key !== "catalog" && !allowed.includes(key)) {
      throw new UsageError(`--${key} is unavailable for ${command}.`);
    }
    const value = values[key as keyof typeof values];
    if (typeof value === "string" && !value.trim()) {
      throw new UsageError(`--${key} requires a value.`);
    }
  }
  const count = positionals.length;
  const validPositionals = command === "compare" ? count >= 2
    : command === "get" || command === "search" ? count === 1 : count === 0;
  if (!validPositionals || positionals.some((value) => !value.trim())) {
    throw new UsageError(`Invalid arguments for ${command}; see --help.`);
  }
  if (command === "floor" && (values.floor === undefined) === (values.anchor === undefined)) {
    throw new UsageError("floor requires exactly one of --floor or --anchor.");
  }

  const floor = numericOption(values.floor, "floor", 50, 100);
  const n = numericOption(values.n, "n", 3, Number.MAX_SAFE_INTEGER, 1);
  const objective = values.objective ?? "balanced";
  if (objective !== "min_cost" && objective !== "max_speed" && objective !== "balanced") {
    throw new UsageError("--objective requires min_cost, max_speed, or balanced.");
  }
  const catalog = loadCatalog(resolveCatalogPath(values.catalog));
  const ctx = ctxFrom(catalog, floor);
  switch (command) {
    case "meta":
      print(toolGetCatalogMeta(ctx).result);
      break;
    case "search":
      print(toolSearchModels(ctx, positionals[0]!, "catalog").result);
      break;
    case "get": {
      const got = toolGetModel(ctx, positionals[0]!);
      printLookup(got.result, got.trace.detail);
      break;
    }
    case "eligible":
      print(toolListEligible(ctx, floor).result);
      break;
    case "rank":
      print(toolRankEligible(ctx, floor, objective, n).result);
      break;
    case "floor": {
      const proposed = toolProposeFloor(ctx, {
        floor: values.floor !== undefined ? floor : undefined,
        anchor: values.anchor,
      });
      printLookup(proposed.result, proposed.trace.detail);
      break;
    }
    case "compare": {
      const compared = toolCompareModels(ctx, positionals);
      print(compared.result);
      if (!compared.trace.ok) {
        console.error(compared.trace.detail);
        process.exitCode = 2;
      }
      break;
    }
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = err instanceof UsageError ? 1 : 3;
}
