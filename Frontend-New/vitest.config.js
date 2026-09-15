import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const stub = (p) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Component tests. Deliberately a *second* runner rather than a replacement.
 *
 * `node --test` owns `**\/*.test.js` — 206 pure-function tests over
 * `packages/shared/src/lib/*.js` that need no DOM, no transform and no
 * dependency to run, and that stay exactly as they are. This config owns
 * `**\/*.test.jsx` and nothing else. The file extension is the whole
 * boundary: Vitest's default `include` would happily pick up the node:test
 * files and fail on `import { test } from "node:test"`, so it is narrowed
 * here, and node's own default patterns only ever match `.js`/`.cjs`/`.mjs`,
 * so it will never pick these up. Neither runner can see the other's files,
 * and `npm test` runs both in sequence.
 */
export default defineConfig({
  test: {
    include: ["**/*.test.jsx"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.open-next/**",
      "e2e/**",
    ],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./testing/setup.js"],
    restoreMocks: true,
  },
  resolve: {
    /**
     * The three `next/*` modules the shared package imports. Aliased to stubs
     * rather than `vi.mock`ed per file so that a smoke test of a page is one
     * `render()` call and not a preamble of mocks — and so there is one place
     * to look when a page starts depending on a fourth.
     */
    alias: {
      "next/link": stub("./testing/stubs/next-link.jsx"),
      "next/navigation": stub("./testing/stubs/next-navigation.js"),
      "next/dynamic": stub("./testing/stubs/next-dynamic.jsx"),
    },
  },
});
