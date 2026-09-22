import test from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "./client.js";
import { getCategories } from "./catalog.js";

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
