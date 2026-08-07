import { describe, expect, it } from "vitest";
import {
  INTELLIGENCE_TASK_ANCHORS,
  formatTaskAnchorStageLabel,
  nearestTaskAnchor,
  taskAnchorsInDomain,
} from "../src/lib/intelligence-task-anchors";

describe("intelligence-task-anchors", () => {
  it("exports sparse plain-English work bands, not benchmark jargon", () => {
    expect(INTELLIGENCE_TASK_ANCHORS.length).toBeGreaterThanOrEqual(4);
    let prev = -1;
    for (const a of INTELLIGENCE_TASK_ANCHORS) {
      expect(a.index).toBeGreaterThan(prev);
      prev = a.index;
      expect(a.short.length).toBeGreaterThan(18);
      // No raw eval acronyms in the on-stage short line
      expect(a.short).not.toMatch(/\b(GPQA|HLE|SWE|METR|LCB)\b/i);
      expect(a.example.length).toBeGreaterThan(30);
      expect(a.sources.length).toBeGreaterThan(10);
    }
  });

  it("stage label is the plain work description only", () => {
    const a = INTELLIGENCE_TASK_ANCHORS.find((x) => x.index === 52)!;
    expect(formatTaskAnchorStageLabel(a)).toBe(a.short);
    expect(formatTaskAnchorStageLabel(a)).toMatch(/bug|fix|test/i);
  });

  it("filters anchors to the visible intelligence domain", () => {
    const mid = taskAnchorsInDomain(12, 62);
    expect(mid.length).toBeGreaterThanOrEqual(3);
    expect(taskAnchorsInDomain(80, 90)).toEqual([]);
  });

  it("nearest band maps Index values for tooltips", () => {
    expect(nearestTaskAnchor(20).short).toMatch(/email|FAQ|notes/i);
    expect(nearestTaskAnchor(52).short).toMatch(/bug|fix/i);
    expect(nearestTaskAnchor(62).short).toMatch(/autonomous|project|babysitting/i);
  });
});
