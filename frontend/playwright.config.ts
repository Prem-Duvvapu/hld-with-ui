import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Browser journeys run against the packaged Java backend and the production
// frontend build, on ports that do not collide with ./start.sh defaults.
const backendPort = Number(process.env.E2E_BACKEND_PORT ?? 18080);
const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 14173);
const jar = "../backend/target/hld-backend-0.1.0-SNAPSHOT.jar";

if (!existsSync(jar)) {
  throw new Error(
    `Missing ${jar}. Package the backend first: (cd backend && ./mvnw -B package -DskipTests)`,
  );
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `java -jar ${jar}`,
      env: { PORT: String(backendPort) },
      url: `http://127.0.0.1:${backendPort}/api/v1/health`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      // Readiness goes through the preview proxy, proving frontend-to-Java routing.
      command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${frontendPort} --strictPort`,
      env: { BACKEND_PORT: String(backendPort) },
      url: `http://127.0.0.1:${frontendPort}/api/v1/health`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
