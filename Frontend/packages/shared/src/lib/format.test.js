// Run with: node --test src/lib/format.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { maskContact, timeAgo } from "./format.js";

test("maskContact hides the local part of an email", () => {
  assert.equal(maskContact("seller@gmail.com", "email"), "...@gmail.com");
});

test("maskContact keeps only the last 5 phone digits", () => {
  assert.equal(maskContact("+12505551005", "phone"), "...51005");
});

test("maskContact tolerates empty input", () => {
  assert.equal(maskContact("", "phone"), "");
});

test("timeAgo picks the largest fitting unit", () => {
  assert.equal(timeAgo(5 * 3_600_000), "5 hours Ago");
  assert.equal(timeAgo(90_000), "1 minute Ago");
  assert.equal(timeAgo(2 * 86_400_000), "2 days Ago");
  assert.equal(timeAgo(1_000), "Just now");
});
