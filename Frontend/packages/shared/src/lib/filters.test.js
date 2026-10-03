// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { setCategories } from "./taxonomy.js";
import { categories } from "../data/mock.js";
import {
  DEFAULT_FILTERS,
  activeFilterChips,
  activeFilterCount,
  applyFilters,
  reconcileSubcategory,
  filterButtonLabel,
  filtersToParams,
  filtersToQueryString,
  paramsToFilters,
} from "./filters.js";

const HOUR = 3_600_000;
setCategories(categories);
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
      f({ categories: ["Jobs"], verifiedOnly: true, postedWithin: "24h" }),
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

// Personals posts carry an ethnicity; marketplace listings do not, which is
// why an empty selection has to leave every board untouched.
const board = [
  { ...data[0], id: "p1", ethnicity: "Asian" },
  { ...data[1], id: "p2", ethnicity: "Black" },
  { ...data[2], id: "p3", ethnicity: "Asian" },
];

test("ethnicity narrows the board, and picking none narrows nothing", () => {
  assert.deepEqual(
    applyFilters(board, f({ ethnicities: ["Asian"] })).map((l) => l.id),
    ["p1", "p3"],
  );
  assert.deepEqual(
    applyFilters(board, f({ ethnicities: ["Asian", "Black"] })).map(
      (l) => l.id,
    ),
    ["p1", "p3", "p2"],
  );
  assert.equal(applyFilters(data, f({ ethnicities: [] })).length, data.length);
});

test("listings with no ethnicity drop out once one is picked", () => {
  assert.deepEqual(applyFilters(data, f({ ethnicities: ["Asian"] })), []);
});

test("ethnicity counts as one filter and chips clear one at a time", () => {
  const filters = f({ ethnicities: ["Asian", "Black"] });
  assert.equal(activeFilterCount(filters), 1);
  const chip = activeFilterChips(filters).find((c) => c.key === "eth:Asian");
  assert.deepEqual(chip.clear, { ethnicities: ["Black"] });
});

/* ---- availability ------------------------------------------------------ */

// Personals posts carry the poster's own "available now" switch. The three
// rows in `data` above deliberately do not: they are the marketplace shape,
// and every assertion below that uses them is asserting what happens when the
// flag reaches a board that has never heard of it.
const posted = [
  { ...data[0], id: "n1", available: true },
  { ...data[1], id: "n2", available: false },
  { ...data[2], id: "n3", available: true },
];

test("availableOnly keeps only the posts whose poster says they are free", () => {
  assert.deepEqual(
    applyFilters(posted, f({ availableOnly: true })).map((l) => l.id),
    ["n1", "n3"],
  );
  // Off is off: the switch narrows nothing until it is on.
  assert.deepEqual(
    applyFilters(posted, f()).map((l) => l.id),
    ["n1", "n3", "n2"],
  );
});

test("availableOnly leaves a board with no availability field alone", () => {
  // The safe reading, and the deliberate one. `l.available === true` would
  // return nothing here and silently empty a marketplace feed the moment the
  // flag arrived by a hand-edited URL or a saved search carried across. A row
  // that never made an availability claim is not contradicted by one.
  assert.deepEqual(
    applyFilters(data, f({ availableOnly: true })).map((l) => l.id),
    ["a", "c", "b"],
  );
  // Even mixed: only the explicit "no" is dropped.
  assert.deepEqual(
    applyFilters([...data, posted[1]], f({ availableOnly: true })).map(
      (l) => l.id,
    ),
    ["a", "c", "b"],
  );
});

test("availableOnly counts as a filter and clears from its own chip", () => {
  assert.equal(activeFilterCount(f()), 0);
  assert.equal(activeFilterCount(f({ availableOnly: true })), 1);
  assert.equal(
    activeFilterCount(f({ availableOnly: true, verifiedOnly: true })),
    2,
  );

  const chip = activeFilterChips(f({ availableOnly: true })).find(
    (c) => c.key === "available",
  );
  assert.equal(chip.label, "Available now");
  assert.deepEqual(chip.clear, { availableOnly: false });
  assert.equal(filterButtonLabel(f({ availableOnly: true })), "Available now");
});

test("availableOnly survives the query string round-trip", () => {
  assert.deepEqual(filtersToParams(f({ availableOnly: true })), {
    available: "1",
  });
  // Default-off writes nothing, the way every other default does.
  assert.equal(filtersToQueryString(f({ availableOnly: false })), "");

  const filters = f({
    availableOnly: true,
    verifiedOnly: true,
    sort: "nearest",
  });
  const { filters: back, query } = paramsToFilters(
    filtersToQueryString(filters, "  now  "),
  );
  assert.deepEqual(back, filters);
  assert.equal(query, "now");
});

test("personals categories narrow the board independently of ethnicity", () => {
  const posts = [
    { ...board[0], personalsCategory: "Dating" },
    { ...board[1], personalsCategory: "Friendship" },
    { ...board[2], personalsCategory: "Dating" },
  ];
  assert.deepEqual(
    applyFilters(posts, f({ personalsCategories: ["Dating"] })).map(
      (l) => l.id,
    ),
    ["p1", "p3"],
  );
  assert.deepEqual(
    applyFilters(
      posts,
      f({ personalsCategories: ["Dating"], ethnicities: ["Asian"] }),
    ).map((l) => l.id),
    ["p1", "p3"],
  );
  assert.equal(activeFilterCount(f({ personalsCategories: ["Dating"] })), 1);
});

test("the filter button names one filter, counts several, and falls back", () => {
  assert.equal(filterButtonLabel(f()), "Filter");
  assert.equal(filterButtonLabel(f({ categories: ["Jobs"] })), "Jobs");
  assert.equal(filterButtonLabel(f({ verifiedOnly: true })), "Verified only");
  assert.equal(
    filterButtonLabel(f({ categories: ["Jobs"], verifiedOnly: true })),
    "2 filters",
  );
  // Province and its cities are two chips but one filter, and the count is the
  // one the button reports.
  assert.equal(
    filterButtonLabel(f({ province: "bc", cities: ["Metro Vancouver"] })),
    "1 filter",
  );
});

/* ---- sub-categories ---------------------------------------------------- */

const ads = [
  { title: "A", category: "Vehicles", subcategory: "Cars & Trucks" },
  { title: "B", category: "Vehicles", subcategory: "Motorcycles" },
  // Filed straight under Vehicles. The whole point of "optional".
  { title: "C", category: "Vehicles", subcategory: null },
  { title: "D", category: "Property", subcategory: "For rent" },
].map((l) => ({
  business: "",
  location: "",
  province: "British Columbia",
  price: 0,
  verified: false,
  postedMsAgo: 0,
  distanceKm: 0,
  ...l,
}));

const titles = (rows) => rows.map((r) => r.title).sort();

test("a category filter keeps ads with no sub-category", () => {
  const out = applyFilters(ads, {
    ...DEFAULT_FILTERS,
    categories: ["Vehicles"],
  });
  assert.deepEqual(titles(out), ["A", "B", "C"]);
});

test("naming a sub-category narrows past the unclassified ads", () => {
  const out = applyFilters(ads, {
    ...DEFAULT_FILTERS,
    categories: ["Vehicles"],
    subcategory: "Cars & Trucks",
  });
  assert.deepEqual(titles(out), ["A"]);
});

test("a sub-category counts as its own filter", () => {
  const f = { ...DEFAULT_FILTERS, categories: ["Vehicles"] };
  assert.equal(activeFilterCount(f), 1);
  assert.equal(activeFilterCount({ ...f, subcategory: "Boats" }), 2);
});

test("a sub-category gets its own chip, clearable on its own", () => {
  const f = {
    ...DEFAULT_FILTERS,
    categories: ["Vehicles"],
    subcategory: "Boats",
  };
  const chip = activeFilterChips(f).find((c) => c.key === "sub:Boats");
  assert.ok(chip);
  assert.deepEqual(chip.clear, { subcategory: null });
});

test("a sub-category is dropped once it stops meaning one thing", () => {
  const one = {
    ...DEFAULT_FILTERS,
    categories: ["Vehicles"],
    subcategory: "Boats",
  };
  // Still exactly one category, and Boats is one of its subs: kept untouched.
  assert.equal(reconcileSubcategory(one), one);

  // A second category, and Boats now filters against something that has never
  // heard of it.
  assert.equal(
    reconcileSubcategory({ ...one, categories: ["Vehicles", "Property"] })
      .subcategory,
    null,
  );
  // The category it belonged to is gone entirely.
  assert.equal(
    reconcileSubcategory({ ...one, categories: [] }).subcategory,
    null,
  );
  // Swapped for a different category that has no such sub.
  assert.equal(
    reconcileSubcategory({ ...one, categories: ["Property"] }).subcategory,
    null,
  );
  // Nothing to reconcile.
  const none = { ...DEFAULT_FILTERS, categories: [] };
  assert.equal(reconcileSubcategory(none), none);
});

/* -------------------------------------------------------- URL round-trip */

test("nothing narrowed round-trips to an empty params object", () => {
  assert.deepEqual(filtersToParams(DEFAULT_FILTERS), {});
  assert.deepEqual(filtersToParams(DEFAULT_FILTERS, "   "), {});
  assert.equal(filtersToQueryString(DEFAULT_FILTERS), "");
});

test("only fields that differ from the default are written", () => {
  const filters = {
    ...DEFAULT_FILTERS,
    categories: ["Vehicles", "Property"],
    subcategory: null,
    verifiedOnly: true,
  };
  assert.deepEqual(filtersToParams(filters, "oak"), {
    q: "oak",
    categories: "Vehicles,Property",
    verified: "1",
  });
});

test("a fully narrowed filter set round-trips through a real query string", () => {
  const filters = {
    ...DEFAULT_FILTERS,
    sort: "price-asc",
    categories: ["Vehicles"],
    subcategory: "Cars & Trucks",
    province: "bc",
    cities: ["Metro Vancouver", "Vancouver Island"],
    verifiedOnly: true,
    postedWithin: "7d",
  };
  const qs = filtersToQueryString(filters, "  oak  ");
  assert.equal(typeof qs, "string");

  const { filters: back, query } = paramsToFilters(qs);
  assert.deepEqual(back, filters);
  assert.equal(query, "oak");
});

test("paramsToFilters accepts a query string, a URLSearchParams, or a plain object alike", () => {
  const filters = {
    ...DEFAULT_FILTERS,
    categories: ["Jobs"],
    verifiedOnly: true,
  };
  const qs = filtersToQueryString(filters, "barista");

  const fromString = paramsToFilters(qs);
  const fromParams = paramsToFilters(new URLSearchParams(qs));
  const fromObject = paramsToFilters(filtersToParams(filters, "barista"));

  assert.deepEqual(fromString, fromParams);
  assert.deepEqual(fromString, fromObject);
});

test("nothing stored parses back to the untouched default", () => {
  assert.deepEqual(paramsToFilters(""), {
    filters: DEFAULT_FILTERS,
    query: "",
  });
  assert.deepEqual(paramsToFilters(undefined), {
    filters: DEFAULT_FILTERS,
    query: "",
  });
});

test("a hand-edited sort, province or postedWithin falls back to the default rather than sticking", () => {
  const { filters } = paramsToFilters(
    "sort=not-a-real-sort&province=nowhere&postedWithin=never",
  );
  assert.equal(filters.sort, DEFAULT_FILTERS.sort);
  assert.equal(filters.province, DEFAULT_FILTERS.province);
  assert.equal(filters.postedWithin, DEFAULT_FILTERS.postedWithin);
});

test("a stored sub-category that no longer matches its category is dropped on the way out", () => {
  // Two categories and a sub-category: exactly the shape `reconcileSubcategory`
  // already drops it for everywhere else `categories` is written.
  const { filters } = paramsToFilters(
    "categories=Vehicles%2CProperty&subcategory=Boats",
  );
  assert.deepEqual(filters.categories, ["Vehicles", "Property"]);
  assert.equal(filters.subcategory, null);
});
