import test from "node:test";
import assert from "node:assert/strict";
import { groupStatuses, ringDashes, statusTime } from "./status.js";

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
