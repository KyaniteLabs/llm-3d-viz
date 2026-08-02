import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    headless: true,
    launchOptions: {
      args: ["--no-sandbox", "--disable-gpu-sandbox", "--use-angle=swiftshader"],
    },
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && npx vite preview --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 15000,
  },
});
