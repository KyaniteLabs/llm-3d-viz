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

    // Check .hoverlayer is empty
    const hoverlayer = page.locator(".hoverlayer");
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

  test("Items 19 & 22: HTML tooltip anchors to cursor, pins, unpins, and camera survives re-rank", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz !== undefined);
    const inspected = await page.evaluate(() => {
      const viz = (window as any).__viz;
      const pointNumber = viz.scorableModels.findIndex((model: any) => /reasoning/i.test(model.model));
      const event = { points: [{ pointNumber }], event: { clientX: 140, clientY: 120 } };
      viz.gd.emit("plotly_hover", event);
      const tooltip = document.querySelector(".stage-tooltip") as HTMLElement;
      const initial = { left: tooltip.style.left, top: tooltip.style.top, text: tooltip.textContent };
      viz.gd.emit("plotly_click", event);
      const pinnedText = tooltip.textContent;
      const camera = { eye: { x: 2.1, y: 1.2, z: 0.9 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: 0 } };
      viz.gd.emit("plotly_relayout", { "scene.camera": camera });
      return { initial, pinnedText, camera };
    });
    expect(inspected.initial.text).toContain("TPS");
    expect(inspected.initial.text).toContain("Blended price");
    expect(inspected.initial.text).toContain("AA index");
    expect(inspected.initial.text).toContain("TTFT incl. reasoning (long prompt)");
    expect(Number.parseInt(inspected.initial.left, 10) - 140).toBeLessThanOrEqual(24);
    expect(Number.parseInt(inspected.initial.top, 10) - 120).toBeLessThanOrEqual(24);
    expect(inspected.pinnedText).toBeTruthy();

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
