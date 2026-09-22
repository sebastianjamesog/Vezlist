import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  renderApp,
  screen,
  signIn,
  userEvent,
  waitFor,
  within,
} from "../../../../testing/render.jsx";
import MyAds from "./MyAds";
import * as listingsApi from "../lib/api/listings.js";
import * as moderationApi from "../lib/api/moderation.js";

/**
 * My Ads, over the real backend now: `GET /me/listings`, `DELETE
 * /listings/{id}`, `PATCH` + resubmit for an edit, and the owner's
 * moderation status with its appeal action. Every network call is mocked at
 * the `lib/api/*` boundary — this is a test of the screen's wiring (loading,
 * error, tab filtering, the actions it offers per status), not of the HTTP
 * client or the backend it talks to.
 */

vi.mock("../lib/api/listings.js", async () => {
  const actual = await vi.importActual("../lib/api/listings.js");
  return {
    ...actual,
    ownedListings: vi.fn(),
    deleteListing: vi.fn(),
    updateListing: vi.fn(),
    submitListing: vi.fn(),
    resolveCategoryId: vi.fn(),
    resolveLocationId: vi.fn(),
  };
});

vi.mock("../lib/api/moderation.js", () => ({
  ownerStatus: vi.fn(),
  appeal: vi.fn(),
}));

const media = (id, url = `https://cdn.example/${id}.jpg`) => ({
  id,
  fileName: `${id}.jpg`,
  contentType: "image/jpeg",
  sizeBytes: 1000,
  status: "READY",
  position: 0,
  cover: true,
  url,
  rejectionReason: null,
  readyAt: "2026-01-01T00:00:00Z",
});

function listing(overrides) {
  return {
    id: "listing-1",
    ownerId: "owner-1",
    site: "MARKETPLACE",
    status: "ACTIVE",
    title: "2 Bedroom Apartment",
    businessName: "Modern City Apartments",
    description: "Bright two bedroom with parking.",
    price: 1500,
    categoryId: "property",
    categoryLabel: "Property",
    provinceId: "bc",
    provinceLabel: "British Columbia",
    locationId: "bc-1",
    locationLabel: "Metro Vancouver",
    contactEmail: "seller@example.com",
    contactPhone: "+1 250 555 1234",
    latitude: null,
    longitude: null,
    attributes: {},
    version: 1,
    viewCount: 42,
    saveCount: 3,
    media: [media("m1")],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    submittedAt: "2026-01-01T00:00:00Z",
    publishedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-12-01T00:00:00Z",
    ...overrides,
  };
}

const tab = (name) =>
  screen.getByRole("button", { name: new RegExp(`^${name}`) });

describe("MyAds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn({ role: "creator" });
  });

  test("a browsing account is offered the switch rather than the screen", async () => {
    signIn({ role: "user" });
    listingsApi.ownedListings.mockResolvedValue([]);
    renderApp(<MyAds />);

    expect(screen.getByText("This is a creator screen")).toBeTruthy();
    expect(listingsApi.ownedListings).not.toHaveBeenCalled();
  });

  test("shows a retry-able error when the fetch fails", async () => {
    listingsApi.ownedListings.mockRejectedValueOnce(new Error("network down"));
    renderApp(<MyAds />);

    expect(await screen.findByText("Couldn't load your ads")).toBeTruthy();

    listingsApi.ownedListings.mockResolvedValueOnce([listing()]);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("2 Bedroom Apartment")).toBeTruthy();
  });

  test("an account with no ads sees the empty state, not a crash", async () => {
    listingsApi.ownedListings.mockResolvedValue([]);
    renderApp(<MyAds />);

    expect(await screen.findByText("No active ads")).toBeTruthy();
  });

  test("the tabs count listings by backend status and filter to them", async () => {
    listingsApi.ownedListings.mockResolvedValue([
      listing({ id: "a", title: "Active one", status: "ACTIVE" }),
      listing({ id: "p", title: "Pending one", status: "PENDING_REVIEW" }),
      listing({ id: "e", title: "Expired one", status: "EXPIRED" }),
    ]);
    moderationApi.ownerStatus.mockResolvedValue({
      listingId: "x",
      status: "REJECTED",
      publicReason: null,
      appealAllowed: false,
    });
    renderApp(<MyAds />);

    expect(await screen.findByText("Active one")).toBeTruthy();
    expect(screen.queryByText("Pending one")).toBe(null);

    await userEvent.click(tab("In review"));
    expect(await screen.findByText("Pending one")).toBeTruthy();
    expect(screen.queryByText("Active one")).toBe(null);

    await userEvent.click(tab("Expired"));
    expect(await screen.findByText("Expired one")).toBeTruthy();
  });

  test("only a draft or rejected ad offers Edit — the backend refuses the rest", async () => {
    listingsApi.ownedListings.mockResolvedValue([
      listing({ id: "active", title: "Live ad", status: "ACTIVE" }),
    ]);
    renderApp(<MyAds />);

    await screen.findByText("Live ad");
    expect(screen.queryByRole("button", { name: /^Edit /i })).toBe(null);
  });

  test("delete asks first, and Cancel keeps the ad", async () => {
    listingsApi.ownedListings.mockResolvedValue([listing()]);
    renderApp(<MyAds />);

    await screen.findByText("2 Bedroom Apartment");
    await userEvent.click(
      screen.getByRole("button", { name: "Delete 2 Bedroom Apartment" }),
    );
    expect(screen.getByRole("dialog", { name: /Delete/i })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(listingsApi.deleteListing).not.toHaveBeenCalled();
    expect(screen.getByText("2 Bedroom Apartment")).toBeTruthy();
  });

  test("confirming the delete calls the API and removes the row", async () => {
    listingsApi.ownedListings.mockResolvedValue([listing()]);
    listingsApi.deleteListing.mockResolvedValue(undefined);
    renderApp(<MyAds />);

    await screen.findByText("2 Bedroom Apartment");
    await userEvent.click(
      screen.getByRole("button", { name: "Delete 2 Bedroom Apartment" }),
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() =>
      expect(listingsApi.deleteListing).toHaveBeenCalledWith("listing-1"),
    );
    await waitFor(() =>
      expect(screen.queryByText("2 Bedroom Apartment")).toBe(null),
    );
  });

  test("editing a rejected ad validates, then saves and resubmits it", async () => {
    const rejected = listing({
      id: "r1",
      title: "Rejected ad",
      status: "REJECTED",
    });
    listingsApi.ownedListings.mockResolvedValue([rejected]);
    moderationApi.ownerStatus.mockResolvedValue({
      listingId: "r1",
      status: "REJECTED",
      publicReason: "Photos were unclear.",
      appealAllowed: true,
    });
    renderApp(<MyAds />);

    await userEvent.click(await screen.findByRole("button", { name: /^Needs attention/ }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit Rejected ad" }),
    );
    const sheet = screen.getByRole("dialog", { name: "Edit this ad" });

    const title = within(sheet).getByDisplayValue("Rejected ad");
    await userEvent.clear(title);
    await userEvent.type(title, "no");
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Save changes" }),
    );

    // Still open and complaining — the write never went out.
    expect(screen.getByRole("dialog", { name: "Edit this ad" })).toBeTruthy();
    expect(listingsApi.updateListing).not.toHaveBeenCalled();

    await userEvent.clear(title);
    await userEvent.type(title, "A perfectly good title");

    listingsApi.resolveCategoryId.mockResolvedValue("property");
    listingsApi.resolveLocationId.mockResolvedValue({
      locationId: "bc-1",
      provinceId: "bc",
    });
    listingsApi.updateListing.mockResolvedValue({
      ...rejected,
      title: "A perfectly good title",
    });
    listingsApi.submitListing.mockResolvedValue({
      ...rejected,
      title: "A perfectly good title",
      status: "PENDING_REVIEW",
    });

    await userEvent.click(
      within(sheet).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() => expect(listingsApi.updateListing).toHaveBeenCalled());
    await waitFor(() => expect(listingsApi.submitListing).toHaveBeenCalled());
    expect(
      screen.queryByRole("dialog", { name: "Edit this ad" }),
    ).toBe(null);
  });

  test("a rejected ad with a reason and an open appeal shows both", async () => {
    listingsApi.ownedListings.mockResolvedValue([
      listing({ id: "r1", title: "Rejected ad", status: "REJECTED" }),
    ]);
    moderationApi.ownerStatus.mockResolvedValue({
      listingId: "r1",
      status: "REJECTED",
      publicReason: "Photos were unclear.",
      appealAllowed: true,
    });
    renderApp(<MyAds />);

    await userEvent.click(await screen.findByRole("button", { name: /^Needs attention/ }));
    expect(await screen.findByText("Photos were unclear.")).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: "Appeal the decision on Rejected ad" }),
    );
    const sheet = screen.getByRole("dialog", { name: "Appeal this decision" });
    await userEvent.type(
      within(sheet).getByRole("textbox"),
      "Please take another look, the photos were fine.",
    );

    moderationApi.appeal.mockResolvedValue({ id: "case-1" });
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Submit appeal" }),
    );

    await waitFor(() =>
      expect(moderationApi.appeal).toHaveBeenCalledWith("r1", {
        site: "MARKETPLACE",
        message: "Please take another look, the photos were fine.",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: "Appeal the decision on Rejected ad",
        }),
      ).toBe(null),
    );
  });
});
