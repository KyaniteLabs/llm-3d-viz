import { defineConfig } from "@playwright/test";

const browserPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const externalBase = process.env.PLAYWRIGHT_BASE_URL;

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
    baseURL: externalBase ?? "http://localhost:5173",
    channel: browserPath ? undefined : "chrome",
    headless: true,
    launchOptions: {
      executablePath: browserPath,
      args: ["--no-sandbox", "--disable-gpu-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
    trace: "on-first-retry",
  },
  webServer: externalBase ? undefined : {
    command: "npx vite --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 15000,
  },
});
