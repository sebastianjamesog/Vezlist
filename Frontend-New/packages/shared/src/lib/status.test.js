import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_REACTIONS,
  STORY_TTL_MS,
  findActiveStory,
  groupStatuses,
  isStoryActive,
  isUpdateActive,
  reactionFor,
  reactionsReducer,
  ringDashes,
  statusTime,
} from "./status.js";

test("status labels get vaguer as the update ages", () => {
  assert.equal(statusTime(20_000), "Just now");
  assert.equal(statusTime(60_000), "1 minute ago");
  assert.equal(statusTime(22 * 60_000), "22 minutes ago");
  assert.equal(statusTime(3_600_000), "Today, 1 hour ago");
  assert.equal(statusTime(5 * 3_600_000), "Today, 5 hours ago");
  assert.equal(statusTime(30 * 3_600_000), "Yesterday");
  assert.equal(statusTime(3 * 86_400_000), "3 days ago");
});

const stories = [
  { id: "me", own: true, updates: [] },
  { id: "a", msAgo: 5_000_000, updates: [{ id: "a1" }] },
  { id: "b", msAgo: 1_000_000, updates: [{ id: "b1" }] },
  { id: "c", msAgo: 9_000_000, updates: [{ id: "c1" }] },
  { id: "empty", msAgo: 1, updates: [] },
  // Posted a day and change ago — the fixture `s5` in `data/mock.js` is
  // seeded the same way, past `STORY_TTL_MS` on purpose.
  { id: "old", msAgo: 28 * 3_600_000, updates: [{ id: "old1" }] },
];

test("grouping splits mine, unseen and viewed", () => {
  const { mine, recent, viewed } = groupStatuses(stories, ["a"]);
  assert.equal(mine.id, "me");
  assert.deepEqual(
    recent.map((s) => s.id),
    ["b", "c"],
  );
  assert.deepEqual(
    viewed.map((s) => s.id),
    ["a"],
  );
});

test("newest update comes first and people with nothing posted drop out", () => {
  const { recent } = groupStatuses(stories);
  assert.deepEqual(
    recent.map((s) => s.id),
    ["b", "a", "c"],
  );
});

test("a single update draws one unbroken ring", () => {
  assert.equal(ringDashes(1, 100), "100 0");
});

test("multiple updates split the ring into gapped arcs", () => {
  assert.equal(ringDashes(4, 100, 5), "20 5");
});

/* ------------------------------------------------------- expiry (#30) */

test("a story ages out at the TTL, not a moment before", () => {
  assert.equal(isStoryActive({ msAgo: STORY_TTL_MS - 1 }), true);
  assert.equal(isStoryActive({ msAgo: STORY_TTL_MS }), false);
  assert.equal(isStoryActive({ msAgo: STORY_TTL_MS + 1 }), false);
});

test("a story with no msAgo at all is never treated as expired", () => {
  // `mine` in the real data has no `msAgo` — nothing has been posted to it.
  assert.equal(isStoryActive({ updates: [] }), true);
});

/* An update posted from this device carries a real `postedAt`, so its age is
   measured against a `now` handed in rather than one read here — see the
   header comment on `isUpdateActive` and the clock in `StatusContext`. */

const NOW = 1_700_000_000_000;

test("a posted update ages out at the TTL, not a moment before", () => {
  const at = (age) => isUpdateActive({ postedAt: NOW - age }, NOW);
  assert.equal(at(STORY_TTL_MS - 1), true);
  assert.equal(at(STORY_TTL_MS), false);
  assert.equal(at(STORY_TTL_MS + 1), false);
});

test("an update with no postedAt is kept, not expired", () => {
  // Every fixture in `mock.js` is one of these, and so is anything written
  // by a build older than the composer. Dropping them would empty the seed
  // story the first time the clock was consulted.
  assert.equal(isUpdateActive({ id: "s1-1" }, NOW), true);
  assert.equal(isUpdateActive({ postedAt: "yesterday" }, NOW), true);
  assert.equal(isUpdateActive(undefined, NOW), true);
});

test("expiry is per update, so a fresh post outlives the one beside it", () => {
  const updates = [
    { id: "old", postedAt: NOW - STORY_TTL_MS - 1 },
    { id: "new", postedAt: NOW - 60_000 },
  ];
  assert.deepEqual(
    updates.filter((u) => isUpdateActive(u, NOW)).map((u) => u.id),
    ["new"],
  );
});

test("grouping drops a story past the TTL from both recent and viewed", () => {
  const { recent, viewed } = groupStatuses(stories, ["old"]);
  assert.ok(!recent.some((s) => s.id === "old"));
  assert.ok(!viewed.some((s) => s.id === "old"));
});

test("finding by id treats an expired story the same as one that never existed", () => {
  assert.equal(findActiveStory(stories, "old"), null);
  assert.equal(findActiveStory(stories, "does-not-exist"), null);
  assert.equal(findActiveStory(stories, "a")?.id, "a");
});

test("finding your own story ignores the TTL — it has no msAgo to expire by", () => {
  assert.equal(findActiveStory(stories, "me")?.id, "me");
});

/* ----------------------------------------------------- reactions (#30) */

test("reacting sets this device's emoji for that update, and nothing else's", () => {
  const state = reactionsReducer(EMPTY_REACTIONS, {
    type: "react",
    storyId: "s1",
    updateId: "s1a",
    emoji: "🔥",
  });
  assert.equal(reactionFor(state, "s1", "s1a"), "🔥");
  assert.equal(reactionFor(state, "s1", "s1b"), null);
});

test("reacting with the same emoji again clears it", () => {
  const reacted = reactionsReducer(EMPTY_REACTIONS, {
    type: "react",
    storyId: "s1",
    updateId: "s1a",
    emoji: "🔥",
  });
  const cleared = reactionsReducer(reacted, {
    type: "react",
    storyId: "s1",
    updateId: "s1a",
    emoji: "🔥",
  });
  assert.equal(reactionFor(cleared, "s1", "s1a"), null);
});

test("reacting with a different emoji replaces the one already there", () => {
  const first = reactionsReducer(EMPTY_REACTIONS, {
    type: "react",
    storyId: "s1",
    updateId: "s1a",
    emoji: "🔥",
  });
  const swapped = reactionsReducer(first, {
    type: "react",
    storyId: "s1",
    updateId: "s1a",
    emoji: "❤️",
  });
  assert.equal(reactionFor(swapped, "s1", "s1a"), "❤️");
});

test("rehydrate drops anything that is not a real emoji this build offers", () => {
  const state = reactionsReducer(EMPTY_REACTIONS, {
    type: "rehydrate",
    state: { "s1:s1a": "🔥", "s1:s1b": "not-an-emoji", junk: 5 },
  });
  assert.deepEqual(state, { "s1:s1a": "🔥" });
});
