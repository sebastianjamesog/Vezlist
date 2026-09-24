import test from "node:test";
import assert from "node:assert/strict";
import { liveStreamFor } from "./live.js";

const streams = [
  { id: "a", host: "Chloe Dubois" },
  { id: "b", host: "Noah  Fischer " },
];

test("finds a creator's stream regardless of case and spacing", () => {
  assert.equal(liveStreamFor("chloe dubois", streams)?.id, "a");
  assert.equal(liveStreamFor(" Noah Fischer", streams)?.id, "b");
});

test("returns null for a creator who is not live or has no name", () => {
  assert.equal(liveStreamFor("Priya Nair", streams), null);
  assert.equal(liveStreamFor("", streams), null);
  assert.equal(liveStreamFor(undefined, streams), null);
});
