import { defineConfig, devices } from "@playwright/test";

const CI = Boolean(process.env.CI);

/**
 * End-to-end, on the three flows a regression is expensive in: posting an ad,
 * spending credits to promote one, and moderating a listing in the console.
 *
 * Include Personals startup: shared component tests cannot catch failures in
 * its separate root layout, font compilation, or age-gate hydration.
 *
 * `next dev` rather than `next build && next start`: these specs assert on
 * behaviour, none of it dependent on a production bundle, and a dev server
 * starts in a fraction of the time three production builds take. The build is
 * already proven on every run by the `build:all` step.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // One worker: projects share dev servers, and the stores
  // under test are per-origin browser storage rather than per-tab.
  workers: 1,
  reporter: CI ? [["github"], ["list"]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    trace: "on-first-retry",
    // A phone. The shell is a 430px column with a bottom bar below `lg`, and
    // the plus in that bar is the only way into the create sheet.
    ...devices["Pixel 7"],
  },

  projects: [
    {
      name: "marketplace",
      testMatch: /(?:marketplace|public)\..*\.spec\.js/,
      use: { baseURL: "http://localhost:3000" },
    },
    {
      name: "personals",
      testMatch: /(?:personals|public)\..*\.spec\.js/,
      use: { baseURL: "http://localhost:3001" },
    },
    {
      name: "admin",
      testMatch: /admin\..*\.spec\.js/,
      use: { baseURL: "http://localhost:3002" },
    },
  ],

  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !CI,
      timeout: 180_000,
      stdout: "ignore",
    },
    {
      command: "npm run dev:personals",
      url: "http://localhost:3001/login",
      reuseExistingServer: !CI,
      timeout: 180_000,
      stdout: "ignore",
    },
    {
      command: "npm run dev:admin",
      url: "http://localhost:3002/login",
      reuseExistingServer: !CI,
      timeout: 180_000,
      stdout: "ignore",
    },
  ],
});
