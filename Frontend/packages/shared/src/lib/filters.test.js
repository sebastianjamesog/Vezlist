// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FILTERS,
  activeFilterChips,
  activeFilterCount,
  applyFilters,
} from "./filters.js";

const HOUR = 3_600_000;
const DAY = 86_400_000;

const data = [
  {
    id: "a",
    title: "Red Bike",
    business: "Ride",
    category: "Vehicles",
    location: "Vancouver Island",
    province: "British Columbia",
    price: 850,
    verified: true,
    postedMsAgo: 2 * HOUR,
    distanceKm: 5,
  },
  {
    id: "b",
    title: "Blue Condo",
    business: "Estates",
    category: "Property",
    location: "Metro Vancouver",
    province: "British Columbia",
    price: 2400,
    verified: false,
    postedMsAgo: 10 * DAY,
    distanceKm: 1,
  },
  {
    id: "c",
    title: "Barista Job",
    business: "Bean",
    category: "Jobs",
    location: "Greater Toronto Area",
    province: "Ontario",
    price: 0,
    verified: true,
    postedMsAgo: 3 * DAY,
    distanceKm: 9,
  },
];

const f = (over) => ({ ...DEFAULT_FILTERS, ...over });

test("no filters returns everything, newest first", () => {
  assert.deepEqual(
    applyFilters(data, f()).map((l) => l.id),
    ["a", "c", "b"],
  );
});

test("query matches title, business or category", () => {
  assert.deepEqual(
    applyFilters(data, f(), "bean").map((l) => l.id),
    ["c"],
  );
  assert.deepEqual(
    applyFilters(data, f(), "property").map((l) => l.id),
    ["b"],
  );
  assert.deepEqual(applyFilters(data, f(), "nothing"), []);
});

test("province narrows to its own listings", () => {
  assert.deepEqual(
    applyFilters(data, f({ province: "on" })).map((l) => l.id),
    ["c"],
  );
  assert.deepEqual(
    applyFilters(data, f({ province: "bc" })).map((l) => l.id),
    ["a", "b"],
  );
});

test("areas narrow inside the province", () => {
  assert.deepEqual(
    applyFilters(data, f({ province: "bc", cities: ["Metro Vancouver"] })).map(
      (l) => l.id,
    ),
    ["b"],
  );
});

test("province and areas are one filter, and clearing the province clears the areas", () => {
  const filters = f({ province: "bc", cities: ["Metro Vancouver"] });
  assert.equal(activeFilterCount(filters), 1);
  const chip = activeFilterChips(filters).find((c) => c.key === "prov:bc");
  assert.equal(chip.label, "British Columbia");
  assert.deepEqual(chip.clear, { province: "all", cities: [] });
});

test("category and city narrow independently", () => {
  assert.deepEqual(
    applyFilters(data, f({ categories: ["Vehicles"] })).map((l) => l.id),
    ["a"],
  );
  assert.deepEqual(
    applyFilters(
      data,
      f({ cities: ["Vancouver Island", "Greater Toronto Area"] }),
    ).map((l) => l.id),
    ["a", "c"],
  );
});

test("price bounds are inclusive and ignore blanks", () => {
  assert.deepEqual(
    applyFilters(data, f({ minPrice: 850, maxPrice: 850 })).map((l) => l.id),
    ["a"],
  );
  assert.deepEqual(
    applyFilters(data, f({ minPrice: "", maxPrice: 1000 })).map((l) => l.id),
    ["a", "c"],
  );
});

test("verifiedOnly and postedWithin filter", () => {
  assert.deepEqual(
    applyFilters(data, f({ verifiedOnly: true })).map((l) => l.id),
    ["a", "c"],
  );
  assert.deepEqual(
    applyFilters(data, f({ postedWithin: "24h" })).map((l) => l.id),
    ["a"],
  );
  assert.deepEqual(
    applyFilters(data, f({ postedWithin: "7d" })).map((l) => l.id),
    ["a", "c"],
  );
});

test("sorts by price and distance", () => {
  assert.deepEqual(
    applyFilters(data, f({ sort: "price-asc" })).map((l) => l.id),
    ["c", "a", "b"],
  );
  assert.deepEqual(
    applyFilters(data, f({ sort: "price-desc" })).map((l) => l.id),
    ["b", "a", "c"],
  );
  assert.deepEqual(
    applyFilters(data, f({ sort: "nearest" })).map((l) => l.id),
    ["b", "a", "c"],
  );
});

test("applyFilters does not mutate its input array", () => {
  const before = data.map((l) => l.id);
  applyFilters(data, f({ sort: "price-desc" }));
  assert.deepEqual(
    data.map((l) => l.id),
    before,
  );
});

test("activeFilterCount ignores sort, counts each narrowed group once", () => {
  assert.equal(activeFilterCount(f()), 0);
  assert.equal(activeFilterCount(f({ sort: "price-asc" })), 0);
  assert.equal(activeFilterCount(f({ categories: ["Jobs", "Vehicles"] })), 1);
  assert.equal(
    activeFilterCount(
      f({ categories: ["Jobs"], verifiedOnly: true, maxPrice: 10 }),
    ),
    3,
  );
});

test("chips clear only their own group", () => {
  const filters = f({ categories: ["Jobs", "Vehicles"], verifiedOnly: true });
  const chips = activeFilterChips(filters);
  assert.deepEqual(
    chips.map((c) => c.label),
    ["Jobs", "Vehicles", "Verified only"],
  );
  assert.deepEqual(chips[0].clear, { categories: ["Vehicles"] });
});
