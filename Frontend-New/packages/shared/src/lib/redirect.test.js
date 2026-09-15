import test from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "./redirect.js";

test("a same-origin path is returned as-is", () => {
  assert.equal(safeNext("/settings"), "/settings");
  assert.equal(safeNext("/ads/42?tab=status"), "/ads/42?tab=status");
});

test("an absolute URL is refused", () => {
  assert.equal(safeNext("https://evil.example"), "/");
  assert.equal(safeNext("http://evil.example/phish"), "/");
});

test("a protocol-relative URL is refused — it is offsite despite the leading slash", () => {
  assert.equal(safeNext("//evil.example"), "/");
  assert.equal(safeNext("//evil.example/login"), "/");
});

test("a missing or non-string param falls back rather than throwing", () => {
  assert.equal(safeNext(null), "/");
  assert.equal(safeNext(undefined), "/");
  assert.equal(safeNext(""), "/");
  assert.equal(safeNext(42), "/");
  assert.equal(safeNext({}), "/");
});

test("the caller chooses where a refused value lands", () => {
  assert.equal(safeNext("https://evil.example", "/admin"), "/admin");
  assert.equal(safeNext("/reports", "/admin"), "/reports");
});

test("a scheme-relative path that only looks dangerous is still allowed", () => {
  // One slash then a word is an ordinary route, even when the word is a host
  // name. Only the double slash makes a browser treat it as an origin.
  assert.equal(safeNext("/evil.example"), "/evil.example");
});
