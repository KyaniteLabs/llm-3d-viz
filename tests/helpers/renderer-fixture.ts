import { resolve } from "node:path";
import { createServer, normalizePath } from "vite";
import { test as base, type Page } from "@playwright/test";

export const RENDERER_POINT_COUNT = 40;
export const COST_PREFERRED_MODEL = "Fixture Family 06 (low)";
export const INCOMPLETE_FIXTURE_MODEL = "Fixture Incomplete";

export const test = base.extend<{}, { rendererOrigin: string }>({
  rendererOrigin: [async ({}, use) => {
    // Exercise the actual legacy application and Plotly without depending on
    // licensed benchmark fields that are absent from the public catalog.
    const catalog = normalizePath(resolve("data/models.v0.draft.json"));
    let replacement: string;
    const server = await createServer({
      cacheDir: ".cache/renderer-suite/vite",
      server: {
        host: "127.0.0.1",
        port: 0,
        hmr: false,
        watch: { ignored: ["**/.cache/**", "**/.scratch/**"] },
      },
      plugins: [{
        name: "renderer-test-catalog",
        enforce: "pre",
        transform(_source, id, options) {
          return id === catalog && !options?.ssr ? replacement : null;
        },
      }],
    });
    try {
      const { syntheticModels } = await server.ssrLoadModule("/tests/helpers/synthetic-catalog.ts");
      const complete = syntheticModels.map((model: (typeof syntheticModels)[number], index: number) => {
        const family = `Fixture Family ${String(Math.floor(index / 2) + 1).padStart(2, "0")}`;
        const effort = index % 2 === 0 ? "low" : "high";
        return {
          ...model,
          model: `${family} (${effort})`,
          family_id: family,
          effort_tier: effort,
          provider: syntheticModels[Math.floor(index / 2)].provider,
          openness: Math.floor(index / 2) % 2 === 0 ? "open" : "closed",
          release_date: "2026-10-01",
          ...(index === 0 || index === 10
            ? { blended_price_per_M: 0, price_in_per_M: 0, price_out_per_M: 0, cost_per_index_task_usd: 0 }
            : index === 20
              ? { blended_price_per_M: 0.08, price_in_per_M: 0.048, price_out_per_M: 0.2, cost_per_index_task_usd: 0.004 }
              : {}),
        };
      });
      const incomplete = {
        ...complete[0],
        model: INCOMPLETE_FIXTURE_MODEL,
        family_id: INCOMPLETE_FIXTURE_MODEL,
        tps: null,
        null_reason: "Synthetic row with no measured speed.",
      };
      replacement = JSON.stringify([...complete, incomplete]);
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === "string") throw new Error("Renderer fixture failed to listen");
      await use(`http://127.0.0.1:${address.port}`);
    } finally {
      await server.close();
    }
  }, { scope: "worker" }],
  baseURL: async ({ rendererOrigin }, use) => use(rendererOrigin),
  page: async ({ page }, use) => {
    // The legacy page probes Atlas text-to-speech in the background. Keep
    // renderer tests independent of the optional model download and TLS proxy.
    await page.route("https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/**", route =>
      route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }),
    );
    await use(page);
  },
});

export async function waitForSweepSettled(page: Page, expectedId: string | null = null): Promise<void> {
  await page.waitForFunction((expected) => {
    const viz = (window as any).__viz;
    const optimum = viz?.optimumModelId;
    if (!optimum || (expected !== null && optimum !== expected)) return false;
    const pointIndex = viz.gd?.data?.[0]?.text?.indexOf(optimum) ?? -1;
    return pointIndex >= 0 && viz.markerSizes?.[pointIndex] >= 16;
  }, expectedId, { timeout: 15000 });
}
