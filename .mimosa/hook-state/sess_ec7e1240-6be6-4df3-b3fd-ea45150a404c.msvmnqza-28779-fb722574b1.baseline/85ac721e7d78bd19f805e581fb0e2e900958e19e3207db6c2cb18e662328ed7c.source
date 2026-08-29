import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  DEFAULT_ARCHIVE_MAX_AGE_DAYS,
  DEFAULT_KEEP_RECENT_TAGS,
  DEFAULT_TAG_MAX_AGE_DAYS,
  deriveArchiveName,
  deriveTagName,
  formatTimestampUtc,
  isArchiveName,
  isDataReleaseTag,
  parseTimestampMs,
  selectArchivesToPrune,
  selectTagsToPrune,
} from "../scripts/lib/archive-tag.mjs";

// Fixed clock — every retention decision is a pure function of `now`.
const NOW = new Date("2026-08-14T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const tagAt = (d: Date) => deriveTagName(d);

describe("archive-tag — tag/archive name derivation", () => {
  it("derives data/YYYY-MM-DD-HHMM in UTC", () => {
    expect(deriveTagName(new Date("2026-08-14T09:05:00Z"))).toBe("data/2026-08-14-0905");
    expect(deriveTagName(new Date("2026-01-02T23:58:59Z"))).toBe("data/2026-01-02-2358");
    // A local-time Date still formats as its UTC moment.
    expect(formatTimestampUtc(new Date(Date.UTC(2026, 7, 14, 0, 1)))).toBe("2026-08-14-0001");
  });

  it("derives <YYYY-MM-DD-HHMM>.tgz archive names from the same clock", () => {
    expect(deriveArchiveName(new Date("2026-08-14T09:05:00Z"))).toBe("2026-08-14-0905.tgz");
  });

  it("round-trips a derived tag through parseTimestampMs", () => {
    const t = new Date("2026-08-14T09:05:00Z");
    expect(parseTimestampMs(deriveTagName(t))).toBe(t.getTime());
  });

  it("accepts only well-formed release tags", () => {
    expect(isDataReleaseTag("data/2026-08-14-0905")).toBe(true);
    expect(isDataReleaseTag("v1.0.0")).toBe(false);
    expect(isDataReleaseTag("2026-08-14-0905")).toBe(false); // missing data/ prefix
    expect(isDataReleaseTag("data/2026-08-14-09")).toBe(false); // minute truncated
    expect(isDataReleaseTag("data/2026-13-01-0000")).toBe(false); // impossible month
    expect(isDataReleaseTag("data/2026-02-30-0000")).toBe(false); // impossible day
    expect(isDataReleaseTag("data/2026-08-14-2460")).toBe(false); // impossible hour/minute
  });

  it("ships the ticket's retention defaults (30d tags / keep 12 / 30d archives)", () => {
    expect(DEFAULT_TAG_MAX_AGE_DAYS).toBe(30);
    expect(DEFAULT_KEEP_RECENT_TAGS).toBe(12);
    expect(DEFAULT_ARCHIVE_MAX_AGE_DAYS).toBe(30);
  });
});

describe("archive-tag — tag prune selection (30d / keep-12)", () => {
  it("a 40-day-old tag inside the latest 12 SURVIVES; outside them it is pruned", () => {
    // The 12 newest tags are ALL 40+ days old — keep-N protects every one.
    const newest12 = Array.from({ length: 12 }, (_, i) => tagAt(daysAgo(40 + i)));
    // Tags beyond the latest 12 with comparable age are pruned.
    const outside = [tagAt(daysAgo(60)), tagAt(daysAgo(70)), tagAt(daysAgo(80))];
    const prune = selectTagsToPrune([...newest12, ...outside], { now: NOW });
    expect([...prune].sort()).toEqual([...outside].sort());
    for (const t of newest12) expect(prune).not.toContain(t);
  });

  it("recent tags are never pruned regardless of count", () => {
    const recent = Array.from({ length: 20 }, (_, i) => tagAt(daysAgo(i)));
    expect(selectTagsToPrune(recent, { now: NOW })).toEqual([]);
  });

  it("with ≤12 release tags nothing is pruned even when all are old", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => tagAt(daysAgo(100 + i)));
    expect(selectTagsToPrune(twelve, { now: NOW })).toEqual([]);
  });

  it("age boundary: exactly 30d survives, 31d is pruned (outside the keep set)", () => {
    const anchors = Array.from({ length: DEFAULT_KEEP_RECENT_TAGS }, (_, i) => tagAt(daysAgo(i + 1)));
    const at30 = tagAt(daysAgo(30));
    const at31 = tagAt(daysAgo(31));
    expect(selectTagsToPrune([...anchors, at30], { now: NOW })).toEqual([]);
    expect(selectTagsToPrune([...anchors, at31], { now: NOW })).toEqual([at31]);
  });

  it("non-release tags are ignored — not counted toward keep-12, never pruned", () => {
    const junk = ["v1.0.0", "data/not-a-date", "release-2026"];
    const anchors = Array.from({ length: DEFAULT_KEEP_RECENT_TAGS }, (_, i) => tagAt(daysAgo(i + 1)));
    const old = tagAt(daysAgo(90));
    expect(selectTagsToPrune([...junk, ...anchors, old], { now: NOW })).toEqual([old]);
  });

  it("keepRecent=0 degrades to a pure age prune; result is oldest-first", () => {
    const tags = [tagAt(daysAgo(5)), tagAt(daysAgo(40)), tagAt(daysAgo(60))];
    expect(selectTagsToPrune(tags, { now: NOW, keepRecent: 0 })).toEqual([
      tagAt(daysAgo(60)),
      tagAt(daysAgo(40)),
    ]);
  });
});

describe("archive-tag — archive prune window", () => {
  it("prunes archives strictly older than 30 days — full prune, no keep-N", () => {
    const entries = [
      { name: "2026-08-09-0000.tgz", mtimeMs: daysAgo(5).getTime() },
      { name: "2026-07-15-1200.tgz", mtimeMs: daysAgo(30).getTime() }, // exactly 30d → survives
      { name: "2026-07-14-1200.tgz", mtimeMs: daysAgo(31).getTime() },
      { name: "2026-07-05-0000.tgz", mtimeMs: daysAgo(40).getTime() },
    ];
    expect(selectArchivesToPrune(entries, { now: NOW })).toEqual([
      "2026-07-05-0000.tgz",
      "2026-07-14-1200.tgz", // oldest first
    ]);
  });

  it("prunes ALL stale archives even when there are many (no rollup anchors)", () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      name: `2026-06-${String(i + 1).padStart(2, "0")}-0000.tgz`,
      mtimeMs: daysAgo(40 + i).getTime(),
    }));
    expect(selectArchivesToPrune(entries, { now: NOW })).toHaveLength(20);
  });

  it("falls back to the name-encoded timestamp when mtime is missing", () => {
    expect(
      selectArchivesToPrune([{ name: "2026-07-01-0000.tgz" }], { now: NOW }), // 44d old by name
    ).toEqual(["2026-07-01-0000.tgz"]);
    expect(
      selectArchivesToPrune([{ name: "2026-08-10-0000.tgz" }], { now: NOW }), // 4d old by name
    ).toEqual([]);
  });

  it("never touches non-archive names or undatable files", () => {
    const entries = [
      { name: "notes.txt", mtimeMs: daysAgo(400).getTime() },
      { name: "manual.tgz", mtimeMs: daysAgo(400).getTime() }, // not our naming pattern
      { name: "not-a-date.tgz" }, // undatable via name, no mtime
      { name: "2026-01-01-0000.tgz", mtimeMs: NaN }, // still datable via name → prunable
    ];
    expect(entries.filter((e) => isArchiveName(e.name)).map((e) => e.name)).toEqual([
      "2026-01-01-0000.tgz",
    ]);
    expect(selectArchivesToPrune(entries, { now: NOW })).toEqual(["2026-01-01-0000.tgz"]);
  });
});
