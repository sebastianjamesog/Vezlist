import assert from "node:assert/strict";
import test from "node:test";
import {
  adForSite,
  adIdsForSite,
  MARKETPLACE_SITE,
  PERSONALS_SITE,
  sellerForListings,
  sellerIdsForListings,
} from "./siteContent.js";

const ads = {
  public: { id: "public", category: "Vehicles" },
  adult: { id: "adult", category: "Personals" },
};

test("listing bodies are available only on their own site", () => {
  assert.equal(adForSite(ads, "public", MARKETPLACE_SITE)?.id, "public");
  assert.equal(adForSite(ads, "adult", MARKETPLACE_SITE), null);
  assert.equal(adForSite(ads, "adult", PERSONALS_SITE)?.id, "adult");
  assert.equal(adForSite(ads, "public", PERSONALS_SITE), null);
  assert.equal(adForSite(ads, "missing", MARKETPLACE_SITE), null);
});

test("static listing ids cannot cross site scope", () => {
  assert.deepEqual(adIdsForSite(ads, MARKETPLACE_SITE), ["public"]);
  assert.deepEqual(adIdsForSite(ads, PERSONALS_SITE), ["adult"]);
});

test("seller routes require a listing on the current site", () => {
  const sellers = {
    market: { id: "market", listingIds: ["m1"] },
    personals: { id: "personals", listingIds: ["p1"] },
    empty: { id: "empty", listingIds: [] },
  };
  const marketListings = [{ id: "m1" }];

  assert.equal(
    sellerForListings(sellers, "market", marketListings)?.id,
    "market",
  );
  assert.equal(sellerForListings(sellers, "personals", marketListings), null);
  assert.deepEqual(sellerIdsForListings(sellers, marketListings), ["market"]);
});
