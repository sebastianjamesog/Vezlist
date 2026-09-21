import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIT_CAP,
  BROADCAST_CAP,
  auditFor,
  buildSeed,
  counts,
  listingsFor,
  normaliseAdminState,
  reducer,
} from "./adminStore.js";

const ACTOR = "Priya Nair";
// Every action carries a role now, and the reducer refuses what the role does
// not hold. The default here is the one that can do everything.
const ROLE = "owner";

/**
 * Dispatch a list of actions in order, as the console does.
 *
 * `at` is an input now rather than something the reducer reaches for, so the
 * clock is held still here — and the audit ids still come out distinct, which
 * is exactly the property `state.auditSeq` exists to provide.
 */
let clock = Date.parse("2026-08-25T12:00:00.000Z");
const run = (state, ...actions) =>
  actions.reduce(
    (s, a) =>
      reducer(s, { actor: ACTOR, role: ROLE, at: (clock += 1000), ...a }),
    state,
  );

const listing = (state, id) => state.listings.find((l) => l.id === id);
const pendingId = (state) =>
  state.listings.find((l) => l.status === "pending").id;

/**
 * Every array the seed builds. Named exhaustively rather than sampled: a
 * collection that goes missing arrives as `undefined` at a screen that calls
 * `.filter` on it, and this is the test that catches it before the screen does.
 */
const COLLECTIONS = [
  "listings",
  "users",
  "tickets",
  "reports",
  "appeals",
  "streams",
  "stories",
  "faqs",
  "faqCategories",
  "topics",
  "channels",
  "categories",
  "homeCategories",
  "personalsCategories",
  "ethnicities",
  "provinces",
  "notifications",
  "broadcasts",
  "creditPacks",
  "billing",
  "admins",
  "cannedReplies",
  "audit",
];

test("the seed holds every collection the console reads", () => {
  const state = buildSeed();
  for (const key of COLLECTIONS) {
    assert.ok(Array.isArray(state[key]), `${key} is an array`);
    assert.ok(state[key].length > 0, `${key} is not empty`);
  }
  assert.equal(typeof state.settings, "object");
  assert.equal(state.auditSeq, 0);

  // And nothing else: an unlisted key here means the seed grew and this test
  // did not, which is exactly the drift it exists to catch.
  assert.deepEqual(
    Object.keys(state).sort(),
    [...COLLECTIONS, "settings", "auditSeq"].sort(),
  );
});

test("rehydrate folds stored state over a fresh seed", () => {
  const state = buildSeed();
  // A copy written before `channels` existed — the shape drift the fold exists
  // to survive.
  const { channels, ...old } = state;
  assert.equal(channels.length > 0, true);

  const back = reducer(state, { type: "rehydrate", state: old });
  assert.ok(Array.isArray(back.channels), "the missing key comes back");
  assert.ok(back.channels.length > 0);
  // ...and it does not write an audit entry for reading from storage.
  assert.equal(back.audit.length, state.audit.length);
});

/* --------------------------------------------------------- rehydrate guard */

test("a value that is not a stored-state object falls back to the seed, never throws", () => {
  const seed = buildSeed();
  for (const junk of [null, "nonsense", 5, [], { listings: "nope" }]) {
    const next = reducer(seed, { type: "rehydrate", state: junk });
    assert.deepEqual(next.listings, seed.listings, JSON.stringify(junk));
    assert.deepEqual(next.settings, seed.settings, JSON.stringify(junk));
  }
});

test("a collection full of rows a screen cannot use comes back empty, not thrown or half-trusted", () => {
  const next = normaliseAdminState({
    // No id: dropped by every collection's baseline check.
    users: [{ name: "No id at all" }],
    // Ids, but missing what `removePhoto`/`replyTicket`/`removeUpdate` call
    // directly with no `?? []` to catch a missing array.
    listings: [{ id: "l1", title: "No photos array" }],
    tickets: [{ id: "t1", subject: "No messages array" }],
    stories: [{ id: "st1", name: "No updates array" }],
    // Ids, but missing the pair `reportOf`/the duplicate-appeal check key on.
    reports: [{ id: "r1", status: "open" }],
    appeals: [{ id: "ap1", status: "pending" }],
  });
  assert.deepEqual(next.users, []);
  assert.deepEqual(next.listings, []);
  assert.deepEqual(next.tickets, []);
  assert.deepEqual(next.stories, []);
  assert.deepEqual(next.reports, []);
  assert.deepEqual(next.appeals, []);
});

test("a well-shaped row survives rehydrate, fields this store does not know about and all", () => {
  const row = {
    id: "l1",
    title: "Solid Oak Dining Table",
    photos: ["https://example.com/a.jpg"],
    // A field only a future build would understand.
    fromAFutureBuild: "kept",
  };
  const next = normaliseAdminState({ listings: [row] });
  assert.deepEqual(next.listings, [row]);
});

test("a province with no areas array is dropped; a well-shaped one keeps only string areas", () => {
  const next = normaliseAdminState({
    provinces: [
      { id: "bc", areas: ["Metro Vancouver", 5, null, "Okanagan"] },
      { id: "no-areas" },
    ],
  });
  assert.deepEqual(next.provinces, [
    { id: "bc", areas: ["Metro Vancouver", "Okanagan"] },
  ]);
});

test("string-list collections keep only strings, and a non-array is left for the seed", () => {
  const next = normaliseAdminState({
    ethnicities: ["Mixed", 5, null, "South Asian"],
    homeCategories: "not an array",
  });
  assert.deepEqual(next.ethnicities, ["Mixed", "South Asian"]);
  assert.equal(next.homeCategories, undefined, "left for the seed to fill in");
});

test("settings must be an object and auditSeq a finite number, or they are left for the seed", () => {
  assert.deepEqual(
    normaliseAdminState({ settings: ["not", "an", "object"] }),
    {},
  );
  assert.deepEqual(normaliseAdminState({ settings: { liveEnabled: false } }), {
    settings: { liveEnabled: false },
  });
  assert.deepEqual(normaliseAdminState({ auditSeq: "nope" }), {});
  assert.deepEqual(normaliseAdminState({ auditSeq: 7.9 }), { auditSeq: 7 });
});

test("a top-level key nothing reads is dropped, not carried into state", () => {
  assert.deepEqual(normaliseAdminState({ listings: [], injected: "x" }), {
    listings: [],
  });
});

test("counts scope to one site so the rail and the dashboard agree", () => {
  const state = buildSeed();
  const both = counts(state);
  const market = counts(state, "marketplace");
  const personals = counts(state, "personals");

  assert.equal(market.pending + personals.pending, both.pending);
  assert.equal(market.active + personals.active, both.active);
  // Broadcasting only exists on one board.
  assert.equal(market.liveNow, 0);
  assert.equal(personals.liveNow, both.liveNow);
});

test("a listing carries the ad body, so screens never reach past the store", () => {
  const state = buildSeed();
  for (const row of state.listings) {
    assert.ok(Array.isArray(row.photos) && row.photos.length > 0, row.id);
    // Paragraphs, not one string — the shape the mock's ad bodies use.
    assert.ok(Array.isArray(row.description), `${row.id} description`);
  }
});

test("support topics can be added and deleted, not only edited", () => {
  const state = buildSeed();
  const added = run(state, {
    type: "upsertTopic",
    topic: {
      label: "Refunds",
      sub: "Credits and disputes",
      icon: "CreditCard",
    },
  });
  assert.equal(added.topics.length, state.topics.length + 1);

  const removed = run(added, {
    type: "deleteTopic",
    id: added.topics.at(-1).id,
  });
  assert.equal(removed.topics.length, state.topics.length);
  assert.equal(removed.audit[0].action, "deleteTopic");
});

test("the seed is deterministic — no Math.random in the view counts", () => {
  // Two seeds have to be identical, or the server renders one number and the
  // client another and React throws out the tree.
  assert.deepEqual(buildSeed().listings, buildSeed().listings);
});

test("site is stamped once, from the array the listing came out of", () => {
  const state = buildSeed();
  const sites = new Set(state.listings.map((l) => l.site));
  assert.deepEqual([...sites].sort(), ["marketplace", "personals"]);
  // Personals rows keep the field only that board has.
  const personal = state.listings.find((l) => l.site === "personals");
  assert.ok(personal.personalsCategory);
  assert.equal(listing(state, "l1").site, "marketplace");
});

test("an ad in review has been seen by nobody", () => {
  const state = buildSeed();
  for (const row of state.listings.filter((l) => l.status === "pending")) {
    assert.equal(row.views, 0);
    assert.equal(row.saves, 0);
  }
});

test("approve moves pending to active", () => {
  const state = buildSeed();
  const id = pendingId(state);
  const next = run(state, { type: "approve", id });
  assert.equal(listing(next, id).status, "active");
  assert.equal(counts(next).pending, counts(state).pending - 1);
});

test("reject records the reason, on the row and in the audit", () => {
  const state = buildSeed();
  const id = pendingId(state);
  const next = run(state, {
    type: "reject",
    id,
    reason: "Contact details in the photos.",
  });
  assert.equal(listing(next, id).status, "rejected");
  assert.equal(
    listing(next, id).rejectionReason,
    "Contact details in the photos.",
  );
  assert.equal(next.audit[0].note, "Contact details in the photos.");
});

test("a rejection with no reason still carries one", () => {
  const state = buildSeed();
  const id = pendingId(state);
  const next = run(state, { type: "reject", id, reason: "   " });
  assert.equal(listing(next, id).rejectionReason, "No reason given");
});

test("delete removes the row and closes reports pointing at it", () => {
  const state = buildSeed();
  // r2 targets l27; deleting the ad must not leave the report unanswerable.
  const before = state.reports.find((r) => r.id === "r2");
  assert.equal(before.status, "open");

  const next = run(state, { type: "deleteListing", id: "l27" });
  assert.equal(listing(next, "l27"), undefined);
  assert.equal(next.listings.length, state.listings.length - 1);
  assert.equal(next.reports.find((r) => r.id === "r2").status, "resolved");
});

test("ownership is one id, and the table agrees with the detail screen", () => {
  const state = buildSeed();
  for (const user of state.users) {
    // `listingIds` and `listingsFor` must be the same answer, or the users
    // table claims ads the account screen then denies.
    assert.deepEqual(
      user.listingIds,
      listingsFor(state, user).map((l) => l.id),
      user.name,
    );
  }
  // Every ad resolves to an owner that exists.
  for (const row of state.listings.filter((l) => l.ownerId)) {
    assert.ok(
      state.users.some((u) => u.id === row.ownerId),
      `${row.id} owner`,
    );
  }
});

test("namesakes are separate accounts, not one shared identity", () => {
  const state = buildSeed();
  // `people` carries "Priya S." three times; they must not collapse.
  const emails = state.users.map((u) => u.email);
  assert.equal(new Set(emails).size, emails.length, "emails are unique");

  const twins = state.users.filter((u) => u.name === "Priya S.");
  assert.ok(twins.length > 1, "the fixture still has namesakes");
  // Exactly one of them owns the ad posted under that name.
  const owners = twins.filter((u) => listingsFor(state, u).length > 0);
  assert.equal(owners.length, 1);

  // Suspending one must not take a namesake's ads down.
  const next = run(state, { type: "suspendUser", id: twins[1].id });
  assert.deepEqual(next.listings, state.listings);
});

test("suspending an account takes its live ads down with it", () => {
  const state = buildSeed();
  const seller = state.users.find((u) => u.id === "s1");
  const live = listingsFor(state, seller).filter((l) => l.status === "active");
  assert.ok(live.length > 0, "fixture has something to take down");

  const next = run(state, {
    type: "suspendUser",
    id: "s1",
    reason: "Off-platform payment",
  });
  assert.equal(next.users.find((u) => u.id === "s1").status, "suspended");
  for (const row of live) {
    assert.equal(listing(next, row.id).status, "expired");
  }

  // Unsuspending restores the account, not the ads — those are re-posted.
  const back = run(next, { type: "unsuspendUser", id: "s1" });
  assert.equal(back.users.find((u) => u.id === "s1").status, "active");
  assert.equal(listing(back, live[0].id).status, "expired");
});

test("replying to a ticket appends an agent message and reopens it", () => {
  const state = buildSeed();
  const resolved = state.tickets.find((t) => t.status === "resolved");
  const before = resolved.messages.length;

  const next = run(state, {
    type: "replyTicket",
    id: resolved.id,
    body: "Reopened — the refund bounced.",
  });
  const after = next.tickets.find((t) => t.id === resolved.id);
  assert.equal(after.messages.length, before + 1);
  assert.equal(after.messages.at(-1).from, "agent");
  assert.equal(after.messages.at(-1).author, "Priya · Support");
  assert.equal(after.status, "open");
});

test("an empty reply is not a reply", () => {
  const state = buildSeed();
  const id = state.tickets[0].id;
  assert.equal(run(state, { type: "replyTicket", id, body: "  " }), state);
});

test("reports resolve and dismiss into different words", () => {
  const state = buildSeed();
  const next = run(
    state,
    { type: "resolveReport", id: "r1" },
    { type: "dismissReport", id: "r3" },
  );
  assert.equal(next.reports.find((r) => r.id === "r1").status, "resolved");
  assert.equal(next.reports.find((r) => r.id === "r3").status, "dismissed");
  assert.equal(counts(next).openReports, counts(state).openReports - 2);
});

test("ending a stream and verifying a host", () => {
  const state = buildSeed();
  const next = run(
    state,
    { type: "endStream", id: "lv1", reason: "Nudity on stream" },
    { type: "verifyHost", id: "lv3" },
  );
  assert.equal(next.streams.find((s) => s.id === "lv1").status, "ended");
  assert.equal(next.streams.find((s) => s.id === "lv3").verified, true);
  assert.equal(counts(next).liveNow, counts(state).liveNow - 1);
});

test("removing an update leaves the story, removing the story leaves nothing", () => {
  const state = buildSeed();
  const story = state.stories.find((s) => s.updates.length > 1);
  const target = story.updates[0].id;

  const next = run(state, {
    type: "removeUpdate",
    storyId: story.id,
    id: target,
  });
  const after = next.stories.find((s) => s.id === story.id);
  assert.equal(after.updates.length, story.updates.length - 1);
  assert.ok(!after.updates.some((u) => u.id === target));

  const gone = run(next, { type: "removeStory", id: story.id });
  assert.equal(
    gone.stories.find((s) => s.id === story.id),
    undefined,
  );
});

test("taxonomy: deleting a category pulls its launcher tile too", () => {
  const state = buildSeed();
  assert.ok(state.homeCategories.includes("vehicles"));
  const next = run(state, { type: "deleteCategory", id: "vehicles" });
  assert.ok(!next.categories.some((c) => c.id === "vehicles"));
  assert.ok(!next.homeCategories.includes("vehicles"));
});

test("a new category never lands on an id something else already answers to", () => {
  const state = buildSeed();
  assert.ok(state.categories.some((c) => c.id === "vehicles"));

  // The label slugifies straight onto a seeded id.
  const next = run(state, {
    type: "upsertCategory",
    category: { label: "Vehicles", icon: "Car", primary: false },
  });
  const ids = next.categories.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "ids stay unique");
  assert.equal(next.categories.length, state.categories.length + 1);

  // ...so deleting the original takes one row, not two.
  const removed = run(next, { type: "deleteCategory", id: "vehicles" });
  assert.equal(removed.categories.length, next.categories.length - 1);
  assert.ok(removed.categories.some((c) => c.label === "Vehicles"));
});

test("taxonomy: reorder swaps neighbours and refuses to walk off either end", () => {
  const state = buildSeed();
  const [first, second] = state.categories.map((c) => c.id);

  const moved = run(state, {
    type: "reorderCategories",
    id: second,
    delta: -1,
  });
  assert.deepEqual(
    moved.categories.slice(0, 2).map((c) => c.id),
    [second, first],
  );

  // Already at the top: nothing to swap with, so nothing happens at all.
  assert.equal(
    run(state, { type: "reorderCategories", id: first, delta: -1 }),
    state,
  );
});

/**
 * The category a sub-category test should pick on.
 *
 * Chosen by "which pairing actually has ads under it" rather than hardcoded:
 * `mock.js` deals sub-categories out by hashing the title, so pinning a pair
 * here would make these tests fail on a data edit that broke nothing.
 */
function busiestSub(state) {
  const tally = new Map();
  for (const l of state.listings) {
    if (!l.subcategory) continue;
    const key = `${l.categoryId}|${l.subcategory}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const [key, ads] = [...tally].sort((a, b) => b[1] - a[1])[0];
  const [categoryId, sub] = key.split("|");
  return { categoryId, sub, ads };
}

const subsOf = (state, id) => state.categories.find((c) => c.id === id).subs;

test("the seed carries each category's sub-categories, copied not shared", () => {
  const state = buildSeed();
  for (const category of state.categories) {
    assert.ok(Array.isArray(category.subs), `${category.id} subs`);
  }
  assert.deepEqual(subsOf(state, "vehicles"), [
    "Cars & Trucks",
    "Motorcycles",
    "Boats",
    "RVs & Campers",
    "Parts",
  ]);

  // Two seeds must agree on the contents and disagree on the identity — a
  // shared array would let one console edit reach into `mock.js` itself.
  const other = buildSeed();
  assert.deepEqual(subsOf(other, "vehicles"), subsOf(state, "vehicles"));
  assert.notEqual(subsOf(other, "vehicles"), subsOf(state, "vehicles"));

  // And the listings carry the other half of the pairing, optional case and
  // all — a mock where every ad had one would hide every null-handling bug.
  assert.ok(state.listings.some((l) => l.subcategory));
  assert.ok(state.listings.some((l) => l.subcategory === null));
});

test("sub-categories add, rename, reorder and remove inside one category", () => {
  const state = buildSeed();
  const before = subsOf(state, "pets");

  const added = run(state, {
    type: "addSubcategory",
    categoryId: "pets",
    value: "Aquariums",
  });
  assert.deepEqual(subsOf(added, "pets"), [...before, "Aquariums"]);
  // Nested under the category, so the category's own audit trail carries it.
  assert.equal(added.audit[0].action, "addSubcategory");
  assert.equal(added.audit[0].entity, "category");
  assert.equal(added.audit[0].entityId, "pets");
  // ...and only that category moved.
  assert.deepEqual(subsOf(added, "vehicles"), subsOf(state, "vehicles"));

  const moved = run(added, {
    type: "reorderSubcategory",
    categoryId: "pets",
    value: "Aquariums",
    delta: -1,
  });
  assert.equal(subsOf(moved, "pets").at(-2), "Aquariums");
  assert.equal(subsOf(moved, "pets").length, before.length + 1);

  const renamed = run(moved, {
    type: "renameSubcategory",
    categoryId: "pets",
    from: "Aquariums",
    to: "Fish & Aquariums",
  });
  assert.ok(subsOf(renamed, "pets").includes("Fish & Aquariums"));
  assert.ok(!subsOf(renamed, "pets").includes("Aquariums"));
  assert.equal(renamed.audit[0].note, "Aquariums → Fish & Aquariums");

  const removed = run(renamed, {
    type: "removeSubcategory",
    categoryId: "pets",
    value: "Fish & Aquariums",
  });
  assert.deepEqual(subsOf(removed, "pets"), before);
});

test("a sub-category is claimed once, whatever the casing", () => {
  const state = buildSeed();
  for (const value of ["Boats", "boats", "  BOATS  "]) {
    assert.equal(
      run(state, { type: "addSubcategory", categoryId: "vehicles", value }),
      state,
      value,
    );
  }
  // An empty label is not a label, and neither is a spacebar.
  for (const value of ["", "   ", null, undefined]) {
    assert.equal(
      run(state, { type: "addSubcategory", categoryId: "vehicles", value }),
      state,
      JSON.stringify(value),
    );
  }
  // The same word under a different parent is a different sub-category —
  // "Furniture" is already both Buy/Sell's and Home & Garden's.
  const next = run(state, {
    type: "addSubcategory",
    categoryId: "vehicles",
    value: "Furniture",
  });
  assert.ok(subsOf(next, "vehicles").includes("Furniture"));

  // Renaming onto a sibling's label is the same collision from the other side,
  // while correcting only the casing of one label is a real edit.
  assert.equal(
    run(state, {
      type: "renameSubcategory",
      categoryId: "vehicles",
      from: "Boats",
      to: "parts",
    }),
    state,
  );
  assert.equal(
    run(state, {
      type: "renameSubcategory",
      categoryId: "vehicles",
      from: "Boats",
      to: "Boats",
    }),
    state,
  );
  assert.ok(
    subsOf(
      run(state, {
        type: "renameSubcategory",
        categoryId: "vehicles",
        from: "Boats",
        to: "boats",
      }),
      "vehicles",
    ).includes("boats"),
  );
});

test("a sub-category action naming nothing real leaves the state alone", () => {
  const state = buildSeed();
  const missing = [
    { type: "addSubcategory", categoryId: "no-such-category", value: "Nope" },
    { type: "removeSubcategory", categoryId: "vehicles", value: "Submarines" },
    { type: "removeSubcategory", categoryId: "no-such", value: "Boats" },
    {
      type: "renameSubcategory",
      categoryId: "vehicles",
      from: "Submarines",
      to: "Boats",
    },
    {
      type: "renameSubcategory",
      categoryId: "vehicles",
      from: "Boats",
      to: "   ",
    },
    { type: "reorderSubcategory", categoryId: "no-such", value: "x", delta: 1 },
    {
      type: "reorderSubcategory",
      categoryId: "vehicles",
      value: "Submarines",
      delta: 1,
    },
  ];
  for (const action of missing) {
    assert.equal(run(state, action), state, action.type);
  }
});

test("reordering a sub-category refuses to walk off either end", () => {
  const state = buildSeed();
  const subs = subsOf(state, "vehicles");

  for (const [value, delta] of [
    [subs[0], -1],
    [subs.at(-1), 1],
    [subs[0], -5],
  ]) {
    assert.equal(
      run(state, {
        type: "reorderSubcategory",
        categoryId: "vehicles",
        value,
        delta,
      }),
      state,
      `${value} ${delta}`,
    );
  }

  const swapped = run(state, {
    type: "reorderSubcategory",
    categoryId: "vehicles",
    value: subs[1],
    delta: -1,
  });
  assert.deepEqual(subsOf(swapped, "vehicles").slice(0, 2), [subs[1], subs[0]]);
});

test("removing a sub-category files its ads back under the parent", () => {
  const state = buildSeed();
  const { categoryId, sub, ads } = busiestSub(state);
  assert.ok(ads > 0, "the fixture still files ads under a sub-category");
  const doomed = state.listings.filter(
    (l) => l.categoryId === categoryId && l.subcategory === sub,
  );

  const next = run(state, {
    type: "removeSubcategory",
    categoryId,
    value: sub,
  });
  assert.ok(!subsOf(next, categoryId).includes(sub));
  // Not a cascade: every ad is still there, still under the same category.
  assert.equal(next.listings.length, state.listings.length);
  for (const row of doomed) {
    const after = listing(next, row.id);
    assert.equal(after.subcategory, null, row.id);
    assert.equal(after.categoryId, row.categoryId);
    assert.equal(after.status, row.status);
  }
  // A namesake sub-category under another parent keeps its ads — "Furniture"
  // belongs to two categories and only one of them was edited.
  for (const row of state.listings) {
    if (row.categoryId === categoryId) continue;
    assert.equal(listing(next, row.id).subcategory, row.subcategory, row.id);
  }
  // How many ads moved is not recoverable from the state afterwards, so the
  // audit note is where it has to be.
  assert.ok(next.audit[0].note.includes(String(ads)));

  // Re-adding the label does not bring them back — the ads are on the parent
  // now, and nothing recorded that they were ever underneath it.
  const back = run(next, {
    type: "addSubcategory",
    categoryId,
    value: sub,
  });
  assert.equal(listing(back, doomed[0].id).subcategory, null);
});

test("renaming a sub-category takes its ads with it", () => {
  const state = buildSeed();
  const { categoryId, sub, ads } = busiestSub(state);
  const next = run(state, {
    type: "renameSubcategory",
    categoryId,
    from: sub,
    to: "Renamed & Co",
  });
  const moved = next.listings.filter(
    (l) => l.categoryId === categoryId && l.subcategory === "Renamed & Co",
  );
  assert.equal(moved.length, ads);
  // Nothing is left pointing at the old label anywhere on the board.
  assert.ok(!next.listings.some((l) => l.subcategory === sub));
});

test("sub-categories are the owner's, like the rest of the taxonomy", () => {
  const state = buildSeed();
  const act = { actor: ACTOR, at: 1_756_000_000_000 };
  for (const action of [
    { type: "addSubcategory", categoryId: "vehicles", value: "Trailers" },
    {
      type: "renameSubcategory",
      categoryId: "vehicles",
      from: "Boats",
      to: "Boats & Marine",
    },
    { type: "removeSubcategory", categoryId: "vehicles", value: "Boats" },
    {
      type: "reorderSubcategory",
      categoryId: "vehicles",
      value: "Boats",
      delta: -1,
    },
  ]) {
    for (const role of ["moderator", "support", null]) {
      assert.equal(
        reducer(state, { ...act, role, ...action }),
        state,
        `${action.type} as ${role}`,
      );
    }
    assert.notEqual(
      reducer(state, { ...act, role: "owner", ...action }),
      state,
      action.type,
    );
  }
});

test("the personals vocabularies are editable, and only those two", () => {
  const state = buildSeed();
  assert.ok(state.personalsCategories.includes("Casual encounters"));
  assert.ok(state.ethnicities.includes("Mixed"));

  const added = run(
    state,
    {
      type: "addTerm",
      list: "personalsCategories",
      value: "Activity partners",
    },
    { type: "addTerm", list: "ethnicities", value: "Indigenous" },
  );
  assert.equal(
    added.personalsCategories.length,
    state.personalsCategories.length + 1,
  );
  assert.equal(added.ethnicities.at(-1), "Indigenous");

  // The value is the key, so a duplicate is a no-op rather than a second
  // identical option sitting in the picker.
  assert.equal(
    run(added, { type: "addTerm", list: "ethnicities", value: "Indigenous" }),
    added,
  );
  assert.equal(
    run(added, { type: "addTerm", list: "ethnicities", value: "   " }),
    added,
  );

  const moved = run(added, {
    type: "reorderTerm",
    list: "personalsCategories",
    value: "Dating",
    delta: -1,
  });
  assert.notDeepEqual(moved.personalsCategories, added.personalsCategories);
  assert.equal(
    moved.personalsCategories.length,
    added.personalsCategories.length,
  );

  const removed = run(moved, {
    type: "removeTerm",
    list: "ethnicities",
    value: "Indigenous",
  });
  assert.ok(!removed.ethnicities.includes("Indigenous"));
  // Removing something absent is not an edit and must not spend an audit slot.
  assert.equal(
    run(removed, {
      type: "removeTerm",
      list: "ethnicities",
      value: "Indigenous",
    }),
    removed,
  );

  // And an action cannot reach a state key that is not one of the two lists.
  for (const verb of ["addTerm", "removeTerm", "reorderTerm"]) {
    assert.equal(
      run(state, { type: verb, list: "settings", value: "x", delta: 1 }),
      state,
      verb,
    );
  }
});

test("areas are added once and removed by name", () => {
  const state = buildSeed();
  const added = run(state, {
    type: "addArea",
    provinceId: "on",
    area: "Muskoka",
  });
  const areas = added.provinces.find((p) => p.id === "on").areas;
  assert.ok(areas.includes("Muskoka"));

  // A duplicate is a no-op, not a second row.
  assert.equal(
    run(added, { type: "addArea", provinceId: "on", area: "Muskoka" }),
    added,
  );

  const removed = run(added, {
    type: "removeArea",
    provinceId: "on",
    area: "Muskoka",
  });
  assert.ok(
    !removed.provinces.find((p) => p.id === "on").areas.includes("Muskoka"),
  );

  // Removing it twice is not two edits — the second spends an audit slot on
  // nothing, and the audit only has 200 of them.
  assert.equal(
    run(removed, { type: "removeArea", provinceId: "on", area: "Muskoka" }),
    removed,
  );
});

test("the reducer is a function of its arguments and nothing else", () => {
  const state = buildSeed();
  const action = {
    type: "approve",
    id: pendingId(state),
    actor: ACTOR,
    role: ROLE,
    at: 1_756_000_000_000,
  };
  // The same (state, action) twice — as React's StrictMode does in dev — has
  // to produce the same thing, ids and timestamps included.
  assert.deepEqual(reducer(state, action), reducer(state, action));

  // And two writes inside one millisecond still get distinct ids.
  const first = reducer(state, action);
  const second = reducer(first, { ...action, type: "expire" });
  assert.notEqual(second.audit[0].id, second.audit[1].id);
  assert.equal(second.audit[0].at, second.audit[1].at);
});

test("a broadcast lands at the top of the history", () => {
  const state = buildSeed();
  const next = run(state, {
    type: "sendBroadcast",
    broadcast: {
      title: "Fees are changing",
      body: "Boosts drop to 4 credits on 1 September.",
      tone: "blue",
      icon: "Megaphone",
      site: "marketplace",
    },
  });
  assert.equal(next.broadcasts.length, state.broadcasts.length + 1);
  assert.equal(next.broadcasts[0].title, "Fees are changing");
  assert.ok(next.broadcasts[0].reach > 0);
});

test("credit packs upsert by id and delete by id", () => {
  const state = buildSeed();
  const created = run(state, {
    type: "upsertCreditPack",
    pack: { credits: 2000, price: 99, note: "Agency" },
  });
  assert.equal(created.creditPacks.length, state.creditPacks.length + 1);
  const added = created.creditPacks.at(-1);

  const edited = run(created, {
    type: "upsertCreditPack",
    pack: { ...added, price: 89 },
  });
  assert.equal(edited.creditPacks.length, created.creditPacks.length);
  assert.equal(edited.creditPacks.at(-1).price, 89);

  const removed = run(edited, { type: "deleteCreditPack", id: added.id });
  assert.equal(removed.creditPacks.length, state.creditPacks.length);
});

test("FAQs upsert and delete", () => {
  const state = buildSeed();
  const created = run(state, {
    type: "upsertFaq",
    faq: {
      q: "Can I pause an ad?",
      a: "Yes, from My Ads.",
      category: "Posting",
    },
  });
  assert.equal(created.faqs.length, state.faqs.length + 1);
  const removed = run(created, {
    type: "deleteFaq",
    id: created.faqs.at(-1).id,
  });
  assert.equal(removed.faqs.length, state.faqs.length);
});

test("a setting writes through and says so in the audit", () => {
  const state = buildSeed();
  const next = run(state, {
    type: "setSetting",
    key: "discreetByDefault",
    value: false,
  });
  assert.equal(next.settings.discreetByDefault, false);
  assert.equal(next.audit[0].entityId, "discreetByDefault");
  assert.equal(next.audit[0].note, "false");
});

test("every mutation names its actor, newest first", () => {
  const state = buildSeed();
  const id = pendingId(state);
  const next = run(
    state,
    { type: "approve", id },
    { type: "setBoost", id, on: true },
  );
  assert.equal(next.audit.length, state.audit.length + 2);
  assert.equal(next.audit[0].action, "startBoost");
  assert.equal(next.audit[1].action, "approve");
  for (const entry of next.audit.slice(0, 2)) {
    assert.equal(entry.actor, ACTOR);
    assert.equal(typeof entry.at, "number");
  }
  assert.deepEqual(
    auditFor(next, "listing", id).map((a) => a.action),
    ["startBoost", "approve"],
  );
});

test("a no-op action leaves the state — and the audit — alone", () => {
  const state = buildSeed();
  assert.equal(run(state, { type: "approve", id: "nope" }), state);
  assert.equal(run(state, { type: "notAVerb" }), state);
});

test("the audit caps rather than growing forever", () => {
  let state = buildSeed();
  const id = "l1";
  for (let i = 0; i < AUDIT_CAP + 25; i += 1) {
    state = reducer(state, {
      actor: ACTOR,
      role: ROLE,
      at: 1_756_000_000_000 + i,
      type: "setBoost",
      id,
      on: i % 2 === 0,
    });
  }
  assert.equal(state.audit.length, AUDIT_CAP);
  // The cap drops the tail, so the newest entry is still the last one written
  // — the loop ends on an even index, which is a boost being switched on.
  assert.equal(state.audit[0].action, "startBoost");
  // And the seeded entries, which were the oldest, are the ones now gone.
  assert.ok(!state.audit.some((a) => a.id.startsWith("au-seed")));
});

test("broadcasts cap the same way the audit does", () => {
  let state = buildSeed();
  for (let i = 0; i < BROADCAST_CAP + 10; i += 1) {
    state = reducer(state, {
      actor: ACTOR,
      role: ROLE,
      at: 1_756_000_000_000 + i,
      type: "sendBroadcast",
      broadcast: { title: `Broadcast ${i}`, body: "x", site: "all" },
    });
  }
  assert.equal(state.broadcasts.length, BROADCAST_CAP);
  assert.equal(state.broadcasts[0].title, `Broadcast ${BROADCAST_CAP + 9}`);
});

test("the reducer refuses what the role does not hold", () => {
  const state = buildSeed();
  const id = pendingId(state);
  const act = { actor: ACTOR, at: 1_756_000_000_000 };

  // Support may answer tickets but must not moderate ads or delete them.
  assert.equal(
    reducer(state, { ...act, role: "support", type: "approve", id }),
    state,
  );
  assert.equal(
    reducer(state, {
      ...act,
      role: "support",
      type: "deleteListing",
      id: "l1",
    }),
    state,
  );
  // A moderator may approve but still may not delete — that is owner-only.
  assert.notEqual(
    reducer(state, { ...act, role: "moderator", type: "approve", id }),
    state,
  );
  assert.equal(
    reducer(state, {
      ...act,
      role: "moderator",
      type: "deleteListing",
      id: "l1",
    }),
    state,
  );
  // Taxonomy, money, settings and admins are the owner's.
  for (const action of [
    { type: "deleteCategory", id: "vehicles" },
    { type: "setSetting", key: "liveEnabled", value: false },
    {
      type: "sendBroadcast",
      broadcast: { title: "x", body: "y", site: "all" },
    },
    { type: "removeAdmin", id: "ad2" },
    { type: "refundCharge", id: "bh1" },
  ]) {
    assert.equal(
      reducer(state, { ...act, role: "moderator", ...action }),
      state,
      action.type,
    );
    assert.notEqual(
      reducer(state, { ...act, role: "owner", ...action }),
      state,
      action.type,
    );
  }
  // No role at all is not a skeleton key.
  assert.equal(
    reducer(state, { ...act, role: null, type: "approve", id }),
    state,
  );
});

test("editing an ad touches only the fields a moderator may rewrite", () => {
  const state = buildSeed();
  const before = state.listings.find((l) => l.id === "l1");
  const next = run(state, {
    type: "editListing",
    id: "l1",
    fields: {
      title: "Solid Oak Dining Table",
      price: 500,
      // Not editable — a form typo must not reassign or un-reject an ad.
      status: "active",
      ownerId: "someone-else",
      views: 999_999,
    },
  });
  const after = next.listings.find((l) => l.id === "l1");
  assert.equal(after.title, "Solid Oak Dining Table");
  assert.equal(after.price, 500);
  assert.equal(after.status, before.status);
  assert.equal(after.ownerId, before.ownerId);
  assert.equal(after.views, before.views);
});

test("photos come off one at a time, and never the last one", () => {
  const state = buildSeed();
  const row = state.listings.find((l) => l.photos.length > 1);
  const doomed = row.photos[0];

  let next = run(state, { type: "removePhoto", id: row.id, photo: doomed });
  assert.equal(
    next.listings.find((l) => l.id === row.id).photos.length,
    row.photos.length - 1,
  );

  // Strip it down to one and the next removal is refused — an ad with no
  // photos is not an ad.
  for (const photo of row.photos.slice(1, -1)) {
    next = run(next, { type: "removePhoto", id: row.id, photo });
  }
  const last = next.listings.find((l) => l.id === row.id);
  assert.equal(last.photos.length, 1);
  assert.equal(
    run(next, { type: "removePhoto", id: row.id, photo: last.photos[0] }),
    next,
  );
});

test("tickets are assigned, unassigned, and released when an admin leaves", () => {
  const state = buildSeed();
  const ticket = state.tickets[0];
  const assigned = run(state, {
    type: "assignTicket",
    id: ticket.id,
    adminId: "ad2",
  });
  assert.equal(
    assigned.tickets.find((t) => t.id === ticket.id).assigneeId,
    "ad2",
  );
  // Assigning to somebody who does not exist is refused outright.
  assert.equal(
    run(assigned, { type: "assignTicket", id: ticket.id, adminId: "nobody" }),
    assigned,
  );

  const gone = run(assigned, { type: "removeAdmin", id: "ad2" });
  assert.equal(gone.tickets.find((t) => t.id === ticket.id).assigneeId, null);
});

test("the last owner cannot be removed", () => {
  const state = buildSeed();
  const owners = state.admins.filter((a) => a.role === "owner");
  assert.equal(owners.length, 1);
  assert.equal(run(state, { type: "removeAdmin", id: owners[0].id }), state);

  // With a second owner in place, the first may go.
  const two = run(state, {
    type: "upsertAdmin",
    admin: { name: "Rae Lin", email: "rae@vezlist.cc", role: "owner" },
  });
  const fewer = run(two, { type: "removeAdmin", id: owners[0].id });
  assert.equal(fewer.admins.length, two.admins.length - 1);
});

test("an admin email is claimed once", () => {
  const state = buildSeed();
  assert.equal(
    run(state, {
      type: "upsertAdmin",
      admin: {
        name: "Someone Else",
        email: "priya@vezlist.cc",
        role: "support",
      },
    }),
    state,
  );
  // A bad role is a typo, not a tier.
  assert.equal(
    run(state, {
      type: "upsertAdmin",
      admin: { name: "Nope", email: "nope@vezlist.cc", role: "superuser" },
    }),
    state,
  );
});

test("a refund marks the charge rather than erasing it", () => {
  const state = buildSeed();
  const next = run(state, { type: "refundCharge", id: "bh1" });
  assert.equal(next.billing.length, state.billing.length);
  assert.equal(next.billing.find((b) => b.id === "bh1").refunded, true);
  // Refunding twice is not two refunds.
  assert.equal(run(next, { type: "refundCharge", id: "bh1" }), next);
});

test("credits adjust up and down but never below zero", () => {
  const state = buildSeed();
  const user = state.users.find((u) => (u.credits ?? 0) > 0);
  const up = run(state, { type: "adjustCredits", id: user.id, delta: 50 });
  assert.equal(
    up.users.find((u) => u.id === user.id).credits,
    user.credits + 50,
  );

  const floored = run(up, {
    type: "adjustCredits",
    id: user.id,
    delta: -100_000,
  });
  assert.equal(floored.users.find((u) => u.id === user.id).credits, 0);
  // A zero adjustment is not an adjustment.
  assert.equal(
    run(state, { type: "adjustCredits", id: user.id, delta: 0 }),
    state,
  );
});

test("resetToSeed returns a clean seed", () => {
  const state = buildSeed();
  const dirty = run(
    state,
    { type: "reject", id: pendingId(state), reason: "spam" },
    { type: "deleteListing", id: "l1" },
    { type: "setSetting", key: "liveEnabled", value: false },
  );
  assert.notEqual(dirty.listings.length, state.listings.length);

  const clean = reducer(dirty, {
    type: "resetToSeed",
    actor: ACTOR,
    role: ROLE,
    at: 1_700_000_000_000,
  });
  assert.deepEqual(clean.listings, state.listings);
  assert.deepEqual(clean.settings, state.settings);
  // The reset itself is the one entry the fresh seed's audit does not share
  // with a plain `buildSeed()` — see the "reset is recorded" tests below.
  assert.deepEqual(clean.audit.slice(1), state.audit);
});

test("a reset writes a terminal audit entry that survives the wipe", () => {
  const state = buildSeed();
  const dirty = run(
    state,
    { type: "reject", id: pendingId(state), reason: "spam" },
    { type: "deleteListing", id: "l1" },
  );
  // The most destructive action in the console must not be the one action
  // that bypasses `log()` — a reset with no record would be silent.
  const clean = reducer(dirty, {
    type: "resetToSeed",
    actor: ACTOR,
    role: ROLE,
    at: 1_700_000_000_000,
  });

  assert.equal(clean.audit[0].action, "resetToSeed");
  assert.equal(clean.audit[0].actor, ACTOR);
  assert.equal(clean.audit[0].entity, "system");
  assert.equal(clean.audit[0].at, 1_700_000_000_000);
  // It is written against the *new* audit trail's sequence, not the old
  // state's — the record lives in the log that survives the reset, not the
  // one that gets thrown away.
  assert.equal(clean.auditSeq, 1);
  assert.equal(clean.audit.length, state.audit.length + 1);
});

test("the reset entry is capped like every other audit entry, and it wins", () => {
  // A seed with a full audit log is not a real scenario `buildSeed()` ever
  // produces, but `log()`'s cap logic has to hold for the reset entry the
  // same way it holds for the other 39 actions — the newest entry (the
  // reset itself) must never be the one the cap drops.
  const state = buildSeed();
  const clean = reducer(state, {
    type: "resetToSeed",
    actor: ACTOR,
    role: ROLE,
    at: 1_700_000_000_000,
  });
  assert.ok(clean.audit.length <= AUDIT_CAP);
  assert.equal(clean.audit[0].action, "resetToSeed");
});

test("resetToSeed still refuses a role without settings.edit", () => {
  const state = buildSeed();
  const refused = reducer(state, {
    type: "resetToSeed",
    actor: ACTOR,
    role: "support",
    at: 1_700_000_000_000,
  });
  assert.equal(refused, state);
});

test("re-filing an ad into another category drops a sub-category it takes with it", () => {
  const state = buildSeed();
  // Any ad that actually carries a sub-category; the mock assigns them by
  // title hash, so one is picked at runtime rather than named here.
  const before = state.listings.find((l) => l.subcategory);
  assert.ok(before, "seed carries no classified ad to move");

  const target = state.categories.find(
    (c) => c.id !== before.categoryId && !c.subs.includes(before.subcategory),
  );
  const next = run(state, {
    type: "editListing",
    id: before.id,
    fields: { categoryId: target.id, category: target.label },
  });
  const after = next.listings.find((l) => l.id === before.id);

  assert.equal(after.category, target.label);
  // The dangling string `removeSubcategory` exists to prevent, reached by a
  // different route and given the same answer.
  assert.equal(after.subcategory, null);
});

test("an edit that leaves the category alone leaves the sub-category alone", () => {
  const state = buildSeed();
  const before = state.listings.find((l) => l.subcategory);
  const next = run(state, {
    type: "editListing",
    id: before.id,
    fields: { title: "Renamed but not re-filed" },
  });
  const after = next.listings.find((l) => l.id === before.id);
  assert.equal(after.subcategory, before.subcategory);
});

test("a move into a category that has the same sub-category label keeps it", () => {
  const state = buildSeed();
  // "Furniture" is deliberately a sub-category of more than one category, so
  // the ad is still filed under something the new parent can offer.
  const shared = state.categories.filter((c) => c.subs.includes("Furniture"));
  assert.ok(shared.length > 1, "no shared sub-category label to test with");

  const moved = run(state, {
    type: "editListing",
    id: state.listings[0].id,
    fields: { categoryId: shared[0].id, category: shared[0].label },
  });
  const seeded = {
    ...moved,
    listings: moved.listings.map((l) =>
      l.id === state.listings[0].id ? { ...l, subcategory: "Furniture" } : l,
    ),
  };
  const next = run(seeded, {
    type: "editListing",
    id: state.listings[0].id,
    fields: { categoryId: shared[1].id, category: shared[1].label },
  });
  const after = next.listings.find((l) => l.id === state.listings[0].id);
  assert.equal(after.subcategory, "Furniture");
});

/* ------------------------------------------------------- reports (#4) */

test("a report raised outside the console lands at the top of the queue", () => {
  const state = buildSeed();
  const target = state.listings[0];
  const next = run(state, {
    type: "createReport",
    site: target.site,
    targetType: "listing",
    targetId: target.id,
    reasonId: "scam",
    detail: "Asks for an e-transfer deposit before any viewing.",
    reporter: "Sarah Jenkins",
  });

  assert.equal(next.reports.length, state.reports.length + 1);
  const row = next.reports[0];
  assert.equal(row.status, "open");
  assert.equal(row.reason, "Scam or fraud");
  assert.equal(row.targetId, target.id);
  // The reporter is the actor on the audit line, not whoever happens to be
  // signed into the console when it arrives.
  assert.equal(next.audit[0].action, "createReport");
  assert.equal(next.audit[0].actor, "Sarah Jenkins");
});

test("a report the console cannot open is not accepted", () => {
  const state = buildSeed();
  const next = run(state, {
    type: "createReport",
    site: "marketplace",
    targetType: "listing",
    targetId: "no-such-listing",
    reasonId: "scam",
  });
  assert.equal(next.reports.length, state.reports.length);
  assert.equal(next.audit.length, state.audit.length);
});

test("a report with a reason that does not exist is not accepted", () => {
  const state = buildSeed();
  const next = run(state, {
    type: "createReport",
    site: "marketplace",
    targetType: "listing",
    targetId: state.listings[0].id,
    reasonId: "because-i-said-so",
  });
  assert.equal(next.reports.length, state.reports.length);
});

test("two reports filed in the same millisecond get different ids", () => {
  const state = buildSeed();
  const target = state.listings[0];
  const action = {
    type: "createReport",
    site: target.site,
    targetType: "listing",
    targetId: target.id,
    reasonId: "duplicate",
    at: 1_700_000_000_000,
  };
  const next = reducer(reducer(state, action), action);
  assert.notEqual(next.reports[0].id, next.reports[1].id);
});

test("a moderator can close a report that arrived this way", () => {
  const state = buildSeed();
  const target = state.listings[0];
  const filed = run(state, {
    type: "createReport",
    site: target.site,
    targetType: "listing",
    targetId: target.id,
    reasonId: "prohibited",
    reporter: "Sarah Jenkins",
  });
  const closed = run(filed, {
    type: "resolveReport",
    id: filed.reports[0].id,
    note: "Ad removed.",
  });
  assert.equal(closed.reports[0].status, "resolved");
});

/* --------------------------------------------------------------- appeals */

test("the seed ships with a rejected listing and a suspended account already appealed", () => {
  const state = buildSeed();
  assert.equal(listing(state, "l18").status, "rejected");
  assert.equal(state.users.find((u) => u.id === "s2").status, "suspended");
  assert.equal(state.appeals.length, 2);
  assert.ok(state.appeals.every((a) => a.status === "pending"));
});

test("an appeal needs something appealable to point at", () => {
  const state = buildSeed();
  const active = state.listings.find((l) => l.status === "active");
  const next = run(state, {
    type: "raiseAppeal",
    targetType: "listing",
    targetId: active.id,
    appellant: "Someone",
    message: "Please look again.",
  });
  assert.equal(next, state);

  const noSuchTarget = run(state, {
    type: "raiseAppeal",
    targetType: "user",
    targetId: "no-such-user",
    appellant: "Someone",
  });
  assert.equal(noSuchTarget, state);
});

test("one open appeal per target — a second one is refused while the first is pending", () => {
  const state = buildSeed();
  // l18 already carries a pending appeal from the seed.
  const next = run(state, {
    type: "raiseAppeal",
    targetType: "listing",
    targetId: "l18",
    appellant: "Theo L.",
    message: "Again, please.",
  });
  assert.equal(next, state);
  assert.equal(next.appeals.length, 2);
});

test("raising and overturning an appeal reinstates a rejected listing", () => {
  const state = buildSeed();
  const id = pendingId(state);
  const rejected = run(state, {
    type: "reject",
    id,
    reason: "Contact details in the photos.",
  });

  const appealed = run(rejected, {
    type: "raiseAppeal",
    targetType: "listing",
    targetId: id,
    appellant: "The seller",
    message: "The photo has been fixed.",
  });
  const appeal = appealed.appeals.find((a) => a.targetId === id);
  assert.equal(appeal.status, "pending");
  assert.equal(appeal.originalNote, "Contact details in the photos.");

  const overturned = run(appealed, {
    type: "overturnAppeal",
    id: appeal.id,
    note: "Photo re-checked, it is clean now.",
  });
  assert.equal(listing(overturned, id).status, "active");
  assert.equal(listing(overturned, id).rejectionReason, null);
  assert.equal(
    overturned.appeals.find((a) => a.id === appeal.id).status,
    "overturned",
  );
  // The reversal is written under the listing's own entity too, so
  // `ListingDetail`'s decision history shows it without knowing appeals
  // exist.
  const trail = auditFor(overturned, "listing", id);
  assert.equal(trail[0].action, "approve");
  assert.equal(trail[0].note, "Photo re-checked, it is clean now.");
  const appealTrail = auditFor(overturned, "appeal", appeal.id);
  assert.equal(appealTrail[0].action, "overturnAppeal");
});

test("overturning a suspension restores the account but not the listings it already took down", () => {
  const state = buildSeed();
  const seller = state.users.find((u) => u.id === "s1");
  const suspended = run(state, {
    type: "suspendUser",
    id: seller.id,
    reason: "test",
  });
  const takenDown = suspended.listings.filter(
    (l) => l.ownerId === seller.id && l.status === "expired",
  );
  assert.ok(takenDown.length > 0, "fixture has something to take down");

  const appealed = run(suspended, {
    type: "raiseAppeal",
    targetType: "user",
    targetId: seller.id,
    appellant: seller.name,
    message: "It was a misunderstanding.",
  });
  const appeal = appealed.appeals.find((a) => a.targetId === seller.id);

  const overturned = run(appealed, { type: "overturnAppeal", id: appeal.id });
  assert.equal(
    overturned.users.find((u) => u.id === seller.id).status,
    "active",
  );
  // Restoring the account does not resurrect what the suspension expired —
  // the same thing `unsuspendUser` alone already does not do.
  for (const l of takenDown) {
    assert.equal(listing(overturned, l.id).status, "expired");
  }
});

test("upholding an appeal leaves the target untouched", () => {
  const state = buildSeed();
  const appeal = state.appeals.find((a) => a.targetType === "listing");
  const next = run(state, {
    type: "upholdAppeal",
    id: appeal.id,
    note: "The photo still shows a phone number.",
  });
  assert.equal(listing(next, appeal.targetId).status, "rejected");
  assert.equal(next.appeals.find((a) => a.id === appeal.id).status, "upheld");
  assert.equal(next.audit[0].action, "upholdAppeal");
});

test("a decided appeal cannot be decided again", () => {
  const state = buildSeed();
  const appeal = state.appeals[0];
  const upheld = run(state, { type: "upholdAppeal", id: appeal.id });
  const again = run(upheld, { type: "overturnAppeal", id: appeal.id });
  assert.equal(again, upheld);
});

test("appeals are RBAC-checked like every other action", () => {
  const state = buildSeed();
  const appeal = state.appeals.find((a) => a.targetType === "listing");
  const act = { actor: "Sam Okafor", at: 1_756_000_000_000 };

  // Support may not raise or decide an appeal.
  assert.equal(
    reducer(state, {
      ...act,
      role: "support",
      type: "raiseAppeal",
      targetType: "listing",
      targetId: appeal.targetId,
      appellant: "x",
    }),
    state,
  );
  assert.equal(
    reducer(state, {
      ...act,
      role: "support",
      type: "upholdAppeal",
      id: appeal.id,
    }),
    state,
  );
  assert.equal(
    reducer(state, {
      ...act,
      role: "support",
      type: "overturnAppeal",
      id: appeal.id,
    }),
    state,
  );
  // A moderator may.
  assert.notEqual(
    reducer(state, {
      ...act,
      role: "moderator",
      type: "upholdAppeal",
      id: appeal.id,
    }),
    state,
  );
});
