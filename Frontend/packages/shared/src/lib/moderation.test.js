import test from "node:test";
import assert from "node:assert/strict";
import {
  appealListing,
  createModerationQuery,
  moderationPath,
  ownerModeration,
  reportListing,
} from "./moderation.js";

const review = {
  listingId: "listing-1",
  status: "REJECTED",
  publicReason: "Add a clear description.",
  appealAllowed: true,
};

test("owner review path is encoded and site scoped", () => {
  assert.equal(
    moderationPath("a/b", "personals"),
    "/me/listings/a%2Fb/moderation?site=PERSONALS",
  );
  assert.throws(() => moderationPath("", "marketplace"));
  assert.throws(() => moderationPath("listing-1", "invalid"));
});

test("owner projection excludes internal notes and validates the listing identity", () => {
  assert.deepEqual(
    ownerModeration(
      { ...review, internalNote: "private", reporterId: "private" },
      "listing-1",
    ),
    review,
  );
  assert.throws(() => ownerModeration(review, "someone-else"));
  assert.throws(() =>
    ownerModeration({ ...review, appealAllowed: "true" }, "listing-1"),
  );
  assert.throws(() =>
    ownerModeration({ ...review, publicReason: {} }, "listing-1"),
  );
  assert.equal(
    ownerModeration({ ...review, status: "ACTIVE" }, "listing-1").appealAllowed,
    false,
  );
  assert.equal(
    ownerModeration({ ...review, status: "REMOVED" }, "listing-1")
      .appealAllowed,
    true,
  );
});

test("report submits the selected reason and trimmed details to the scoped API", async () => {
  const result = await reportListing(
    async (path, options) => {
      assert.equal(path, "/listings/a%2Fb/reports");
      assert.deepEqual(options, {
        method: "POST",
        body: {
          site: "PERSONALS",
          reason: "FRAUD",
          details: "Payment requested outside platform",
        },
      });
      return { id: "report-1" };
    },
    "a/b",
    "personals",
    "FRAUD",
    "  Payment requested outside platform  ",
  );
  assert.deepEqual(result, { id: "report-1" });
});

test("invalid report data cannot reach the API", async () => {
  const unexpected = () => assert.fail("API must not be called");
  await assert.rejects(
    reportListing(unexpected, "listing-1", "marketplace", "", ""),
  );
  await assert.rejects(
    reportListing(
      unexpected,
      "listing-1",
      "marketplace",
      "OTHER",
      "x".repeat(1001),
    ),
  );
});

test("appeal is bounded, nonblank, and scoped in the request body", async () => {
  const result = await appealListing(
    async (path, options) => {
      assert.equal(path, "/me/listings/listing-1/moderation/appeals");
      assert.deepEqual(options, {
        method: "POST",
        body: {
          site: "MARKETPLACE",
          message: "Please review the additional details.",
        },
      });
      return { id: "appeal-1" };
    },
    "listing-1",
    "marketplace",
    " Please review the additional details. ",
  );
  assert.deepEqual(result, { id: "appeal-1" });
  const unexpected = () => assert.fail("API must not be called");
  await assert.rejects(
    appealListing(unexpected, "listing-1", "marketplace", "  "),
  );
  await assert.rejects(
    appealListing(unexpected, "listing-1", "marketplace", "x".repeat(2001)),
  );
});

test("failed or unconfirmed submissions never return success", async () => {
  const failure = new Error("Already reported");
  await assert.rejects(
    reportListing(
      async () => {
        throw failure;
      },
      "listing-1",
      "marketplace",
      "SPAM",
      "",
    ),
    (error) => error === failure,
  );
  await assert.rejects(
    reportListing(async () => null, "listing-1", "marketplace", "SPAM", ""),
    /did not confirm/,
  );
  await assert.rejects(
    appealListing(
      async () => ({}),
      "listing-1",
      "marketplace",
      "Please review",
    ),
    /did not confirm/,
  );
});

test("review cache deduplicates, refreshes, and remains isolated between owner cards", async () => {
  let count = 0;
  const query = createModerationQuery(
    async () => {
      count += 1;
      return review;
    },
    "listing-1",
    "marketplace",
  );
  const states = [];
  const unsubscribe = query.subscribe(() =>
    states.push(query.getSnapshot().state),
  );
  const first = query.load();
  assert.equal(query.load(), first);
  await first;
  await query.load();
  assert.equal(count, 1);
  assert.deepEqual(states, ["loading", "success"]);
  await query.load(true);
  assert.equal(count, 2);
  assert.equal(
    createModerationQuery(
      async () => review,
      "listing-1",
      "marketplace",
    ).getSnapshot().data,
    null,
  );
  unsubscribe();
});

test("failed review fetch clears private data and supports a real retry", async () => {
  let fail = true;
  const query = createModerationQuery(
    async () => {
      if (fail) throw new Error("Not authorized");
      return review;
    },
    "listing-1",
    "marketplace",
  );
  await assert.rejects(query.load(), /Not authorized/);
  assert.equal(query.getSnapshot().state, "error");
  assert.equal(query.getSnapshot().data, null);
  fail = false;
  await query.load();
  assert.deepEqual(query.getSnapshot().data, review);
});
