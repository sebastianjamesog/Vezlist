import test from "node:test";
import assert from "node:assert/strict";
import {
  listingPayload,
  listingStatus,
  listingToAd,
  relativeListingTime,
} from "./listings.js";

const listing = {
  id: "listing-1",
  ownerId: "owner-1",
  status: "PENDING_REVIEW",
  title: "Oak dining table",
  businessName: "Harbour Home",
  description: "Solid oak.\n\nSeats six.",
  price: 480,
  categoryLabel: "Home & Garden",
  provinceLabel: "British Columbia",
  locationLabel: "Metro Vancouver",
  contactEmail: "seller@example.com",
  contactPhone: "+1 250 555 1234",
  media: [],
  createdAt: "2026-09-10T10:00:00Z",
};

test("listingPayload maps the create form to the backend contract", () => {
  assert.deepEqual(
    listingPayload(
      {
        title: "Oak dining table",
        business: "Harbour Home",
        description: "Solid oak and seats six.",
        price: "",
        categoryId: "home-garden",
        provinceId: "bc",
        locationId: "bc-1",
        email: "seller@example.com",
        phone: "+1 250 555 1234",
      },
      "marketplace",
    ),
    {
      site: "MARKETPLACE",
      title: "Oak dining table",
      businessName: "Harbour Home",
      description: "Solid oak and seats six.",
      price: null,
      categoryId: "home-garden",
      provinceId: "bc",
      locationId: "bc-1",
      contactEmail: "seller@example.com",
      contactPhone: "+1 250 555 1234",
      latitude: null,
      longitude: null,
      attributes: {},
    },
  );
});

test("listingToAd creates a safe detail view when media is pending Module 5", () => {
  const ad = listingToAd(listing);
  assert.equal(ad.id, "listing-1");
  assert.equal(ad.price, 480);
  assert.equal(ad.location, "Metro Vancouver, British Columbia");
  assert.deepEqual(ad.photos, []);
  assert.deepEqual(ad.description, ["Solid oak.", "Seats six."]);
  assert.equal(ad.statusLabel, "In review");
});

test("listingToAd exposes only ready media URLs in persisted order", () => {
  const ad = listingToAd({
    ...listing,
    media: [
      { id: "ready", status: "READY", url: "https://cdn.test/ready.jpg" },
      { id: "processing", status: "PROCESSING", url: null },
    ],
  });
  assert.deepEqual(ad.photos, ["https://cdn.test/ready.jpg"]);
  assert.equal(ad.photoCount, 1);
});

test("status and relative time labels cover known and unknown values", () => {
  assert.equal(listingStatus("ACTIVE").label, "Active");
  assert.equal(listingStatus("SUSPENDED").label, "SUSPENDED");
  assert.equal(
    relativeListingTime(
      "2026-09-10T09:00:00Z",
      Date.parse("2026-09-10T10:00:00Z"),
    ),
    "Posted 1 hr ago",
  );
});
