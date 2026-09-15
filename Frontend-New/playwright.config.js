import { defineConfig, devices } from "@playwright/test";

const CI = Boolean(process.env.CI);

/**
 * End-to-end, on the three flows a regression is expensive in: posting an ad,
 * spending credits to promote one, and moderating a listing in the console.
 *
 * Two of the three apps, not three. Personals shares its shell, its stores and
 * its wizard with the marketplace — what it does not share is the age gate and
 * the copy — so a third server would triple the slowest part of CI to re-test
 * the same code paths. The personals-specific branches are covered instead by
 * `pages.personals.test.jsx`, which builds the whole shared package as that
 * board in about two seconds.
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
  // One worker: both projects drive the same two dev servers, and the stores
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
      testMatch: /marketplace\..*\.spec\.js/,
      use: { baseURL: "http://localhost:3100" },
    },
    {
      name: "admin",
      testMatch: /admin\..*\.spec\.js/,
      use: { baseURL: "http://localhost:3102" },
    },
  ],

  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:3100",
      reuseExistingServer: !CI,
      timeout: 180_000,
      stdout: "ignore",
    },
    {
      command: "npm run dev:admin",
      url: "http://localhost:3102/login",
      reuseExistingServer: !CI,
      timeout: 180_000,
      stdout: "ignore",
    },
  ],
});
