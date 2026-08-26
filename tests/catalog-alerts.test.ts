import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildAlertEvents,
  buildAlertPayload,
  fireAlert,
  loadDedupStore,
  saveDedupStore,
} from "../scripts/lib/catalog-alerts.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function diffFixture(overrides = {}) {
  return {
    available: true,
    added: [],
    removed: [{ model: "Claude Opus 5", provider: "Anthropic" }],
    renamed: [],
    price_deltas: [
      { model: "DeepSeek V4 Pro", provider: "DeepSeek", field: "price_out_per_M", from: 0.87, to: 1.32, pct: 52 },
    ],
    counts: { added: 0, removed: 1, renamed: 0, price_deltas: 1 },
    ...overrides,
  };
}

describe("catalog-alerts — event policy", () => {
  it("fires on cloud-lab removals but not held-lab removals", () => {
    const events = buildAlertEvents({ diff: diffFixture(), divergences: [] });
    expect(events.map((e) => e.kind)).toContain("cloud_removal");
    const heldOnly = buildAlertEvents({
      diff: diffFixture({
        removed: [{ model: "Ling 3.0 Flash", provider: "InclusionAI" }],
      }),
      divergences: [],
    });
    expect(heldOnly.map((e) => e.kind)).not.toContain("cloud_removal");
  });

  it("price moves fire at ≥25%, not below", () => {
    const below = buildAlertEvents({
      diff: diffFixture({ price_deltas: [{ ...diffFixture().price_deltas[0], pct: 24 }] }),
      divergences: [],
    });
    expect(below.map((e) => e.kind)).not.toContain("price_move");
  });

  it("manual family drift fires as its own event kind (#204)", () => {
    const events = buildAlertEvents({
      diff: diffFixture({
        supersede_drift: [{ family: "qwen3-8-27b", model: "Qwen3.8 27B", provider: "Alibaba" }],
      }),
      divergences: [],
    });
    const drift = events.filter((e) => e.kind === "manual_family_drift");
    expect(drift).toHaveLength(1);
    expect(drift[0].key).toBe("manual_drift:qwen3-8-27b");
    expect(drift[0].line).toContain("manual-additions.json");
    const clean = buildAlertEvents({ diff: diffFixture({ supersede_drift: [] }), divergences: [] });
    expect(clean.map((e) => e.kind)).not.toContain("manual_family_drift");
  });

  it("shrink fires above 5% only", () => {
    expect(
      buildAlertEvents({ diff: { removed: [], price_deltas: [] }, prevCount: 100, nextCount: 94, divergences: [] }).map((e) => e.kind),
    ).toContain("shrink");
    expect(
      buildAlertEvents({ diff: { removed: [], price_deltas: [] }, prevCount: 100, nextCount: 96, divergences: [] }).map((e) => e.kind),
    ).not.toContain("shrink");
  });

  it("divergence alerts fire on delta-changed records only (level-flat persists quietly)", () => {
    const changed = [
      { model: "DeepSeek V4 Pro", field: "price_in_per_M", ratio: 2.7, changed: true },
    ];
    const flat = [
      { model: "DeepSeek V4 Pro", field: "price_in_per_M", ratio: 2.7, changed: false },
    ];
    const staleFlap = [
      { model: "DeepSeek V4 Pro", field: "price_in_per_M", ratio: 2.7, changed: true, stale: true },
    ];
    expect(buildAlertEvents({ diff: { removed: [], price_deltas: [] }, divergences: changed }).map((e) => e.kind)).toContain("price_divergence_delta");
    expect(buildAlertEvents({ diff: { removed: [], price_deltas: [] }, divergences: flat }).map((e) => e.kind)).not.toContain("price_divergence_delta");
    expect(buildAlertEvents({ diff: { removed: [], price_deltas: [] }, divergences: staleFlap }).map((e) => e.kind)).not.toContain("price_divergence_delta");
  });
});

describe("catalog-alerts — aggregated payload + dedup", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "alerts-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("builds ONE aggregated payload regardless of event count", () => {
    const events = buildAlertEvents({ diff: diffFixture(), divergences: [
      { model: "DeepSeek V4 Pro", field: "price_in_per_M", ratio: 2.7, changed: true },
    ] });
    const payload = buildAlertPayload(events, { prefix: "catalog" });
    expect(payload.title).toContain("3 catalog events");
    expect(payload.body).toContain("Claude Opus 5");
    expect(payload.body).toContain("Price moved 52%");
  });

  it("dedups: second identical run fires nothing; fresh events fire once", async () => {
    const deliver = vi.fn().mockResolvedValue({ ok: true, recordable: true, channels: { forgejo: "posted", localNotification: "notified" } });
    const storePath = path.join(dir, "dedup.json");
    const events = buildAlertEvents({ diff: diffFixture(), divergences: [] });
    const first = await fireAlert(events, { storePath, deliver });
    expect(first.fired).toBe(true);
    expect(deliver).toHaveBeenCalledTimes(1);
    const second = await fireAlert(events, { storePath, deliver });
    expect(second.fired).toBe(false);
    expect(second.reason).toBe("all_deduped");
    expect(deliver).toHaveBeenCalledTimes(1);
    // New event on a later run still fires
    const withNew = [...events, { kind: "shrink", key: "shrink:100:90", line: "Draft shrank" }];
    const third = await fireAlert(withNew, { storePath, deliver });
    expect(third.fired).toBe(true);
  });

  it("public_deploy_drift (#206): kind-deduped across runs — hourly checks yield ONE issue per epoch", async () => {
    // The drift event must dedup by KIND (not by key): the observed asset pair
    // changes every build, so key-dedup would re-fire on every pipeline run.
    // Identical semantics to the pipeline_silence watchdog event.
    const deliver = vi.fn().mockResolvedValue({ ok: true, recordable: true, channels: { forgejo: "posted", localNotification: "notified" } });
    const storePath = path.join(dir, "drift-dedup.json");
    const mk = (pair) => [
      {
        kind: "public_deploy_drift",
        key: "public_deploy_drift:entry-asset-mismatch",
        line: `Public site serves a different build than the private instance (${pair}) — redeploy via docs/deploy/cloudflare-pages.md gate when intended`,
      },
    ];
    const first = await fireAlert(mk("public=a1 private=b1"), { storePath, deliver, dedupByKind: true });
    expect(first.fired).toBe(true);
    // Different observed pair, same kind — still deduped (no second issue)
    const second = await fireAlert(mk("public=a2 private=b2"), { storePath, deliver, dedupByKind: true });
    expect(second.fired).toBe(false);
    expect(second.reason).toBe("all_deduped");
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("failed delivery records NO signatures — events retry next run", async () => {
    const deliver = vi.fn().mockResolvedValue({ ok: false, recordable: false, channels: { forgejo: "no_token", localNotification: "error" } });
    const storePath = path.join(dir, "dedup.json");
    const events = [{ kind: "cloud_removal", key: "cloud_removal:M", line: "removed" }];
    const first = await fireAlert(events, { storePath, deliver });
    expect(first.fired).toBe(true);
    expect(first.ok).toBe(false);
    expect(loadDedupStore(storePath)).toEqual({});
    const second = await fireAlert(events, { storePath, deliver });
    expect(second.fired).toBe(true); // not deduped — retried
    expect(deliver).toHaveBeenCalledTimes(2);
  });

  it("regression 2026-08-20: local-only delivery (forgejo failed) records NO signature — the phantom pipeline_failure class", async () => {
    // Desktop notification succeeded, Forgejo post failed: ok=true but the
    // durable channel never received the event. Recording here swallowed the
    // board trail for the 7d TTL while no issue existed.
    const deliver = vi.fn().mockResolvedValue({ ok: true, recordable: false, channels: { forgejo: "http_403", localNotification: "notified" } });
    const storePath = path.join(dir, "dedup.json");
    const events = [{ kind: "pipeline_failure", key: "pipeline_failure:build", line: "failed" }];
    const first = await fireAlert(events, { storePath, deliver });
    expect(first.fired).toBe(true);
    expect(first.ok).toBe(true); // locally visible
    expect(loadDedupStore(storePath)).toEqual({}); // but nothing recorded
    const second = await fireAlert(events, { storePath, deliver });
    expect(second.fired).toBe(true); // retries until the board receives it
    expect(deliver).toHaveBeenCalledTimes(2);
  });

  it("kind-dedup mode (silence) fires once for repeated calls", async () => {
    const deliver = vi.fn().mockResolvedValue({ ok: true, recordable: true, channels: { forgejo: "posted" } });
    const storePath = path.join(dir, "dedup.json");
    const events = [{ kind: "pipeline_silence", key: "pipeline_silence:24h", line: "silent" }];
    expect((await fireAlert(events, { storePath, deliver, dedupByKind: true })).fired).toBe(true);
    expect((await fireAlert(events, { storePath, deliver, dedupByKind: true })).fired).toBe(false);
  });

  it("dedup store round-trips and prunes", async () => {
    const storePath = path.join(dir, "dedup.json");
    saveDedupStore({ "catalog:x": Date.now() - 8 * 24 * 3600_000, "catalog:y": Date.now() }, storePath);
    const loaded = loadDedupStore(storePath);
    expect(loaded["catalog:x"]).toBeDefined(); // load is raw
    expect(loaded["catalog:y"]).toBeDefined();
    const { pruneDedupStore } = await import("../scripts/lib/catalog-alerts.mjs");
    const pruned = pruneDedupStore(loaded);
    expect(pruned["catalog:x"]).toBeUndefined();
    expect(pruned["catalog:y"]).toBeDefined();
  });
});
