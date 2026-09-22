// Run with: node --test src/lib/format.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { compactCount, statementDate, timeAgo } from "./format.js";

test("timeAgo picks the largest fitting unit", () => {
  assert.equal(timeAgo(5 * 3_600_000), "5 hours Ago");
  assert.equal(timeAgo(90_000), "1 minute Ago");
  assert.equal(timeAgo(2 * 86_400_000), "2 days Ago");
  assert.equal(timeAgo(1_000), "Just now");
});

test("compactCount abbreviates once it stops being readable", () => {
  assert.equal(compactCount(0), "0");
  assert.equal(compactCount(999), "999");
  assert.equal(compactCount(1000), "1K");
  assert.equal(compactCount(1243), "1.2K");
  // Past 100K the decimal is noise, so it rounds off.
  assert.equal(compactCount(124_300), "124K");
  assert.equal(compactCount(2_400_000), "2.4M");
});

test("statementDate is stable wherever it renders", () => {
  const at = Date.parse("2026-08-12T10:00:00.000Z");
  assert.equal(statementDate(at), "12 Aug 2026");
  // Pinned to UTC, so a build machine in another zone prerenders the same
  // string the reader's browser hydrates against.
  assert.equal(
    statementDate(Date.parse("2026-01-01T23:30:00.000Z")),
    "1 Jan 2026",
  );
  // A ledger row from a hand-edited cookie loses its date, not its row.
  assert.equal(statementDate(undefined), "");
  assert.equal(statementDate(NaN), "");
});
