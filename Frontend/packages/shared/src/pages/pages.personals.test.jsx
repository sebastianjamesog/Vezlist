import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The same screens again, built as the personals board.
 *
 * `lib/sites.js` reads `NEXT_PUBLIC_SITE` once at module scope and every
 * shared screen branches on the `IS_PERSONALS` it derives — different feed,
 * different copy, different cards, and on some screens a whole section that
 * only one board has. A suite that only ever mounts the marketplace build is
 * therefore not testing half of what ships, and the half it is not testing is
 * the one with the legal exposure.
 *
 * `vi.hoisted` runs before the static imports below, which is the only place
 * the variable can be set: `sites.js` would otherwise already have read it.
 * Vitest isolates module graphs per file, so this does not leak into the
 * marketplace pass in `pages.smoke.test.jsx`.
 */
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SITE = "personals";
});

const { renderApp } = await import("../../../../testing/render.jsx");
const { setRoute } =
  await import("../../../../testing/stubs/next-navigation.js");
const { IS_PERSONALS } = await import("../lib/sites.js");

const modules = import.meta.glob("./*.jsx");
const pages = Object.entries(modules)
  .filter(([path]) => !path.endsWith(".test.jsx"))
  .map(([path, load]) => [path.replace("./", "").replace(".jsx", ""), load]);

const ROUTES = {
  AdDetail: { path: "/ad/a2", params: { id: "a2" } },
  SellerProfile: { path: "/seller/s1", params: { id: "s1" } },
  StatusViewer: { path: "/status/s1", params: { id: "s1" } },
  TicketDetail: { path: "/support/tickets/1234", params: { id: "1234" } },
};

describe("every shared page mounts on the personals build", () => {
  // If this ever fails the rest of the file is silently re-testing the
  // marketplace, so it is asserted rather than assumed.
  test("the build really is personals", () => {
    expect(IS_PERSONALS).toBe(true);
  });

  beforeEach(() => {
    setRoute({ path: "/" });
  });

  for (const [name, load] of pages) {
    test(`${name} renders without throwing`, async () => {
      if (ROUTES[name]) setRoute(ROUTES[name]);

      const { default: Page } = await load();
      const { container } = renderApp(<Page />);
      expect(container.textContent.trim().length).toBeGreaterThan(0);
    });
  }
});
