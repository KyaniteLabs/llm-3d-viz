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
    await expect(page.locator(".incomplete-data-entry")).toHaveCount(2);
    await expect(page.locator(".incomplete-data")).toContainText("GPT-5.5 Pro (xhigh)");
    await expect(page.locator(".incomplete-data")).toContainText("DeepSeek V4 Flash 0731");

    // Check no .modebar element in the DOM
    const modebar = page.locator(".modebar");
    await expect(modebar).toHaveCount(0);

    // Check .hoverlayer is empty
    const hoverlayer = page.locator(".hoverlayer");
    await expect(hoverlayer).toHaveCount(1);
    await expect(hoverlayer).toHaveJSProperty("childElementCount", 0);
  });

  test("Item 13: All three axes are log scale with custom ticks including ε floor", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz !== undefined);

    const layout = await page.evaluate(() => {
      const scene = (window as any).__viz.gd.layout.scene;
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
    const priceFloor = 0.08125;
    expect(layout.zaxisTickvals).toEqual([priceFloor, 0.1, 1, 10, 100]);
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
        colors: pointsTrace.marker.color,
        models: viz.scorableModels.map((m: any) => m.model),
        providers: viz.scorableModels.map((m: any) => m.provider),
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
    const optimumProvider = data.providers[optimumIndex];

    // Assert optimum is larger in size (16)
    expect(data.sizes[optimumIndex]).toBe(16);

    // Check standard provider shapes are honored
    // E.g. OpenAI -> circle, Anthropic -> circle-open, Google -> cross, Meta -> diamond
    const openaiIndices = data.providers.map((p: string, idx: number) => p === "OpenAI" ? idx : -1).filter((idx: number) => idx !== -1);
    openaiIndices.forEach((idx: number) => {
      if (idx !== optimumIndex) {
        expect(data.symbols[idx]).toBe("circle");
      }
    });

    const googleIndices = data.providers.map((p: string, idx: number) => p === "Google" ? idx : -1).filter((idx: number) => idx !== -1);
    googleIndices.forEach((idx: number) => {
      if (idx !== optimumIndex) {
        expect(data.symbols[idx]).toBe("cross");
      }
    });

    // The optimum must have a symbol distinct from its own provider's standard shape
    // Wait, let's verify if its standard provider shape is overridden.
    if (optimumProvider === "OpenAI") {
      expect(optimumSymbol).not.toBe("circle");
    } else if (optimumProvider === "Google") {
      expect(optimumSymbol).not.toBe("cross");
    }
  });

  test("Item 24: $0.00 models are placed at the ε price floor position", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => (window as any).__viz !== undefined);

    const zeroPricePlottedCoords = await page.evaluate(() => {
      const viz = (window as any).__viz;
      const pointsTrace = viz.gd.data[0];
      const res: any[] = [];
      viz.scorableModels.forEach((model: any, index: number) => {
        if (model.blended_price_per_M === 0) {
          res.push({
            name: model.model,
            z: pointsTrace.z[index],
          });
        }
      });
      return res;
    });

    expect(zeroPricePlottedCoords.length).toBe(2);
    const priceFloor = 0.08125;
    zeroPricePlottedCoords.forEach((pt) => {
      expect(pt.z).toBeCloseTo(priceFloor);
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
