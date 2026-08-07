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
import type { RankObjective } from "../src/lib/atlas-agent/types";

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
  const raw = JSON.parse(readFileSync(path, "utf8")) as Model[];
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

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  return args[i + 1];
}

function print(obj: unknown) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

function usage(): never {
  console.error(`Atlas CLI — catalog tools (read-only)

Commands:
  meta
  search <query>
  get <name>
  eligible [--floor N]
  rank [--floor N] [--objective min_cost|max_speed|balanced] [--n 3]
  floor --floor N | --anchor <name>
  compare <a> <b> [c...]

Options:
  --catalog <path>   default: data/models.v0.draft.json
`);
  process.exit(1);
}

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === "-h" || argv[0] === "--help") usage();

  const catalogPath = resolveCatalogPath(argValue(argv, "--catalog"));
  const catalog = loadCatalog(catalogPath);
  const floor = Number(argValue(argv, "--floor") ?? 50);
  const ctx = ctxFrom(catalog, Number.isFinite(floor) ? floor : 50);
  const cmd = argv[0]!;

  switch (cmd) {
    case "meta":
      print(toolGetCatalogMeta(ctx).result);
      break;
    case "search": {
      const q = argv[1] ?? "";
      print(toolSearchModels(ctx, q, "catalog").result);
      break;
    }
    case "get": {
      const id = argv[1] ?? "";
      const got = toolGetModel(ctx, id);
      print(got.result);
      if (!got.result) process.exit(2);
      break;
    }
    case "eligible": {
      print(toolListEligible(ctx, ctx.floor).result);
      break;
    }
    case "rank": {
      const obj = (argValue(argv, "--objective") ?? "balanced") as RankObjective;
      const n = Number(argValue(argv, "--n") ?? 3);
      print(toolRankEligible(ctx, ctx.floor, obj, n).result);
      break;
    }
    case "floor": {
      const anchor = argValue(argv, "--anchor");
      const f = argValue(argv, "--floor");
      print(
        toolProposeFloor(ctx, {
          floor: f != null ? Number(f) : undefined,
          anchor: anchor ?? undefined,
        }).result,
      );
      break;
    }
    case "compare": {
      const names = argv.slice(1).filter((a) => !a.startsWith("--"));
      print(toolCompareModels(ctx, names).result);
      break;
    }
    default:
      usage();
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(3);
}
