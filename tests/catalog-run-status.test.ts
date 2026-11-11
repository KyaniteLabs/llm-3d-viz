/**
 * catalog-auto-update.sh run-status machine (STATUS_FILE / HISTORY_FILE).
 *
 * Runs the REAL script inside a throwaway REPO_ROOT whose builder, coverage
 * and alert scripts are stubs, then checks the persisted record and the
 * failure alert. Deploy/build stages are not exercised end-to-end (they need
 * npm/rsync/ssh); their stage names are covered by the exhaustive table check.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve(__dirname, "../scripts/catalog-auto-update.sh");
const SRC = fs.readFileSync(SCRIPT, "utf8");

/** Stages the trap/alert path and silence watchdog may see — one table. */
const FAIL_STAGES = [
  "lock",
  "fetch",
  "parse_vet",
  "builder_gate",
  "write",
  "scrape",
  "guard",
  "build",
  "deploy_config",
  "rsync",
  "restart",
  "health",
  "pages",
  "unknown",
] as const;

const tmpRoots: string[] = [];
afterEach(() => {
  for (const d of tmpRoots.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function sandbox(opts: { builderRc?: number; draft?: string; priorStatus?: string }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cau-status-"));
  tmpRoots.push(root);
  fs.mkdirSync(path.join(root, "scripts/lib"), { recursive: true });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  const draft = opts.draft ?? JSON.stringify(Array.from({ length: 60 }, (_, i) => ({ model: `m${i}` })));
  fs.writeFileSync(
    path.join(root, "scripts/expand-aa-multi-effort.mjs"),
    `import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(path.join(root, "data/models.v0.draft.json"))}, ${JSON.stringify(draft)});\nprocess.exit(${opts.builderRc ?? 0});\n`,
  );
  fs.writeFileSync(path.join(root, "scripts/catalog-coverage-report.mjs"), "process.exit(0);\n");
  fs.writeFileSync(
    path.join(root, "scripts/lib/catalog-alerts.mjs"),
    `import fs from "node:fs";\nfs.appendFileSync(${JSON.stringify(path.join(root, "alerts.log"))}, process.argv.slice(2).join(" ") + "\\n");\n`,
  );
  const stateDir = path.join(root, ".cache/catalog-sync");
  fs.mkdirSync(stateDir, { recursive: true });
  if (opts.priorStatus) fs.writeFileSync(path.join(stateDir, "last-status.json"), opts.priorStatus + "\n");
  return {
    root,
    statusFile: path.join(stateDir, "last-status.json"),
    historyFile: path.join(stateDir, "status-history.jsonl"),
    lockFile: path.join(stateDir, "catalog-auto-update.lock"),
    alerts: () => {
      const p = path.join(root, "alerts.log");
      return fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean) : [];
    },
    history: () => {
      const p = path.join(stateDir, "status-history.jsonl");
      return fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean) : [];
    },
  };
}

function run(root: string, env: Record<string, string> = {}) {
  return spawnSync("bash", [SCRIPT], {
    env: { ...process.env, REPO_ROOT: root, ARCHIVE_TAG_ENABLED: "0", DEPLOY_PAGES: "0", ...env },
    encoding: "utf8",
    timeout: 30_000,
  });
}

const AT = '"at":"\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ"';

describe("catalog run-status: stage table", () => {
  it("STATUS_FAIL_STAGES in the script equals the known stage table", () => {
    const m = SRC.match(/^STATUS_FAIL_STAGES="([^"]*)"/m);
    expect(m).not.toBeNull();
    expect(m![1].trim().split(/\s+/).sort()).toEqual([...FAIL_STAGES].sort());
  });

  it("every status_fail literal and builder rc→stage mapping uses a known stage", () => {
    const used = new Set<string>();
    for (const x of SRC.matchAll(/status_fail ([a-z_]+)\b/g)) used.add(x[1]);
    for (const x of SRC.matchAll(/stage="([a-z_]+)"/g)) used.add(x[1]);
    expect(used.size).toBeGreaterThan(5);
    for (const s of used) expect(FAIL_STAGES as readonly string[]).toContain(s);
    // And every stage in the table is actually reachable from some write.
    for (const s of FAIL_STAGES) expect(used.has(s), `stage ${s} never written`).toBe(true);
  });

  it("STATUS_FILE is only ever written by _status_write (no copy-pasted printf)", () => {
    const writes = SRC.split("\n").filter((l) => /> ?"\$STATUS_FILE"/.test(l) && !l.trim().startsWith("#"));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('"ok\\":$1');
  });
});

describe("catalog run-status: persisted records (byte format unchanged)", () => {
  it("SKIP_BUILD scrape → ok:true changed:true scraped:true deployed:false", () => {
    const sb = sandbox({});
    const r = run(sb.root, { SKIP_BUILD: "1" });
    expect(r.status).toBe(0);
    const line = fs.readFileSync(sb.statusFile, "utf8");
    expect(line).toMatch(
      new RegExp(`^\\{${AT},"ok":true,"changed":true,"scraped":true,"deployed":false,"rows":60,"hash":"[0-9a-f]{64}"\\}\\n$`),
    );
    expect(sb.history()).toEqual([line.trim()]);
    expect(sb.alerts().filter((a) => a.startsWith("--failure"))).toEqual([]);
  });

  it("second run with unchanged data → ok:true changed:false", () => {
    const sb = sandbox({});
    // First run records the hash only on the changed:false path, so seed it via a no-op run pair.
    expect(run(sb.root, { SKIP_BUILD: "1" }).status).toBe(0);
    fs.writeFileSync(
      path.join(sb.root, ".cache/catalog-sync/last-data.sha256"),
      spawnSync("shasum", ["-a", "256", path.join(sb.root, "data/models.v0.draft.json")], { encoding: "utf8" })
        .stdout.split(" ")[0] + "\n",
    );
    expect(run(sb.root).status).toBe(0);
    expect(fs.readFileSync(sb.statusFile, "utf8")).toMatch(
      new RegExp(`^\\{${AT},"ok":true,"changed":false,"rows":60,"hash":"[0-9a-f]{64}"\\}\\n$`),
    );
    expect(sb.history()).toHaveLength(2);
  });

  it.each([
    [2, "fetch"],
    [4, "parse_vet"],
    [5, "builder_gate"],
    [6, "write"],
    [9, "scrape"],
  ])("builder rc %i → stage %s record + one failure alert", (rc, stage) => {
    const sb = sandbox({ builderRc: rc });
    const r = run(sb.root);
    expect(r.status).toBe(2);
    expect(fs.readFileSync(sb.statusFile, "utf8")).toMatch(
      new RegExp(`^\\{${AT},"ok":false,"stage":"${stage}","builder_rc":${rc}\\}\\n$`),
    );
    expect(sb.alerts()).toContain(`--failure ${stage}`);
  });

  it("row guard → stage guard below_min", () => {
    const sb = sandbox({ draft: JSON.stringify([{ model: "only" }]) });
    expect(run(sb.root).status).toBe(8);
    expect(fs.readFileSync(sb.statusFile, "utf8")).toMatch(
      new RegExp(`^\\{${AT},"ok":false,"stage":"guard","rows":1,"reason":"below_min"\\}\\n$`),
    );
    expect(sb.alerts()).toContain("--failure guard");
  });

  it("lock overlap → stage lock, history appended, NO failure alert", async () => {
    const sb = sandbox({});
    const holder = spawn("flock", [sb.lockFile, "sleep", "20"], { stdio: "ignore" });
    try {
      // Wait until the holder owns the lock.
      for (let i = 0; i < 50; i++) {
        if (spawnSync("flock", ["-n", sb.lockFile, "true"]).status !== 0) break;
        await new Promise((res) => setTimeout(res, 50));
      }
      const r = run(sb.root);
      expect(r.status).toBe(10);
      expect(fs.readFileSync(sb.statusFile, "utf8")).toMatch(
        new RegExp(`^\\{${AT},"ok":false,"stage":"lock","reason":"overlap"\\}\\n$`),
      );
      expect(sb.history()).toHaveLength(1);
      expect(sb.alerts().filter((a) => a.startsWith("--failure"))).toEqual([]);
    } finally {
      holder.kill();
    }
  });
});

describe("catalog run-status: bug — EXIT trap clobbered every exit code to 1", () => {
  it.each([
    [{ SKIP_BUILD: "1" }, {}, 0],
    [{}, { builderRc: 2 }, 2],
    [{}, { draft: JSON.stringify([{ model: "x" }]) }, 8],
  ] as const)("env %j sandbox %j → exit %i", (env, sb, want) => {
    const s = sandbox(sb);
    expect(run(s.root, env).status).toBe(want);
  });
});

describe("catalog run-status: bug — exit without a record re-used the PREVIOUS run's record", () => {
  // Malformed draft JSON passes the builder (rc 0) but makes the row-count
  // `node -e` die under `set -e` — an exit path that writes no status.
  const BAD_DRAFT = "{not json";

  it("after a prior lock-overlap record: failure alert still fires (old code suppressed it as 'lock')", () => {
    const prior = '{"at":"2026-01-01T00:00:00Z","ok":false,"stage":"lock","reason":"overlap"}';
    const sb = sandbox({ draft: BAD_DRAFT, priorStatus: prior });
    const r = run(sb.root);
    expect(r.status).not.toBe(0);
    expect(sb.alerts()).toContain("--failure unknown");
    const hist = sb.history();
    expect(hist).toHaveLength(1);
    expect(hist[0]).not.toBe(prior); // old code re-appended the stale prior line
    expect(hist[0]).toMatch(new RegExp(`^\\{${AT},"ok":false,"stage":"unknown","rc":\\d+\\}$`));
  });

  it("after a prior ok:true record: history does not get a duplicated stale ok:true", () => {
    const prior = '{"at":"2026-01-01T00:00:00Z","ok":true,"changed":false,"rows":60,"hash":"x"}';
    const sb = sandbox({ draft: BAD_DRAFT, priorStatus: prior });
    run(sb.root);
    const hist = sb.history();
    expect(hist).toHaveLength(1);
    expect(JSON.parse(hist[0]).ok).toBe(false);
  });
});
