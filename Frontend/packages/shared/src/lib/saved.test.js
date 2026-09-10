import test from "node:test";
import assert from "node:assert/strict";
import {
  createSavedState,
  dedupeSavedItems,
  isRemoteListingId,
  savedActions,
  savedListingToCard,
  savedListingsPath,
  savedStateReducer,
  savedStatusError,
  savedStatusPath,
} from "./saved.js";

const LISTING_ID = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";

function reduce(state, action) {
  return savedStateReducer(state, action);
}

function knownState(saved, totalCount) {
  return reduce(
    createSavedState("user-1"),
    savedActions.statusReceived(LISTING_ID, { saved, totalCount }),
  );
}

test("saved endpoint builders encode IDs, site, page size, and cursor", () => {
  assert.equal(
    savedStatusPath("listing / one", "personals"),
    "/listings/listing%20%2F%20one/saved?site=PERSONALS",
  );

  const path = savedListingsPath({
    site: "marketplace",
    limit: 12,
    cursor: "next+/=?& page",
  });
  const [pathname, query] = path.split("?");
  const params = new URLSearchParams(query);
  assert.equal(pathname, "/me/saved-listings");
  assert.equal(params.get("site"), "MARKETPLACE");
  assert.equal(params.get("limit"), "12");
  assert.equal(params.get("cursor"), "next+/=?& page");
  assert.equal(
    savedListingsPath({ site: "personals" }),
    "/me/saved-listings?site=PERSONALS&limit=24",
  );
});

test("remote listing eligibility accepts UUIDs and rejects legacy mock IDs", () => {
  assert.equal(isRemoteListingId(LISTING_ID), true);
  assert.equal(isRemoteListingId(LISTING_ID.toUpperCase()), true);
  assert.equal(isRemoteListingId("a1"), false);
  assert.equal(isRemoteListingId(null), false);
});

test("saved response maps to the established card contract and keeps savedAt", () => {
  const card = savedListingToCard(
    {
      id: LISTING_ID,
      title: "Red bike",
      businessName: "Island Cycle",
      price: "850.00",
      categoryId: "vehicles",
      categoryLabel: "Vehicles",
      provinceId: "bc",
      provinceLabel: "British Columbia",
      locationId: "bc-2",
      locationLabel: "Vancouver Island",
      imageUrl: null,
      photoCount: 3,
      verified: true,
      publishedAt: "2026-09-10T09:00:00Z",
      distanceKm: null,
      savedAt: "2026-09-10T09:30:00Z",
    },
    Date.parse("2026-09-10T10:00:00Z"),
  );

  assert.equal(card.id, LISTING_ID);
  assert.equal(card.adId, LISTING_ID);
  assert.equal(card.price, 850);
  assert.equal(card.image, "/icon.svg");
  assert.equal(card.postedMsAgo, 3_600_000);
  assert.equal(card.savedAt, "2026-09-10T09:30:00Z");
});

test("saved pagination deduplicates listing IDs while preserving first-page order", () => {
  const first = { id: "one", title: "First version" };
  const duplicate = { id: "one", title: "Later version" };
  const second = { listingId: "two" };
  assert.deepEqual(dedupeSavedItems([first, duplicate, second]), [
    first,
    second,
  ]);
});

test("optimistic save changes count once and commits the server result", () => {
  let state = knownState(false, 2);
  state = reduce(state, savedActions.optimisticSet(LISTING_ID, true, "save-1"));
  assert.equal(state.totalCount, 3);
  assert.deepEqual(
    {
      saved: state.byId[LISTING_ID].saved,
      pending: state.byId[LISTING_ID].pending,
    },
    { saved: true, pending: true },
  );

  const duplicate = reduce(
    state,
    savedActions.optimisticSet(LISTING_ID, true, "save-2"),
  );
  assert.strictEqual(duplicate, state);

  state = reduce(
    state,
    savedActions.mutationSucceeded(
      LISTING_ID,
      { saved: true, totalCount: 3 },
      "save-1",
    ),
  );
  assert.equal(state.totalCount, 3);
  assert.equal(state.byId[LISTING_ID].saved, true);
  assert.equal(state.byId[LISTING_ID].pending, false);
});

test("optimistic un-save commits without double-decrementing", () => {
  let state = knownState(true, 3);
  state = reduce(
    state,
    savedActions.optimisticSet(LISTING_ID, false, "remove-1"),
  );
  assert.equal(state.totalCount, 2);

  const duplicate = reduce(
    state,
    savedActions.optimisticSet(LISTING_ID, false, "remove-2"),
  );
  assert.strictEqual(duplicate, state);

  state = reduce(
    state,
    savedActions.mutationSucceeded(
      LISTING_ID,
      { saved: false, totalCount: 2 },
      "remove-1",
    ),
  );
  assert.equal(state.totalCount, 2);
  assert.equal(state.byId[LISTING_ID].saved, false);
  assert.equal(state.byId[LISTING_ID].pending, false);
});

test("failed save and un-save mutations roll back state and count", () => {
  let saveState = knownState(false, 2);
  saveState = reduce(
    saveState,
    savedActions.optimisticSet(LISTING_ID, true, "save-1"),
  );
  saveState = reduce(
    saveState,
    savedActions.mutationFailed(LISTING_ID, "save failed", "save-1"),
  );
  assert.equal(saveState.totalCount, 2);
  assert.equal(saveState.byId[LISTING_ID].saved, false);
  assert.equal(saveState.byId[LISTING_ID].pending, false);
  assert.equal(saveState.byId[LISTING_ID].error, "save failed");

  let removeState = knownState(true, 3);
  removeState = reduce(
    removeState,
    savedActions.optimisticSet(LISTING_ID, false, "remove-1"),
  );
  const staleResponse = reduce(
    removeState,
    savedActions.mutationFailed(LISTING_ID, "stale", "remove-old"),
  );
  assert.strictEqual(staleResponse, removeState);

  removeState = reduce(
    removeState,
    savedActions.mutationFailed(LISTING_ID, "remove failed", "remove-1"),
  );
  assert.equal(removeState.totalCount, 3);
  assert.equal(removeState.byId[LISTING_ID].saved, true);
  assert.equal(removeState.byId[LISTING_ID].pending, false);
  assert.equal(removeState.byId[LISTING_ID].error, "remove failed");
});

test("session reset clears all saved state for the previous account", () => {
  const populated = knownState(true, 4);
  const reset = reduce(populated, savedActions.resetSession("user-2"));
  assert.deepEqual(reset, createSavedState("user-2"));
});

test("late status hydration cannot regress a known count or revive a stale error", () => {
  let state = reduce(createSavedState("user-1"), savedActions.countReceived(5));
  state = reduce(
    state,
    savedActions.statusReceived(LISTING_ID, {
      saved: true,
      totalCount: 4,
    }),
  );

  assert.equal(state.totalCount, 5);
  assert.equal(
    savedStatusError(state.byId[LISTING_ID], new Error("stale request")),
    null,
  );
  assert.equal(
    savedStatusError({ known: false, error: null }, "request failed"),
    "request failed",
  );
});
