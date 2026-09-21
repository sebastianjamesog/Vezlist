// Run with: node --test src/lib/wallet.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  LEDGER_CAP,
  MAX_LABEL,
  affords,
  normaliseWallet,
  seedWallet,
  spend,
  topUp,
} from "./wallet.js";

const at = Date.parse("2026-08-31T12:00:00.000Z");
const empty = { balance: 0, ledger: [] };

test("a top-up adds credits and records the row", () => {
  const w = topUp(empty, { credits: 350, label: "350 credits", price: 25, at });
  assert.equal(w.balance, 350);
  assert.equal(w.ledger.length, 1);
  assert.equal(w.ledger[0].delta, 350);
  assert.equal(w.ledger[0].price, 25);
});

test("a spend the balance covers goes through", () => {
  const w = spend({ balance: 100, ledger: [] }, { credits: 20, at });
  assert.equal(w.balance, 80);
  assert.equal(w.ledger[0].delta, -20);
});

test("a spend the balance does not cover is refused, not overdrawn", () => {
  const before = { balance: 10, ledger: [] };
  const after = spend(before, { credits: 20, at });
  // Same object back is the contract every call site tests against.
  assert.equal(after, before);
  assert.equal(after.balance, 10);
});

test("spending the whole balance is allowed; a credit more is not", () => {
  assert.equal(spend({ balance: 20, ledger: [] }, { credits: 20 }).balance, 0);
  const broke = { balance: 20, ledger: [] };
  assert.equal(spend(broke, { credits: 21 }), broke);
});

test("junk amounts move nothing", () => {
  for (const credits of [0, -50, NaN, "abc", undefined]) {
    assert.equal(topUp(empty, { credits }), empty, `topUp ${credits}`);
    assert.equal(spend(empty, { credits }), empty, `spend ${credits}`);
  }
});

test("the ledger is capped so the cookie stays a cookie", () => {
  let w = empty;
  for (let i = 0; i < LEDGER_CAP + 5; i += 1) {
    w = topUp(w, { credits: 1, label: `row ${i}`, at: at + i });
  }
  assert.equal(w.ledger.length, LEDGER_CAP);
  // Newest first: the last row written is the one on top.
  assert.equal(w.ledger[0].label, `row ${LEDGER_CAP + 4}`);
});

test("a hand-edited cookie cannot mint credits or crash a screen", () => {
  assert.deepEqual(normaliseWallet(null), seedWallet());
  assert.deepEqual(normaliseWallet("nonsense"), seedWallet());
  assert.equal(normaliseWallet({ balance: -5, ledger: [] }).balance, 0);
  assert.equal(normaliseWallet({ balance: "12.9", ledger: [] }).balance, 12);
  assert.deepEqual(normaliseWallet({ balance: 5, ledger: "no" }).ledger, []);
  assert.deepEqual(
    normaliseWallet({ balance: 5, ledger: [{ nope: true }] }).ledger,
    [],
  );
});

test("affords answers the question Promote asks first", () => {
  assert.equal(affords({ balance: 60, ledger: [] }, 60), true);
  assert.equal(affords({ balance: 59, ledger: [] }, 60), false);
  assert.equal(affords({ balance: 60, ledger: [] }, 0), false);
});

test("the seeded wallet opens on a balance with a history behind it", () => {
  const w = seedWallet();
  assert.ok(w.balance > 0);
  assert.ok(w.ledger.length > 0);
  assert.ok(w.ledger.some((row) => row.delta < 0));
});

test("a long ad title is clipped so twelve rows still fit in a cookie", () => {
  const title = "Promoted “".concat("x".repeat(300), "”");
  const w = spend({ balance: 500, ledger: [] }, { credits: 20, label: title });
  assert.ok(w.ledger[0].label.length <= MAX_LABEL);
  assert.ok(w.ledger[0].label.endsWith("…"));
});

test("a full ledger of clipped rows stays well inside the cookie budget", () => {
  let w = seedWallet();
  for (let i = 0; i < LEDGER_CAP + 4; i += 1) {
    w = spend(w, {
      credits: 1,
      label: `Promoted “${"x".repeat(200)}”`,
      at: at + i,
    });
  }
  const cookie = `vezlist_wallet=${encodeURIComponent(JSON.stringify(w))}`;
  // Browsers drop a cookie over ~4KB without raising anything.
  assert.ok(cookie.length < 4000, `cookie was ${cookie.length} bytes`);
});
