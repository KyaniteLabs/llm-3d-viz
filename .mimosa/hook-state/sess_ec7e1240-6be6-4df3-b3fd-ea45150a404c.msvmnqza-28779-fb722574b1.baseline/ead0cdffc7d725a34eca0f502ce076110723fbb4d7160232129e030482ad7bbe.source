import { describe, expect, it } from "vitest";
import { CLOUD_LABS, HELD_LABS_FOR_LATER } from "../src/data/catalog-scope";
import draftRows from "../data/models.v0.draft.json";

/**
 * WS4 scope-vocabulary lint: every provider present in the draft must be a
 * known scope decision — exactly one of CLOUD_LABS / HELD_LABS_FOR_LATER.
 * An unknown provider fails loudly, named, so a new lab in the AA scrape can
 * never silently fall outside the scope policy.
 */
function scopeViolations(
  providers: readonly string[],
  cloudLabs: readonly string[] = CLOUD_LABS,
  heldLabs: readonly string[] = HELD_LABS_FOR_LATER,
): { unlisted: string[]; inBoth: string[] } {
  const cloud = new Set(cloudLabs);
  const held = new Set(heldLabs);
  const unlisted = new Set<string>();
  const inBoth = new Set<string>();
  for (const p of providers) {
    const inCloud = cloud.has(p);
    const inHeld = held.has(p);
    if (inCloud && inHeld) inBoth.add(p);
    else if (!inCloud && !inHeld) unlisted.add(p);
  }
  return { unlisted: [...unlisted].sort(), inBoth: [...inBoth].sort() };
}

function assertExhaustiveScope(
  providers: readonly string[],
  cloudLabs?: readonly string[],
  heldLabs?: readonly string[],
): void {
  const v = scopeViolations(providers, cloudLabs, heldLabs);
  if (v.unlisted.length || v.inBoth.length) {
    const parts: string[] = [];
    if (v.unlisted.length) {
      parts.push(`not in any scope list: ${v.unlisted.join(", ")}`);
    }
    if (v.inBoth.length) {
      parts.push(`in BOTH CLOUD_LABS and HELD_LABS_FOR_LATER: ${v.inBoth.join(", ")}`);
    }
    throw new Error(
      `catalog scope vocabulary is not exhaustive — ${parts.join("; ")}. ` +
        "Add each provider to exactly one of CLOUD_LABS / HELD_LABS_FOR_LATER in src/data/catalog-scope.ts.",
    );
  }
}

describe("catalog scope vocabulary is exhaustive (WS4)", () => {
  const draftProviders = [
    ...new Set((draftRows as { provider: string }[]).map((r) => r.provider)),
  ].sort();

  it("every draft provider appears in exactly one of CLOUD_LABS / HELD_LABS_FOR_LATER", () => {
    expect(() => assertExhaustiveScope(draftProviders)).not.toThrow();
  });

  it("lists ByteDance Seed and Reka AI as held (WS4 vocab fix)", () => {
    expect(HELD_LABS_FOR_LATER).toContain("ByteDance Seed");
    expect(HELD_LABS_FOR_LATER).toContain("Reka AI");
    expect(CLOUD_LABS).not.toContain("ByteDance Seed");
    expect(CLOUD_LABS).not.toContain("Reka AI");
  });

  it("keeps the two lists disjoint", () => {
    const held = new Set<string>(HELD_LABS_FOR_LATER);
    const overlap = CLOUD_LABS.filter((p) => held.has(p));
    expect(overlap, `providers in both lists: ${overlap.join(", ")}`).toEqual([]);
  });

  it("fails with a named message for an unknown provider (fixture)", () => {
    expect(() => assertExhaustiveScope([...draftProviders, "Unknown Lab"])).toThrow(
      /not in any scope list: .*Unknown Lab/,
    );
  });

  it("fails with a named message for a provider listed in both (fixture)", () => {
    expect(() =>
      assertExhaustiveScope(["OpenAI", "Dual Lab"], ["OpenAI", "Dual Lab"], ["Dual Lab"]),
    ).toThrow(/in BOTH CLOUD_LABS and HELD_LABS_FOR_LATER: Dual Lab/);
  });
});
