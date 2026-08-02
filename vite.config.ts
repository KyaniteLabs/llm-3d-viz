import { defineConfig, type Plugin } from "vite";
import { models, validateModels } from "./src/data/models";

/** Enforces the curated-data contract before Vite emits any production assets. */
function validateDataset(): Plugin {
  return {
    name: "validate-model-dataset",
    buildStart() {
      validateModels(models);
    },
  };
}

export default defineConfig({
  plugins: [validateDataset()],
  test: {
    exclude: [
      "node_modules",
      "dist",
      ".idea",
      ".git",
      ".cache",
      // Playwright browser specs live as *.spec.ts; vitest (the unit runner)
      // must skip them. Globbed so new Playwright specs are auto-excluded.
      "tests/*.spec.ts",
    ],
  },
} as any);
