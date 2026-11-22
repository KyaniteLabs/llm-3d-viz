import { test as base } from "@playwright/test";
import { resolve } from "node:path";
import { createServer, normalizePath } from "vite";

export const test = base.extend<{}, { measuredOrigin: string }>({
  measuredOrigin: [async ({}, use) => {
    const catalogPath = normalizePath(resolve("data/models.v0.draft.json"));
    let catalogJson: string;
    const server = await createServer({
      cacheDir: `.cache/measured-observatory/vite-${process.pid}`,
      server: { host: "127.0.0.1", port: 0, hmr: false },
      plugins: [{
        name: "measured-observatory-fixture",
        enforce: "pre",
        transform(_source, id, options) {
          return id === catalogPath && !options?.ssr ? catalogJson : null;
        },
      }],
    });
    try {
      const { syntheticModels } = await server.ssrLoadModule("/tests/helpers/synthetic-catalog.ts");
      const rows = (syntheticModels as import("../../src/data/models").Model[]).map((row, index) => {
        const family = `Fixture Family ${String(Math.floor(index / 2) + 1).padStart(2, "0")}`;
        const effort = index % 2 === 0 ? "low" : "high";
        return {
          ...row,
          model: `${family} (${effort})`,
          family_id: family,
          effort_tier: effort,
          release_date: "2026-10-01",
          blended_price_per_M: index === 0 ? 0 : row.blended_price_per_M,
        };
      });
      const outsideMeasuredScope = {
        ...rows[0], model: "Fixture without speed", family_id: "Fixture without speed",
        effort_tier: "default", tps: null, aa_intelligence_index: 80,
      };
      catalogJson = JSON.stringify([...rows, outsideMeasuredScope]);
      await server.listen();
      const address = server.httpServer?.address();
      if (address == null || typeof address === "string") throw new Error("Measured fixture failed to listen");
      await use(`http://127.0.0.1:${address.port}`);
    } finally {
      await server.close();
    }
  }, { scope: "worker" }],
  baseURL: async ({ measuredOrigin }, use) => use(measuredOrigin),
});

export { expect } from "@playwright/test";
