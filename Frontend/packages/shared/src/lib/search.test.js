// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { applyFilters, DEFAULT_FILTERS } from "./filters.js";
import {
  EMPTY,
  MAX_NAME,
  MAX_RECENT,
  normaliseSearchState,
  reducer,
  suggest,
} from "./search.js";

/* --------------------------------------------------------------- reducer */

test("search adds a term to the front of recent", () => {
  const first = reducer(EMPTY, { type: "search", term: "oak dresser" });
  const second = reducer(first, { type: "search", term: "road bike" });
  assert.deepEqual(
    second.recent.map((r) => r.term),
    ["road bike", "oak dresser"],
  );
});

test("a blank or whitespace-only term is a no-op", () => {
  assert.equal(reducer(EMPTY, { type: "search", term: "" }), EMPTY);
  assert.equal(reducer(EMPTY, { type: "search", term: "   " }), EMPTY);
  assert.equal(reducer(EMPTY, { type: "search" }), EMPTY);
});

test("re-searching a term moves it to the front rather than duplicating it", () => {
  let state = reducer(EMPTY, { type: "search", term: "oak dresser" });
  state = reducer(state, { type: "search", term: "road bike" });
  state = reducer(state, { type: "search", term: "Oak Dresser" });
  assert.deepEqual(
    state.recent.map((r) => r.term),
    // The re-search keeps the casing it was typed with just now, not the
    // casing it first appeared with.
    ["Oak Dresser", "road bike"],
  );
});

test("recent is capped at MAX_RECENT, oldest falling off first", () => {
  let state = EMPTY;
  for (let i = 0; i < MAX_RECENT + 3; i++) {
    state = reducer(state, { type: "search", term: `term ${i}` });
  }
  assert.equal(state.recent.length, MAX_RECENT);
  assert.equal(state.recent[0].term, `term ${MAX_RECENT + 2}`, "newest first");
  assert.equal(
    state.recent[state.recent.length - 1].term,
    "term 3",
    "the three oldest fell off",
  );
});

test("clearRecent empties the history and leaves saved searches alone", () => {
  let state = reducer(EMPTY, { type: "search", term: "oak dresser" });
  state = reducer(state, {
    type: "save",
    id: "s1",
    name: "Oak",
    params: "q=oak",
  });
  state = reducer(state, { type: "clearRecent" });
  assert.deepEqual(state.recent, []);
  assert.equal(state.saved.length, 1);
});

test("save adds a named search with the query string it was given", () => {
  const state = reducer(EMPTY, {
    type: "save",
    id: "s1",
    name: "My commute",
    params: "categories=Vehicles&sort=nearest",
  });
  assert.deepEqual(state.saved, [
    {
      id: "s1",
      name: "My commute",
      params: "categories=Vehicles&sort=nearest",
    },
  ]);
});

test("a blank name is refused, and a name is trimmed to MAX_NAME", () => {
  assert.equal(
    reducer(EMPTY, { type: "save", id: "s1", name: "   ", params: "" }),
    EMPTY,
  );
  const long = "x".repeat(MAX_NAME + 20);
  const state = reducer(EMPTY, {
    type: "save",
    id: "s1",
    name: long,
    params: "",
  });
  assert.equal(state.saved[0].name.length, MAX_NAME);
});

test("saving under a name already in use replaces it rather than duplicating it", () => {
  let state = reducer(EMPTY, {
    type: "save",
    id: "s1",
    name: "My commute",
    params: "sort=nearest",
  });
  state = reducer(state, {
    type: "save",
    id: "s2",
    name: "my commute",
    params: "sort=newest",
  });
  assert.equal(state.saved.length, 1);
  assert.deepEqual(state.saved[0], {
    id: "s2",
    name: "my commute",
    params: "sort=newest",
  });
});

test("deleteSaved removes one saved search by id", () => {
  let state = reducer(EMPTY, { type: "save", id: "s1", name: "A", params: "" });
  state = reducer(state, { type: "save", id: "s2", name: "B", params: "" });
  state = reducer(state, { type: "deleteSaved", id: "s1" });
  assert.deepEqual(
    state.saved.map((s) => s.id),
    ["s2"],
  );
});

test("a stored state is folded over EMPTY, never used as-is", () => {
  const stored = { recent: [{ term: "oak" }] };
  const next = reducer(EMPTY, { type: "rehydrate", state: stored });
  assert.deepEqual(next.recent, stored.recent);
  assert.deepEqual(next.saved, []);
});

test("a hand-edited or stale search key falls back to EMPTY, never throws", () => {
  for (const junk of [null, "nonsense", 5, [], { recent: "nope" }]) {
    const next = reducer(EMPTY, { type: "rehydrate", state: junk });
    assert.deepEqual(next, EMPTY, JSON.stringify(junk));
  }
});

/* ----------------------------------------------------------- normalise */

test("a recent row with no term, or a saved row missing a field, is dropped", () => {
  const next = normaliseSearchState({
    recent: [{ term: "oak" }, { term: "" }, "junk", { label: "no term key" }],
    saved: [
      { id: "s1", name: "Fine", params: "q=oak" },
      { id: "s2", name: "No params" },
      { name: "No id", params: "" },
      { id: "s3", params: "" },
    ],
  });
  assert.deepEqual(next.recent, [{ term: "oak" }]);
  assert.deepEqual(next.saved, [{ id: "s1", name: "Fine", params: "q=oak" }]);
});

test("a saved search with an empty params string is still valid — it is a real, if empty, filter set", () => {
  const next = normaliseSearchState({
    saved: [{ id: "s1", name: "Everything", params: "" }],
  });
  assert.deepEqual(next.saved, [{ id: "s1", name: "Everything", params: "" }]);
});

test("normalise caps recent at MAX_RECENT even if storage held more", () => {
  const recent = Array.from({ length: MAX_RECENT + 5 }, (_, i) => ({
    term: `term ${i}`,
  }));
  const next = normaliseSearchState({ recent });
  assert.equal(next.recent.length, MAX_RECENT);
  assert.deepEqual(next.recent, recent.slice(0, MAX_RECENT));
});

/* --------------------------------------------------------------- suggest */

const categories = [
  {
    id: "vehicles",
    label: "Vehicles",
    subs: ["Cars & Trucks", "Motorcycles"],
  },
  { id: "jobs", label: "Jobs", subs: ["Hospitality"] },
];

const listings = [
  { id: "a", title: "Oak Dresser", business: "Home", category: "Property" },
  { id: "b", title: "Red Bike", business: "Ride", category: "Vehicles" },
  { id: "c", title: "Barista Job", business: "Bean", category: "Jobs" },
];

test("an empty term suggests nothing", () => {
  assert.deepEqual(suggest("", { categories, listings }), []);
  assert.deepEqual(suggest("   ", { categories, listings }), []);
});

test("a term matching a category surfaces it", () => {
  const hits = suggest("veh", { categories, listings });
  assert.deepEqual(hits[0], {
    id: "cat:vehicles",
    type: "category",
    label: "Vehicles",
    categoryId: "vehicles",
  });
});

test("a term matching a sub-category surfaces it with its parent category attached", () => {
  const hits = suggest("hospit", { categories, listings });
  assert.deepEqual(hits, [
    {
      id: "sub:jobs:Hospitality",
      type: "subcategory",
      label: "Hospitality",
      categoryId: "jobs",
      category: "Jobs",
      subcategory: "Hospitality",
    },
  ]);
});

test("a term matching only a listing surfaces it, using the exact rows applyFilters would return", () => {
  const hits = suggest("bean", { categories, listings });
  const matched = applyFilters(listings, DEFAULT_FILTERS, "bean");
  assert.deepEqual(
    hits.map((h) => h.listingId),
    matched.map((l) => l.id),
    "suggest never disagrees with the matcher the feed itself narrows with",
  );
  assert.deepEqual(hits[0], {
    id: "listing:c",
    type: "listing",
    label: "Barista Job",
    listingId: "c",
    adId: "c",
  });
});

test("categories are offered before listings, and the combined list respects limit", () => {
  // "e" matches the Vehicles category label, the Motorcycles sub-category, and
  // two listing titles/businesses — plenty to prove the ordering and the cap.
  const hits = suggest("e", { categories, listings, limit: 3 });
  assert.equal(hits.length, 3);
  assert.ok(
    hits
      .slice(0, 2)
      .every((h) => h.type === "category" || h.type === "subcategory"),
  );
});

test("suggest reaches nothing beyond what the caller hands in", () => {
  assert.deepEqual(suggest("anything"), []);
});
