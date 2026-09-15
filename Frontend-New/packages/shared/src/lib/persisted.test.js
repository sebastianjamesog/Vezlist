// Run with: node --test src/lib/persisted.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeFlag,
  decodeIds,
  decodeObject,
  readWithMigration,
} from "./persisted.js";

/**
 * The decode half of `usePersisted` — the pure functions every context's
 * first render runs a stored string through. The hook itself needs a DOM
 * this repo's test runner does not have (no React testing library — see
 * `plan.md`'s "no component test framework"), but the decoding is where a
 * hand-edited localStorage value or a stale key from an older shape actually
 * gets judged, and that half is plain functions, testable the same way
 * `wallet.js`'s `normaliseWallet` is.
 */

/* -------------------------------------------------------------- decodeIds */

test("decodeIds reads a list of ids", () => {
  assert.deepEqual(decodeIds('["a1","a2"]'), ["a1", "a2"]);
  assert.deepEqual(decodeIds("[]"), []);
});

test("decodeIds drops entries that are not strings rather than keeping them", () => {
  assert.deepEqual(decodeIds('["a1", 5, null, {"id":"a2"}, "a3"]'), [
    "a1",
    "a3",
  ]);
});

test("decodeIds treats anything that is not an array as no ids at all", () => {
  assert.deepEqual(decodeIds('{"a1":true}'), []);
  assert.deepEqual(decodeIds('"a1"'), []);
  assert.deepEqual(decodeIds("5"), []);
  assert.deepEqual(decodeIds("null"), []);
});

test("decodeIds throws on unparsable JSON, same as JSON.parse — the hook's own catch covers it", () => {
  assert.throws(() => decodeIds("not json"));
});

/* ------------------------------------------------------------ decodeFlag */

test("decodeFlag reads the JSON boolean form and the legacy string form", () => {
  assert.equal(decodeFlag("true"), true);
  assert.equal(decodeFlag('"true"'), false, "the raw string, not JSON-decoded");
  assert.equal(decodeFlag("1"), true);
  assert.equal(decodeFlag("false"), false);
  assert.equal(decodeFlag("0"), false);
  assert.equal(decodeFlag(null), false);
  assert.equal(decodeFlag("nonsense"), false);
});

/* ---------------------------------------------------------- decodeObject */

test("decodeObject reads a stored object", () => {
  assert.deepEqual(decodeObject('{"balance":5}'), { balance: 5 });
  assert.deepEqual(decodeObject("{}"), {});
});

test('decodeObject refuses an array — it answers typeof "object" but has none of the keys a caller reads by name', () => {
  assert.equal(decodeObject("[1,2,3]"), null);
  assert.equal(decodeObject("[]"), null);
});

test("decodeObject refuses null and every primitive JSON can hold", () => {
  assert.equal(decodeObject("null"), null);
  assert.equal(decodeObject('"a string"'), null);
  assert.equal(decodeObject("5"), null);
  assert.equal(decodeObject("true"), null);
});

test("decodeObject throws on unparsable JSON, same as JSON.parse — the hook's own catch covers it", () => {
  assert.throws(() => decodeObject("{not json"));
});

/* ------------------------------------------------------ readWithMigration */

/** A store shaped like localStorage, over a plain object. */
const fakeStore = (seed = {}) => {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
};

test("a value under the current key is read without touching the old one", () => {
  const store = fakeStore({ "k:v1": '["a1"]', k: '["stale"]' });
  assert.equal(readWithMigration(store, "k:v1", "k"), '["a1"]');
  // The old slot is left exactly as it was: this is not the migration case.
  assert.equal(store.data.k, '["stale"]');
});

test("a value under the old key is carried forward, not thrown away", () => {
  const store = fakeStore({ k: '["a1","a2"]' });
  assert.equal(readWithMigration(store, "k:v1", "k"), '["a1","a2"]');
  assert.equal(store.data["k:v1"], '["a1","a2"]');
});

test("the old slot is cleared, so the fallback fires exactly once", () => {
  const store = fakeStore({ k: '["a1"]' });
  readWithMigration(store, "k:v1", "k");
  assert.equal(store.getItem("k"), null);

  // A later write under the new name must not be undone by a second migration.
  store.setItem("k:v1", '["a1","a2"]');
  assert.equal(readWithMigration(store, "k:v1", "k"), '["a1","a2"]');
});

test("nothing under either name is still nothing", () => {
  const store = fakeStore();
  assert.equal(readWithMigration(store, "k:v1", "k"), null);
  assert.equal(readWithMigration(store, "k:v1", null), null);
});

test("an unversioned caller passes no legacy key and is unaffected", () => {
  const store = fakeStore({ k: '["a1"]' });
  assert.equal(readWithMigration(store, "k"), '["a1"]');
});
