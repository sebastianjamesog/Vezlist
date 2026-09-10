import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const localChrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync(localChrome) ? localChrome : undefined);
const sites = [
  { name: "marketplace", port: 3100 },
  { name: "personals", port: 3101 },
];

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.cjs",
  fullyParallel: false,
  workers: 2,
  timeout: 45_000,
  use: {
    browserName: "chromium",
    launchOptions: executablePath ? { executablePath } : {},
    trace: "retain-on-failure",
  },
  projects: sites.map(({ name, port }) => ({
    name,
    use: { baseURL: `http://127.0.0.1:${port}` },
  })),
  webServer: sites.map(({ name, port }) => ({
    command: `node node_modules/next/dist/bin/next dev apps/${name} --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8099/api/v1",
      VEZLIST_E2E_DIST_DIR: ".next-e2e",
    },
  })),
});
