import { describe, expect, it } from "vitest";
import {
  diffCatalog,
  todayISO,
  type CatalogSnapshot,
} from "../src/lib/catalog-diff";

describe("catalog-diff — L3 living stage", () => {
  it("first visit (no baseline) is first-visit with no new ids", () => {
    expect(diffCatalog(["a", "b"], null)).toEqual({
      newIds: [],
      removedIds: [],
      isFirstVisit: true,
    });
  });

  it("empty baseline also counts as first-visit (suppress pulse)", () => {
    expect(diffCatalog(["a"], { ids: [], date: "2026-08-01" })).toEqual({
      newIds: [],
      removedIds: [],
      isFirstVisit: true,
    });
  });

  it("detects new ids added since last visit, order-preserving", () => {
    const last: CatalogSnapshot = { ids: ["a", "b"], date: "2026-08-01" };
    expect(diffCatalog(["a", "b", "c", "d"], last).newIds).toEqual(["c", "d"]);
  });

  it("detects removed ids", () => {
    const last: CatalogSnapshot = { ids: ["a", "b", "x"], date: "2026-08-01" };
    expect(diffCatalog(["a", "b"], last).removedIds).toEqual(["x"]);
  });

  it("no changes → empty diff, not first-visit", () => {
    const last: CatalogSnapshot = { ids: ["a", "b"], date: "2026-08-01" };
    const d = diffCatalog(["a", "b"], last);
    expect(d.newIds).toEqual([]);
    expect(d.removedIds).toEqual([]);
    expect(d.isFirstVisit).toBe(false);
  });

  it("a current id present in baseline is never new", () => {
    const last: CatalogSnapshot = { ids: ["a"], date: "2026-08-01" };
    expect(diffCatalog(["a", "b"], last).newIds).toEqual(["b"]);
  });

  it("todayISO yields yyyy-mm-dd", () => {
    expect(todayISO(new Date("2026-08-07T13:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

