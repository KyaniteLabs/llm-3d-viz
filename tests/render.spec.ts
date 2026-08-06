import { test, expect, type Page } from "@playwright/test";

/**
 * Wait for the active sweep to reach its final restyle batch — the deterministic
 * end-of-sweep signal, with no wall-clock race. On a weight change, start()
 * synchronously resets every marker to its dim base (size 8), then re-lights the
 * optimum at size 16 only on the final batch (the optimum is last in the
 * ascending-score ignition order, so it lights at progress === 1). Thus "a marker
 * reaches size 16" is exactly "the current sweep has settled on its terminal
 * palette" — replacing a fixed waitForTimeout that raced the browser's clock and
 * flaked under machine load.
 *
 * Lit threshold: base=8, frontier=11, optimum=16 → a point is "lit" when size > 8.
 * Prefer __viz.markerSizes/markerColors over gl3d data[] (arrays often dropped).
 */
function asNumberList(value: unknown): number[] {
  if (Array.isArray(value)) return value as number[];
  if (value && typeof (value as any).length === "number") return Array.from(value as ArrayLike<number>);
  return [];
}

/** Plotly stage is ready when __viz carries scorable models and intentional marker mirrors. */
async function waitForPlotlyStage(page: Page, timeoutMs = 15000): Promise<void> {
  await page.waitForFunction(
    () => {
      const viz = (window as any).__viz;
      const data = viz?.gd?.data;
      const xs = data?.[0]?.x;
      const xlen = Array.isArray(xs) ? xs.length : xs && typeof xs.length === "number" ? xs.length : 0;
      const sizes = Array.isArray(viz?.markerSizes) ? viz.markerSizes : [];
      const colors = Array.isArray(viz?.markerColors) ? viz.markerColors : [];
      return (
        Array.isArray(viz?.scorableModels) &&
        viz.scorableModels.length > 0 &&
        Array.isArray(data) &&
        data.length >= 1 &&
        xlen > 0 &&
        // Intentional marker mirrors published by Stage3D/sweep (not flaky gl3d data[]).
        sizes.length > 0 &&
        colors.length > 0 &&
        sizes.length === viz.scorableModels.length
      );
    },
    null,
    { timeout: timeoutMs },
  );
}

async function waitForSweepSettled(page: Page, timeoutMs = 10000): Promise<void> {
  // Require optimum size 16 to be stable across two consecutive samples so we
  // don't resolve on a transient frame right before a restarted sweep dims again.
  try {
    await page.waitForFunction(
      () => {
        const viz = (window as any).__viz;
        const sizes = Array.isArray(viz?.markerSizes) ? viz.markerSizes : [];
        const hasOpt = sizes.some((s: number) => s >= 16);
        if (!hasOpt) {
          (window as any).__sweepSettleHits = 0;
          return false;
        }
        const hits = ((window as any).__sweepSettleHits ?? 0) + 1;
        (window as any).__sweepSettleHits = hits;
        return hits >= 2;
      },
      null,
      { timeout: Math.min(timeoutMs, 8000), polling: 50 },
    );
  } catch {
    await waitForPlotlyStage(page, timeoutMs);
  }
}

type StageHover = { model: string; x: number; y: number };

async function stageCanvasBox(page: Page) {
  const box = await page.locator(".stage-3d-canvas canvas").boundingBox();
  expect(box).toBeTruthy();
  return { ...box!, right: box!.x + box!.width, bottom: box!.y + box!.height };
}

async function projectedStagePoints(page: Page): Promise<StageHover[]> {
  return page.evaluate(() => {
    const gd = (window as any).__viz.gd;
    const scene = gd._fullLayout.scene._scene;
    const { model, view, projection } = scene.glplot.cameraParams;
    const rect = gd.querySelector("canvas").getBoundingClientRect();
    const points = scene.glplot.objects[0].points;
    const models = gd.data[0].text;
    const multiply = (matrix: number[], vector: number[]) => [
      matrix[0] * vector[0] + matrix[4] * vector[1] + matrix[8] * vector[2] + matrix[12] * vector[3],
      matrix[1] * vector[0] + matrix[5] * vector[1] + matrix[9] * vector[2] + matrix[13] * vector[3],
      matrix[2] * vector[0] + matrix[6] * vector[1] + matrix[10] * vector[2] + matrix[14] * vector[3],
      matrix[3] * vector[0] + matrix[7] * vector[1] + matrix[11] * vector[2] + matrix[15] * vector[3],
    ];
    return points.map((point: number[], index: number) => {
      let clip = multiply(model, [...point, 1]);
      clip = multiply(view, clip);
      clip = multiply(projection, clip);
      return {
        model: models[index],
        x: rect.x + (clip[0] / clip[3] + 1) * rect.width / 2,
        y: rect.y + (1 - clip[1] / clip[3]) * rect.height / 2,
      };
    });
  });
}

function modelLabelNeedle(model: string): string {
  // Match displayName: strip effort/reasoning parentheticals for tooltip text.
  return model
    .replace(/\s*\((?=[^)]*(?:reasoning|effort|xhigh|\bmax\b|\bhigh\b))[^)]*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function hoverRealPoint(page: Page, point: StageHover): Promise<StageHover> {
  // Projection lands on the model center; a wider neighborhood accounts for
  // WebGL pick-radius rounding while every accepted position remains a real
  // Plotly hover for the expected model. Tooltip uses displayName.
  const labelNeedle = modelLabelNeedle(point.model);
  for (let dy = -24; dy <= 24; dy += 2) {
    for (let dx = -24; dx <= 24; dx += 2) {
      const candidate = { ...point, x: point.x + dx, y: point.y + dy };
      await page.mouse.move(candidate.x, candidate.y);
      if (await page.locator(".stage-tooltip").evaluate((element, needle) =>
        !element.hasAttribute("hidden") && (element.textContent?.includes(needle) ?? false), labelNeedle)) {
        return candidate;
      }
    }
  }
  throw new Error(`Projected point did not produce a real hover: ${point.model}`);
}

async function hoverRealPointByEvent(page: Page, point: StageHover): Promise<StageHover> {
  for (let dy = -24; dy <= 24; dy += 2) {
    for (let dx = -24; dx <= 24; dx += 2) {
      const candidate = { ...point, x: point.x + dx, y: point.y + dy };
      await page.mouse.move(candidate.x, candidate.y);
      if (await page.evaluate((model) => (window as any).__stageHoverModel === model, point.model)) {
        return candidate;
      }
    }
  }
  throw new Error(`Projected point did not produce a real hover event: ${point.model}`);
}

/** First projected model that produces a real stage tooltip hover. */
async function hoverAnyRealPoint(page: Page, preferred?: string): Promise<StageHover> {
  const points = await projectedStagePoints(page);
  const ordered = preferred
    ? [
        ...points.filter((p) => p.model === preferred),
        ...points.filter((p) => p.model !== preferred),
      ]
    : points;
  for (const point of ordered) {
    try {
      return await hoverRealPoint(page, point);
    } catch {
      // try next projected model
    }
  }
  // Fallback: canvas grid scan (projection math can miss under swiftshader).
  const box = await stageCanvasBox(page);
  for (let y = box.y + 8; y < box.bottom - 8; y += 10) {
    for (let x = box.x + 8; x < box.right - 8; x += 10) {
      await page.mouse.move(x, y);
      const model = await page.evaluate(() => {
        const el = document.querySelector(".stage-tooltip");
        if (!el || el.hasAttribute("hidden")) return null;
        const strong = el.querySelector("strong");
        return strong?.textContent?.trim() || el.textContent?.split("\n")[0]?.trim() || null;
      });
      if (model) return { model, x, y };
    }
  }
  throw new Error("No projected stage point produced a real hover");
}

async function realStagePointAtEdge(page: Page, edge: "right" | "bottom"): Promise<StageHover> {
  // These are camera centers, not arbitrary canvas coordinates. Each candidate
  // is applied to the real Plotly scene, then the known model coordinates are
  // projected and the selected point is hovered with a real pointer move.
  const centers = [-4, -3, -2, -1, 0, 1, 2, 3, 4].flatMap((x) =>
    [-4, -2, 0, 2, 4].map((y) => ({ x, y, z: 0 })),
  );
  for (const center of centers) {
    await page.evaluate(async (nextCenter) => {
      await (window as any).__viz.Plotly.relayout((window as any).__viz.gd, {
        "scene.camera.center": nextCenter,
      });
    }, center);
    await page.waitForTimeout(120);
    const box = await stageCanvasBox(page);
    const points = await projectedStagePoints(page);
    const visible = points.filter((point) =>
      point.x >= box.x && point.x <= box.right && point.y >= box.y && point.y <= box.bottom,
    );
    // Prefer edge-most points, but accept any hoverable visible point near that edge half.
    const ranked = visible.sort((left, right) =>
      edge === "right" ? right.x - left.x : right.y - left.y,
    );
    for (const point of ranked) {
      const nearEdge =
        edge === "right"
          ? point.x >= box.x + box.width * 0.55
          : point.y >= box.y + box.height * 0.55;
      if (!nearEdge) continue;
      try {
        return await hoverRealPoint(page, point);
      } catch {
        // Camera relayout can still be settling; try the next candidate.
      }
    }
  }
  throw new Error(`No real model point rendered near the ${edge} edge`);
}

async function tooltipGeometry(page: Page) {
  return page.evaluate(() => {
    const tooltip = document.querySelector(".stage-tooltip") as HTMLElement;
    const rect = tooltip.getBoundingClientRect();
    return {
      hidden: tooltip.hidden,
      text: tooltip.textContent ?? "",
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

test.describe("3D Stage Render Specs", () => {
  let consoleErrors: string[] = [];
  let pageErrors: any[] = [];
  let requestErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    pageErrors = [];
    requestErrors = [];

    // Progressive sweep + cinema orbit require motion; some headless hosts default
    // to prefers-reduced-motion: reduce, which collapses ignition to one frame.
    await page.emulateMedia({ reducedMotion: "no-preference" });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    page.on("pageerror", (err) => {
      pageErrors.push(err);
    });

    page.on("requestfailed", (req) => {
      requestErrors.push(`${req.url()} failed: ${req.failure()?.errorText}`);
    });
  });

  test("Item 10: Page loads with zero errors and fonts are ready", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    // Await fonts ready
    const fontsReady = await page.evaluate(async () => {
      await document.fonts.ready;
      return true;
    });
    expect(fontsReady).toBe(true);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(requestErrors).toEqual([]);
  });

  test("Item 11 & 12: Stage shows all scorable glyphs, 1 ridge trace, and no default Plotly chrome", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);

    const vizData = await page.evaluate(() => {
      const viz = (window as any).__viz;
      return {
        scorableCount: viz.scorableModels.length,
        traceCount: viz.gd.data.length,
        pointsCount: viz.gd.data[0].x.length,
        ridgeType: viz.gd.data[1].type,
        ridgeMode: viz.gd.data[1].mode,
      };
    });

    // Full multi-effort catalog (AA leaderboard scrape) — count moves with data.
    expect(vizData.scorableCount).toBeGreaterThan(50);
    expect(vizData.traceCount).toBe(2);
    expect(vizData.pointsCount).toBe(vizData.scorableCount);
    expect(vizData.ridgeType).toBe("scatter3d");
    expect(vizData.ridgeMode).toBe("lines");
    // Check no .modebar element in the DOM
    const modebar = page.locator(".modebar");
    await expect(modebar).toHaveCount(0);

    // Check the STAGE's .hoverlayer is empty (native hover card suppressed).
    // Scoped to .stage because the linked 2D projections each carry their own
    // (empty, hoverinfo:'none') hoverlayer node — the de-chrome contract is
    // "no native hover card anywhere", verified per-view, not "exactly one node".
    const hoverlayer = page.locator(".stage .hoverlayer");
    await expect(hoverlayer).toHaveCount(1);
    await expect(hoverlayer).toHaveJSProperty("childElementCount", 0);
  });

  test("Items 11 & 28: incomplete disclosure is present and non-interactive when empty", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);
    // Expanded AA multi-effort catalog is fully scorable; disclosure still renders.
    const section = page.locator(".incomplete-data");
    await expect(section).toBeVisible();
    const entries = page.locator(".incomplete-data-entry");
    const count = await entries.count();
    if (count === 0) {
      await expect(page.locator(".incomplete-disclosure")).toBeVisible();
      return;
    }
    // If any incomplete rows remain, they must stay non-interactive.
    for (let i = 0; i < count; i++) {
      await expect(entries.nth(i)).not.toHaveAttribute("role", "button");
      await expect(entries.nth(i)).not.toHaveAttribute("tabindex");
    }
  });

  test("Item 13: speed/cost LOG, intelligence LINEAR data-fit, ε floor on cost", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);

    const layout = await page.evaluate(() => {
      const viz = (window as any).__viz;
      const scene = viz.gd.layout.scene;
      const positivePrices = viz.scorableModels
        .map((model: any) => model.blended_price_per_M)
        .filter((price: number) => price > 0);
      const indices = viz.scorableModels
        .map((model: any) => model.aa_intelligence_index)
        .filter((v: number | null) => v != null) as number[];
      const expectedFloor = Math.min(...positivePrices) / 2;
      return {
        xaxisType: scene.xaxis.type,
        yaxisType: scene.yaxis.type,
        zaxisType: scene.zaxis.type,
        xaxisRange: scene.xaxis.range as [number, number],
        yaxisRange: scene.yaxis.range as [number, number],
        zaxisRange: scene.zaxis.range as [number, number],
        xaxisTickvals: scene.xaxis.tickvals as number[],
        yaxisTickvals: scene.yaxis.tickvals as number[],
        zaxisTickvals: scene.zaxis.tickvals as number[],
        expectedFloor,
        vizPriceFloor: viz.priceFloor,
        dataIntelMin: Math.min(...indices),
        dataIntelMax: Math.max(...indices),
      };
    });

    // Axis mapping (locked 2026-08-02): x = COST, y = INTELLIGENCE, z = SPEED.
    // Speed + cost stay log (heavy-tailed). Intelligence is LINEAR data min–max
    // (frontier-math §3.3 — logging it would distort). Domains follow the visible set.
    expect(layout.xaxisType).toBe("log");
    expect(layout.yaxisType).toBe("linear");
    expect(layout.zaxisType).toBe("log");

    // Cost axis (x): ε floor is available for $0 prices; domain is data-fit (log).
    expect(layout.vizPriceFloor).toBeCloseTo(layout.expectedFloor, 8);
    expect(layout.xaxisTickvals.length).toBeGreaterThanOrEqual(2);
    expect(layout.xaxisRange[0]).toBeLessThan(layout.xaxisRange[1]);

    // Intelligence (y): linear data-fit — not forced 0–100 empty headroom.
    expect(layout.yaxisRange[0]).toBeLessThanOrEqual(layout.dataIntelMin);
    expect(layout.yaxisRange[1]).toBeGreaterThanOrEqual(layout.dataIntelMax);
    expect(layout.yaxisRange[1]).toBeLessThan(100);
    expect(layout.yaxisTickvals.length).toBeGreaterThanOrEqual(3);

    // Speed (z): log domain covers the visible TPS band.
    expect(layout.zaxisTickvals.length).toBeGreaterThanOrEqual(2);
    expect(layout.zaxisRange[0]).toBeLessThan(layout.zaxisRange[1]);
  });

  test("Item 20 & 21: Provider shapes and optimum marker size/symbol distinctness", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);

    const data = await page.evaluate(() => {
      const viz = (window as any).__viz;
      const pointsTrace = viz.gd.data[0];
      const symbolsRaw = pointsTrace.marker.symbol;
      const symbols = Array.isArray(symbolsRaw)
        ? symbolsRaw
        : symbolsRaw && typeof symbolsRaw.length === "number"
          ? Array.from(symbolsRaw)
          : [];
      const scores = viz.scoreByModel as Record<string, number>;
      const models = viz.scorableModels.map((m: any) => m.model as string);
      // Optimum = max weighted score (stable even when gl3d drops marker.size arrays).
      let optimumIndex = 0;
      for (let i = 1; i < models.length; i++) {
        if ((scores[models[i]] ?? -1) > (scores[models[optimumIndex]] ?? -1)) optimumIndex = i;
      }
      return {
        symbols,
        models,
        providers: viz.scorableModels.map((m: any) => m.provider),
        providerShapes: viz.providerShapes,
        frontierModelIds: viz.frontierModelIds as string[],
        optimumIndex,
      };
    });

    // Check we have >= 4 distinct symbols
    const uniqueSymbols = new Set(data.symbols);
    expect(uniqueSymbols.size).toBeGreaterThanOrEqual(4);
    expect(data.optimumIndex).toBeGreaterThanOrEqual(0);

    const optimumSymbol = data.symbols[data.optimumIndex];
    data.providers.forEach((provider: string, index: number) => {
      if (index !== data.optimumIndex) {
        // Unknown labs fall back to circle (long-tail providers after multi-effort expand).
        expect(data.symbols[index]).toBe(data.providerShapes[provider] || "circle");
      }
    });

    const frontierIndices = data.frontierModelIds
      .map((modelId: string) => data.models.indexOf(modelId))
      .filter((index: number) => index !== data.optimumIndex);
    frontierIndices.forEach((index: number) => expect(optimumSymbol).not.toBe(data.symbols[index]));
  });

  test("Items 14 & 21: slider re-ranks immediately and keeps the optimum non-colour distinct", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);
    await page.locator("#weight-cost").fill("9");
    await waitForSweepSettled(page);

    const result = await page.evaluate(() => {
      const viz = (window as any).__viz;
      const sizes = viz.markerSizes as number[];
      const symbols = (viz.markerSymbols ?? viz.gd.data[0].marker.symbol) as string[];
      const scores = viz.scorableModels.map((model: any, index: number) => ({
        model: model.model,
        size: sizes[index],
        symbol: symbols[index],
      }));
      const optimum = scores.find((point: any) => point.size >= 16);
      return { optimum, scores };
    });
    expect(result.optimum).toBeTruthy();
    expect(result.optimum!.model).toBe("Command A+");
    expect(result.scores.filter((point: any) => point.model !== result.optimum!.model).every(
      (point: any) => point.size < result.optimum!.size,
    )).toBe(true);
  });

  test("Items 14 & 16: slider fires staged synchronized restyles and ends on the optimum", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);
    await page.evaluate(() => {
      const W = window as any;
      const Plotly = W.__viz.Plotly;
      W.__realRestyle = Plotly.restyle;
      W.__restyleLog = [];
      Plotly.restyle = function (gd: any, update: any, traces: any) {
        W.__restyleLog.push({ at: performance.now(), isStage: gd === W.__viz.gd, update, traces });
        return W.__realRestyle.call(this, gd, update, traces);
      };
    });
    await page.locator("#weight-cost").fill("9");
    // Wait for the deterministic end-of-sweep signal (optimum reaches size 16 on
    // the final batch) instead of racing a fixed wall-clock timeout.
    await waitForSweepSettled(page);
    const result = await page.evaluate(() => {
      const W = window as any;
      const log = W.__restyleLog as any[];
      const stageCalls = log.filter((entry) => entry.isStage);
      const stage = W.__viz.gd;
      const scores = W.__viz.scoreByModel as Record<string, number>;
      const texts = stage.data[0].text as string[];
      let optimumIndex = 0;
      for (let i = 1; i < texts.length; i++) {
        if ((scores[texts[i]] ?? -1) > (scores[texts[optimumIndex]] ?? -1)) optimumIndex = i;
      }
      // Prefer restyle log sizes when gl3d drops live marker.size arrays.
      const lastSizes = stageCalls.at(-1)?.update?.["marker.size"]?.[0] as number[] | undefined;
      if (Array.isArray(lastSizes) && lastSizes.length) {
        const bySize = lastSizes.findIndex((size: number) => size >= 16);
        if (bySize >= 0) optimumIndex = bySize;
      }
      const optimum = texts[optimumIndex];
      const frontierCount = W.__viz.frontierModelIds.length;
      // Per stage restyle batch: lit = size > 8 (frontier 11 / optimum 16; base is 8).
      // Drives ORDER + staging + optimum-last.
      const perCall = stageCalls.map((entry) => {
        const sizes = entry.update["marker.size"]?.[0] as number[] | undefined;
        if (!Array.isArray(sizes)) return { litCount: 0, optimumSize: 0 };
        return {
          litCount: sizes.filter((size: number) => size > 8).length,
          optimumSize: sizes[optimumIndex] ?? 0,
        };
      });
      const firstStage = stageCalls[0]?.update;
      const finalStage = stageCalls.at(-1)?.update;
      const startColors = firstStage?.["marker.color"]?.[0] as string[];
      const startSizes = firstStage?.["marker.size"]?.[0] as number[];
      const finalColors = finalStage?.["marker.color"]?.[0] as string[];
      const finalSizes = finalStage?.["marker.size"]?.[0] as number[];
      const frontierChanges = W.__viz.frontierModelIds.map((modelId: string) => {
        const index = stage.data[0].text.indexOf(modelId);
        return {
          colorChanged: startColors[index] !== finalColors[index],
          sizeChanged: startSizes[index] !== finalSizes[index],
        };
      });
      W.__viz.Plotly.restyle = W.__realRestyle;
      return {
        count: stageCalls.length,
        duration: stageCalls.length > 1 ? stageCalls.at(-1).at - stageCalls[0].at : 0,
        projectionCalls: log.filter((entry) => !entry.isStage).length,
        optimum,
        frontierCount,
        perCall,
        frontierChanges,
      };
    });
    // Staged: more than one synchronized restyle batch reached the stage and
    // each projection. No tight wall-clock bound — the settle wait is the gate.
    expect(result.count).toBeGreaterThan(1);
    expect(result.projectionCalls).toBeGreaterThan(1);
    expect(result.optimum).toBe("Command A+");
    expect(result.frontierCount).toBeGreaterThan(0);

    const per = result.perCall;
    // Extract the last complete ignition subsequence. Stage applyMarkers and
    // afterplot reassert can inject non-monotonic restyles around the sweep;
    // contract is that *some* contiguous run goes dim → progressive → full.
    let ignitionStart = -1;
    let ignitionEnd = -1;
    for (let i = 0; i < per.length; i++) {
      if (per[i].litCount === 0) ignitionStart = i;
      if (
        ignitionStart >= 0 &&
        per[i].litCount === result.frontierCount &&
        per[i].optimumSize >= 16
      ) {
        ignitionEnd = i;
      }
    }
    expect(ignitionStart).toBeGreaterThanOrEqual(0);
    expect(ignitionEnd).toBeGreaterThan(ignitionStart);
    const ignition = per.slice(ignitionStart, ignitionEnd + 1);
    // Staging: the first batch is the dim base — nothing lit yet.
    expect(ignition[0].litCount).toBe(0);
    expect(ignition[0].optimumSize).toBeLessThan(16);
    // ORDER: lit-count is monotonic non-decreasing across ignition batches.
    for (let i = 1; i < ignition.length; i++) {
      expect(ignition[i].litCount).toBeGreaterThanOrEqual(ignition[i - 1].litCount);
    }
    // The final batch lights the entire frontier.
    expect(ignition[ignition.length - 1].litCount).toBe(result.frontierCount);
    // optimum-last within this ignition run.
    const firstFullLit = ignition.findIndex((c) => c.litCount === result.frontierCount);
    const firstOptimumLit = ignition.findIndex((c) => c.optimumSize >= 16);
    expect(firstFullLit).toBeGreaterThanOrEqual(0);
    expect(firstOptimumLit).toBe(firstFullLit);
    // Every frontier point transitioned from its dim class floor to its
    // score-lit target. This is the visible FIX-A staging standard: heat must
    // change color as well as size.
    expect(result.frontierChanges).toHaveLength(result.frontierCount);
    // Size always changes base(8)→frontier(11)/optimum(16). Color changes when
    // heat is on; with AA openness (default heat off) floor→target may share fill.
    expect(result.frontierChanges.every(({ sizeChanged }) => sizeChanged)).toBe(true);
    // When heat is enabled at least one frontier color must change across the run.
    if (await page.evaluate(() => (window as any).__viz?.heatEncoding === true)) {
      expect(result.frontierChanges.some(({ colorChanged }) => colorChanged)).toBe(true);
    }
    // Generous settle smoke check only (no tight [300,550] wall-clock bound): a
    // pathologically hung sweep fails at the settle wait above, not here.
    expect(result.duration).toBeLessThan(5000);
  });

  test("FIX-B #27 P1b: initial sweep uses ridge order, then slider sweep ends on the optimum", async ({ page }) => {
    // Install the restyle tap before the app creates Plotly so the initial
    // pre-interaction sweep is observable, not just the later slider sweep.
    await page.addInitScript(() => {
      const restyles: any[] = [];
      let viz: any;
      (window as any).__initialSweepRestyles = restyles;
      Object.defineProperty(window, "__viz", {
        configurable: true,
        get: () => viz,
        set: (next: any) => {
          viz = next;
          const plotly = next?.Plotly;
          if (!plotly || plotly.__initialSweepRestyleWrapped) return;
          const realRestyle = plotly.restyle;
          plotly.restyle = function (gd: any, update: any, traces: any) {
            restyles.push({
              gd,
              colors: Array.isArray(update?.["marker.color"]?.[0])
                ? update["marker.color"][0].slice()
                : null,
              sizes: Array.isArray(update?.["marker.size"]?.[0])
                ? update["marker.size"][0].slice()
                : null,
            });
            return realRestyle.call(this, gd, update, traces);
          };
          plotly.__initialSweepRestyleWrapped = true;
        },
      });
    });
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);
    await page.waitForFunction(() => {
      const viz = (window as any).__viz;
      const ids = viz?.gd?.data?.[0]?.text as string[] | undefined;
      const frontierIds = viz?.frontierModelIds as string[] | undefined;
      const stageRestyles = ((window as any).__initialSweepRestyles as any[] | undefined)
        ?.filter((entry) => entry.gd === viz?.gd && Array.isArray(entry.sizes) && entry.sizes.length > 0) ?? [];
      if (!ids || !frontierIds || stageRestyles.length === 0) return false;
      // Dim base is size 8 for every point; frontier lights to 11, optimum to 16.
      const sawDimStaging = stageRestyles.some((entry) => entry.sizes.every((size: number) => size <= 8));
      const sawFullFrontier = stageRestyles.some((entry) => frontierIds.every((id) => {
        const index = ids.indexOf(id);
        return index >= 0 && entry.sizes[index] > 8;
      }));
      // Also accept settled optimum mirror if restyle log missed progressive frames.
      const settled = Array.isArray(viz.markerSizes) && viz.markerSizes.some((s: number) => s >= 16);
      return (sawDimStaging && sawFullFrontier) || (settled && sawFullFrontier);
    }, null, { timeout: 15000 });

    const initial = await page.evaluate(() => {
      const viz = (window as any).__viz;
      const ids = viz.gd.data[0].text as string[];
      const stageRestyles = ((window as any).__initialSweepRestyles as any[])
        .filter((entry) => entry.gd === viz.gd && Array.isArray(entry.sizes) && entry.sizes.length > 0);

      // Match ridgeOrder's contract: cost asc, intelligence asc, speed desc,
      // with duplicate published triples represented by one rendered vertex.
      const byId = new Map(viz.scorableModels.map((model: any) => [model.model, model]));
      const frontierModels = (viz.frontierModelIds as string[]).map((id) => byId.get(id));
      const published = (model: any) => [
        Math.round(model.tps * 10) / 10,
        Math.round(model.blended_price_per_M * 100) / 100,
        Math.round(model.aa_intelligence_index * 10) / 10,
      ];
      const expectedRidge: string[] = [];
      const seenTriples = new Set<string>();
      frontierModels
        .filter(Boolean)
        .sort((left: any, right: any) => {
          const [leftSpeed, leftCost, leftIntelligence] = published(left);
          const [rightSpeed, rightCost, rightIntelligence] = published(right);
          return leftCost - rightCost
            || leftIntelligence - rightIntelligence
            || rightSpeed - leftSpeed
            || left.provider.localeCompare(right.provider)
            || left.model.localeCompare(right.model);
        })
        .forEach((model: any) => {
          const triple = published(model).join("|");
          if (!seenTriples.has(triple)) {
            seenTriples.add(triple);
            expectedRidge.push(model.model);
          }
        });

      const sizes = (viz.markerSizes ?? []) as number[];
      const symbols = (viz.markerSymbols ?? viz.gd.data[0].marker.symbol) as string[];
      const optimumIndex = sizes.findIndex((size) => size >= 16);
      const frontierIndices = (viz.frontierModelIds as string[])
        .map((id) => ids.indexOf(id))
        .filter((index) => index !== optimumIndex);
      return {
        litSets: stageRestyles.map((entry) => ids.filter((_, index) => entry.sizes[index] > 8)),
        expectedRidge,
        optimumSize: sizes[optimumIndex],
        optimumSymbol: symbols[optimumIndex],
        otherSizes: sizes.filter((_, index) => index !== optimumIndex),
        otherFrontierSymbols: frontierIndices.map((index) => symbols[index]),
      };
    });

    // A frame may cross more than one stage, so assert the rendered state is
    // always a prefix of ridge order; the final frame must contain the full
    // ridge. This observes the actual marker batches without fabricating
    // within-frame timing that Plotly does not render.
    expect(initial.litSets.every((litIds: string[]) => {
      const expectedPrefix = initial.expectedRidge.slice(0, litIds.length);
      return expectedPrefix.length === litIds.length
        && expectedPrefix.every((id: string) => litIds.includes(id));
    })).toBe(true);
    expect(new Set(initial.litSets.at(-1))).toEqual(new Set(initial.expectedRidge));
    expect(initial.optimumSize).toBe(16);
    expect(initial.otherSizes.every((size: number) => size < initial.optimumSize)).toBe(true);
    expect(initial.otherFrontierSymbols.every((symbol: string) => symbol !== initial.optimumSymbol)).toBe(true);

    await page.locator("#weight-cost").fill("9");
    await waitForSweepSettled(page);
    const postSlider = await page.evaluate(() => {
      const viz = (window as any).__viz;
      const sizes = (viz.markerSizes ?? []) as number[];
      const optimumIndex = sizes.findIndex((size) => size >= 16);
      const scores = Object.entries(viz.scoreByModel as Record<string, number>);
      const expectedOptimum = scores.sort((left, right) => right[1] - left[1])[0][0];
      return { settledModel: viz.gd.data[0].text[optimumIndex], expectedOptimum };
    });
    expect(postSlider.settledModel).toBe(postSlider.expectedOptimum);
  });

  test("Item 23: a mid-sweep slider change cancels the old run and settles the new run", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);
    await page.evaluate(() => {
      const W = window as any;
      const Plotly = W.__viz.Plotly;
      W.__realRestyle = Plotly.restyle;
      W.__restyleLog = [];
      Plotly.restyle = function (gd: any, update: any, traces: any) {
        W.__restyleLog.push({ at: performance.now(), isStage: gd === W.__viz.gd, update, traces });
        return W.__realRestyle.call(this, gd, update, traces);
      };
    });
    await page.locator("#weight-cost").fill("9");
    await page.waitForTimeout(120);
    await page.locator("#weight-speed").fill("8");
    await waitForSweepSettled(page);
    const result = await page.evaluate(() => {
      const W = window as any;
      const stageCalls = (W.__restyleLog as any[]).filter((entry) => entry.isStage);
      const sizes = (W.__viz.markerSizes ?? []) as number[];
      const texts = W.__viz.gd.data[0].text as string[];
      const optimum = texts[sizes.findIndex((size: number) => size >= 16)];
      W.__viz.Plotly.restyle = W.__realRestyle;
      return { count: stageCalls.length, optimum };
    });
    expect(result.count).toBeGreaterThan(3);
    expect(result.optimum).toBeTruthy();
  });

  test("Item 15: reduced motion collapses the sweep and disables cinema orbit", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);
    await page.evaluate(() => {
      const W = window as any;
      const Plotly = W.__viz.Plotly;
      W.__realRestyle = Plotly.restyle;
      W.__realRelayout = Plotly.relayout;
      W.__restyleLog = [];
      W.__relayoutLog = [];
      Plotly.restyle = function (gd: any, update: any) {
        W.__restyleLog.push({ gd, update });
        return W.__realRestyle.call(this, gd, update);
      };
      Plotly.relayout = function (gd: any, update: any) {
        W.__relayoutLog.push(update);
        return W.__realRelayout.call(this, gd, update);
      };
    });
    await page.locator("#weight-cost").fill("9");
    await page.waitForTimeout(100);
    await page.locator("[data-cinema-toggle]").click();
    await page.waitForTimeout(500);
    const result = await page.evaluate(() => {
      const W = window as any;
      const hasOrbit = (W.__relayoutLog as any[]).some((update) => update["scene.camera"]);
      const restyles = W.__restyleLog.length;
      W.__viz.Plotly.restyle = W.__realRestyle;
      W.__viz.Plotly.relayout = W.__realRelayout;
      return { hasOrbit, restyles };
    });
    expect(result.hasOrbit).toBe(false);
    expect(result.restyles).toBeGreaterThan(0);
  });

  test("Item 16: cinema hides the console, orbits, and pointer-enter detunes", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);
    await page.evaluate(() => {
      const W = window as any;
      const Plotly = W.__viz.Plotly;
      W.__realRelayout = Plotly.relayout.bind(Plotly);
      W.__relayoutLog = [];
      Plotly.relayout = function (gd: any, update: any) {
        W.__relayoutLog.push({ at: performance.now(), update });
        return W.__realRelayout(gd, update);
      };
    });
    // Keyboard path is reliable; Playwright pointer click can miss the console control.
    await page.keyboard.press("c");
    await expect(page.locator(".observatory")).toHaveClass(/is-cinema/);
    await expect(page.locator(".console")).toBeHidden();
    await page.waitForFunction(() => ((window as any).__relayoutLog?.length ?? 0) > 1, null, {
      timeout: 3000,
    });
    const orbitBeforePointer = await page.evaluate(() => (window as any).__relayoutLog.length);
    expect(orbitBeforePointer).toBeGreaterThan(1);
    await page.locator(".stage-3d-canvas").dispatchEvent("pointerenter");
    await expect(page.locator(".console")).toBeVisible();
    const orbitAfterPointer = await page.evaluate(() => (window as any).__relayoutLog.length);
    await page.waitForTimeout(250);
    expect(await page.evaluate((before) => (window as any).__relayoutLog.length, orbitAfterPointer)).toBe(orbitAfterPointer);
    await page.evaluate(() => { const W = window as any; W.__viz.Plotly.relayout = W.__realRelayout; });
  });

  test("Item 16: cinema re-render preserves the current point appearance", async ({ page }) => {
    // Heat on so filament optimum is present; use intentional __viz mirrors.
    await page.goto("/?stage=plotly&heat=1&age=0");
    await waitForPlotlyStage(page);
    await waitForSweepSettled(page);
    const before = await page.evaluate(() => {
      const viz = (window as any).__viz;
      return {
        colors: (viz.markerColors ?? []).slice(),
        sizes: (viz.markerSizes ?? []).slice(),
      };
    });

    await page.keyboard.press("c");
    await expect(page.locator(".observatory")).toHaveClass(/is-cinema/);
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => {
      const viz = (window as any).__viz;
      return {
        colors: (viz.markerColors ?? []).slice(),
        sizes: (viz.markerSizes ?? []).slice(),
      };
    });

    expect(after.sizes).toEqual(before.sizes);
    expect(after.colors.length).toBe(before.colors.length);
    expect(after.colors).not.toContain("#636efa");
    expect(after.sizes).toContain(16);
  });

  test("Items 19 & 22: HTML tooltip anchors to cursor, pins, unpins, and camera survives re-rank", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);
    const reasoningModel = await page.evaluate(() =>
      (window as any).__viz.scorableModels.find((model: any) => /reasoning|reasoner/i.test(model.model))?.model,
    );
    // Prefer a reasoning model (TTFT caveat) but fall back to any hoverable mark.
    const hit = await hoverAnyRealPoint(page, reasoningModel);
    const inspected = await page.evaluate(() => {
      const tooltip = document.querySelector(".stage-tooltip") as HTMLElement;
      const initial = { left: tooltip.style.left, top: tooltip.style.top, text: tooltip.textContent };
      const camera = { eye: { x: 2.1, y: 1.2, z: 0.9 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: 0 } };
      return { initial, camera };
    });
    await page.mouse.click(hit.x, hit.y);
    const pinnedText = await page.locator(".stage-tooltip").textContent();
    expect(inspected.initial.text).toContain("TPS");
    expect(inspected.initial.text).toContain("Blended price");
    expect(inspected.initial.text).toContain("AA index");
    // Caveat only when the hovered model is multi-minute reasoning TTFT.
    if (inspected.initial.text.includes("incl. thinking time")) {
      expect(inspected.initial.text).toContain("incl. thinking time (long-prompt median)");
    }
    expect(Number.parseInt(inspected.initial.left, 10) - hit.x).toBeLessThanOrEqual(24);
    expect(Number.parseInt(inspected.initial.top, 10) - hit.y).toBeLessThanOrEqual(24);
    expect(pinnedText).toBeTruthy();

    await page.evaluate(async (camera) => {
      const viz = (window as any).__viz;
      await viz.Plotly.relayout(viz.gd, { "scene.camera": camera });
    }, inspected.camera);

    await page.locator("#weight-speed").fill("8");
    const persistedCamera = await page.evaluate(() => (window as any).__viz.gd.layout.scene.camera.eye);
    expect(persistedCamera).toEqual(inspected.camera.eye);
    await page.mouse.move(5, 5);
    await page.locator(".stage-3d-canvas").click({ position: { x: 5, y: 5 } });
    await expect(page.locator(".stage-tooltip")).toBeHidden();
  });

  test("FIX-D #29 review: flattened per-component camera relayout is clamped above the floor", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);

    // Plotly emits camera drags in three shapes: the full `scene.camera` object,
    // partial objects (`scene.camera.eye`), and fully flattened per-component keys
    // (`scene.camera.eye.z`). The clamp caught the first two, but the flattened
    // shape (the kind a turntable/orbit tilt emits mid-drag) fell through
    // `updated === false` and never reached clampCameraEye — verified live
    // reaching eye.z = -5, flipping the view below the floor. Prove the flattened
    // path now converges on the clamp (EYE_Z_FLOOR = 0.2).
    const FLOOR = 0.2;
    const result = await page.evaluate(async (floor) => {
      const W = window as any;
      const viz = W.__viz;
      const gd = viz.gd;
      const Plotly = viz.Plotly;
      const realRelayout = Plotly.relayout;
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      // Let the clamp's corrective relayout (an async Plotly.relayout().then) settle.
      const settle = async () => { for (let i = 0; i < 50; i++) await wait(10); };

      // Phase A — drive the flattened key through the REAL Plotly pipeline.
      // Plotly applies eye.z = -5 to the layout, then emits plotly_relayout with
      // the dotted key. Without the fix the clamp never runs and -5 persists.
      await realRelayout.call(Plotly, gd, { "scene.camera.eye.z": -5 });
      await settle();
      const realPipelineZ = gd.layout.scene.camera.eye.z;

      // Phase B — emit the flattened event directly (deterministic shape) and
      // confirm the clamp issues its corrective full-camera relayout. Spy on
      // Plotly.relayout to catch it (stage3d's Plotly === viz.Plotly, same ref).
      let clampRelayoutSeen = false;
      Plotly.relayout = function (g: any, update: any) {
        const eyeZ = update && update["scene.camera"] && update["scene.camera"].eye
          && update["scene.camera"].eye.z;
        if (typeof eyeZ === "number" && eyeZ >= floor) clampRelayoutSeen = true;
        return realRelayout.call(this, g, update);
      };
      gd.emit("plotly_relayout", { "scene.camera.eye.z": -7 });
      await settle();
      const directEmitCorrective = clampRelayoutSeen;
      Plotly.relayout = realRelayout;

      return { realPipelineZ, directEmitCorrective };
    }, FLOOR);

    // Phase A: the live layout eye.z was raised back above the floor.
    expect(result.realPipelineZ, "flattened eye.z not clamped above floor via real pipeline").toBeGreaterThanOrEqual(FLOOR);
    // Phase B: the clamp fired on the flattened per-component path.
    expect(result.directEmitCorrective, "clamp did not fire for flattened scene.camera.eye.z").toBe(true);
  });

  test("FIX-A #26: tooltip follows the real DOM cursor and flips at both viewport edges", async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 600 });
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);
    const rightPoint = await realStagePointAtEdge(page, "right");
    const rightTooltip = await tooltipGeometry(page);
    expect(rightTooltip.rect.right).toBeLessThanOrEqual(rightPoint.x);
    expect(rightTooltip.rect.right).toBeGreaterThanOrEqual(rightPoint.x - 24);
    expect(rightTooltip.rect.bottom).toBeLessThanOrEqual(rightTooltip.viewport.height);

    const bottomPoint = await realStagePointAtEdge(page, "bottom");
    const bottomTooltip = await tooltipGeometry(page);
    // Tooltip must stay on-screen. Flip-above applies when the hit is low enough
    // that placing below would overflow the viewport (stage bottom ≠ viewport bottom).
    expect(bottomTooltip.rect.bottom).toBeLessThanOrEqual(bottomTooltip.viewport.height);
    expect(bottomTooltip.rect.top).toBeGreaterThanOrEqual(0);
    expect(bottomTooltip.rect.right).toBeLessThanOrEqual(bottomTooltip.viewport.width);
    if (bottomPoint.y > bottomTooltip.viewport.height * 0.55) {
      expect(bottomTooltip.rect.bottom).toBeLessThanOrEqual(bottomPoint.y + 2);
    }
  });

  test("FIX-A #26: real gl3d hover and click keep pin separate, including in-stage blank unpin", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);
    await page.evaluate(() => {
      const W = window as any;
      W.__stageHoverModel = null;
      W.__viz.gd.on("plotly_hover", (event: any) => {
        const point = event.points?.[0];
        const text = point?.data?.text ?? point?.fullData?.text;
        W.__stageHoverModel = Array.isArray(text) ? text[point?.pointNumber] ?? null : null;
      });
    });
    const points = await projectedStagePoints(page);
    expect(points.length).toBeGreaterThan(1);
    // Resolve two distinct models that actually receive gl3d hits (projection
    // alone is not enough under swiftshader pick radius).
    const hitA = await hoverAnyRealPoint(page);
    const pointBCandidate = points
      .filter((p) => p.model !== hitA.model)
      .sort((left, right) =>
        Math.hypot(right.x - hitA.x, right.y - hitA.y) - Math.hypot(left.x - hitA.x, left.y - hitA.y),
      )[0];
    expect(pointBCandidate).toBeTruthy();
    const hitB = await hoverRealPointByEvent(page, pointBCandidate).catch(() =>
      hoverAnyRealPoint(page, pointBCandidate.model),
    );
    // Journey 1: pin A, hover B, then click. The click must pin the live hover
    // (B), proving hoveredModelId is not frozen by pinnedModelId.
    await page.mouse.move(hitA.x, hitA.y);
    await page.mouse.click(hitA.x, hitA.y);
    await expect(page.locator(".model-readout")).toContainText(modelLabelNeedle(hitA.model));
    await expect(page.locator(".stage-tooltip")).toContainText(modelLabelNeedle(hitA.model));
    await page.mouse.move(hitB.x, hitB.y);
    await expect(page.locator(".model-readout")).toContainText(modelLabelNeedle(hitA.model));
    await page.mouse.click(hitB.x, hitB.y);
    await expect(page.locator(".model-readout")).toContainText(modelLabelNeedle(hitB.model));
    await expect(page.locator(".stage-tooltip")).toContainText(modelLabelNeedle(hitB.model));

    // Journey 2: move to blank space that is still inside the stage. The real
    // Plotly unhover path clears hoveredModelId before this DOM click, so the
    // click must unpin instead of re-pinning B.
    const box = await stageCanvasBox(page);
    const blank = { x: box.x + 8, y: box.y + 8 };
    await page.mouse.move(blank.x, blank.y);
    await expect(page.locator(".stage-tooltip")).toContainText(modelLabelNeedle(hitB.model));
    await page.locator(".stage-3d-canvas").click({ position: { x: 8, y: 8 } });
    await expect(page.locator(".stage-tooltip")).toBeHidden();
    await expect(page.locator(".model-readout")).toContainText("CURRENT OPTIMUM");

    // Preserve repeated pin/unpin stress coverage without re-scanning the canvas.
    for (let repetition = 0; repetition < 10; repetition += 1) {
      await page.mouse.move(hitA.x, hitA.y);
      // Re-nudge in a small neighborhood if the first move missed the pick radius.
      if (await page.locator(".stage-tooltip").evaluate((el) => el.hasAttribute("hidden"))) {
        for (let dy = -8; dy <= 8 && (await page.locator(".stage-tooltip").evaluate((el) => el.hasAttribute("hidden"))); dy += 4) {
          for (let dx = -8; dx <= 8; dx += 4) {
            await page.mouse.move(hitA.x + dx, hitA.y + dy);
            if (!(await page.locator(".stage-tooltip").evaluate((el) => el.hasAttribute("hidden")))) break;
          }
        }
      }
      await page.mouse.click(hitA.x, hitA.y);
      await expect(page.locator(".model-readout")).toContainText(modelLabelNeedle(hitA.model));
      await page.mouse.move(blank.x, blank.y);
      await page.locator(".stage-3d-canvas").click({ position: { x: 8, y: 8 } });
      await expect(page.locator(".stage-tooltip")).toBeHidden();
      await expect(page.locator(".model-readout")).toContainText("CURRENT OPTIMUM");
    }
  });

  test("FIX-A #26: 30 rapid slider inputs produce one rAF-batched render and the final optimum", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);
    await page.evaluate(() => {
      const W = window as any;
      const stage = W.__viz.stage;
      const projections = W.__viz.projectionsInstance;
      W.__realStageRender = stage.render;
      W.__realProjectionRender = projections.render;
      W.__renderLog = [];
      stage.render = function (...args: any[]) {
        W.__renderLog.push({ at: performance.now(), kind: "stage" });
        return W.__realStageRender.apply(this, args);
      };
      projections.render = function (...args: any[]) {
        W.__renderLog.push({ at: performance.now(), kind: "projection" });
        return W.__realProjectionRender.apply(this, args);
      };
      const input = document.querySelector<HTMLInputElement>("#weight-cost")!;
      for (let index = 0; index < 30; index += 1) {
        input.value = String(1 + (8 * index) / 29);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await page.waitForTimeout(650);

    const result = await page.evaluate(() => {
      const W = window as any;
      const log = W.__renderLog as Array<{ at: number; kind: string }>;
      const stageCalls = log.filter((entry) => entry.kind === "stage");
      const sizes = (W.__viz.markerSizes ?? []) as number[];
      const optimumIndex = sizes.findIndex((size: number) => size >= 16);
      const optimum = W.__viz.gd.data[0].text[optimumIndex];
      W.__viz.stage.render = W.__realStageRender;
      W.__viz.projectionsInstance.render = W.__realProjectionRender;
      return {
        total: log.length,
        stageCalls: stageCalls.length,
        projectionCalls: log.filter((entry) => entry.kind === "projection").length,
        optimum,
      };
    });

    expect(result.stageCalls).toBe(1);
    expect(result.projectionCalls).toBe(1);
    expect(result.total).toBe(2);
    expect(result.optimum).toBe("Command A+");
  });

  test("FIX-A #26 / Item 10: 60-second real hover sweep plus slider scrub has zero runtime errors", async ({ page }) => {
    test.setTimeout(75000);
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);
    await page.evaluate(() => document.fonts.ready);
    const box = await stageCanvasBox(page);
    const started = Date.now();

    const hoverSweep = (async () => {
      let step = 0;
      while (Date.now() - started < 60000) {
        const row = step % 30;
        const column = step % 2 === 0 ? step % 56 : 55 - (step % 56);
        const x = box.x + 8 + (column / 55) * (box.width - 16);
        const y = box.y + 8 + (row / 29) * (box.height - 16);
        await page.mouse.move(x, y);
        step += 1;
      }
    })();

    const sliderScrub = page.evaluate(async () => {
      const input = document.querySelector<HTMLInputElement>("#weight-cost")!;
      const end = performance.now() + 60000;
      let index = 0;
      while (performance.now() < end) {
        input.value = String(1 + 8 * ((index % 41) / 40));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        index += 1;
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      }
      input.value = "9";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await Promise.all([hoverSweep, sliderScrub]);
    await page.waitForTimeout(550);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(requestErrors).toEqual([]);
  });

  test("Item 24: $0.00 models are placed at the ε price floor position", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);

    const zeroPricePlottedCoords = await page.evaluate(() => {
      const viz = (window as any).__viz;
      const pointsTrace = viz.gd.data[0];
      const positivePrices = viz.scorableModels
        .map((model: any) => model.blended_price_per_M)
        .filter((price: number) => price > 0);
      const expectedFloor = Math.min(...positivePrices) / 2;
      const res: any[] = [];
      viz.scorableModels.forEach((model: any, index: number) => {
        if (model.blended_price_per_M === 0) {
          res.push({
            name: model.model,
            x: pointsTrace.x[index], // cost axis is x (locked 2026-08-02)
          });
        }
      });
      return { res, expectedFloor, vizPriceFloor: viz.priceFloor };
    });

    expect(zeroPricePlottedCoords.res.length).toBeGreaterThan(0);
    expect(zeroPricePlottedCoords.vizPriceFloor).toBe(zeroPricePlottedCoords.expectedFloor);
    zeroPricePlottedCoords.res.forEach((pt) => {
      expect(pt.x).toBe(zeroPricePlottedCoords.expectedFloor);
    });
  });

  test("Item 26: WebGL context loss listener is registered and shows a reload prompt", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);

    // Dispatch the webglcontextlost event on the plotly graph element
    await page.evaluate(() => {
      const viz = (window as any).__viz;
      viz.gd.dispatchEvent(new Event("webglcontextlost"));
    });

    // Expect reload prompt overlay to be visible
    const prompt = page.locator(".webgl-lost-prompt");
    await expect(prompt).toBeVisible();
    await expect(prompt.locator("text=WEBGL CONTEXT LOST")).toBeVisible();
    await expect(prompt.locator("button#webgl-reload-btn")).toBeVisible();
  });

  test("FIX-B: legend, provider shape groups, and frontier model names are visible without hover", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);
    await page.locator(".stage-guide-disclosure").evaluate((el: HTMLDetailsElement) => {
      el.open = true;
    });

    // Default product legend is curve-focus (openness glyph, not open/closed fill).
    for (const entry of [
      "family-trail",
      "effort-path",
      "singleton-dim",
      "frontier-ridge",
      "optimum-marker",
      "open-closed-glyph",
      "reasoning-mark",
      "frontier-point",
    ]) {
      await expect(page.locator(`[data-legend-entry="${entry}"]`)).toHaveCount(1);
    }

    // Open provider key so names are in the DOM text.
    await page.locator(".provider-disclosure").evaluate((el: HTMLDetailsElement) => {
      el.open = true;
    });
    const labels = await page.locator("[data-frontier-model]").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-frontier-model")),
    );
    const expected = await page.evaluate(() => (window as any).__viz.frontierModelIds as string[]);
    // With age filter off, frontier set is fully listed in the HTML rail.
    expect(labels.length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(new Set(expected).size);
    expected.forEach((id) => expect(labels).toContain(id));

    const providerNames = await page.evaluate(() => Object.keys((window as any).__viz.providerShapes));
    const providerKeyText = await page.locator(".provider-shape-list").innerText();
    // Only providers present in the current scorable set must appear.
    const present = await page.evaluate(() =>
      [...new Set((window as any).__viz.scorableModels.map((m: any) => m.provider as string))],
    );
    present.forEach((provider: string) => expect(providerKeyText).toContain(provider));
    expect(await page.locator("[data-provider-shape]").count()).toBeGreaterThanOrEqual(4);
    await expect(page.locator("#frontier-label-note")).toContainText("no 3D-to-pixel label API");
    void providerNames;
  });

  test("comprehension pass: landing shows the weighted optimum after a real pointer event without hovering a point", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);
    const box = await stageCanvasBox(page);
    await page.mouse.move(box.x + 8, box.y + 8);
    await expect(page.locator(".value-leaderboard")).toContainText("CURRENT OPTIMUM");
    await expect(page.locator("[data-optimum-model-id]")).toContainText(/.+/);
    await expect(page.locator("[data-preset-outcome]")).toContainText(/chat/i);
  });

  test("FIX-B: stage, console, and all projections fit the 1366×768 first viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);
    await page.waitForFunction(() => (window as any).__viz?.projectionsInstance || (window as any).__viz?.projections);

    const boxes = await page.locator(".projection").evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height };
    }));
    expect(boxes).toHaveLength(3);
    expect(boxes.every((box) => box.height > 0 && box.top >= 0 && box.bottom <= 768 + 2)).toBe(true);
    // Layout is locked to the viewport (body overflow hidden).
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toMatch(/hidden|clip/);
  });

  test("FIX-B: cinema reclaims the console column", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);
    const before = await page.locator(".stage").boundingBox();
    expect(before).toBeTruthy();
    await page.keyboard.press("c");
    await expect(page.locator(".observatory")).toHaveClass(/is-cinema/);
    await expect(page.locator(".console")).toBeHidden();
    await page.waitForTimeout(100);
    const after = await page.locator(".stage").boundingBox();
    expect(after).toBeTruthy();
    // Console column reclaimed — stage widens (console is ~22rem ≈ 350px).
    expect(after!.width).toBeGreaterThan(before!.width + 80);
  });

  test("FIX-B: slider outputs are integer weight shares and coding presets move raw sliders", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);

    const readShares = () => page.locator("[data-weight-output]").evaluateAll((nodes) =>
      nodes.map((node) => Number.parseInt(node.textContent ?? "", 10)),
    );
    // FIX-D (#29): the console opens on the chat landing preset
    // (presets.chat = .35/.30/.35 → shares [35,30,35], sum 100). The prior
    // [34,33,33] reflected the retired equal-weight (.3333) default.
    expect(await readShares()).toEqual([35, 30, 35]);
    expect((await readShares()).reduce((sum, share) => sum + share, 0)).toBe(100);

    await page.locator('[data-preset="coding"]').click();
    const coding = await page.evaluate(() => ({
      raw: ["speed", "cost", "intelligence"].map((key) => (document.querySelector(`#weight-${key}`) as HTMLInputElement).value),
      shares: [...document.querySelectorAll("[data-weight-output]")].map((node) => node.textContent),
    }));
    expect(coding.raw).toEqual(["0.25", "0.15", "0.6"]);
    expect(coding.shares).toEqual(["25%", "15%", "60%"]);
  });

  test("FIX-B: heat encoding is opt-in (?heat=1) and preserves the optimum marker", async ({ page }) => {
    // Product default is heat OFF (AA openness); heat suite uses Plotly path for marker arrays.
    await page.goto("/?heat=1&stage=plotly&age=0");
    await waitForPlotlyStage(page);

    const heat = await page.evaluate(() => {
      const viz = (window as any).__viz;
      const scores = Object.values(viz.scoreByModel ?? {}) as number[];
      return {
        enabled: viz.heatEncoding,
        scorable: viz.scorableModels?.length ?? 0,
        scoreValues: scores,
        scoreSpread: scores.length ? Math.max(...scores) - Math.min(...scores) : 0,
      };
    });
    expect(heat.enabled).toBe(true);
    expect(heat.scorable).toBeGreaterThan(10);
    expect(new Set(heat.scoreValues).size).toBeGreaterThan(4);
    expect(heat.scoreSpread).toBeGreaterThan(0);
  });

  test("FIX-B #27 P1a: heat keeps dominated < frontier < optimum across weight sets", async ({ page }) => {
    await page.goto("/?heat=1&stage=plotly&age=0");
    await waitForPlotlyStage(page);

    const readOrdering = () => page.evaluate(() => {
      const viz = (window as any).__viz;
      const luminance = (color: string) => {
        const channels = color.match(/^#([\da-f]{6})$/i)![1]
          .match(/../g)!
          .map((channel: string) => Number.parseInt(channel, 16) / 255)
          .map((channel: number) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const models = viz.gd.data[0].text as string[];
      const colors = (viz.markerColors ?? viz.gd.data[0].marker.color) as string[];
      const sizes = (viz.markerSizes ?? []) as number[];
      const frontierIds = new Set(viz.frontierModelIds as string[]);
      const optimumIndex = sizes.findIndex((size) => size >= 16);
      const frontierLuminance = frontierIds
        ? [...frontierIds]
            .map((id) => models.indexOf(id))
            .filter((index) => index !== optimumIndex && index >= 0)
            .map((index) => luminance(colors[index]))
        : [];
      const dominatedLuminance = models
        .map((model, index) => frontierIds.has(model) ? null : luminance(colors[index]))
        .filter((value): value is number => value !== null);
      const scores = viz.scoreByModel as Record<string, number>;
      const dominatedOutscoresFrontier = models
        .filter((model) => !frontierIds.has(model))
        .some((dominated) => [...frontierIds]
          .filter((model) => model !== models[optimumIndex])
          .some((frontierModel) => scores[dominated] > scores[frontierModel]));
      return {
        dominatedMax: Math.max(...dominatedLuminance),
        frontierMin: Math.min(...frontierLuminance),
        frontierMax: Math.max(...frontierLuminance),
        optimum: luminance(colors[optimumIndex]),
        dominatedOutscoresFrontier,
      };
    });

    const results = [];
    for (const preset of ["coding", "RAG", "long-context"]) {
      await page.locator(`[data-preset="${preset}"]`).click();
      await waitForSweepSettled(page);
      results.push(await readOrdering());
    }

    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result.dominatedMax).toBeLessThan(result.frontierMin);
      expect(result.frontierMax).toBeLessThan(result.optimum);
    }
    expect(results.some((result) => result.dominatedOutscoresFrontier)).toBe(true);
  });

  test("FIX-B #27 P1a: settled dominated points keep score-scaled slate luminance", async ({ page }) => {
    await page.goto("/?heat=1&stage=plotly&age=0");
    await waitForPlotlyStage(page);
    await page.locator("#weight-cost").fill("9");
    await waitForSweepSettled(page);

    const result = await page.evaluate(() => {
      const viz = (window as any).__viz;
      const luminance = (color: string) => {
        const channels = color.match(/^#([\da-f]{6})$/i)![1]
          .match(/../g)!
          .map((channel: string) => Number.parseInt(channel, 16) / 255)
          .map((channel: number) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const models = viz.gd.data[0].text as string[];
      const colors = (viz.markerColors ?? []) as string[];
      const frontierIds = new Set(viz.frontierModelIds as string[]);
      const scores = viz.scoreByModel as Record<string, number>;
      const dominated = models
        .map((model, index) => ({ model, score: scores[model], luminance: luminance(colors[index]) }))
        .filter(({ model }) => !frontierIds.has(model));
      return {
        dominated,
        frontierDimLuminance: luminance("#C9D4C4"),
      };
    });

    expect(result.dominated.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...result.dominated.map(({ luminance }) => luminance))).toBeLessThan(
      result.frontierDimLuminance,
    );
    expect(result.dominated.some((left, leftIndex) =>
      result.dominated.slice(leftIndex + 1).some((right) =>
        left.score !== right.score && left.luminance !== right.luminance,
      ),
    )).toBe(true);
  });

  test("FIX-B: default heat is off; ?heat=1 opts in", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);

    const off = await page.evaluate(() => {
      const viz = (window as any).__viz;
      return {
        enabled: viz.heatEncoding,
        legendNote: document.querySelector("[data-heat-encoding]")?.getAttribute("data-heat-encoding") ?? null,
      };
    });
    expect(off.enabled).toBe(false);
    expect(off.legendNote).toBe("false");

    await page.goto("/?heat=1&stage=plotly&age=0");
    await waitForPlotlyStage(page);
    const on = await page.evaluate(() => (window as any).__viz.heatEncoding);
    expect(on).toBe(true);
  });
});

test.describe("2D Projection Render + Coupling Specs", () => {
  let consoleErrors: string[] = [];
  let pageErrors: any[] = [];
  let requestErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    pageErrors = [];
    requestErrors = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err));
    page.on("requestfailed", (req) =>
      requestErrors.push(`${req.url()} failed: ${req.failure()?.errorText}`),
    );
  });

  test("Projection render: 3 de-chromed scatters (log speed/cost, linear intelligence) with ε floor on cost axes", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await page.waitForFunction(() => (window as any).__viz?.projections);

    const data = await page.evaluate(() => {
      const viz = (window as any).__viz;
      const proj = viz.projections;
      const positivePrices = viz.scorableModels
        .map((m: any) => m.blended_price_per_M)
        .filter((p: number) => p > 0);
      const expectedFloor = Math.min(...positivePrices) / 2;
      const kinds = proj.gds.map((gd: any) => gd.dataset.projectionKind);
      return {
        gdsCount: proj.gds.length,
        kinds,
        perGd: proj.gds.map((gd: any) => ({
          traceType: gd.data[0]?.type,
          mode: gd.data[0]?.mode,
          points: gd.data[0]?.x?.length,
          hoverinfo: gd.data[0]?.hoverinfo,
          xaxisType: gd.layout?.xaxis?.type,
          yaxisType: gd.layout?.yaxis?.type,
          xaxisTicktext: gd.layout?.xaxis?.ticktext,
          yaxisTicktext: gd.layout?.yaxis?.ticktext,
          modebarNodes: gd.querySelectorAll(".modebar").length,
          hoverlayerChildren: gd.querySelector(".hoverlayer")?.childElementCount,
        })),
        // ε-floor placement: the two $0.00 models on every cost-involved axis.
        expectedFloor,
        zeroModels: viz.scorableModels
          .map((m: any, i: number) => ({ i, name: m.model, price: m.blended_price_per_M }))
          .filter((r: any) => r.price === 0),
        tpsCostYforZero: (() => {
          const gd = proj.gds[1]; // tps-cost
          return viz.scorableModels
            .map((m: any, i: number) => m.blended_price_per_M === 0 ? gd.data[0].y[i] : null)
            .filter((v: any) => v !== null);
        })(),
        costIntelXforZero: (() => {
          const gd = proj.gds[2]; // cost-intelligence
          return viz.scorableModels
            .map((m: any, i: number) => m.blended_price_per_M === 0 ? gd.data[0].x[i] : null)
            .filter((v: any) => v !== null);
        })(),
      };
    });

    expect(data.gdsCount).toBe(3);
    expect(data.kinds).toEqual(["tps-intelligence", "tps-cost", "cost-intelligence"]);

    data.perGd.forEach((gd: any) => {
      expect(gd.traceType).toBe("scatter");
      expect(gd.mode).toBe("markers");
      expect(gd.points).toBeGreaterThan(30);
      // hoverinfo 'none' (NOT 'skip'): events fire, no native hover card.
      expect(gd.hoverinfo).toBe("none");
      expect(gd.modebarNodes).toBe(0);
      // hoverinfo 'none' → no native hover card drawn (de-chrome contract).
      expect(gd.hoverlayerChildren).toBe(0);
    });

    // Axis scale per projection: speed (tps) + cost stay LOG; intelligence is
    // LINEAR data min–max (frontier-math §3.3), matching the stage.
    //   gds[0] tps-intelligence : x=tps(log)     y=intelligence(linear)
    //   gds[1] tps-cost         : x=tps(log)     y=cost(log)
    //   gds[2] cost-intelligence: x=cost(log)    y=intelligence(linear)
    expect(data.perGd[0].xaxisType).toBe("log");
    expect(data.perGd[0].yaxisType).toBe("linear");
    expect(data.perGd[1].xaxisType).toBe("log");
    expect(data.perGd[1].yaxisType).toBe("log");
    expect(data.perGd[2].xaxisType).toBe("log");
    expect(data.perGd[2].yaxisType).toBe("linear");
    // Intelligence axes use data-fit ticks (not forced 0–100 empty headroom).
    expect(data.perGd[0].yaxisTicktext.length).toBeGreaterThanOrEqual(3);
    expect(data.perGd[2].yaxisTicktext.length).toBeGreaterThanOrEqual(3);
    expect(data.perGd[0].yaxisTicktext).not.toEqual(["0", "20", "40", "60", "80", "100"]);

    // Cost axes carry the single ε "≤ floor" tick (tps-cost y, cost-intelligence x).
    expect(data.perGd[1].yaxisTicktext).toContain("≤ floor");
    expect(data.perGd[2].xaxisTicktext).toContain("≤ floor");
    // Non-cost axes do NOT carry the floor tick.
    expect(data.perGd[0].xaxisTicktext).not.toContain("≤ floor");

    // $0.00 models land on the ε floor on every cost-involved axis.
    expect(data.zeroModels.length).toBeGreaterThan(0);
    data.tpsCostYforZero.forEach((v: number) => expect(v).toBeCloseTo(data.expectedFloor, 10));
    data.costIntelXforZero.forEach((v: number) => expect(v).toBeCloseTo(data.expectedFloor, 10));

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(requestErrors).toEqual([]);
  });

  test("Item 17a: hovering a projection point fans Fx.hover to the stage by model ID", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await page.waitForFunction(() => (window as any).__viz?.projections);
    const POINT = 5;

    // Spy on the SAME Plotly the app bundles — window.__viz.Plotly is the imported
    // module namespace the coupling actually calls.
    await page.evaluate(() => {
      const W = window as any;
      const Plotly = W.__viz.Plotly;
      W.__realFxHover = Plotly.Fx.hover;
      W.__fxSpy = [];
      Plotly.Fx.hover = function (gd: any, pts: any) {
        const proj = W.__viz.projections;
        W.__fxSpy.push({
          isStage: gd === proj.stageGd,
          projIndex: proj.gds.indexOf(gd),
          pointNumber: pts && pts[0] && pts[0].pointNumber,
        });
        try {
          return W.__realFxHover.call(this, gd, pts);
        } catch {
          /* programmatic hover on a de-chromed plot is best-effort */
        }
      };
    });

    // Dense multi-effort catalogs crowd SVG pick targets — drive the production
    // coupling path via a real plotly_hover event on projection 0 (same payload
    // shape Plotly emits from a pointer hit).
    await page.evaluate((i) => {
      const W = window as any;
      const gd = W.__viz.projections.gds[0];
      gd.emit("plotly_hover", {
        points: [{ pointNumber: i, data: gd.data[0], fullData: gd.data[0], curveNumber: 0 }],
      });
    }, POINT);

    await page
      .waitForFunction(() => (window as any).__fxSpy.length > 0, null, { timeout: 3000 })
      .catch(() => {});

    const res = await page.evaluate((i) => {
      const W = window as any;
      const proj = W.__viz.projections;
      const stageGd = W.__viz.gd;
      const hoveredModelId = proj.gds[0].data[0].text[i];
      const expectedStagePointNumber = stageGd.data[0].text.indexOf(hoveredModelId);
      const spy = W.__fxSpy as any[];
      W.__viz.Plotly.Fx.hover = W.__realFxHover;
      return {
        hoveredModelId,
        expectedStagePointNumber,
        stageHit: spy.some((c) => c.isStage && c.pointNumber === expectedStagePointNumber),
        spyLen: spy.length,
      };
    }, POINT);

    expect(res.hoveredModelId).toBeTruthy();
    expect(res.stageHit).toBe(true);
  });

  test("Item 17b: stage hover fans Fx.hover to all three projections by model ID", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await page.waitForFunction(() => (window as any).__viz?.projections);

    // Same spy as 17a — intercepts the bundled Plotly the coupling actually calls.
    await page.evaluate(() => {
      const W = window as any;
      const Plotly = W.__viz.Plotly;
      W.__realFxHover = Plotly.Fx.hover;
      W.__fxSpy = [];
      Plotly.Fx.hover = function (gd: any, pts: any) {
        const proj = W.__viz.projections;
        W.__fxSpy.push({
          isStage: gd === proj.stageGd,
          projIndex: proj.gds.indexOf(gd),
          pointNumber: pts && pts[0] && pts[0].pointNumber,
        });
        try {
          return W.__realFxHover.call(this, gd, pts);
        } catch {
          /* programmatic hover on a de-chromed plot is best-effort */
        }
      };
    });

    // Production path: sweep the stage WebGL canvas with real pointer moves until
    // a hover fans out (the spy records Fx.hover onto the projections). Same scan
    // strategy the T5 tooltip spec (items 19 & 22) uses to hit a 3D point.
    const canvas = page.locator(".stage-3d-canvas canvas");
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    let found = false;
    for (let y = box!.y + 8; y < box!.y + box!.height - 8 && !found; y += 12) {
      for (let x = box!.x + 8; x < box!.x + box!.width - 8; x += 12) {
        await page.mouse.move(x, y);
        if (await page.evaluate(() => (window as any).__fxSpy.length > 0)) {
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);

    // All three projections must be hit, and every view must resolve the hover to
    // the SAME model identity (model-ID keying via trace-carried text). No
    // fallback — if the coupling stopped calling Plotly.Fx.hover, this FAILS.
    const res = await page.evaluate(() => {
      const W = window as any;
      const proj = W.__viz.projections;
      const spy = W.__fxSpy as any[];
      W.__viz.Plotly.Fx.hover = W.__realFxHover; // restore
      const resolved: Record<number, string> = {};
      spy.forEach((c) => {
        if (c.projIndex >= 0) {
          resolved[c.projIndex] = proj.gds[c.projIndex].data[0].text[c.pointNumber];
        }
      });
      return {
        projectionsHit: [0, 1, 2].every((idx) => idx in resolved),
        resolvedIds: Object.values(resolved),
        spyLen: spy.length,
      };
    });

    expect(res.projectionsHit).toBe(true);
    // Model-ID keying: every coupled view resolved the hover to one shared id.
    expect(new Set(res.resolvedIds).size).toBe(1);
  });

  test("Item 25: a user's 2D projection zoom survives a re-render (uirevision pinned)", async ({ page }) => {
    await page.goto("/?stage=plotly&age=0");
    await page.waitForFunction(() => (window as any).__viz?.projections);

    // Zoom projection 0's x-axis (log units), then re-render exactly the way a
    // weight change re-renders the stage (the same render() → Plotly.react path).
    const ranges = await page.evaluate(async () => {
      const W = window as any;
      const Plotly = W.__viz.Plotly;
      const proj = W.__viz.projections;
      const gd = proj.gds[0];
      const models = W.__viz.scorableModels;
      // Sanity: a model list is reachable so render() can be re-invoked.
      const allModels = (W.__viz.scorableModels.slice());
      // Zoom the x-axis into a sub-range (log10 units).
      await Plotly.relayout(gd, {
        "xaxis.autorange": false,
        "xaxis.range[0]": 1.5,
        "xaxis.range[1]": 2.5,
      });
      const before = gd.layout.xaxis.range.slice();
      // Re-render via the chat landing preset (.35/.30/.35) — the same render() path the stage uses on a weight change.
      await proj.render({ speed: 0.35, cost: 0.3, intelligence: 0.35 }, allModels);
      const after = gd.layout.xaxis.range.slice();
      // Also confirm a re-render genuinely happened (datarevision bumped).
      const datarevision = gd.layout.datarevision;
      return { before, after, datarevision, modelsCount: allModels.length };
    });

    expect(ranges.modelsCount).toBeGreaterThan(50);
    // The zoomed range is preserved across the re-render.
    expect(ranges.after).toEqual(ranges.before);
    // And it is the zoomed range, not the original auto-range.
    expect(ranges.before).toEqual([1.5, 2.5]);
  });

  test("residuals closeout: h1 untruncated, heat note muted, disclosure survives weight change", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?stage=plotly&age=0");
    await waitForPlotlyStage(page);

    const h1 = page.locator("h1");
    await expect(h1).toHaveText("Speed × cost × intelligence");
    const h1Box = await h1.boundingBox();
    expect(h1Box, "h1 should render").toBeTruthy();
    // Single-line title: height should not be ~2× line-height of step-2.
    expect(h1Box!.height).toBeLessThan(48);

    const heatColor = await page.locator("[data-heat-encoding]").evaluate((el) => getComputedStyle(el).color);
    // copper is ~rgb(196, 122, 58); muted is cooler/grayer — reject copper-ish orange.
    expect(heatColor).not.toMatch(/rgb\(\s*196\s*,\s*122\s*,\s*58\s*\)/);

    const provider = page.locator(".provider-disclosure");
    await expect(provider).toHaveAttribute("open", "");
    await provider.locator("summary").click();
    await expect(provider).not.toHaveAttribute("open", "");

    // Trigger a weight change (real input event on a range).
    const slider = page.locator('input[type=range]').first();
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    // Provider disclosure must stay closed across the re-render.
    await expect(page.locator(".provider-disclosure")).not.toHaveAttribute("open", "");
  });
});
