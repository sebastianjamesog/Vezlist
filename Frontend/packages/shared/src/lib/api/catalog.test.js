import test from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "./client.js";
import { getCategories, getEthnicities, getLocations } from "./catalog.js";

test("categories request the explicit site and preserve backend IDs and labels", async (t) => {
  const categories = [
    { id: "new-category-1", label: "New category", icon: "Tag", primary: true },
    {
      id: "new-category-2",
      label: "New category",
      icon: "Tag",
      primary: false,
    },
  ];
  const get = t.mock.method(api, "get", async () => categories);
  for (const site of ["MARKETPLACE", "PERSONALS"]) {
    assert.deepEqual(await getCategories(site), categories);
  }
  assert.deepEqual(
    get.mock.calls.map((call) => call.arguments),
    [
      ["/api/v1/categories", { site: "MARKETPLACE" }],
      ["/api/v1/categories", { site: "PERSONALS" }],
    ],
  );
});

test("an empty category catalog remains empty without mock fallback", async (t) => {
  t.mock.method(api, "get", async () => []);
  assert.deepEqual(await getCategories("PERSONALS"), []);
});

test("malformed category responses are rejected instead of offered for selection", async (t) => {
  const get = t.mock.method(api, "get");
  for (const invalid of [
    null,
    {},
    [null],
    [{ id: "", label: "Empty ID" }],
    [{ id: "new", label: " " }],
    [{ id: 123, label: "Numeric ID" }],
    [
      { id: "same", label: "First" },
      { id: "same", label: "Second" },
    ],
  ]) {
    get.mock.mockImplementation(async () => invalid);
    await assert.rejects(
      getCategories("MARKETPLACE"),
      (error) =>
        error instanceof ApiError && error.code === "INVALID_CATEGORY_CATALOG",
    );
  }
});

test("a failed request propagates and a later request can retry", async (t) => {
  const failure = new Error("Offline");
  const get = t.mock.method(api, "get", async () => {
    throw failure;
  });
  await assert.rejects(getCategories("PERSONALS"), failure);
  get.mock.mockImplementation(async () => [{ id: "fresh", label: "Fresh" }]);
  assert.deepEqual(await getCategories("PERSONALS"), [
    { id: "fresh", label: "Fresh" },
  ]);
});

test("ethnicities use current server IDs and labels without mock fallback", async (t) => {
  const values = [{ id: "custom", label: "Regional, mixed" }];
  const get = t.mock.method(api, "get", async () => values);
  assert.deepEqual(await getEthnicities(), values);
  assert.deepEqual(get.mock.calls[0].arguments, ["/api/v1/ethnicities"]);
  get.mock.mockImplementation(async () => []);
  assert.deepEqual(await getEthnicities(), []);
});

test("malformed ethnicity catalogs fail clearly rather than replacing choices", async (t) => {
  const get = t.mock.method(api, "get");
  for (const values of [
    null,
    {},
    [null],
    [{ id: "a", label: "" }],
    [{ id: "a", label: "x".repeat(81) }],
    [
      { id: "a", label: "One" },
      { id: "a", label: "Two" },
    ],
    [
      { id: "a", label: "One" },
      { id: "b", label: "one" },
    ],
  ]) {
    get.mock.mockImplementation(async () => values);
    await assert.rejects(
      getEthnicities(),
      (error) => error.code === "INVALID_ETHNICITY_CATALOG",
    );
  }
});


test("location catalog preserves dynamic province, region and neighbourhood IDs", async (t) => {
 const tree = { provinces: [{id: "custom-province", label: "New province", areas: [{id: "region", label: "New region", neighbourhoods: [{id: "leaf", label: "New neighbourhood"}]}]}], popularAreas: [] };
 const get = t.mock.method(api, "get", async () => tree);
 assert.deepEqual(await getLocations(), tree);
 assert.deepEqual(get.mock.calls[0].arguments, ["/api/v1/locations", undefined, { cache: "no-store" }]);
 get.mock.mockImplementation(async () => ({provinces: [], popularAreas: []}));
 assert.deepEqual(await getLocations(), {provinces: [], popularAreas: []});
});

test("malformed location branches fail without silently dropping neighbourhoods", async (t) => {
 const get = t.mock.method(api, "get");
 for (const invalid of [null, {}, {provinces: [{id: "on", label: "Ontario"}]},
  {provinces: [{id: "on", label: "Ontario", areas: [{id: "gta", label: "Toronto", neighbourhoods: {}}]}]},
  {provinces: [{id: "on", label: "Ontario", areas: [{id: "gta", label: "Toronto", neighbourhoods: [{id: "gta", label: "Duplicate"}]}]}]}]) {
  get.mock.mockImplementation(async () => invalid);
  await assert.rejects(getLocations(), error => error.code === "INVALID_LOCATION_CATALOG");
 }
});
