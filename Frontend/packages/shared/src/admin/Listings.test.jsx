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
import ListingDetail from "./ListingDetail";
import { adminRoutes } from "../components/admin/adminNav.js";
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

  test.each(["ACTIVE", "PENDING_REVIEW"])("removing a %s ad asks for a reason, then calls the API", async (status) => {
    const user = userEvent.setup();
    asAdmin();
    adminListingsApi.browseListings.mockResolvedValue(page([row({ status })]));
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
      new ApiError({ status: 409, code: "LISTING_CONFLICT", message: "This listing can no longer be removed." }),
    );
    renderAdmin(<Listings />);

    await screen.findByText("2 Bedroom Apartment");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = screen.getByRole("dialog", { name: "Remove this ad" });
    await user.type(within(dialog).getByRole("textbox"), "reason");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(
      await screen.findByText("This listing can no longer be removed."),
    ).toBeTruthy();
    // The dialog stayed open rather than crashing or silently closing.
    expect(screen.getByRole("dialog", { name: "Remove this ad" })).toBeTruthy();
  });

  test.each(["DRAFT", "REJECTED", "REMOVED", "EXPIRED"])("a %s listing does not offer Remove", async (status) => {
    asAdmin();
    adminListingsApi.browseListings.mockResolvedValue(page([row({ status })]));
    renderAdmin(<Listings />);

    await screen.findByText("2 Bedroom Apartment");
    expect(screen.queryByRole("button", { name: "Remove" })).toBe(null);
  });

  test("batch removal includes pending and active ads, excluding drafts", async () => {
    const user = userEvent.setup();
    asAdmin();
    adminListingsApi.browseListings.mockResolvedValue(page([
      row({ id: "active" }),
      row({ id: "pending", title: "Pending ad", status: "PENDING_REVIEW" }),
      row({ id: "draft", title: "Draft ad", status: "DRAFT" }),
    ]));
    adminListingsApi.removeListing.mockResolvedValue({});
    renderAdmin(<Listings />);
    await screen.findByText("Pending ad");
    await user.click(screen.getByRole("checkbox", { name: "Select every row on this page" }));
    await user.click(screen.getByRole("button", { name: "Remove (2)" }));
    const dialog = screen.getByRole("dialog", { name: "Remove 2 ads" });
    await user.type(within(dialog).getByRole("textbox"), "Duplicate submissions");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Removed 2 ads")).toBeTruthy();
    expect(adminListingsApi.removeListing.mock.calls).toEqual([
      ["active", "Duplicate submissions"], ["pending", "Duplicate submissions"],
    ]);
  });

  test("removal refreshes the in-review list and Review Queue is absent", async () => {
    const user = userEvent.setup();
    asAdmin();
    setRoute({ path: "/listings", query: "status=PENDING_REVIEW" });
    adminListingsApi.browseListings.mockResolvedValueOnce(page([row({ status: "PENDING_REVIEW" })]))
      .mockResolvedValue(page([]));
    adminListingsApi.removeListing.mockResolvedValue({});
    renderAdmin(<Listings />);
    await screen.findByText("2 Bedroom Apartment");
    expect(screen.queryByRole("link", { name: /review queue/i })).toBeNull();
    expect(adminRoutes.some((route) => route.to === "/reviews")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = screen.getByRole("dialog", { name: "Remove this ad" });
    await user.type(within(dialog).getByRole("textbox"), "Duplicate submission");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("No ads match")).toBeTruthy();
    expect(adminListingsApi.browseListings).toHaveBeenLastCalledWith(expect.objectContaining({ status: "PENDING_REVIEW" }));
  });

  test("moderators cannot remove pending ads", async () => {
    asAdmin(["USER", "MODERATOR"]);
    adminListingsApi.browseListings.mockResolvedValue(page([row({ status: "PENDING_REVIEW" })]));
    renderAdmin(<Listings />);
    await screen.findByText("2 Bedroom Apartment");
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  test("pending detail supports removal and retains verification review", async () => {
    const user = userEvent.setup();
    asAdmin();
    setRoute({ path: "/listings/listing-1", params: { id: "listing-1" } });
    const listing = row({ status: "PENDING_REVIEW", verificationRequested: true, viewCount: 0, saveCount: 0 });
    adminListingsApi.adminListingDetail.mockResolvedValue({ listing });
    adminListingsApi.removeListing.mockResolvedValue({ listing: { ...listing, status: "REMOVED" } });
    renderAdmin(<ListingDetail />);
    await screen.findByText("2 Bedroom Apartment");
    expect(screen.getByRole("link", { name: "Review verification" }).getAttribute("href"))
      .toBe("/verifications?site=marketplace");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = screen.getByRole("dialog", { name: "Remove this ad" });
    expect(within(dialog).getByRole("button", { name: "Remove" }).disabled).toBe(true);
    await user.type(within(dialog).getByRole("textbox"), "Duplicate submission");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Ad removed")).toBeTruthy();
    expect(adminListingsApi.removeListing).toHaveBeenCalledWith("listing-1", "Duplicate submission");
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Review verification" })).toBeNull();
  });
});
