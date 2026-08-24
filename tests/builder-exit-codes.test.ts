import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * #203 — the builder's exit-code contract. The 2026-08-20 incident: a broken
 * data/manual-additions.json aborted the builder with an anonymous rc=1 and
 * the shell wrapper labeled it "AA scrape failed". These tests spawn the REAL
 * builder and pin the contract:
 *   rc=2 fetch (upstream) · rc=4 parse/vet (local data file)
 * Both failure paths exit before any catalog write, so no data is touched.
 */
const BUILDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../scripts/expand-aa-multi-effort.mjs",
);
const node = process.execPath;

function runBuilder(envOverrides) {
  const env = { ...process.env };
  delete env.AA_API_KEY;
  delete env.ARTIFICIAL_ANALYSIS_API_KEY;
  delete env.AA_FIXTURE_JSON;
  delete env.MANUAL_ADDITIONS_PATH;
  Object.assign(env, envOverrides);
  return spawnSync(node, ["--experimental-strip-types", BUILDER], {
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
}

describe("builder exit-code contract (#203)", () => {
  it("malformed manual-additions exits rc=4 parse_vet naming the file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "exit-codes-"));
    try {
      const fixture = path.join(dir, "aa-fixture.json");
      writeFileSync(
        fixture,
        JSON.stringify({ data: [{ name: "Fixture Flash", model_creator: { name: "FixtureLabs" } }] }),
      );
      const broken = path.join(dir, "broken-manual.json");
      writeFileSync(broken, "{ this is not json");
      const r = runBuilder({ AA_FIXTURE_JSON: fixture, MANUAL_ADDITIONS_PATH: broken });
      expect(r.status).toBe(4);
      expect(r.stderr).toContain('"class": "parse_vet"');
      expect(r.stderr).toContain("broken-manual.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("missing AA credentials exit rc=2 fetch (no network needed)", () => {
    const r = runBuilder({});
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('"class": "fetch"');
    expect(r.stderr).toContain("AA_API_KEY");
  });

  it("node itself is reachable (sanity for the spawn harness)", () => {
    expect(() => execFileSync(node, ["--version"])).not.toThrow();
  });
});
