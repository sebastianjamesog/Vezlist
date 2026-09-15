import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY,
  MAX_DETAIL,
  REPORT_REASONS,
  buildReport,
  hideBlocked,
  isBlocked,
  normaliseReportsState,
  reasonsFor,
  reducer,
  reportOf,
  sellerIdFor,
} from "./reports.js";
import { listings, sellers } from "../data/mock.js";

/**
 * Dispatch in order, the way the provider does. `at` and `id` are inputs
 * rather than things the reducer reaches for, so the clock is held still here
 * and the ids stay readable.
 */
let clock = Date.parse("2026-09-02T09:00:00.000Z");
let seq = 0;
const run = (state, ...actions) =>
  actions.reduce(
    (s, a) => reducer(s, { id: `rep-${++seq}`, at: (clock += 1000), ...a }),
    state,
  );

const listingReport = (over = {}) => ({
  type: "report",
  targetType: "listing",
  targetId: "l1",
  reasonId: "scam",
  detail: "Asks for an e-transfer deposit before any viewing.",
  site: "marketplace",
  reporter: "Sarah Jenkins",
  ...over,
});

/* ------------------------------------------------------------- taxonomy */

test("every reason names targets the reducer can actually build", () => {
  for (const reason of REPORT_REASONS) {
    assert.ok(reason.id, "a reason with no id cannot be submitted");
    assert.ok(reason.label, `${reason.id} has no label to show`);
    assert.ok(reason.targets.length > 0, `${reason.id} applies to nothing`);
    for (const target of reason.targets) {
      assert.ok(
        ["listing", "user", "stream"].includes(target),
        `${reason.id} names a target the console cannot link to: ${target}`,
      );
    }
  }
});

test("the marketplace is not offered the two personals-only reasons", () => {
  const ids = (rows) => rows.map((r) => r.id);
  assert.ok(!ids(reasonsFor("listing", "marketplace")).includes("escort"));
  assert.ok(ids(reasonsFor("listing", "personals")).includes("escort"));
  assert.ok(!ids(reasonsFor("listing", "marketplace")).includes("underage"));
});

test("every target type has something to pick on both boards", () => {
  for (const site of ["marketplace", "personals"]) {
    for (const target of ["listing", "user", "stream"]) {
      assert.ok(
        reasonsFor(target, site).length > 1,
        `${target} on ${site} has no real choice of reason`,
      );
    }
  }
});

/* ---------------------------------------------------------------- build */

test("a report comes out in the shape the console's queue reads", () => {
  const row = buildReport(listingReport(), "rep-1", 1_700_000_000_000);
  // Named exhaustively: a field that goes missing arrives as `undefined` in a
  // moderation queue, and this is what catches it before a moderator does.
  for (const key of [
    "id",
    "site",
    "targetType",
    "targetId",
    "reason",
    "detail",
    "reporter",
    "status",
    "createdMsAgo",
  ]) {
    assert.ok(key in row, `report is missing ${key}`);
  }
  assert.equal(row.status, "open");
  assert.equal(row.reason, "Scam or fraud", "the label, not the id");
  assert.equal(row.at, 1_700_000_000_000, "the real timestamp rides along");
});

test("an unknown reason, or one that does not fit the target, builds nothing", () => {
  assert.equal(buildReport(listingReport({ reasonId: "nope" }), "x"), null);
  // "Harassment" is about a person, not an ad.
  assert.equal(
    buildReport(listingReport({ reasonId: "harassment" }), "x"),
    null,
  );
});

test('"Something else" refuses to be filed with nothing written under it', () => {
  assert.equal(
    buildReport(listingReport({ reasonId: "other", detail: "   " }), "x"),
    null,
  );
  assert.ok(
    buildReport(listingReport({ reasonId: "other", detail: "Wrong." }), "x"),
  );
});

test("a detail longer than the box allows is cut, not refused", () => {
  const row = buildReport(
    listingReport({ detail: "x".repeat(MAX_DETAIL + 200) }),
    "x",
  );
  assert.equal(row.detail.length, MAX_DETAIL);
});

/* -------------------------------------------------------------- reports */

test("a report lands, and reads back against the thing it was raised on", () => {
  const state = run(EMPTY, listingReport());
  assert.equal(state.reports.length, 1);
  assert.ok(reportOf(state.reports, "listing", "l1"));
  assert.equal(reportOf(state.reports, "listing", "l99"), null);
});

test("the same target cannot be reported twice by the same reader", () => {
  const state = run(
    EMPTY,
    listingReport(),
    listingReport({ reasonId: "spam" }),
  );
  assert.equal(state.reports.length, 1);
});

test("a stream and a seller are separate targets from a listing of the same id", () => {
  const state = run(
    EMPTY,
    listingReport(),
    listingReport({ targetType: "user", targetId: "l1", reasonId: "scam" }),
  );
  assert.equal(state.reports.length, 2);
});

test("a report that cannot be built leaves the state alone", () => {
  const state = run(EMPTY, listingReport({ reasonId: "nope" }));
  assert.equal(state.reports.length, 0);
});

/* --------------------------------------------------------------- blocks */

test("blocking is idempotent and unblocking undoes it", () => {
  const once = run(EMPTY, { type: "block", id: "s1", name: "Victoria Realty" });
  const twice = run(once, { type: "block", id: "s1", name: "Victoria Realty" });
  assert.equal(twice.blocked.length, 1);
  assert.ok(isBlocked(twice.blocked, "s1"));

  const after = run(twice, { type: "unblock", id: "s1" });
  assert.equal(after.blocked.length, 0);
  assert.ok(!isBlocked(after.blocked, "s1"));
});

test("a block with no id is not a block", () => {
  assert.equal(run(EMPTY, { type: "block", id: "  " }).blocked.length, 0);
});

/* ---------------------------------------------------- block enforcement */

test("a listing resolves to the seller whose profile claims it", () => {
  for (const [id, seller] of Object.entries(sellers)) {
    for (const listingId of seller.listingIds) {
      assert.equal(sellerIdFor({ id: listingId }), id);
    }
  }
  assert.equal(
    sellerIdFor({ id: "l999" }),
    null,
    "unclaimed rows have no owner",
  );
  assert.equal(
    sellerIdFor({ id: "l1", sellerId: "s9" }),
    "s9",
    "a row that carries its own owner wins over the reverse index",
  );
});

test("blocking a seller drops exactly their rows from the feed", () => {
  const state = run(EMPTY, {
    type: "block",
    id: "s1",
    name: "Victoria Realty",
  });
  const before = listings;
  const after = hideBlocked(before, state.blocked);

  assert.ok(after.length < before.length, "nothing was hidden");
  for (const id of sellers.s1.listingIds.filter((l) =>
    before.some((row) => row.id === l),
  )) {
    assert.ok(
      !after.some((row) => row.id === id),
      `${id} is still in the feed after blocking its seller`,
    );
  }
  // Everything else survives — a block is not a filter that empties the board.
  const hidden = before.filter((row) => !after.includes(row));
  for (const row of hidden) {
    assert.equal(sellerIdFor(row), "s1");
  }
});

test("no blocks means the feed array is handed straight back", () => {
  assert.equal(hideBlocked(listings, []), listings);
});

/* ------------------------------------------------------------ rehydrate */

test("a stored shape missing a key it has since grown comes back whole", () => {
  const state = reducer(EMPTY, {
    type: "rehydrate",
    state: { reports: [buildReport(listingReport(), "rep-1", 1)] },
  });
  assert.ok(Array.isArray(state.blocked), "blocked must not arrive undefined");
  assert.equal(state.reports.length, 1);
});

test("a value that is not a stored delta falls back to EMPTY, never throws", () => {
  for (const junk of [null, "nonsense", 5, [], { reports: "nope" }]) {
    const state = reducer(EMPTY, { type: "rehydrate", state: junk });
    assert.deepEqual(state, EMPTY, JSON.stringify(junk));
  }
});

test("a report missing its target or status is dropped, not half-trusted", () => {
  const good = buildReport(listingReport(), "rep-1", 1);
  const next = normaliseReportsState({
    reports: [
      good,
      { id: "rep-2", targetType: "listing", targetId: "l2" }, // no status
      { id: "rep-3", status: "open" }, // no target
      "not even an object",
    ],
  });
  assert.deepEqual(next.reports, [good]);
});

test("a block that is not an object with an id is dropped; the rest survive", () => {
  const next = normaliseReportsState({
    blocked: [{ id: "s1", name: "Real" }, { name: "No id" }, null],
  });
  assert.deepEqual(next.blocked, [{ id: "s1", name: "Real" }]);
});
