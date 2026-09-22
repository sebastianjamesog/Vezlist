import { beforeEach, describe, expect, test } from "vitest";
import { renderApp } from "../../../../testing/render.jsx";
import { setRoute } from "../../../../testing/stubs/next-navigation.js";

/**
 * Every screen in `pages/`, mounted.
 *
 * Discovered with `import.meta.glob` rather than listed, so a page added next
 * week is covered the day it lands instead of the day someone remembers to add
 * it here. That is the whole point of a smoke suite: it is the test that
 * catches "this screen no longer mounts at all" — a bad import, a hook called
 * outside its provider, a `.map` over something that became undefined — which
 * is exactly the class of breakage that 206 pure-function tests over `lib/`
 * cannot see.
 *
 * It asserts three things and deliberately no more: the module has a default
 * export, mounting it throws nothing, and it puts something on the page. What
 * each screen actually *says* belongs in that screen's own test.
 */
const modules = import.meta.glob("./*.jsx");
const pages = Object.entries(modules)
  .filter(([path]) => !path.endsWith(".test.jsx"))
  .map(([path, load]) => [path.replace("./", "").replace(".jsx", ""), load]);

/**
 * The four screens that read `useParams`. Given a real id they render the real
 * thing; left empty they would each render their not-found branch, which is a
 * weaker test of the same mount.
 */
const ROUTES = {
  AdDetail: { path: "/ad/a1", params: { id: "a1" } },
  SellerProfile: { path: "/seller/s1", params: { id: "s1" } },
  StatusViewer: { path: "/status/s1", params: { id: "s1" } },
  TicketDetail: { path: "/support/tickets/1234", params: { id: "1234" } },
};

describe("every shared page mounts", () => {
  // The glob is resolved at build time by Vite; an empty one means the pattern
  // stopped matching and every test below would vacuously pass.
  test("the suite found the pages", () => {
    expect(pages.length).toBeGreaterThan(15);
  });

  beforeEach(() => {
    // A page that reads the query without one still has to render.
    setRoute({ path: "/" });
  });

  for (const [name, load] of pages) {
    test(`${name} renders without throwing`, async () => {
      if (ROUTES[name]) setRoute(ROUTES[name]);

      const mod = await load();
      const Page = mod.default;
      expect(typeof Page).toBe("function");

      const { container } = renderApp(<Page />);
      expect(container.textContent.trim().length).toBeGreaterThan(0);
    });
  }
});
