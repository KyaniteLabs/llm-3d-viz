import { test, expect } from "@playwright/test";

test.describe("3D Stage Render Specs", () => {
  let consoleErrors: string[] = [];
  let pageErrors: any[] = [];
  let requestErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    pageErrors = [];
    requestErrors = [];

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
    await page.goto("/");
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

  test("Item 11 & 12: Stage shows 33 glyphs, 1 ridge trace, and no default Plotly chrome", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz !== undefined);

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

    expect(vizData.scorableCount).toBe(33);
    expect(vizData.traceCount).toBe(2);
    expect(vizData.pointsCount).toBe(33);
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

  test("Items 11 & 28: incomplete rows are visible, labelled, and have no stage affordance", async ({ page }) => {
    await page.goto("/");
    const entries = page.locator(".incomplete-data-entry");
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toContainText("GPT-5.5 Pro (xhigh)");
    await expect(entries.nth(1)).toContainText("DeepSeek V4 Flash 0731 (Reasoning, Max Effort)");
    await expect(entries.nth(0)).toContainText("Missing benchmark axis: not measured");
    await expect(entries.nth(1)).toContainText("Missing benchmark axis: not measured");
    for (const entry of [entries.nth(0), entries.nth(1)]) {
      await expect(entry).not.toHaveAttribute("role", "button");
      await expect(entry).not.toHaveAttribute("tabindex");
    }
  });

  test("Item 13: All three axes are log scale with custom ticks including ε floor", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz !== undefined);

    const layout = await page.evaluate(() => {
      const viz = (window as any).__viz;
      const scene = viz.gd.layout.scene;
      const positivePrices = viz.scorableModels
        .map((model: any) => model.blended_price_per_M)
        .filter((price: number) => price > 0);
      const expectedFloor = Math.min(...positivePrices) / 2;
      return {
        xaxisType: scene.xaxis.type,
        yaxisType: scene.yaxis.type,
        zaxisType: scene.zaxis.type,
        xaxisTickvals: scene.xaxis.tickvals,
        xaxisTicktext: scene.xaxis.ticktext,
        yaxisTickvals: scene.yaxis.tickvals,
        yaxisTicktext: scene.yaxis.ticktext,
        zaxisTickvals: scene.zaxis.tickvals,
        zaxisTicktext: scene.zaxis.ticktext,
        expectedFloor,
        vizPriceFloor: viz.priceFloor,
      };
    });

    expect(layout.xaxisType).toBe("log");
    expect(layout.yaxisType).toBe("log");
    expect(layout.zaxisType).toBe("log");

    // Check powers of 10 ticks
    expect(layout.xaxisTickvals).toEqual([10, 100, 1000]);
    expect(layout.xaxisTicktext).toEqual(["10", "100", "1000"]);

    expect(layout.yaxisTickvals).toEqual([1, 10, 100]);
    expect(layout.yaxisTicktext).toEqual(["1", "10", "100"]);

    // Check cost axis includes the floor value and "≤ floor" label
    expect(layout.vizPriceFloor).toBe(layout.expectedFloor);
    expect(layout.zaxisTickvals).toEqual([layout.expectedFloor, 0.1, 1, 10, 100]);
    expect(layout.zaxisTicktext).toEqual(["≤ floor", "0.1", "1", "10", "100"]);
  });

  test("Item 20 & 21: Provider shapes and optimum marker size/symbol distinctness", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz !== undefined);

    const data = await page.evaluate(() => {
      const viz = (window as any).__viz;
      const pointsTrace = viz.gd.data[0];
      return {
        symbols: pointsTrace.marker.symbol,
        sizes: pointsTrace.marker.size,
        models: viz.scorableModels.map((m: any) => m.model),
        providers: viz.scorableModels.map((m: any) => m.provider),
        providerShapes: viz.providerShapes,
        frontierModelIds: viz.frontierModelIds,
      };
    });

    // Check we have >= 4 distinct symbols
    const uniqueSymbols = new Set(data.symbols);
    expect(uniqueSymbols.size).toBeGreaterThanOrEqual(4);

    // Let's find the optimum model index.
    // By default weights are equal. We can find the optimum model in data.
    // The optimum is styled with filament color rgba(232, 241, 228, 1.0) and size 16.
    const optimumIndex = data.sizes.findIndex((s: number) => s === 16);
    expect(optimumIndex).not.toBe(-1);

    const optimumSymbol = data.symbols[optimumIndex];
    data.providers.forEach((provider: string, index: number) => {
      if (index !== optimumIndex) expect(data.symbols[index]).toBe(data.providerShapes[provider]);
    });

    const frontierIndices = data.frontierModelIds
      .map((modelId: string) => data.models.indexOf(modelId))
      .filter((index: number) => index !== optimumIndex);
    frontierIndices.forEach((index: number) => expect(optimumSymbol).not.toBe(data.symbols[index]));
    data.sizes.forEach((size: number, index: number) => {
      if (index !== optimumIndex) expect(data.sizes[optimumIndex]).toBeGreaterThan(size);
    });
  });

  test("Items 14 & 21: slider re-ranks immediately and keeps the optimum non-colour distinct", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz !== undefined);
    await page.locator("#weight-cost").fill("9");
    await page.waitForTimeout(550);

    const result = await page.evaluate(() => {
      const viz = (window as any).__viz;
      const scores = viz.scorableModels.map((model: any, index: number) => ({
        model: model.model,
        size: viz.gd.data[0].marker.size[index],
        symbol: viz.gd.data[0].marker.symbol[index],
      }));
      const optimum = scores.find((point: any) => point.size === 16);
      return { optimum, scores };
    });
    expect(result.optimum).toBeTruthy();
    expect(result.optimum!.model).toBe("Command A+");
    expect(result.scores.filter((point: any) => point.model !== result.optimum!.model).every(
      (point: any) => point.size < result.optimum!.size,
    )).toBe(true);
  });

  test("Items 14 & 16: slider fires staged synchronized restyles and ends on the optimum", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz !== undefined);
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
    await page.waitForTimeout(550);
    const result = await page.evaluate(() => {
      const W = window as any;
      const log = W.__restyleLog as any[];
      const stageCalls = log.filter((entry) => entry.isStage);
      const stage = W.__viz.gd;
      const optimumIndex = stage.data[0].marker.size.findIndex((size: number) => size === 16);
      const optimum = stage.data[0].text[optimumIndex];
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
        frontierChanges,
      };
    });
    expect(result.count).toBeGreaterThan(1);
    expect(result.projectionCalls).toBeGreaterThan(1);
    expect(result.duration).toBeGreaterThanOrEqual(300);
    expect(result.duration).toBeLessThanOrEqual(550);
    expect(result.optimum).toBe("Command A+");
    expect(result.frontierChanges.length).toBeGreaterThan(0);
    expect(result.frontierChanges.every(({ colorChanged, sizeChanged }) => colorChanged && sizeChanged)).toBe(true);
  });

  test("Item 23: a mid-sweep slider change cancels the old run and settles the new run", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz !== undefined);
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
    await page.waitForTimeout(550);
    const result = await page.evaluate(() => {
      const W = window as any;
      const stageCalls = (W.__restyleLog as any[]).filter((entry) => entry.isStage);
      const stage = W.__viz.gd;
      const optimum = stage.data[0].text[stage.data[0].marker.size.findIndex((size: number) => size === 16)];
      W.__viz.Plotly.restyle = W.__realRestyle;
      return { count: stageCalls.length, optimum };
    });
    expect(result.count).toBeGreaterThan(3);
    expect(result.optimum).toBeTruthy();
  });

  test("Item 15: reduced motion collapses the sweep and disables cinema orbit", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz !== undefined);
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
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz !== undefined);
    await page.evaluate(() => {
      const W = window as any;
      const Plotly = W.__viz.Plotly;
      W.__realRelayout = Plotly.relayout;
      W.__relayoutLog = [];
      Plotly.relayout = function (gd: any, update: any) {
        W.__relayoutLog.push({ at: performance.now(), update });
        return W.__realRelayout.call(this, gd, update);
      };
    });
    await page.locator("[data-cinema-toggle]").click();
    await expect(page.locator(".console")).toBeHidden();
    await page.waitForTimeout(500);
    const orbitBeforePointer = await page.evaluate(() => (window as any).__relayoutLog.length);
    expect(orbitBeforePointer).toBeGreaterThan(1);
    await page.locator(".stage-3d-canvas").dispatchEvent("pointerenter");
    await expect(page.locator(".console")).toBeVisible();
    const orbitAfterPointer = await page.evaluate(() => (window as any).__relayoutLog.length);
    await page.waitForTimeout(250);
    expect(await page.evaluate((before) => (window as any).__relayoutLog.length, orbitAfterPointer)).toBe(orbitAfterPointer);
    await page.evaluate(() => { const W = window as any; W.__viz.Plotly.relayout = W.__realRelayout; });
  });

  test("Items 19 & 22: HTML tooltip anchors to cursor, pins, unpins, and camera survives re-rank", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz !== undefined);
    const canvas = page.locator(".stage-3d-canvas canvas");
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).toBeTruthy();
    let hit: { x: number; y: number } | undefined;
    for (let y = canvasBox!.y + 8; y < canvasBox!.y + canvasBox!.height - 8 && !hit; y += 12) {
      for (let x = canvasBox!.x + 8; x < canvasBox!.x + canvasBox!.width - 8; x += 12) {
        await page.mouse.move(x, y);
        const text = await page.evaluate(() => (document.querySelector(".stage-tooltip") as HTMLElement).textContent);
        if (text.includes("TTFT incl. reasoning (long prompt)")) {
          hit = { x, y };
          break;
        }
      }
    }
    expect(hit).toBeTruthy();
    const inspected = await page.evaluate(() => {
      const tooltip = document.querySelector(".stage-tooltip") as HTMLElement;
      const initial = { left: tooltip.style.left, top: tooltip.style.top, text: tooltip.textContent };
      const camera = { eye: { x: 2.1, y: 1.2, z: 0.9 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: 0 } };
      return { initial, camera };
    });
    await page.mouse.click(hit!.x, hit!.y);
    const pinnedText = await page.locator(".stage-tooltip").textContent();
    expect(inspected.initial.text).toContain("TPS");
    expect(inspected.initial.text).toContain("Blended price");
    expect(inspected.initial.text).toContain("AA index");
    expect(inspected.initial.text).toContain("TTFT incl. reasoning (long prompt)");
    expect(Number.parseInt(inspected.initial.left, 10) - hit!.x).toBeLessThanOrEqual(24);
    expect(Number.parseInt(inspected.initial.top, 10) - hit!.y).toBeLessThanOrEqual(24);
    expect(pinnedText).toBeTruthy();

    await page.evaluate(async (camera) => {
      const viz = (window as any).__viz;
      await viz.Plotly.relayout(viz.gd, { "scene.camera": camera });
    }, inspected.camera);

    await page.locator("#weight-speed").fill("8");
    const persistedCamera = await page.evaluate(() => (window as any).__viz.gd.layout.scene.camera.eye);
    expect(persistedCamera).toEqual(inspected.camera.eye);
    await page.locator(".stage-3d-canvas").click({ position: { x: 5, y: 5 } });
    await expect(page.locator(".stage-tooltip")).toBeHidden();
  });

  test("Item 24: $0.00 models are placed at the ε price floor position", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz !== undefined);

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
            z: pointsTrace.z[index],
          });
        }
      });
      return { res, expectedFloor, vizPriceFloor: viz.priceFloor };
    });

    expect(zeroPricePlottedCoords.res.length).toBe(2);
    expect(zeroPricePlottedCoords.vizPriceFloor).toBe(zeroPricePlottedCoords.expectedFloor);
    zeroPricePlottedCoords.res.forEach((pt) => {
      expect(pt.z).toBe(zeroPricePlottedCoords.expectedFloor);
    });
  });

  test("Item 26: WebGL context loss listener is registered and shows a reload prompt", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz !== undefined);

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

  test("Projection render: 3 de-chromed log-axis scatters with ε floor on cost axes", async ({ page }) => {
    await page.goto("/");
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
      expect(gd.points).toBe(33);
      // hoverinfo 'none' (NOT 'skip'): events fire, no native hover card.
      expect(gd.hoverinfo).toBe("none");
      // Log axes wherever the stage uses log (TPS, cost, intelligence all log).
      expect(gd.xaxisType).toBe("log");
      expect(gd.yaxisType).toBe("log");
      expect(gd.modebarNodes).toBe(0);
      // hoverinfo 'none' → no native hover card drawn (de-chrome contract).
      expect(gd.hoverlayerChildren).toBe(0);
    });

    // Cost axes carry the single ε "≤ floor" tick (tps-cost y, cost-intelligence x).
    expect(data.perGd[1].yaxisTicktext).toContain("≤ floor");
    expect(data.perGd[2].xaxisTicktext).toContain("≤ floor");
    // Non-cost axes do NOT carry the floor tick.
    expect(data.perGd[0].xaxisTicktext).not.toContain("≤ floor");

    // The two $0.00 models land on the ε floor on every cost-involved axis.
    expect(data.zeroModels.length).toBe(2);
    data.tpsCostYforZero.forEach((v: number) => expect(v).toBeCloseTo(data.expectedFloor, 10));
    data.costIntelXforZero.forEach((v: number) => expect(v).toBeCloseTo(data.expectedFloor, 10));

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(requestErrors).toEqual([]);
  });

  test("Item 17a: hovering a projection point fans Fx.hover to the stage by model ID", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz?.projections);
    const POINT = 5;

    // Spy on the SAME Plotly the app bundles — window.__viz.Plotly is the imported
    // module namespace the coupling actually calls. (Spying on the UMD
    // window.Plotly.Fx.hover does NOT intercept bundled calls, which is why the
    // old hoverLog fallback could mask a coupling that stopped invoking Plotly.)
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

    // Production path: a real pointer move onto projection 0's POINT-th marker.
    // Plotly's native hover emits plotly_hover → the coupling → Plotly.Fx.hover.
    // The projection row renders below the fold, so scroll the marker on-screen
    // first — Playwright's page.mouse.move operates in viewport pixels and will
    // not auto-scroll, so an off-screen target would receive no mousemove.
    const target = await page.evaluate((i) => {
      const gd = (window as any).__viz.projections.gds[0];
      const el = gd.querySelectorAll(".scatterlayer .point")[i];
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, POINT);
    expect(target).toBeTruthy();
    await page.mouse.move(target!.x, target!.y);
    // Plotly hover is synchronous on mousemove, but poll briefly to be safe.
    await page
      .waitForFunction(() => (window as any).__fxSpy.length > 0, null, { timeout: 3000 })
      .catch(() => {});

    // Resolve by MODEL ID (trace-carried text), not by reusing POINT: the stage's
    // pointNumber for the hovered model is stage.text.indexOf(modelId). No
    // fallback — if the coupling stops calling Plotly.Fx.hover, this FAILS.
    const res = await page.evaluate((i) => {
      const W = window as any;
      const proj = W.__viz.projections;
      const stageGd = W.__viz.gd;
      const hoveredModelId = proj.gds[0].data[0].text[i];
      const expectedStagePointNumber = stageGd.data[0].text.indexOf(hoveredModelId);
      const spy = W.__fxSpy as any[];
      W.__viz.Plotly.Fx.hover = W.__realFxHover; // restore
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
    await page.goto("/");
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
    await page.goto("/");
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
      // Re-render the same way the stage re-renders on a weight change.
      await proj.render({ speed: 0.3333, cost: 0.3333, intelligence: 0.3333 }, allModels);
      const after = gd.layout.xaxis.range.slice();
      // Also confirm a re-render genuinely happened (datarevision bumped).
      const datarevision = gd.layout.datarevision;
      return { before, after, datarevision, modelsCount: allModels.length };
    });

    expect(ranges.modelsCount).toBe(33);
    // The zoomed range is preserved across the re-render.
    expect(ranges.after).toEqual(ranges.before);
    // And it is the zoomed range, not the original auto-range.
    expect(ranges.before).toEqual([1.5, 2.5]);
  });
});
