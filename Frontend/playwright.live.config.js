import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

// Playwright's AI failure snapshots otherwise include password input values,
// even when ordinary trace/video/screenshot capture is disabled.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

const apiBase = process.env.VEZLIST_LIVE_API_BASE_URL;
if (
  !apiBase ||
  !process.env.VEZLIST_LIVE_EMAIL ||
  !process.env.VEZLIST_LIVE_PASSWORD
) {
  throw new Error(
    "Live browser tests require the isolated backend NotificationBrowserIT harness.",
  );
}
const apiUrl = new URL(apiBase);
if (
  apiUrl.protocol !== "http:" ||
  apiUrl.hostname !== "127.0.0.1" ||
  apiUrl.pathname !== "/api/v1"
) {
  throw new Error(
    "Live notification tests may only target an isolated loopback API.",
  );
}
const localChrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync(localChrome) ? localChrome : undefined);
const sites = [
  { name: "marketplace", port: 3200 },
  { name: "personals", port: 3201 },
];

export default defineConfig({
  testDir: "./e2e-live",
  testMatch: "**/*.live.cjs",
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: "./test-results-live",
  // Live login credentials must not be captured in traces/videos/screenshots.
  use: {
    browserName: "chromium",
    launchOptions: executablePath ? { executablePath } : {},
    trace: "off",
    screenshot: "off",
    video: "off",
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
      NEXT_PUBLIC_API_BASE_URL: apiBase,
      VEZLIST_E2E_DIST_DIR: ".next-live",
    },
  })),
});
