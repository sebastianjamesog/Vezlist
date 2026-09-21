import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  renderAdmin,
  screen,
  userEvent,
  waitFor,
  within,
} from "../../../../testing/render.jsx";
import { router, setRoute } from "../../../../testing/stubs/next-navigation.js";
import Listings from "./Listings";
import * as adminListingsApi from "../lib/api/adminListings.js";
import * as authApi from "../lib/api/auth.js";

/**
 * The admin-wide listings browse, over the real `AdminListingController`.
 * Every network call is mocked at the `lib/api/*` boundary — this is a test
 * of the screen's wiring (loading, error+retry, filters, the remove action
 * and its 409), not of the HTTP client or the backend it talks to.
 *
 * `AdminAuthContext` hydrates from `GET /auth/me` on mount, so every test
 * mocks that too — there is no local session cookie to fake into anymore
 * (see `MyAds.test.jsx`'s and `AdminAuthContext.jsx`'s module docs).
 */

vi.mock("../lib/api/adminListings.js", () => ({
  browseListings: vi.fn(),
  adminListingDetail: vi.fn(),
  removeListing: vi.fn(),
}));

vi.mock("../lib/api/auth.js", () => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

function asAdmin(roles = ["USER", "ADMIN"]) {
  authApi.me.mockResolvedValue({
    id: "admin-1",
    name: "Vezlist Admin",
    email: "admin@vezlist.cc",
    roles,
  });
}

function row(overrides) {
  return {
    id: "listing-1",
    site: "MARKETPLACE",
    status: "ACTIVE",
    title: "2 Bedroom Apartment",
    businessName: "Modern City Apartments",
    price: 1500,
    categoryId: "property",
    categoryLabel: "Property",
    ownerId: "owner-1",
    ownerName: "Jordan Seller",
    ownerEmail: "jordan@example.com",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function page(items, overrides) {
  return { items, nextCursor: null, hasMore: false, totalCount: items.length, ...overrides };
}

describe("admin Listings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRoute({ path: "/listings" });
  });

  test("shows a retry-able error when the browse call fails", async () => {
    asAdmin();
    adminListingsApi.browseListings.mockRejectedValueOnce(new Error("network down"));
    renderAdmin(<Listings />);

    expect(await screen.findByText("Couldn't load listings")).toBeTruthy();

    adminListingsApi.browseListings.mockResolvedValueOnce(page([row()]));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("2 Bedroom Apartment")).toBeTruthy();
  });

  test("an empty result shows the empty state, not a crash", async () => {
    asAdmin();
    adminListingsApi.browseListings.mockResolvedValue(page([]));
    renderAdmin(<Listings />);

    expect(await screen.findByText("No ads match")).toBeTruthy();
  });

  test("the header counts what came back", async () => {
    asAdmin();
    adminListingsApi.browseListings.mockResolvedValue(
      page([row({ id: "a" }), row({ id: "b", title: "Second ad" })], { totalCount: 2 }),
    );
    renderAdmin(<Listings />);

    expect(await screen.findByText(/2 of 2 ads?$/)).toBeTruthy();
  });

  test("the status filter is sent to the API as a real ListingStatus", async () => {
    asAdmin();
    adminListingsApi.browseListings.mockResolvedValue(page([row()]));
    setRoute({ path: "/listings", query: "status=PENDING_REVIEW" });
    renderAdmin(<Listings />);

    await waitFor(() =>
      expect(adminListingsApi.browseListings).toHaveBeenCalledWith(
        expect.objectContaining({ status: "PENDING_REVIEW" }),
      ),
    );
  });

  test("clicking a row opens that listing", async () => {
    const user = userEvent.setup();
    asAdmin();
    adminListingsApi.browseListings.mockResolvedValue(page([row()]));
    renderAdmin(<Listings />);

    await screen.findByText("2 Bedroom Apartment");
    await user.click(screen.getAllByRole("row")[1]);
    expect(router.push).toHaveBeenCalledWith("/listings/listing-1");
  });

  test("removing an active ad asks for a reason, then calls the API", async () => {
    const user = userEvent.setup();
    asAdmin();
    adminListingsApi.browseListings.mockResolvedValue(page([row()]));
    adminListingsApi.removeListing.mockResolvedValue({});
    renderAdmin(<Listings />);

    await screen.findByText("2 Bedroom Apartment");
    await user.click(screen.getByRole("button", { name: "Remove" }));

    const dialog = screen.getByRole("dialog", { name: "Remove this ad" });
    const confirm = within(dialog).getByRole("button", { name: "Remove" });
    expect(confirm.disabled).toBe(true);

    await user.type(within(dialog).getByRole("textbox"), "Contact details in the photos.");
    expect(confirm.disabled).toBe(false);

    adminListingsApi.browseListings.mockResolvedValue(page([row({ status: "REMOVED" })]));
    await user.click(confirm);

    await waitFor(() =>
      expect(adminListingsApi.removeListing).toHaveBeenCalledWith(
        "listing-1",
        "Contact details in the photos.",
      ),
    );
    expect(await screen.findByText("Ad removed")).toBeTruthy();
  });

  test("a 409 from the backend shows inline instead of crashing", async () => {
    const user = userEvent.setup();
    asAdmin();
    adminListingsApi.browseListings.mockResolvedValue(page([row()]));
    const { ApiError } = await import("../lib/api/client.js");
    adminListingsApi.removeListing.mockRejectedValue(
      new ApiError({ status: 409, code: "LISTING_CONFLICT", message: "Only active listings can be force-removed." }),
    );
    renderAdmin(<Listings />);

    await screen.findByText("2 Bedroom Apartment");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = screen.getByRole("dialog", { name: "Remove this ad" });
    await user.type(within(dialog).getByRole("textbox"), "reason");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(
      await screen.findByText("Only active listings can be force-removed."),
    ).toBeTruthy();
    // The dialog stayed open rather than crashing or silently closing.
    expect(screen.getByRole("dialog", { name: "Remove this ad" })).toBeTruthy();
  });

  test("no listing offers Remove once it isn't active", async () => {
    asAdmin();
    adminListingsApi.browseListings.mockResolvedValue(page([row({ status: "REJECTED" })]));
    renderAdmin(<Listings />);

    await screen.findByText("2 Bedroom Apartment");
    expect(screen.queryByRole("button", { name: "Remove" })).toBe(null);
  });
});
