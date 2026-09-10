import test from "node:test";
import assert from "node:assert/strict";
import {
  discoveryApiPath,
  discoveryListingToCard,
  discoveryUrlParams,
  filtersFromSearchParams,
} from "./discovery.js";

const catalog = {
  categories: [
    { id: "vehicles", label: "Vehicles" },
    { id: "jobs", label: "Jobs" },
  ],
  provinces: [
    { id: "all", label: "All Canada" },
    { id: "bc", label: "British Columbia" },
  ],
  locationOptions: [
    {
      id: "bc",
      areas: [
        { id: "bc-1", label: "Metro Vancouver" },
        { id: "bc-2", label: "Vancouver Island" },
      ],
    },
  ],
};

const filters = {
  sort: "price-asc",
  categories: ["Vehicles", "Jobs"],
  province: "bc",
  cities: ["Metro Vancouver"],
  minPrice: "100",
  maxPrice: "900",
  verifiedOnly: true,
  postedWithin: "7d",
};

test("URL filters round-trip with stable catalog IDs", () => {
  const params = discoveryUrlParams(filters, "red bike", catalog);
  assert.equal(
    params.toString(),
    "q=red+bike&sort=price-asc&category=vehicles&category=jobs&province=bc&area=bc-1&minPrice=100&maxPrice=900&verified=1&posted=7d",
  );
  assert.deepEqual(filtersFromSearchParams(params, catalog), filters);
});

test("legacy category entry links hydrate the URL-backed filter", () => {
  const parsed = filtersFromSearchParams(
    new URLSearchParams("cat=vehicles"),
    catalog,
  );
  assert.deepEqual(parsed.categories, ["Vehicles"]);
});

test("nearest URL sorting is accepted only on coordinate-backed screens", () => {
  const params = new URLSearchParams("sort=nearest");
  assert.equal(filtersFromSearchParams(params, catalog).sort, "newest");
  assert.equal(
    filtersFromSearchParams(params, catalog, "nearest", true).sort,
    "nearest",
  );
});

test("API query maps UI values to the backend contract", () => {
  const path = discoveryApiPath({
    site: "marketplace",
    filters,
    query: "red bike",
    catalog,
    coordinates: { latitude: 48.4, longitude: -123.3, radiusKm: 5 },
    limit: 12,
  });
  const params = new URLSearchParams(path.split("?")[1]);
  assert.equal(params.get("site"), "MARKETPLACE");
  assert.deepEqual(params.getAll("category"), ["vehicles", "jobs"]);
  assert.equal(params.get("area"), "bc-1");
  assert.equal(params.get("sort"), "PRICE_ASC");
  assert.equal(params.get("postedWithin"), "DAYS_7");
  assert.equal(params.get("radiusKm"), "5");
});

test("discovery response maps to the established card contract", () => {
  const card = discoveryListingToCard(
    {
      id: "listing-1",
      title: "Red bike",
      businessName: "Island Cycle",
      price: 850,
      categoryId: "vehicles",
      categoryLabel: "Vehicles",
      provinceId: "bc",
      provinceLabel: "British Columbia",
      locationId: "bc-2",
      locationLabel: "Vancouver Island",
      imageUrl: null,
      photoCount: 0,
      verified: true,
      publishedAt: "2026-09-10T09:00:00Z",
      distanceKm: 1.25,
    },
    Date.parse("2026-09-10T10:00:00Z"),
  );
  assert.equal(card.adId, "listing-1");
  assert.equal(card.business, "Island Cycle");
  assert.equal(card.postedMsAgo, 3_600_000);
  assert.equal(card.distanceKm, 1.25);
  assert.equal(card.image, "/icon.svg");
});
