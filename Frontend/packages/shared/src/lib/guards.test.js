import test from "node:test";
import assert from "node:assert/strict";
import {
  arrayOf,
  hasId,
  isFiniteNumber,
  isNonEmptyString,
  isObject,
  isString,
} from "./guards.js";

test("isObject accepts a plain object and rejects everything else that answers typeof object", () => {
  assert.equal(isObject({}), true);
  assert.equal(isObject({ a: 1 }), true);
  assert.equal(isObject([]), false, "an array is not the object a store wants");
  assert.equal(isObject(null), false);
  assert.equal(isObject(undefined), false);
  assert.equal(isObject("nonsense"), false);
  assert.equal(isObject(5), false);
});

test("isString and isNonEmptyString", () => {
  assert.equal(isString("x"), true);
  assert.equal(isString(""), true);
  assert.equal(isString(5), false);
  assert.equal(isString(null), false);

  assert.equal(isNonEmptyString("x"), true);
  assert.equal(isNonEmptyString("   "), false, "whitespace is not content");
  assert.equal(isNonEmptyString(""), false);
  assert.equal(isNonEmptyString(5), false);
});

test("isFiniteNumber refuses NaN, Infinity and anything not a number", () => {
  assert.equal(isFiniteNumber(5), true);
  assert.equal(isFiniteNumber(0), true);
  assert.equal(isFiniteNumber(-3.5), true);
  assert.equal(isFiniteNumber(NaN), false);
  assert.equal(isFiniteNumber(Infinity), false);
  assert.equal(isFiniteNumber("5"), false);
  assert.equal(isFiniteNumber(null), false);
});

test("arrayOf never hands back anything but an array", () => {
  assert.deepEqual(arrayOf(null, isString), []);
  assert.deepEqual(arrayOf(undefined, isString), []);
  assert.deepEqual(arrayOf("nonsense", isString), []);
  assert.deepEqual(arrayOf({}, isString), []);
  assert.deepEqual(arrayOf([1, "a", 2, "b"], isString), ["a", "b"]);
  assert.deepEqual(
    arrayOf(["a", "b"]),
    ["a", "b"],
    "no guard keeps everything",
  );
});

test("hasId is the minimum a stored row must carry, nothing more", () => {
  assert.equal(hasId({ id: "a1" }), true);
  // Extra fields are exactly what a row is allowed to carry — this is not
  // where they would be dropped.
  assert.equal(hasId({ id: "a1", extra: "kept elsewhere" }), true);
  assert.equal(hasId({ id: "" }), false);
  assert.equal(
    hasId({ id: 5 }),
    false,
    "an id must be the string every key is",
  );
  assert.equal(hasId({}), false);
  assert.equal(hasId(null), false);
  assert.equal(hasId("a1"), false);
  assert.equal(hasId([{ id: "a1" }]), false, "an array is not a row");
});
