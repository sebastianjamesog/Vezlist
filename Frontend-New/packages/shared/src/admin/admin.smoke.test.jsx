import { beforeEach, describe, expect, test } from "vitest";
import { renderAdmin } from "../../../../testing/render.jsx";
import { setRoute } from "../../../../testing/stubs/next-navigation.js";
import { adminUsers } from "../data/mock";

/**
 * Every console screen, mounted as an owner.
 *
 * Signed in rather than signed out on purpose. `lib/adminRoles.js` gates
 * roughly nineteen permissions, and a screen rendered with `role === null`
 * short-circuits into its no-permission branch — which mounts a paragraph and
 * proves nothing about the screen. Seeding the session as the seeded owner is
 * what makes each of these actually build its table, its charts and its
 * dialogs.
 *
 * `Admins.test.jsx` and the queue tests cover what the *other* two roles are
 * refused; this file only asks whether the screens stand up.
 */
const SESSION_KEY = "vezlist:admin:session:v1";
const owner = adminUsers.find((a) => a.role === "owner");

const modules = import.meta.glob("./*.jsx");
const screens = Object.entries(modules)
  .filter(([path]) => !path.endsWith(".test.jsx"))
  .map(([path, load]) => [path.replace("./", "").replace(".jsx", ""), load]);

/** The three screens that read an id out of the route. */
const ROUTES = {
  ListingDetail: { path: "/listings/l1", params: { id: "l1" } },
  TicketDetail: { path: "/tickets/1234", params: { id: "1234" } },
  UserDetail: { path: "/users/u1", params: { id: "u1" } },
};

describe("every console screen mounts", () => {
  test("the suite found the screens", () => {
    expect(screens.length).toBeGreaterThan(15);
  });

  beforeEach(() => {
    setRoute({ path: "/" });
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...owner, signedInAt: "just now" }),
    );
  });

  for (const [name, load] of screens) {
    test(`${name} renders without throwing`, async () => {
      if (ROUTES[name]) setRoute(ROUTES[name]);

      const mod = await load();
      const Screen = mod.default;
      expect(typeof Screen).toBe("function");

      const { container } = renderAdmin(<Screen />);
      expect(container.textContent.trim().length).toBeGreaterThan(0);
    });
  }
});
