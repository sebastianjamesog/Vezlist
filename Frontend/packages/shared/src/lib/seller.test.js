import test from "node:test";
import assert from "node:assert/strict";
import { publicSeller, sellerProfilePath } from "./seller.js";

test("seller path encodes the seller, scope, and bounded page size", () => {
  assert.equal(sellerProfilePath("seller / one", "personals", 1), "/sellers/seller%20%2F%20one?site=PERSONALS&limit=1");
  assert.throws(() => sellerProfilePath("seller", "marketplace", 0), RangeError);
  assert.throws(() => sellerProfilePath("", "marketplace"), TypeError);
});

test("public seller projection ignores malformed API data", () => {
  assert.equal(publicSeller(null), null);
  assert.equal(publicSeller({ seller: { id: "id" } }), null);
  assert.deepEqual(publicSeller({ seller: { id: "id", displayName: "Ava", avatarUrl: null, verified: true } }), {
    id: "id", name: "Ava", avatar: null, verified: true, responseTime: null,
  });
});
