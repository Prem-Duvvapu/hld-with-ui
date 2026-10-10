import { defineConfig, devices } from "@playwright/test";
import production from "./playwright.config";

const backendPort = Number(process.env.LESSON_BACKEND_PORT ?? 18581);
const frontendPort = Number(process.env.LESSON_FRONTEND_PORT ?? 14574);
const originalFrontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 14173);
const servers = Array.isArray(production.webServer)
  ? production.webServer
  : [production.webServer!];

export default defineConfig({
  ...production,
  testDir: "./e2e/performance",
  testMatch: "**/lesson-loading.perf.ts",
  workers: 1,
  retries: 0,
  maxFailures: 1,
  timeout: 120_000,
  reporter: [["list"]],
  outputDir: "test-results/lesson-performance",
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium-lessons", use: devices["Desktop Chrome"] }],
  webServer: servers.map((server, index) => ({
    ...server,
    command:
      index === 1
        ? server.command!.replace(
            String(originalFrontendPort),
            String(frontendPort),
          )
        : server.command,
    env: {
      ...server.env,
      ...(index === 0
        ? { PORT: String(backendPort) }
        : { BACKEND_PORT: String(backendPort) }),
    },
    url: `http://127.0.0.1:${index === 0 ? backendPort : frontendPort}/api/v1/health`,
    reuseExistingServer: false,
  })),
});
