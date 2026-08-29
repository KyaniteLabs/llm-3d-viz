import { describe, expect, it } from "vitest";
import { APP_BRANDING } from "../src/config/app-branding";
import { FORK_DEFAULTS } from "../src/config/fork-defaults";
import {
  DEFAULT_COST_SPEED_BIAS,
  DEFAULT_INTELLIGENCE_FLOOR,
} from "../src/lib/decide";
import { DEFAULT_FILTERS } from "../src/lib/filters";
import { brandLayerFlags } from "../src/viz/palette";

describe("forker config seams", () => {
  it("Decide defaults forward from FORK_DEFAULTS", () => {
    expect(DEFAULT_INTELLIGENCE_FLOOR).toBe(FORK_DEFAULTS.decideFloor);
    expect(DEFAULT_COST_SPEED_BIAS).toBe(FORK_DEFAULTS.decideBias);
  });

  it("filter defaults forward from FORK_DEFAULTS", () => {
    expect(DEFAULT_FILTERS.ageEnabled).toBe(FORK_DEFAULTS.ageFilterDefault);
    expect(DEFAULT_FILTERS.ageMonths).toBe(FORK_DEFAULTS.ageMonthsDefault);
    expect(DEFAULT_FILTERS.multiEffortOnly).toBe(FORK_DEFAULTS.multiEffortOnlyDefault);
    expect(DEFAULT_FILTERS.excludeNonReasoning).toBe(FORK_DEFAULTS.excludeNonReasoningDefault);
    expect(FORK_DEFAULTS.excludeNonReasoningDefault).toBe(true);
  });

  it("APP_BRANDING exposes non-empty title, tagline, documentTitle", () => {
    expect(APP_BRANDING.title.trim().length).toBeGreaterThan(0);
    expect(APP_BRANDING.tagline.trim().length).toBeGreaterThan(0);
    expect(APP_BRANDING.documentTitle.trim().length).toBeGreaterThan(0);
  });

  it("brand layers default off; brandFull/focus turns them on", () => {
    const base = {
      solo: false,
      selected: false,
      cinemaFocus: false,
    } as const;
    const idle = brandLayerFlags({ ...base, brandFull: false });
    expect(idle.showRing).toBe(false);
    expect(idle.showCore).toBe(false);
    expect(FORK_DEFAULTS.brandLayersFullDefault).toBe(false);
    expect(brandLayerFlags({ ...base, brandFull: true }).showRing).toBe(true);
  });
});
