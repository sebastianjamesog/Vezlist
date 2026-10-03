import test from "node:test";
import assert from "node:assert/strict";
import { MIN_AGE } from "./age.js";

test("the Personals warning uses one named minimum age", () => {
  assert.equal(MIN_AGE, 18);
});
