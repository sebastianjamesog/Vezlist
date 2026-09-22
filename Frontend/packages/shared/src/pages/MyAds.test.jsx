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
import * as verificationApi from "../lib/api/verification.js";
import { ApiError } from "../lib/api/client.js";

vi.mock("../lib/api/verification.js", () => ({
  currentVerification: vi.fn(),
  requestVerification: vi.fn(),
  uploadVerificationPhoto: vi.fn(),
}));

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
  };
});

vi.mock("../lib/api/moderation.js", () => ({
  ownerStatus: vi.fn(),
  appeal: vi.fn(),
}));

vi.mock("../lib/api/catalog.js", async () => ({
  ...(await vi.importActual("../lib/api/catalog.js")),
  getCategories: vi.fn().mockResolvedValue([
    { id: "property", label: "Property" },
    { id: "db-added-services", label: "New services" },
  ]),
  searchLocations: vi.fn().mockResolvedValue([]),
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
    verificationRequested: false,
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

const verificationRequest = (overrides = {}) => ({
  id: "verification-1",
  status: "AWAITING_PHOTO",
  photoStatus: "NONE",
  code: "123456",
  ...overrides,
});

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
      locationLabel: "Richmond",
      locationId: "on-richmond",
      provinceId: "on",
      categoryLabel: "New services",
      categoryId: "db-added-services",
      attributes: { subcategory: "Legacy selection" },
    });
    listingsApi.ownedListings.mockResolvedValue([rejected]);
    moderationApi.ownerStatus.mockResolvedValue({
      listingId: "r1",
      status: "REJECTED",
      publicReason: "Photos were unclear.",
      appealAllowed: true,
    });
    renderApp(<MyAds />);

    await userEvent.click(
      await screen.findByRole("button", { name: /^Needs attention/ }),
    );
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

    listingsApi.updateListing.mockResolvedValue({
      ...rejected,
      title: "A perfectly good title",
    });
    listingsApi.submitListing.mockResolvedValue({
      ...rejected,
      title: "A perfectly good title",
      status: "ACTIVE",
    });

    await userEvent.click(
      within(sheet).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() => expect(listingsApi.updateListing).toHaveBeenCalled());
    expect(listingsApi.updateListing).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({
        locationId: "on-richmond",
        provinceId: "on",
        categoryId: "db-added-services",
        attributes: { subcategory: "Legacy selection" },
      }),
    );
    await waitFor(() => expect(listingsApi.submitListing).toHaveBeenCalled());
    expect(listingsApi.submitListing).toHaveBeenCalledWith(
      "r1",
      expect.any(String),
      { requestVerification: false },
    );
    expect(
      await screen.findByText("Your ad is live — changes saved"),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Edit this ad" })).toBe(null);
  });

  test("editing an old label-only location requires reselection before saving", async () => {
    listingsApi.ownedListings.mockResolvedValue([
      listing({ status: "DRAFT", locationId: null, provinceId: null }),
    ]);
    renderApp(<MyAds />);

    await userEvent.click(
      await screen.findByRole("button", { name: /^Drafts/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit 2 Bedroom Apartment" }),
    );
    const sheet = screen.getByRole("dialog", { name: "Edit this ad" });
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Save changes" }),
    );

    expect(
      within(sheet).getByText("Select a location from the suggestions."),
    ).toBeTruthy();
    expect(listingsApi.updateListing).not.toHaveBeenCalled();
    expect(listingsApi.submitListing).not.toHaveBeenCalled();
  });

  test("editing an old label-only category requires reselection before saving", async () => {
    listingsApi.ownedListings.mockResolvedValue([
      listing({ status: "DRAFT", categoryId: null }),
    ]);
    renderApp(<MyAds />);

    await userEvent.click(
      await screen.findByRole("button", { name: /^Drafts/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit 2 Bedroom Apartment" }),
    );
    const sheet = screen.getByRole("dialog", { name: "Edit this ad" });
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Save changes" }),
    );

    expect(
      within(sheet).getByText("Select a category from the list."),
    ).toBeTruthy();
    expect(listingsApi.updateListing).not.toHaveBeenCalled();
    expect(listingsApi.submitListing).not.toHaveBeenCalled();
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

    await userEvent.click(
      await screen.findByRole("button", { name: /^Needs attention/ }),
    );
    expect(await screen.findByText("Photos were unclear.")).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", {
        name: "Appeal the decision on Rejected ad",
      }),
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

  test("a private verified ad resumes its existing code without creating another request", async () => {
    listingsApi.ownedListings.mockResolvedValue([
      listing({ status: "PENDING_REVIEW", verificationRequested: true }),
    ]);
    verificationApi.currentVerification.mockResolvedValue(
      verificationRequest(),
    );
    renderApp(<MyAds />);
    await userEvent.click(
      await screen.findByRole("button", { name: /^In review/ }),
    );
    expect(screen.queryByRole("link", { name: "2 Bedroom Apartment" })).toBe(
      null,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Continue verification for/ }),
    );
    expect(await screen.findByText("123456")).toBeTruthy();
    expect(verificationApi.currentVerification).toHaveBeenCalledWith(
      "listing-1",
    );
    expect(verificationApi.requestVerification).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Your ad stays private until approval/),
    ).toBeTruthy();
  });

  test("a failed initial verification request can be retried from My Ads", async () => {
    listingsApi.ownedListings.mockResolvedValue([
      listing({ status: "PENDING_REVIEW", verificationRequested: true }),
    ]);
    verificationApi.currentVerification.mockRejectedValue(
      new ApiError({ status: 404, code: "VERIFICATION_REQUEST_NOT_FOUND" }),
    );
    verificationApi.requestVerification
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(verificationRequest());
    renderApp(<MyAds />);
    await userEvent.click(
      await screen.findByRole("button", { name: /^In review/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Continue verification for/ }),
    );
    await screen.findByText(
      "Couldn't start verification. Your ad stays private; try again.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Continue verification for/ }),
    );
    expect(await screen.findByText("123456")).toBeTruthy();
    expect(verificationApi.requestVerification).toHaveBeenCalledTimes(2);
    expect(listingsApi.submitListing).not.toHaveBeenCalled();
  });

  test("a verification lookup error does not create a second request", async () => {
    listingsApi.ownedListings.mockResolvedValue([
      listing({ status: "PENDING_REVIEW", verificationRequested: true }),
    ]);
    verificationApi.currentVerification.mockRejectedValue(
      new ApiError({ status: 500, message: "Try again later" }),
    );
    renderApp(<MyAds />);
    await userEvent.click(
      await screen.findByRole("button", { name: /^In review/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Continue verification for/ }),
    );
    expect(await screen.findByText("Try again later")).toBeTruthy();
    expect(verificationApi.requestVerification).not.toHaveBeenCalled();
  });

  test("resubmitting a rejected verified ad keeps it private and starts a fresh verification", async () => {
    const rejected = listing({
      status: "REJECTED",
      verificationRequested: true,
    });
    listingsApi.ownedListings.mockResolvedValue([rejected]);
    listingsApi.updateListing.mockResolvedValue(rejected);
    listingsApi.submitListing.mockResolvedValue({
      ...rejected,
      status: "PENDING_REVIEW",
    });
    verificationApi.currentVerification.mockResolvedValue(
      verificationRequest({ status: "REJECTED" }),
    );
    verificationApi.requestVerification.mockResolvedValue(
      verificationRequest({ id: "verification-2", code: "654321" }),
    );
    moderationApi.ownerStatus.mockResolvedValue({ appealAllowed: true });
    renderApp(<MyAds />);
    await userEvent.click(
      await screen.findByRole("button", { name: /^Needs attention/ }),
    );
    expect(
      screen.queryByRole("button", { name: /Appeal the decision on/ }),
    ).toBe(null);
    expect(
      screen.getByText(
        "This ad is private. Edit and resubmit to try verification again.",
      ),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Edit 2 Bedroom Apartment" }),
    );
    await screen.findByRole("button", { name: "Property" });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("654321")).toBeTruthy();
    expect(listingsApi.submitListing).toHaveBeenCalledWith(
      "listing-1",
      expect.any(String),
      { requestVerification: true },
    );
    expect(
      screen.getByText("Your ad stays private until verification is approved"),
    ).toBeTruthy();
    expect(screen.queryByText("Your ad is live — changes saved")).toBe(null);
  });
});
