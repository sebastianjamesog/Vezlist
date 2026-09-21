// Run with: node --test src/lib/age.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { MIN_AGE, isConfirmedAdult } from "./age.js";

/* -------------------------------------------------------- isConfirmedAdult */

test("isConfirmedAdult accepts a stored confirmation", () => {
  assert.equal(isConfirmedAdult({ confirmed: true }), true);
});

test("a confirmation from the date-of-birth version of the gate still passes", () => {
  // Those visitors answered the harder question; asking again would be a
  // regression they experience as the gate having forgotten them.
  assert.equal(isConfirmedAdult({ confirmed: true, dob: "1990-05-20" }), true);
});

test("isConfirmedAdult refuses anything that is not a plain object", () => {
  assert.equal(isConfirmedAdult(null), false);
  assert.equal(isConfirmedAdult(undefined), false);
  assert.equal(isConfirmedAdult("confirmed"), false);
  assert.equal(isConfirmedAdult(true), false);
  assert.equal(isConfirmedAdult(1), false);
  assert.equal(isConfirmedAdult(["confirmed"]), false);
});

test("isConfirmedAdult refuses a missing or falsy flag", () => {
  assert.equal(isConfirmedAdult({}), false);
  assert.equal(isConfirmedAdult({ confirmed: false }), false);
  assert.equal(isConfirmedAdult({ confirmed: null }), false);
  // Truthy is not true: a value written by a build that stored a string here
  // is a shape this one does not read, and guessing is how it fails open.
  assert.equal(isConfirmedAdult({ confirmed: "yes" }), false);
  assert.equal(isConfirmedAdult({ confirmed: 1 }), false);
});

test("the minimum age is still a single named constant", () => {
  // The gate's button and its badge both render it; the number never gets
  // typed a second time.
  assert.equal(MIN_AGE, 18);
});

/* ------------------------------------------- the pre-hydration copy of this */

/**
 * `apps/personals/app/layout.jsx` runs an inline `beforeInteractive` script
 * that re-implements the check above, because a script tag is a string and
 * cannot import this module. That duplication is not a mistake — it is what
 * stops a confirmed adult seeing the answered gate flash on every cold load —
 * but a duplicate nobody checks is a duplicate that drifts.
 *
 * Drift here is not a security hole: `inert` on the board is driven by React's
 * own `isConfirmedAdult`, so the worst case is a one-tick flash, never a
 * bypass. It is still worth catching, because the two would disagree silently
 * and the symptom would look like a rendering bug rather than a stale copy.
 */
test("the pre-hydration script agrees with this module", async () => {
  const { readFile } = await import("node:fs/promises");
  const layout = await readFile(
    new URL("../../../../apps/personals/app/layout.jsx", import.meta.url),
    "utf8",
  );
  const gate = await readFile(
    new URL("../../../../apps/personals/app/AgeGate.jsx", import.meta.url),
    "utf8",
  );

  // The same flag, tested the same strict way. `!== true` is the check that
  // makes a hand-written `"confirmed":"yes"` fail on both sides rather than
  // on one, which is exactly the drift this test exists to catch.
  assert.match(
    layout,
    /confirmed\s*!==\s*true/,
    "the inline script does not check `confirmed !== true` the way isConfirmedAdult does",
  );

  // The slot both halves read. A rename on one side means the script checks a
  // key nobody writes, and every returning adult sees the gate again.
  const key = gate.match(/AGE_GATE_STORAGE_KEY = "([^"]+)"/);
  assert.ok(key, "AGE_GATE_STORAGE_KEY not found in AgeGate.jsx");
  assert.ok(
    layout.includes(`"${key[1]}"`),
    `the inline script does not read ${key[1]}`,
  );
});
