import test from "node:test";
import assert from "node:assert/strict";
import { liveStreamFor } from "./live.js";

const streams = [
  {
    id: "session-a",
    ownerId: "creator-a",
    creatorName: "Same name",
    status: "LIVE",
  },
  {
    id: "session-b",
    ownerId: "creator-b",
    creatorName: "Same name",
    status: "RECONNECTING",
  },
  { id: "old-session", ownerId: "creator-c", status: "ENDED" },
  { id: "not-ready", ownerId: "creator-d", status: "PREPARING" },
];

test("matches live and reconnecting sessions by account ID even with identical names", () => {
  assert.equal(liveStreamFor("creator-a", streams)?.id, "session-a");
  assert.equal(liveStreamFor("creator-b", streams)?.id, "session-b");
  assert.equal(liveStreamFor("Same name", streams), null);
});

test("does not expose ended, preparing or invented sessions", () => {
  assert.equal(liveStreamFor("creator-c", streams), null);
  assert.equal(liveStreamFor("creator-d", streams), null);
  assert.equal(liveStreamFor("creator-a"), null);
  assert.equal(liveStreamFor(undefined, streams), null);
});
