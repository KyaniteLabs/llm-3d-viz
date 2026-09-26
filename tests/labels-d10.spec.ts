import { test, expect } from "@playwright/test";

/**
 * D10 (redefined 2026-08-07): lab identity must be reachable WITHOUT color.
 * The default stage is the Three (r3f) hero; the focus-set (frontier ∪ optimum ∪
 * selected ∪ shortlist ∪ top-K≤12) gets always-on short-name direct labels via the
 * `labelFocusIds` path. These checks prove the label pipeline renders mark labels
 * (optimum always + ≥1 non-optimum frontier mark) in the default view — not only in
 * sparse/cinema contexts.
 */

const displayNameNeedle = (id: string) =>
  id
    .replace(/\s*\((?=[^)]*(?:reasoning|effort|xhigh|\bmax\b|\bhigh\b))[^)]*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 10);

test("D10: focus-set direct labels render in the default r3f stage", async ({ page }) => {
  await page.goto("/?age=0"); // no stage param → default r3f (Three) hero

  // Three stage ready + a real optimum computed + at least one label painted.
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.stageBackend === "r3f" &&
      !!((window as any).__viz?.optimumModelId) &&
      ((window as any).__viz?.visibleCount ?? 0) > 50,
    { timeout: 15000 },
  );
  // Mark labels (optimum + focus-set) are painted during render(); settle a beat.
  await page.waitForFunction(
    () => {
      const root = document.querySelector(".stage-3d-axis-labels");
      return (root?.children.length ?? 0) > 0;
    },
    { timeout: 10000 },
  );

  const { labelText, optimumId, focusIds } = await page.evaluate(() => {
    const root = document.querySelector(".stage-3d-axis-labels");
    return {
      labelText: (root?.textContent ?? "").replace(/\s+/g, " ").trim(),
      optimumId: ((window as any).__viz?.optimumModelId as string) ?? "",
      focusIds: ((window as any).__viz?.labelFocusIds as string[]) ?? [],
    };
  });

  // Baseline: the optimum is always labeled by short name.
  expect(labelText, "label container is empty").toContain(displayNameNeedle(optimumId));

  // NEW (D10): a non-optimum focus-set mark is also labeled by name, so identity is
  // reachable WITHOUT color in the full-catalog default view (not only sparse/cinema).
  const focusLabeled = focusIds.filter(
    (id) => id !== optimumId && labelText.includes(displayNameNeedle(id)),
  );
  expect(
    focusLabeled.length,
    `no non-optimum focus-set mark labeled (focus=${focusIds.length}); labels: "${labelText.slice(0, 180)}"`,
  ).toBeGreaterThanOrEqual(1);
});
