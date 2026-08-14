/**
 * Pure decision helpers for dataset release tags + raw snapshot archive
 * (plan W5 / ticket #191 — reproducibility).
 *
 * Release tags: every deployed catalog state is tagged `data/YYYY-MM-DD-HHMM`
 * (UTC) so any deployed dataset is exactly reproducible (checkout tag, build).
 * Retention: `data/*` release tags older than 30 days are pruned EXCEPT the
 * latest KEEP_RECENT (12) — rollup anchors that survive age, keeping the
 * longitudinal record capped, not erased.
 *
 * Raw snapshot archive: data/aa-api-snapshot.json + data/openrouter-snapshot.json
 * are gitignored (raw API bytes never enter git) but compressed per run into
 * archive/raw/<YYYY-MM-DD-HHMM>.tgz and pruned fully at 30 days (no keep-N).
 *
 * Everything exported is PURE (dates/lists in, decisions out) so tests need no
 * git or filesystem mutations. The CLI below is a read-only planner — it only
 * ever runs `git tag -l` / `readdir`; scripts/catalog-archive-tag.sh performs
 * the actual mutations (and honours DRY_RUN=1).
 *
 * CLI:
 *   node scripts/lib/archive-tag.mjs tag-name      [--now <iso|epoch-ms>]
 *   node scripts/lib/archive-tag.mjs archive-name  [--now <iso|epoch-ms>]
 *   node scripts/lib/archive-tag.mjs tag-prune     [--max-age-days N] [--keep-recent N] [--json]
 *   node scripts/lib/archive-tag.mjs archive-prune --dir <path> [--max-age-days N] [--json]
 *
 * tag-prune / archive-prune print one name per line (the deletion list);
 * --json prints { prune: [...], kept: N } instead.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

export const TAG_PREFIX = "data/";
export const DAY_MS = 24 * 3600_000;
export const DEFAULT_TAG_MAX_AGE_DAYS = 30;
export const DEFAULT_KEEP_RECENT_TAGS = 12;
export const DEFAULT_ARCHIVE_MAX_AGE_DAYS = 30;

const TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/;

function toMs(now) {
  if (now instanceof Date) return now.getTime();
  const n = Number(now);
  return Number.isFinite(n) ? n : new Date(now).getTime();
}

/** Format a moment as the shared UTC timestamp `YYYY-MM-DD-HHMM`. */
export function formatTimestampUtc(now = new Date()) {
  const d = now instanceof Date ? now : new Date(toMs(now));
  const p2 = (n) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` +
    `-${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}`
  );
}

/** Release tag name for a moment: `data/YYYY-MM-DD-HHMM` (UTC). */
export function deriveTagName(now = new Date()) {
  return TAG_PREFIX + formatTimestampUtc(now);
}

/** Archive file name for a moment: `YYYY-MM-DD-HHMM.tgz` (UTC). */
export function deriveArchiveName(now = new Date()) {
  return `${formatTimestampUtc(now)}.tgz`;
}

/**
 * Parse `YYYY-MM-DD-HHMM` (with or without the `data/` prefix) to epoch ms.
 * Returns null for anything malformed or calendar-impossible (month 13,
 * Feb 30, hour 25, …) — impossible dates must never sort into retention.
 */
export function parseTimestampMs(name) {
  if (typeof name !== "string") return null;
  const bare = name.startsWith(TAG_PREFIX) ? name.slice(TAG_PREFIX.length) : name;
  const m = TIMESTAMP_RE.exec(bare);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }
  const ms = Date.UTC(year, month - 1, day, hour, minute);
  // Date.UTC silently rolls overflow (Feb 30 → Mar 2) — reject non-round-trips.
  const dt = new Date(ms);
  if (dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return ms;
}

/** True only for well-formed `data/YYYY-MM-DD-HHMM` release tags. */
export function isDataReleaseTag(tag) {
  return typeof tag === "string" && tag.startsWith(TAG_PREFIX) && parseTimestampMs(tag) !== null;
}

/** True only for archive files we created (`YYYY-MM-DD-HHMM.tgz`). */
export function isArchiveName(name) {
  return (
    typeof name === "string" &&
    name.endsWith(".tgz") &&
    parseTimestampMs(name.slice(0, -".tgz".length)) !== null
  );
}

/**
 * Tags to delete under the 30-day / keep-N-recent policy.
 *
 * The latest `keepRecent` release tags ALWAYS survive (rollup anchors) even
 * when older than maxAgeDays; the rest are pruned once strictly older than
 * maxAgeDays (age == maxAge survives). Non-release names (v1.0.0, malformed)
 * are ignored — neither counted toward keepRecent nor pruned. Result is
 * ordered oldest-first for deterministic deletion logs.
 */
export function selectTagsToPrune(
  tags,
  { now = new Date(), maxAgeDays = DEFAULT_TAG_MAX_AGE_DAYS, keepRecent = DEFAULT_KEEP_RECENT_TAGS } = {},
) {
  const nowMs = toMs(now);
  const unique = [...new Set(tags ?? [])];
  const valid = unique
    .filter(isDataReleaseTag)
    .map((tag) => ({ tag, ms: parseTimestampMs(tag) }));
  valid.sort((a, b) => b.ms - a.ms); // newest first
  const anchors = new Set(valid.slice(0, Math.max(0, keepRecent)).map((t) => t.tag));
  const cutoff = maxAgeDays * DAY_MS;
  return valid
    .filter((t) => !anchors.has(t.tag) && nowMs - t.ms > cutoff)
    .sort((a, b) => a.ms - b.ms)
    .map((t) => t.tag);
}

/**
 * Archive files to delete: every archive strictly older than maxAgeDays —
 * full prune, no keep-N (plan W5: the raw archive prunes completely at 30d).
 * Age is file mtime, falling back to the timestamp encoded in the name; files
 * we cannot date are never deleted. Only our own naming pattern is eligible.
 * Result ordered oldest-first.
 */
export function selectArchivesToPrune(
  entries,
  { now = new Date(), maxAgeDays = DEFAULT_ARCHIVE_MAX_AGE_DAYS } = {},
) {
  const nowMs = toMs(now);
  const cutoff = maxAgeDays * DAY_MS;
  const out = [];
  for (const e of entries ?? []) {
    if (!isArchiveName(e?.name)) continue;
    const fromName = parseTimestampMs(e.name.slice(0, -".tgz".length));
    const ms = Number.isFinite(e?.mtimeMs) ? e.mtimeMs : fromName;
    if (ms === null || nowMs - ms <= cutoff) continue;
    out.push({ name: e.name, ms });
  }
  return out.sort((a, b) => a.ms - b.ms).map((e) => e.name);
}

// ---------------------------------------------------------------------------
// Read-only CLI (planner). Mutations live in scripts/catalog-archive-tag.sh.
// ---------------------------------------------------------------------------
function flag(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 || i + 1 >= argv.length ? undefined : argv[i + 1];
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function resolveNow(argv) {
  const raw = flag(argv, "--now");
  if (raw === undefined) return new Date();
  const n = Number(raw);
  return new Date(raw.trim() !== "" && Number.isFinite(n) ? n : raw);
}

function numFlag(argv, name, fallback) {
  const raw = flag(argv, name);
  const n = Number(raw);
  return raw === undefined || !Number.isFinite(n) ? fallback : n;
}

function listGitTags() {
  const r = spawnSync("git", ["-C", ROOT, "tag", "-l", `${TAG_PREFIX}*`], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`git tag -l failed: ${String(r.stderr || r.error || "").slice(0, 120)}`);
  }
  return r.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
}

function listArchiveFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => ({ name: e.name, mtimeMs: fs.statSync(path.join(dir, e.name)).mtimeMs }));
}

function emit(prune, keptTotal, json) {
  if (json) {
    console.log(JSON.stringify({ prune, kept: keptTotal }));
  } else {
    for (const name of prune) console.log(name);
  }
}

function main() {
  const [cmd, ...argv] = process.argv.slice(2);
  const now = resolveNow(argv);
  switch (cmd) {
    case "tag-name": {
      console.log(deriveTagName(now));
      return;
    }
    case "archive-name": {
      console.log(deriveArchiveName(now));
      return;
    }
    case "tag-prune": {
      const tags = listGitTags();
      const release = tags.filter(isDataReleaseTag);
      const prune = selectTagsToPrune(tags, {
        now,
        maxAgeDays: numFlag(argv, "--max-age-days", DEFAULT_TAG_MAX_AGE_DAYS),
        keepRecent: numFlag(argv, "--keep-recent", DEFAULT_KEEP_RECENT_TAGS),
      });
      emit(prune, release.length - prune.length, hasFlag(argv, "--json"));
      return;
    }
    case "archive-prune": {
      const dir = flag(argv, "--dir");
      if (!dir) {
        console.error("archive-prune requires --dir <path>");
        process.exit(2);
      }
      if (!fs.existsSync(dir)) {
        emit([], 0, hasFlag(argv, "--json"));
        return;
      }
      const files = listArchiveFiles(dir);
      const prune = selectArchivesToPrune(files, {
        now,
        maxAgeDays: numFlag(argv, "--max-age-days", DEFAULT_ARCHIVE_MAX_AGE_DAYS),
      });
      emit(prune, files.length - prune.length, hasFlag(argv, "--json"));
      return;
    }
    default:
      console.error(
        "usage: archive-tag.mjs tag-name | archive-name | tag-prune [--max-age-days N --keep-recent N --json]" +
          " | archive-prune --dir <path> [--max-age-days N --json]",
      );
      process.exit(2);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
