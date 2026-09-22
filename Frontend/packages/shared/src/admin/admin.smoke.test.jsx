import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderAdmin, waitFor } from "../../../../testing/render.jsx";
import { setRoute } from "../../../../testing/stubs/next-navigation.js";
import * as authApi from "../lib/api/auth.js";

/**
 * Every console screen, mounted as an owner (a backend account with the
 * ADMIN role — see `AdminAuthContext`'s mapping of backend roles onto this
 * console's own owner/moderator/support vocabulary).
 *
 * Signed in rather than signed out on purpose. `lib/adminRoles.js` gates
 * roughly nineteen permissions, and a screen rendered with `role === null`
 * short-circuits into its no-permission branch — which mounts a paragraph and
 * proves nothing about the screen. `AdminAuthContext` now hydrates from the
 * real `GET /api/v1/auth/me` rather than a localStorage session, so getting
 * "signed in as owner" here means mocking that call rather than seeding
 * storage.
 *
 * `Admins.test.jsx` and the queue tests cover what the *other* two roles are
 * refused; this file only asks whether the screens stand up.
 */
vi.mock("../lib/api/auth.js", () => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}));

const OWNER_RESPONSE = {
  id: "owner-1",
  name: "Test Owner",
  email: "owner@vezlist.cc",
  emailVerified: true,
  roles: ["USER", "ADMIN"],
  createdAt: "2026-01-01T00:00:00Z",
};

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
    authApi.me.mockReset().mockResolvedValue(OWNER_RESPONSE);
  });

  for (const [name, load] of screens) {
    test(`${name} renders without throwing`, async () => {
      if (ROUTES[name]) setRoute(ROUTES[name]);

      const mod = await load();
      const Screen = mod.default;
      expect(typeof Screen).toBe("function");

      const { container } = renderAdmin(<Screen />);
      await waitFor(() =>
        expect(container.textContent.trim().length).toBeGreaterThan(0),
      );
    });
  }
});
