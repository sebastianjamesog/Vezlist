import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_DRAFT } from "../adDraft.js";
import { api, ApiError } from "./client.js";
import {
  ownedListingSummary,
  publishDraft,
  submitListing,
} from "./listings.js";

test("profile counts request a session-owned summary for the specified site", async (t) => {
  const get = t.mock.method(api, "get", async () => ({ activeAds: 7 }));
  for (const site of ["MARKETPLACE", "PERSONALS"]) {
    assert.deepEqual(await ownedListingSummary(site), { activeAds: 7 });
  }
  assert.deepEqual(
    get.mock.calls.map(({ arguments: args }) => args),
    [
      ["/api/v1/me/listings/summary", { site: "MARKETPLACE" }],
      ["/api/v1/me/listings/summary", { site: "PERSONALS" }],
    ],
  );
});

const draft = (overrides = {}) => ({
  ...EMPTY_DRAFT,
  title: "Bright apartment",
  business: "Local seller",
  category: "Property",
  categoryId: "property",
  description: "A bright apartment with parking available.",
  location: "Richmond",
  locationId: "on-richmond",
  provinceId: "on",
  email: "seller@example.com",
  phone: "6135551234",
  ...overrides,
});

test("publishing duplicate location labels sends the selected IDs without a location lookup", async (t) => {
  const get = t.mock.method(api, "get", async () =>
    assert.fail("must not resolve catalog labels"),
  );
  const post = t.mock.method(api, "post", async (path) =>
    path.endsWith("/submit")
      ? { id: "listing-1", status: "ACTIVE", verificationRequested: false }
      : { id: "listing-1", status: "DRAFT" },
  );

  for (const selection of [
    { locationId: "on-richmond", provinceId: "on" },
    { locationId: "bc-richmond", provinceId: "bc" },
  ]) {
    const result = await publishDraft(draft(selection));
    assert.equal(result.status, "ACTIVE");
  }

  const creates = post.mock.calls.filter(
    ({ arguments: [path] }) => path === "/api/v1/listings",
  );
  assert.equal(creates.length, 2);
  assert.equal(creates[0].arguments[1].locationId, "on-richmond");
  assert.equal(creates[0].arguments[1].provinceId, "on");
  assert.equal(creates[1].arguments[1].locationId, "bc-richmond");
  assert.equal(creates[1].arguments[1].provinceId, "bc");
  assert.equal(get.mock.callCount(), 0);
});

test("publication sends the verification choice before the backend chooses public or private status", async (t) => {
  const post = t.mock.method(api, "post", async (path, body) =>
    path.endsWith("/submit")
      ? {
          id: "listing-1",
          status: body.requestVerification ? "PENDING_REVIEW" : "ACTIVE",
          verificationRequested: body.requestVerification,
        }
      : { id: "listing-1", status: "DRAFT" },
  );
  const regular = await publishDraft(draft());
  const verified = await publishDraft(draft(), { requestVerification: true });
  assert.equal(regular.status, "ACTIVE");
  assert.equal(regular.verificationRequested, false);
  assert.equal(verified.status, "PENDING_REVIEW");
  const submissions = post.mock.calls.filter(({ arguments: [path] }) =>
    path.endsWith("/submit"),
  );
  assert.deepEqual(
    submissions.map(({ arguments: [, body] }) => body),
    [{ requestVerification: false }, { requestVerification: true }],
  );
  assert.ok(
    submissions.every(
      ({ arguments: [, , options] }) => options.headers["Idempotency-Key"],
    ),
  );
});

test("resubmission preserves explicit verified intent while old callers default to regular publication", async (t) => {
  const post = t.mock.method(api, "post", async () => ({}));
  await submitListing("saved", "regular-key");
  await submitListing("saved", "verified-key", { requestVerification: true });
  assert.deepEqual(
    post.mock.calls.map(({ arguments: args }) => args),
    [
      [
        "/api/v1/listings/saved/submit",
        { requestVerification: false },
        { headers: { "Idempotency-Key": "regular-key" } },
      ],
      [
        "/api/v1/listings/saved/submit",
        { requestVerification: true },
        { headers: { "Idempotency-Key": "verified-key" } },
      ],
    ],
  );
});

test("publishing categories with the same label keeps the chosen category ID", async (t) => {
  const get = t.mock.method(api, "get", async () =>
    assert.fail("must not resolve catalog labels"),
  );
  const post = t.mock.method(api, "post", async () => ({ id: "listing-1" }));

  for (const categoryId of ["new-one", "new-two"]) {
    await publishDraft(draft({ category: "New category", categoryId }));
  }

  const creates = post.mock.calls.filter(
    ({ arguments: [path] }) => path === "/api/v1/listings",
  );
  assert.deepEqual(
    creates.map(({ arguments: [, request] }) => request.categoryId),
    ["new-one", "new-two"],
  );
  assert.equal(get.mock.callCount(), 0);
});

test("publishing without an actual category selection stops before any API call", async (t) => {
  const get = t.mock.method(api, "get", async () =>
    assert.fail("must not fetch"),
  );
  const post = t.mock.method(api, "post", async () =>
    assert.fail("must not publish"),
  );

  for (const selection of [
    { categoryId: "" },
    { categoryId: undefined },
    { category: "" },
  ]) {
    await assert.rejects(publishDraft(draft(selection)), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "CATEGORY_SELECTION_REQUIRED");
      assert.equal(error.message, "Select a category from the list.");
      return true;
    });
  }

  assert.equal(get.mock.callCount(), 0);
  assert.equal(post.mock.callCount(), 0);
});

test("publishing without an actual location selection stops before any API call", async (t) => {
  const get = t.mock.method(api, "get", async () =>
    assert.fail("must not fetch"),
  );
  const post = t.mock.method(api, "post", async () =>
    assert.fail("must not publish"),
  );

  for (const selection of [
    { locationId: "", provinceId: "" },
    { locationId: undefined, provinceId: undefined },
    { locationId: "on-richmond", provinceId: "" },
    { location: "", locationId: "on-richmond", provinceId: "on" },
  ]) {
    await assert.rejects(publishDraft(draft(selection)), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, "LOCATION_SELECTION_REQUIRED");
      assert.equal(error.message, "Select a location from the suggestions.");
      return true;
    });
  }

  assert.equal(get.mock.callCount(), 0);
  assert.equal(post.mock.callCount(), 0);
});
