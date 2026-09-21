import test from "node:test";
import assert from "node:assert/strict";
import { readCookie } from "./cookieStore.js";

const jar = 'other_session=nope; vezlist_session=%7B"name"%3A"Sarah"%7D; x=1';

test("reads the named cookie and decodes it", () => {
  assert.equal(readCookie(jar, "vezlist_session"), '{"name":"Sarah"}');
});

test("a name only matches at the start of a pair", () => {
  assert.equal(readCookie(jar, "session"), null);
});

test("a missing cookie, and no cookies at all, are both null", () => {
  assert.equal(readCookie(jar, "vezlist_saved"), null);
  assert.equal(readCookie("", "vezlist_session"), null);
});

test("a hand-edited cookie with a broken percent-encoding reads as no value, not a thrown exception", () => {
  assert.equal(readCookie("vezlist_wallet=%zz", "vezlist_wallet"), null);
  assert.equal(readCookie("vezlist_wallet=%", "vezlist_wallet"), null);
  assert.equal(readCookie("vezlist_wallet=100%off", "vezlist_wallet"), null);
  // A cookie that decodes cleanly right next to a broken one is unaffected.
  assert.equal(
    readCookie("a=%zz; vezlist_session=%7B%7D", "vezlist_session"),
    "{}",
  );
});
