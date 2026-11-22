import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync,
  rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 45_000 });

const execFileAsync = promisify(execFile);

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "iolite-build-test-"));
  roots.push(root);
  for (const path of ["data", "public", "scripts", "src", "package.json", "vite.config.ts"]) {
    cpSync(resolve(path), join(root, path), { recursive: true });
  }
  // Use the real Vite config and data import without rebuilding the 3D app twice in the test suite.
  writeFileSync(join(root, "index.html"), '<script type="module" src="/src/build-fixture.js"></script>');
  writeFileSync(join(root, "src/build-fixture.js"),
    'import models from "../data/models.v0.draft.json"; document.body.textContent = JSON.stringify(models);',
  );
  const decisionCatalog = "plugins/iolite-hermes/data/catalog.json";
  mkdirSync(join(root, "plugins/iolite-hermes/data"), { recursive: true });
  cpSync(resolve(decisionCatalog), join(root, decisionCatalog));
  symlinkSync(realpathSync("node_modules"), join(root, "node_modules"), "junction");

  const draft = join(root, "data/models.v0.draft.json");
  const rows = JSON.parse(readFileSync(draft, "utf8"));
  // The OSS checkout has no private metrics. Add known, synthetic measurements
  // to demonstrate where the generator and browser bundle read their catalogs.
  for (const [model, price, score] of [["Fixture A", 1, 42.34567], ["Fixture B", 2, 50]] as const) {
    rows.push({
      ...rows[0], model, provider: "Alibaba", family_id: model, blended_price_per_M: price,
      aa_intelligence_index: score, tps: null,
      sources: {
        blended_price_per_M: { origin: "aa-api", kind: "measured" },
        aa_intelligence_index: { origin: "aa-api", kind: "measured" },
      },
    });
  }
  writeFileSync(draft, JSON.stringify(rows));
  writeFileSync(join(root, "data/generated/public-catalog.json"), "stale snapshot\n");
  mkdirSync(join(root, "public/blog/embed"), { recursive: true });
  writeFileSync(join(root, "public/blog/embed/keep.txt"), "nested static file\n");
  writeFileSync(join(root, "public/embed/stale.html"), "old top-level embed\n");
  return root;
}

function hashTree(root: string) {
  const hash = createHash("sha256");
  for (const path of readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name)).sort()) {
    hash.update(path.slice(root.length));
    hash.update(createHash("sha256").update(readFileSync(path)).digest());
  }
  return hash.digest("hex");
}

async function run(root: string, command: string, args: string[], env: Record<string, string> = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: root,
      env: { PATH: process.env.PATH, HOME: root, ...env },
      encoding: "utf8",
      timeout: 40_000,
    });
    return { status: 0, ...result };
  } catch (error) {
    const result = error as NodeJS.ErrnoException & { stdout: string; stderr: string };
    if (typeof result.code !== "number") throw error;
    return { status: result.code, stdout: result.stdout, stderr: result.stderr };
  }
}

it.each(["public", "private"] as const)("builds the %s plane without changing source artifacts", async (plane) => {
  const root = fixture();
  const publicDir = join(root, "public");
  const generatedDir = join(root, "data/generated");
  const sourceBefore = [hashTree(publicDir), hashTree(generatedDir)];
  const history = join(root, "data/frontier-events.generated.json");
  writeFileSync(history, '[{"date":"2026-01-01","text":"Fixture movement"}]\n');
  const historyBefore = readFileSync(history, "utf8");
  const result = await run(root, "npm", ["run", "build"], plane === "private" ? { VIZ_DATA_PLANE: "private" } : {});
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect([hashTree(publicDir), hashTree(generatedDir)]).toEqual(sourceBefore);
  expect(readdirSync(join(root, ".cache"))).toEqual([]);
  expect(readFileSync(history, "utf8")).toBe(historyBefore);

  const dist = join(root, "dist");
  const output = (path: string) => readFileSync(join(dist, path), "utf8");
  const frontier = JSON.parse(output("frontier-watch.json"));
  const bundleHasPrivateScore = readdirSync(join(dist, "assets"))
    .filter((path) => path.endsWith(".js"))
    .some((path) => output(join("assets", path)).includes("42.34567"));
  expect(bundleHasPrivateScore).toBe(plane === "private");
  expect(existsSync(join(dist, "compare/fixture-a-vs-fixture-b/index.html"))).toBe(plane === "private");
  expect(existsSync(join(dist, "m/fixture-a/index.html"))).toBe(true);
  expect(existsSync(join(dist, "embed/fixture-a.html"))).toBe(true);
  expect(existsSync(join(dist, "embed/stale.html"))).toBe(false);
  expect(existsSync(join(dist, "blog/embed/keep.txt"))).toBe(true);
  if (plane === "private") {
    expect(frontier.as_of).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(frontier.frontier).toContainEqual({ model: "Fixture A", provider: "Alibaba", price: 1, ii: 42.34567, tps: null });
    expect(output("frontier-watch.xml")).toContain("<title>Fixture movement</title>");
  } else {
    expect(frontier.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(frontier.score_basis).toMatch(/Epoch Capabilities Index/);
    expect(frontier.frontier.length).toBeGreaterThan(0);
    expect(frontier.frontier[0].intelligence.metric).toBe("Epoch Capabilities Index (ECI)");
    expect(frontier.events).toEqual([]);
    expect(output("frontier-watch.xml")).not.toContain("<entry>");
    expect(output("frontier-watch.md")).toContain("/sources/#decision-data");
  }
});

it("cleans staging after a generator fails", async () => {
  const root = fixture();
  writeFileSync(join(root, "data/slug-aliases.json"), '{"old-model":"missing-alias-target"}');
  const result = await run(root, "npm", ["run", "build:public"]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("target slug(s) missing from catalog: missing-alias-target");
  expect(readdirSync(join(root, ".cache"))).toEqual([]);
});

it("writes private movement only when staging explicitly enables tracking", async () => {
  const root = fixture();
  const draft = join(root, "data/models.v0.draft.json");
  const rows = JSON.parse(readFileSync(draft, "utf8"));
  writeFileSync(draft, JSON.stringify(rows.slice(-2)));
  const output = join(root, "stage");
  const state = join(root, ".cache/frontier-watch/last.json");
  const history = join(root, "data/frontier-events.generated.json");
  mkdirSync(output);
  mkdirSync(join(root, ".cache/frontier-watch"), { recursive: true });
  const before = JSON.stringify({ frontier: [{ model: "Fixture A", price: 1, ii: 40.12345 }, { model: "Fixture B", price: 2, ii: 50 }] });
  writeFileSync(state, before);
  // Mark this movement as delivered already so the fixture never sends alerts.
  mkdirSync(join(root, ".cache/catalog-sync"), { recursive: true });
  writeFileSync(join(root, ".cache/catalog-sync/alerted-signatures.json"), JSON.stringify({ "frontier-watch:jump:Fixture A": Date.now() }));
  const env = { VIZ_DATA_PLANE: "private", VIZ_BUILD_PUBLIC_DIR: output };
  const readFrontier = () => JSON.parse(readFileSync(join(output, "frontier-watch.json"), "utf8"));
  const command = ["--import", "tsx", "scripts/frontier-watch.mjs"];
  const staged = await run(root, process.execPath, command, env);
  expect(staged.status, staged.stderr).toBe(0);
  expect(readFrontier().events).toEqual([]);
  expect(readFileSync(state, "utf8")).toBe(before);
  expect(existsSync(history)).toBe(false);

  const tracked = await run(root, process.execPath, command, { ...env, VIZ_FRONTIER_TRACK_MOVEMENT: "1" });
  expect(tracked.status, tracked.stderr).toBe(0);
  const text = "INTELLIGENCE UP: Fixture A index 40.1 → 42.3";
  expect(readFrontier().events).toEqual([{ key: "jump:Fixture A", text }]);
  expect(JSON.parse(readFileSync(history, "utf8"))).toEqual([{ date: expect.any(String), text }]);
  expect(JSON.parse(readFileSync(state, "utf8")).frontier[0].ii).toBe(42.34567);
});

it("ships the linked public sources and licence notices", () => {
  const sources = readFileSync("public/sources/index.html", "utf8");
  const notices = readFileSync("public/decision-data-attribution.txt", "utf8");
  expect(sources).toMatch(/id="decision-data"[\s\S]*Epoch AI[\s\S]*LiteLLM/);
  expect(sources).toContain("/decision-data-attribution.txt");
  expect(notices).toContain("Copyright (c) 2023 Berri AI");
});
