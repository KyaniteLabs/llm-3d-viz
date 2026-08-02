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
});
