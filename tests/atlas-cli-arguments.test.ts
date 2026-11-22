import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const fixture = mkdtempSync(join(tmpdir(), "iolite-cli-"));
const catalog = join(fixture, "atlas catalog.json");
const malformed = join(fixture, "malformed.json");
const nonArray = join(fixture, "non-array.json");
const missing = join(fixture, "missing.json");

beforeAll(() => {
  writeFileSync(catalog, JSON.stringify([
    { model: "Fixture Cheap", provider: "Test", aa_intelligence_index: 70, tps: 20, blended_price_per_M: 1 },
    { model: "Fixture Fast", provider: "Test", aa_intelligence_index: 55, tps: 100, blended_price_per_M: 3 },
  ]));
  writeFileSync(malformed, "{ invalid-json");
  writeFileSync(nonArray, "{}");
});

afterAll(() => {
  rmSync(fixture, { recursive: true, force: true });
});

function cli(...args: string[]) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "bin/atlas-cli.ts", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ATLAS_CATALOG_PATH: "" },
    timeout: 10_000,
  });
  expect(result.error).toBeUndefined();
  return result;
}

it.each<[string[], string]>([
  [[], "A command is required."],
  [["invalid-command"], "Unknown command: invalid-command."],
  [["rank", "--floor", "abc"], "--floor requires a number from 0 to 100."],
  [["rank", "--floor", "101"], "--floor requires a number from 0 to 100."],
  [["rank", "--floor=-1"], "--floor requires a number from 0 to 100."],
  [["rank", "--n", "0"], "--n requires an integer"],
  [["rank", "--n", "1.5"], "--n requires an integer"],
  [["rank", "--n", "-5"], "--n"],
  [["rank", "--n=-5"], "--n requires an integer"],
  [["rank", "--objective", "bogus"], "--objective requires min_cost, max_speed, or balanced."],
  [["rank", "--floor", "abc", "--floor", "50"], "--floor may only be specified once."],
  [["rank", "--objective", "bogus", "--objective", "min_cost"], "--objective may only be specified once."],
  [["rank", "--n", "abc", "--n", "3"], "--n may only be specified once."],
  [["meta", "--catalog", catalog, "--catalog", missing], "--catalog may only be specified once."],
  [["rank", "--catalog", catalog, "--n", "0"], "--n requires an integer"],
  [["eligible", "--n", "3"], "--n is unavailable for eligible."],
  [["floor"], "floor requires exactly one of --floor or --anchor."],
  [["floor", "--floor", "50", "--anchor", "Fixture Fast"], "floor requires exactly one of --floor or --anchor."],
  [["get"], "Invalid arguments for get"],
  [["get", "Fixture Fast", "Fixture Cheap"], "Invalid arguments for get"],
  [["compare"], "Invalid arguments for compare"],
  [["meta", "--catalog="], "--catalog requires a value."],
  [["rank", "--floor", ""], "--floor requires a value."],
])("rejects %j with a usage error on stderr", (args, diagnostic) => {
  const result = cli(...args);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim().split(/\r?\n/)).toHaveLength(1);
  expect(result.stderr).toContain(diagnostic);
}, 15_000);

it.each([["--help"], ["-h"], ["rank", "--help"]])("shows help on stdout for %s", (...args) => {
  const result = cli(...args);
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain("Atlas CLI");
  expect(result.stdout).toContain("data/atlas-catalog-snapshot.json");
  expect(result.stdout).toContain("data/models.v0.draft.json");
}, 15_000);

it.each([
  [missing, "Cannot read catalog"],
  [malformed, "invalid JSON"],
  [nonArray, "must be a JSON array"],
])("names the catalog in the diagnostic for %s", (path, message) => {
  const result = cli("meta", "--catalog", path);
  expect(result.status).toBe(3);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim().split(/\r?\n/)).toHaveLength(1);
  expect(result.stderr).toContain(path);
  expect(result.stderr).toContain(message);
}, 15_000);

const legacyRow = {
  model: "Legacy Sparse",
  provider: "Fixture",
  aa_intelligence_index: null,
  tps: null,
  blended_price_per_M: null,
  modality: ["text"],
  sources: { modality: { origin: "provider", kind: "list" } },
};

it.each<[string, unknown[], string[], number]>([
  ["null", [null], ["meta"], 0],
  ["number", [1], ["eligible"], 0],
  ["empty object", [{}], ["rank"], 0],
  ["missing provider", [legacyRow, { model: "Broken" }], ["compare", "Legacy Sparse", "Unresolved"], 1],
  ["non-string model", [{ model: 1, provider: "Fixture" }], ["get", "Unresolved"], 0],
  ["non-string provider", [{ model: "Broken", provider: null }], ["search", "Fixture"], 0],
])("rejects row shape %s with the catalog path and row index on stderr", (label, rows, args, index) => {
  const path = join(fixture, `row-${label}.json`);
  writeFileSync(path, JSON.stringify(rows));
  const result = cli(...args, "--catalog", path);
  expect(result.status).toBe(3);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim().split(/\r?\n/)).toHaveLength(1);
  expect(result.stderr).toContain(path);
  expect(result.stderr).toContain(`row at index ${index}`);
  expect(result.stderr).toContain('string "model" and "provider" fields');
}, 15_000);

it("accepts legacy rows with missing measurements and nested provenance", () => {
  const path = join(fixture, "legacy-sparse.json");
  writeFileSync(path, JSON.stringify([legacyRow]));
  const result = cli("get", "Legacy Sparse", "--catalog", path);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toMatchObject({
    id: "Legacy Sparse",
    index: null,
    price: null,
    tps: null,
    modalities: ["text"],
  });
}, 15_000);

it.each([
  ["get", "definitely-not-a-model-xyz-999"],
  ["floor", "--anchor", "definitely-not-a-model-xyz-999"],
])("writes JSON null and a diagnostic when %s cannot resolve a model", (...args) => {
  const result = cli(...args);
  expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toBeNull();
  expect(result.stderr).toContain("not found");
}, 15_000);

it("preserves matched rows when a compare is partial", () => {
  const result = cli("compare", "Fixture Cheap", "definitely-missing", "--catalog", catalog);
  expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toEqual([expect.objectContaining({ id: "Fixture Cheap" })]);
  expect(result.stderr).toContain("missing: definitely-missing");
}, 15_000);

const cheap = expect.objectContaining({ id: "Fixture Cheap" });
const fast = expect.objectContaining({ id: "Fixture Fast" });

it.each<[string[], unknown]>([
  [["get", "Fixture Fast"], fast],
  [["search", "Fixture"], [cheap, fast]],
  [["eligible"], expect.objectContaining({ eligible: [cheap, fast] })],
  [["rank", "--objective", "min_cost", "--n", "2"], expect.objectContaining({ shortlist: [cheap, fast] })],
  [["floor", "--floor", "50"], { floor: 50, anchor_id: null, source: "user" }],
  [["floor", "--anchor", "Fixture Fast"], { floor: 55, anchor_id: "Fixture Fast", source: "anchor" }],
  [["compare", "Fixture Cheap", "Fixture Fast"], [cheap, fast]],
])("writes JSON to stdout for %j with a custom catalog", (args, expected) => {
  const result = cli(...args, "--catalog", catalog);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual(expected);
}, 15_000);
