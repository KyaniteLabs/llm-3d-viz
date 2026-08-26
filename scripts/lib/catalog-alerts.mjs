/**
 * Catalog alert channel (plan WS1 / audit H5+M7).
 *
 * One AGGREGATED payload per run (never per-event issues), signature-deduped
 * across runs via a shared store — the same store serves the pipeline trap
 * path, the post-scrape evaluator, and the independent silence watchdog
 * (scripts/catalog-silence-check.sh). Delivery: Forgejo issue (durable trail)
 * + macOS local notification (the push). Token per docs/agents/issue-tracker.md
 * (browser UA mandatory; write-scoped token from ~/.git-credentials). Alerting
 * is best-effort: nothing here may fail the pipeline.
 *
 * CLI:
 *   node scripts/lib/catalog-alerts.mjs --evaluate             (diff + canary + shrink)
 *   node scripts/lib/catalog-alerts.mjs --failure <stage>      (trap path)
 *   node scripts/lib/catalog-alerts.mjs --silence              (watchdog)
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CLOUD_LABS } from "../../src/data/catalog-scope.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const STATE_DIR = path.join(ROOT, ".cache/catalog-sync");
const DEDUP_FILE = path.join(STATE_DIR, "alerted-signatures.json");
const DEDUP_TTL_MS = 7 * 24 * 3600_000;

const FORGEJO_API = "https://git.kyanitelabs.tech/api/v1/repos/simon/llm-3d-viz/issues";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export function resolveForgejoToken(env = process.env) {
  if (env.FORGEJO_TOKEN) return env.FORGEJO_TOKEN;
  try {
    const credFile = path.join(process.env.HOME ?? "", ".git-credentials");
    if (!fs.existsSync(credFile)) return null;
    const line = fs
      .readFileSync(credFile, "utf8")
      .split("\n")
      .find((l) => l.includes("git.kyanitelabs.tech"));
    if (!line) return null;
    // https://user:token@host → token (string ops; no regex literal for parser safety)
    const afterScheme = line.trim().replace(/^https:\/\//, "").split("@")[0] ?? "";
    const parts = afterScheme.split(":");
    return parts.length >= 2 ? parts.slice(1).join(":") : null;
  } catch {
    return null;
  }
}

export function loadDedupStore(storePath = DEDUP_FILE) {
  try {
    return JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch {
    return {};
  }
}

export function saveDedupStore(store, storePath = DEDUP_FILE) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`);
}

/** Drop dedup entries older than TTL. */
export function pruneDedupStore(store, now = Date.now()) {
  const out = {};
  for (const [sig, sentAt] of Object.entries(store ?? {})) {
    if (typeof sentAt === "number" && now - sentAt < DEDUP_TTL_MS) out[sig] = sentAt;
  }
  return out;
}

/**
 * Turn diff + canary + counts into alert events. Thresholds per plan:
 * cloud-lab removal, price side moved >25%, shrink >5%, divergence delta.
 */
export function buildAlertEvents({ diff, divergences, prevCount, nextCount }) {
  const cloud = new Set(CLOUD_LABS);
  const events = [];
  for (const r of diff?.removed ?? []) {
    if (cloud.has(r.provider)) {
      events.push({
        kind: "cloud_removal",
        key: `cloud_removal:${r.model}`,
        line: `Cloud-lab row removed: ${r.model} (${r.provider})`,
      });
    }
  }
  // #204: a declared manual family that exited the draft with no supersede
  // (family would remain as the AA row) and no rename (renames preserve the
  // normalized family) — the silent-vanish class (Seed 2026-08-16,
  // Qwen3.8 27B 2026-08-20).
  for (const d of diff?.supersede_drift ?? []) {
    events.push({
      kind: "manual_family_drift",
      key: `manual_drift:${d.family}`,
      line: `Manual family drifted out of the draft: ${d.model} (${d.provider}) — still declared in data/manual-additions.json, absent from the new draft`,
    });
  }
  for (const p of diff?.price_deltas ?? []) {
    if (p.pct >= 25) {
      events.push({
        kind: "price_move",
        key: `price_move:${p.model}:${p.field}`,
        line: `Price moved ${p.pct}%: ${p.model} ${p.field} ${p.from} → ${p.to}`,
      });
    }
  }
  if (
    typeof prevCount === "number" &&
    prevCount > 0 &&
    typeof nextCount === "number" &&
    (prevCount - nextCount) / prevCount > 0.05
  ) {
    events.push({
      kind: "shrink",
      key: `shrink:${prevCount}:${nextCount}`,
      line: `Draft shrank >5%: ${prevCount} → ${nextCount} rows`,
    });
  }
  for (const d of divergences ?? []) {
    if (d.changed && !d.stale) {
      events.push({
        kind: "price_divergence_delta",
        key: `divergence:${d.model}:${d.field}:${d.ratio}`,
        line: `AA↔OR divergence moved: ${d.model} ${d.field} ratio ${d.ratio}×`,
      });
    }
  }
  return events;
}

/** Build one aggregated payload from events (dedup applied by caller). */
export function buildAlertPayload(events, { prefix = "catalog", now = new Date() } = {}) {
  const stamp = now.toISOString();
  const maxLines = 20;
  const shown = events.slice(0, maxLines);
  const overflow =
    events.length > maxLines ? [`…and ${events.length - maxLines} more (full list in data/effort-gaps.generated.json + data/catalog-diff.generated.json)`] : [];
  const title = `[${prefix}] ${events.length} catalog event${events.length === 1 ? "" : "s"} — ${stamp.slice(0, 16)}`;
  const body = [
    `Automated catalog alert (${stamp}).`,
    "",
    ...shown.map((e) => `- ${e.line}`),
    ...overflow,
    "",
    "_Aggregated per-run alert from `scripts/lib/catalog-alerts.mjs` (plan WS1). Label needs-triage._",
  ].join("\n");
  return { title, body, signature: `${prefix}:${events.map((e) => e.key).sort().join("|")}` };
}

/**
 * Deliver payload: Forgejo issue + local notification. Never throws.
 * Injectable transports for tests.
 */
export async function deliverAlert(
  payload,
  {
    token = resolveForgejoToken(),
    fetchImpl = fetch,
    notifyImpl = defaultNotify,
    api = FORGEJO_API,
  } = {},
) {
  const channels = { forgejo: "skipped", localNotification: "skipped" };
  if (token) {
    try {
      const res = await fetchImpl(api, {
        method: "POST",
        headers: {
          Authorization: `token ${token}`,
          "User-Agent": BROWSER_UA,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: payload.title, body: payload.body }),
      });
      channels.forgejo = res.ok ? "posted" : `http_${res.status}`;
    } catch (err) {
      channels.forgejo = `error:${String(err).slice(0, 80)}`;
    }
  } else {
    channels.forgejo = "no_token";
  }
  try {
    channels.localNotification = notifyImpl(payload.title);
  } catch {
    channels.localNotification = "error";
  }
  // ok = at least one channel surfaced (fired for the caller). recordable = the
  // DURABLE channel posted — signatures gate on this alone: a local-only
  // delivery recording its signature swallows the Forgejo trail for the TTL
  // (the 2026-08-20 phantom pipeline_failure — local notification recorded,
  // no issue ever existed on the board).
  return {
    ok: channels.forgejo === "posted" || channels.localNotification === "notified",
    recordable: channels.forgejo === "posted",
    channels,
  };
}

function defaultNotify(title) {
  const r = spawnSync(
    "osascript",
    ["-e", `display notification "${title.replace(/"/g, "'")}" with title "llm-3d-viz catalog"`],
    { timeout: 5000 },
  );
  return r.status === 0 ? "notified" : "error";
}

/**
 * Fire one aggregated alert for new (not-yet-signaled) events.
 * Shared entry for --evaluate / --failure / --silence.
 */
export async function fireAlert(events, opts = {}) {
  const {
    prefix = "catalog",
    storePath = DEDUP_FILE,
    dedupByKind = false,
    deliver = deliverAlert,
  } = opts;
  if (!events.length) return { fired: false, reason: "no_new_events" };
  let store = pruneDedupStore(loadDedupStore(storePath));
  const fresh = events.filter((e) =>
    dedupByKind ? !store[e.kind] : !store[`${prefix}:${e.key}`],
  );
  if (!fresh.length) return { fired: false, reason: "all_deduped" };
  const payload = buildAlertPayload(fresh, { prefix });
  const result = await deliver(payload, opts);
  // Record signatures ONLY when the durable Forgejo channel posted. Local-only
  // delivery stays visible on the desktop but records nothing — the event
  // retries next run until the board actually receives it.
  if (result.recordable) {
    const now = Date.now();
    for (const e of fresh) {
      store[dedupByKind ? e.kind : `${prefix}:${e.key}`] = now;
    }
    saveDedupStore(store, storePath);
  }
  return { fired: true, events: fresh.length, ...result };
}

// ---------------------------------------------------------------------------
// CLI modes
// ---------------------------------------------------------------------------
function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const [, , mode, arg] = process.argv;
  const gapsDoc = readJsonSafe(path.join(ROOT, "data/effort-gaps.generated.json"));
  const diffDoc = readJsonSafe(path.join(ROOT, "data/catalog-diff.generated.json"));

  if (mode === "--failure") {
    const stage = arg ?? "unknown";
    await fireAlert(
      [
        {
          kind: "pipeline_failure",
          key: `pipeline_failure:${stage}`,
          line: `catalog-auto-update failed at stage: ${stage}`,
        },
      ],
      { prefix: "catalog", dedupByKind: false },
    );
    return;
  }

  if (mode === "--silence") {
    await fireAlert(
      [
        {
          kind: "pipeline_silence",
          key: "pipeline_silence:24h",
          line: "No successful catalog run (ok:true) in ≥24h — pipeline silent (stall/crash/cron removal)",
        },
      ],
      { prefix: "catalog", dedupByKind: true },
    );
    return;
  }

  // #206: public Pages deploy drift. The public site is approval-gated by
  // design, so drift is expected between approvals — the alert fires ONCE per
  // dedup TTL (kind-deduped like --silence), not per run, making staleness
  // loud without nagging every hourly check. `arg` carries the observed pair
  // (public vs private entry asset) for the issue body.
  if (mode === "--drift") {
    await fireAlert(
      [
        {
          kind: "public_deploy_drift",
          key: "public_deploy_drift:entry-asset-mismatch",
          line: `Public site serves a different build than the private instance (${arg ?? "details unknown"}) — redeploy via docs/deploy/cloudflare-pages.md gate when intended`,
        },
      ],
      { prefix: "catalog", dedupByKind: true },
    );
    return;
  }

  if (mode === "--evaluate") {
    const events = buildAlertEvents({
      diff: diffDoc ?? {},
      divergences: gapsDoc?.price_divergences?.records ?? [],
      prevCount: diffDoc?.prev_row_count,
      nextCount: diffDoc?.next_row_count,
    });
    await fireAlert(events, { prefix: "catalog" });
    return;
  }

  console.error("usage: catalog-alerts.mjs --evaluate | --failure <stage> | --silence | --drift <detail>");
  process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`catalog-alerts error (non-fatal): ${err}`);
    process.exit(0); // alerting must never fail the pipeline
  });
}
