import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TOGGLES,
  NO_REVEALS,
  REVEAL_LIMIT,
  REVEAL_WINDOW_MS,
  RUN_DAYS,
  buildSeed,
  byStatus,
  canReveal,
  countOf,
  draftFrom,
  isRevealed,
  maskEmail,
  maskPhone,
  normaliseAdsState,
  recordReveal,
  reducer,
  revealCount,
  revealKey,
  revealsLeft,
  showsEmail,
  showsPhone,
  totalReveals,
} from "./listings.js";
import { EMPTY_DRAFT } from "./adDraft.js";

/**
 * Dispatch in order, the way the provider does. `at` is an input rather than
 * something the reducer reaches for, so the clock is held still here — and the
 * ids still come out distinct, which is exactly what `state.seq` is for.
 */
let clock = Date.parse("2026-09-01T10:00:00.000Z");
const run = (state, ...actions) =>
  actions.reduce((s, a) => reducer(s, { at: (clock += 1000), ...a }), state);

const ad = (state, id) => state.ads.find((a) => a.id === id);
const firstWith = (state, status) => byStatus(state.ads, status)[0];

/** A complete draft, the shape the wizard hands to `publish`. */
const draft = (over = {}) => ({
  ...EMPTY_DRAFT,
  images: [{ id: "i1", name: "one.jpg", url: "data:image/jpeg;base64,AAAA" }],
  title: "Cedar Bookshelf, Six Shelves",
  business: "Harbour Home Goods",
  category: "Home & Garden",
  price: "180",
  description: "Solid cedar, built in 2019, no marks on any of the shelves.",
  location: "Metro Vancouver",
  email: "sarah.jenkins@example.com",
  phone: "+1 250 555 0134",
  ...over,
});

test("the seed folds the join My Ads used to do at render time", () => {
  const state = buildSeed();
  assert.ok(state.ads.length > 0, "there are ads to manage");
  for (const row of state.ads) {
    // Every field the screen reads off a row, named exhaustively: one that
    // goes missing arrives as `undefined` at a card that calls
    // `.toLocaleString()` on it, and this is what catches it first.
    for (const key of [
      "id",
      "title",
      "business",
      "category",
      "price",
      "description",
      "location",
      "email",
      "phone",
      "photos",
      "status",
      "views",
      "saves",
      "expiresInDays",
    ]) {
      assert.notEqual(row[key], undefined, `${key} is set`);
    }
    assert.ok(row.photos.length > 0, "a row has a cover to show");
  }
});

test("the seed is deterministic, so the server and the client agree", () => {
  // The whole hydration rule in one assertion: nothing in the seed reads a
  // clock or a random, so two builds are the same tree.
  assert.deepEqual(buildSeed(), buildSeed());
});

test("publishing lands a pending ad at the top of the list", () => {
  const before = buildSeed();
  const after = run(before, { type: "publish", draft: draft() });

  assert.equal(after.ads.length, before.ads.length + 1);
  const row = after.ads[0];
  assert.equal(row.title, "Cedar Bookshelf, Six Shelves");
  assert.equal(row.status, "pending", "it goes to review, not straight live");
  assert.equal(row.expiresInDays, RUN_DAYS);
  // Nobody has seen an ad that is still in the queue.
  assert.equal(row.views, 0);
  assert.equal(row.saves, 0);
  assert.equal(
    countOf(after.ads, "pending"),
    countOf(before.ads, "pending") + 1,
  );
});

test("a published ad keeps the draft's photos, price and category", () => {
  const state = run(buildSeed(), {
    type: "publish",
    draft: draft({
      subcategory: "Furniture",
      images: [
        { id: "i1", name: "a.jpg", url: "data:image/jpeg;base64,AAAA" },
        { id: "i2", name: "b.jpg", url: "data:image/jpeg;base64,BBBB" },
      ],
    }),
  });
  const row = state.ads[0];

  assert.deepEqual(row.photos, [
    "data:image/jpeg;base64,AAAA",
    "data:image/jpeg;base64,BBBB",
  ]);
  assert.equal(row.price, 180, "the form's string becomes a number");
  assert.equal(row.subcategory, "Furniture");
  // No mock body to open, and My Ads reads this to decide whether to link.
  assert.equal(row.adId, null);
});

test("two ads published in the same millisecond get different ids", () => {
  const state = [1, 2, 3].reduce(
    (s) => reducer(s, { type: "publish", at: 1_000, draft: draft() }),
    buildSeed(),
  );
  const ids = state.ads.slice(0, 3).map((a) => a.id);
  assert.equal(new Set(ids).size, 3);
});

test("a draft with no title or no photo is not an ad", () => {
  const state = buildSeed();
  assert.equal(run(state, { type: "publish", draft: draft({ title: " " }) }), state); // prettier-ignore
  assert.equal(run(state, { type: "publish", draft: draft({ images: [] }) }), state); // prettier-ignore
});

test("editing a live ad sends it back to review", () => {
  const state = buildSeed();
  const live = firstWith(state, "active");
  const next = run(state, {
    type: "edit",
    id: live.id,
    draft: draftFrom({ ...live, price: 99 }),
  });

  const row = ad(next, live.id);
  assert.equal(row.price, 99);
  assert.equal(row.status, "pending", "an edited live ad re-enters the queue");
});

test("editing an ad already in review leaves it where it is", () => {
  const state = buildSeed();
  const queued = firstWith(state, "pending");
  const next = run(state, {
    type: "edit",
    id: queued.id,
    draft: draftFrom({ ...queued, title: "A better title entirely" }),
  });

  assert.equal(ad(next, queued.id).title, "A better title entirely");
  assert.equal(ad(next, queued.id).status, "pending");
});

test("editing an expired ad does not quietly relist it", () => {
  // An edit is not a repost: it buys no days on the board. Renew does that,
  // and it is the button beside this one.
  const state = buildSeed();
  const dead = firstWith(state, "expired");
  const next = run(state, {
    type: "edit",
    id: dead.id,
    draft: draftFrom({ ...dead, description: "Reduced — must go this week." }),
  });

  assert.equal(ad(next, dead.id).status, "expired");
  assert.equal(ad(next, dead.id).expiresInDays, dead.expiresInDays);
});

test("an edit rewrites the content and nothing else", () => {
  const state = buildSeed();
  const live = firstWith(state, "active");
  const next = run(state, {
    type: "edit",
    id: live.id,
    // The keys a form typo, or a hand-written dispatch, might smuggle in.
    draft: {
      ...draftFrom(live),
      id: "hijacked",
      views: 99_999,
      status: "active",
    },
  });

  const row = ad(next, live.id);
  assert.equal(row.id, live.id);
  assert.equal(
    row.views,
    live.views,
    "the numbers are not the poster's to set",
  );
  assert.equal(row.saves, live.saves);
});

test("editing an ad that is not there changes nothing", () => {
  const state = buildSeed();
  assert.equal(run(state, { type: "edit", id: "nope", draft: draft() }), state);
});

test("renewing an expired ad puts it back in the queue with a fresh run", () => {
  const state = buildSeed();
  const dead = firstWith(state, "expired");
  const next = run(state, { type: "renew", id: dead.id });

  const row = ad(next, dead.id);
  assert.equal(row.status, "pending");
  assert.equal(row.expiresInDays, RUN_DAYS);
  // The history it earned is still its own.
  assert.equal(row.views, dead.views);
});

test("there is nothing to renew on an ad that is still running", () => {
  const state = buildSeed();
  const live = firstWith(state, "active");
  assert.equal(run(state, { type: "renew", id: live.id }), state);
});

test("deleting drops the row, and deleting twice is not an error", () => {
  const state = buildSeed();
  const live = firstWith(state, "active");
  const next = run(state, { type: "remove", id: live.id });

  assert.equal(ad(next, live.id), undefined);
  assert.equal(next.ads.length, state.ads.length - 1);
  assert.equal(run(next, { type: "remove", id: live.id }), next);
});

test("a stored state is folded over a fresh seed, never used as-is", () => {
  // A key added to `buildSeed` since the stored copy was written must not
  // arrive `undefined` at a screen that calls `.filter` on it.
  const stored = { ads: [] };
  const next = reducer(buildSeed(), { type: "rehydrate", state: stored });

  assert.deepEqual(next.ads, []);
  assert.equal(next.seq, 0);
});

/* --------------------------------------------------------- rehydrate guard */

test("a value that is not a stored-state object falls back to the seed, never throws", () => {
  const seed = buildSeed();
  for (const junk of [
    null,
    "nonsense",
    5,
    [],
    { ads: "nope" },
    { ads: { 0: "x" } },
  ]) {
    const next = reducer(seed, { type: "rehydrate", state: junk });
    assert.deepEqual(next.ads, seed.ads, JSON.stringify(junk));
    assert.equal(next.seq, seed.seq, JSON.stringify(junk));
  }
});

test("an ads array full of rows a screen cannot render comes back empty, not thrown or half-trusted", () => {
  // The top-level shape ("ads is an array") is real, so it is not a reason to
  // fall all the way back to the seed — but not one of these rows is
  // renderable, so what survives the filter is an empty, safe list rather
  // than a `.map` in My Ads crashing on the first one.
  for (const ads of [
    [1, "two", null, { id: "a1" }],
    [{ id: "a1", title: "No photos, no status" }],
    [{ id: "a1", title: "t", photos: [], status: "made-up" }],
  ]) {
    const next = reducer(buildSeed(), { type: "rehydrate", state: { ads } });
    assert.deepEqual(next.ads, [], JSON.stringify(ads));
  }
});

test("a well-shaped ad row survives rehydrate, extra fields and all", () => {
  const row = {
    id: "a1",
    title: "Cedar Bookshelf",
    photos: ["https://example.com/a.jpg"],
    status: "active",
    // A field this build does not know about — the kind a future shape
    // might add, or a screen this store has never heard of writes.
    fromAFutureBuild: "kept",
  };
  const state = reducer(buildSeed(), {
    type: "rehydrate",
    state: { ads: [row], seq: 3.9 },
  });
  assert.deepEqual(state.ads, [row]);
  assert.equal(state.seq, 3, "a fractional seq is floored, not refused");
});

test("one malformed row does not sink the rest of the list", () => {
  const good = {
    id: "a1",
    title: "Good",
    photos: ["x.jpg"],
    status: "pending",
  };
  const state = reducer(buildSeed(), {
    type: "rehydrate",
    state: { ads: [good, { id: "a2", title: "No photos or status" }] },
  });
  assert.deepEqual(state.ads, [good]);
});

test("a top-level key nothing reads is dropped, not carried into state", () => {
  assert.deepEqual(normaliseAdsState({ ads: [], seq: 1, injected: "x" }), {
    ads: [],
    seq: 1,
  });
});

test("the edit sheet opens on every field the steps read", () => {
  const seeded = draftFrom(buildSeed().ads[0]);
  for (const key of Object.keys(EMPTY_DRAFT)) {
    assert.notEqual(seeded[key], undefined, `${key} is seeded, not undefined`);
  }
  assert.ok(seeded.images.length > 0, "the photos step opens on the cover");
  // Deterministic keys: a random id here is two different React keys for one
  // picture between the server render and the first client one.
  assert.deepEqual(
    draftFrom(buildSeed().ads[0]).images,
    draftFrom(buildSeed().ads[0]).images,
  );
});

test("saving an untouched draft leaves the words exactly as they were", () => {
  const state = buildSeed();
  const live = firstWith(state, "active");
  const next = run(state, {
    type: "edit",
    id: live.id,
    draft: draftFrom(live),
  });

  const row = ad(next, live.id);
  for (const key of ["title", "business", "category", "price", "photos"]) {
    assert.deepEqual(row[key], live[key], `${key} round-trips unchanged`);
  }
});

/* ------------------------------------------------- contact reveal (#25) */

test("every seeded ad carries the phone the reveal control is for", () => {
  for (const row of buildSeed().ads) {
    assert.ok(row.phone, `${row.id} has no number to reveal`);
  }
});

test("the mask keeps the dialling code and area and hides the rest", () => {
  assert.equal(maskPhone("+1 250 555 0134"), "+1 250 ••• ••••");
  // A number that does not split into groups is masked whole rather than
  // half-guessed at.
  assert.equal(maskPhone("2505550134"), "•••• ••••");
  assert.equal(maskPhone(""), "•••• ••••");
  assert.equal(maskPhone(null), "•••• ••••");
});

test("the seller's toggle is what decides whether there is a number at all", () => {
  assert.equal(showsPhone(null), DEFAULT_TOGGLES.phone);
  assert.equal(showsPhone({ phone: false }), false);
  assert.equal(showsPhone({ phone: true }), true);
  // A stored object that predates the toggle still answers the seed's default.
  assert.equal(showsPhone({ email: true }), DEFAULT_TOGGLES.phone);
});

test("a reveal is counted once and reopening the same ad is free", () => {
  const at = Date.parse("2026-09-02T09:00:00.000Z");
  const once = recordReveal(NO_REVEALS, "a1", at);
  assert.equal(revealCount(once, "a1"), 1);
  assert.ok(isRevealed(once, "a1"));

  const again = recordReveal(once, "a1", at + 5000);
  assert.equal(again, once, "a repeat reveal is the same state, untouched");
  assert.equal(revealsLeft(again, at + 5000), REVEAL_LIMIT - 1);
});

test("the limit stops the sixth-and-onwards different number in an hour", () => {
  const at = Date.parse("2026-09-02T09:00:00.000Z");
  let state = NO_REVEALS;
  for (let i = 0; i < REVEAL_LIMIT; i++) {
    state = recordReveal(state, `ad-${i}`, at + i * 1000);
  }
  assert.equal(revealsLeft(state, at), 0);
  assert.equal(totalReveals(state), REVEAL_LIMIT);

  const refused = recordReveal(state, "one-too-many", at + 10_000);
  assert.equal(refused, state, "a refused reveal changes nothing");
  assert.equal(canReveal(state, "one-too-many", at + 10_000), false);
  // ...but the ads already opened stay open, limit or no limit.
  assert.equal(canReveal(state, "ad-0", at + 10_000), true);
});

test("the window rolls: an hour later the budget is back", () => {
  const at = Date.parse("2026-09-02T09:00:00.000Z");
  let state = NO_REVEALS;
  for (let i = 0; i < REVEAL_LIMIT; i++) {
    state = recordReveal(state, `ad-${i}`, at + i * 1000);
  }
  // Past the window's end measured from the *last* of them, not the first.
  const later = at + REVEAL_LIMIT * 1000 + REVEAL_WINDOW_MS;
  assert.equal(revealsLeft(state, later), REVEAL_LIMIT);
  const next = recordReveal(state, "fresh", later);
  assert.equal(revealCount(next, "fresh"), 1);
  assert.equal(next.log.length, 1, "the expired timestamps are dropped");
});

test("an empty store answers every reader without throwing", () => {
  assert.equal(revealCount(null, "a1"), 0);
  assert.equal(totalReveals(null), 0);
  assert.equal(isRevealed(null, "a1"), false);
  assert.equal(recordReveal(null, "", 0), NO_REVEALS);
});

/* --------------------------------------------- the second channel: email */

test("every seeded ad carries the address the second reveal control is for", () => {
  for (const row of buildSeed().ads) {
    assert.ok(row.email, `${row.id} has no address to reveal`);
  }
});

test("the email mask keeps the domain and hides the name in front of it", () => {
  // The domain is the half worth having before you spend a reveal: it is what
  // tells a reader whether they are writing to a person or to a business.
  assert.equal(
    maskEmail("victoria.realty@example.com"),
    "•••••••••••••••@example.com",
  );
  assert.equal(maskEmail("sofia.t@example.com"), "•••••••@example.com");
  // The dot count is the length of what is hidden, the way `maskPhone` keeps
  // each hidden group's length — the mask is the shape of the value.
  assert.equal(maskEmail("a@b.co"), "•@b.co");
  // A local part containing an `@` is not something this has to be clever
  // about; the *last* one is the separator, so the domain still survives.
  assert.equal(maskEmail("odd@name@example.com"), "••••••••@example.com");
});

test("a malformed address is masked whole rather than half-guessed at", () => {
  assert.equal(maskEmail("notanemail"), "••••••");
  assert.equal(maskEmail("@nolocalpart.com"), "••••••");
  assert.equal(maskEmail("nodomain@"), "••••••");
  assert.equal(maskEmail("@"), "••••••");
  assert.equal(maskEmail("   "), "••••••");
  assert.equal(maskEmail(""), "••••••");
  assert.equal(maskEmail(null), "••••••");
  assert.equal(maskEmail(undefined), "••••••");
  // Not a string at all — a hand-edited store or an older row can hand this
  // anything, and none of it may throw on a page that is already rendering.
  assert.equal(maskEmail(42), "••••••");
  assert.equal(maskEmail({}), "••••••");
});

test("the address has its own switch, not the newsletter's", () => {
  assert.equal(showsEmail(null), DEFAULT_TOGGLES.contactEmail);
  assert.equal(showsEmail({ contactEmail: false }), false);
  assert.equal(showsEmail({ contactEmail: true }), true);
  /*
    The `email` id belongs to the weekly digest in the Notifications group.
    Turning the newsletter off must not pull the address off every ad the
    account has running, so `showsEmail` must not so much as look at it.
  */
  assert.equal(showsEmail({ email: false }), DEFAULT_TOGGLES.contactEmail);
  // ...and the two contact switches are independent of each other in both
  // directions, which is the whole reason there are two of them.
  assert.equal(showsEmail({ phone: false }), DEFAULT_TOGGLES.contactEmail);
  assert.equal(showsPhone({ contactEmail: false }), DEFAULT_TOGGLES.phone);
});

/* ------------------------------------------- one budget, two channels */

test("a reveal is per channel, so opening the phone leaves the email shut", () => {
  const at = Date.parse("2026-09-02T09:00:00.000Z");
  const state = recordReveal(NO_REVEALS, revealKey("a1", "phone"), at);

  assert.ok(isRevealed(state, revealKey("a1", "phone")));
  assert.equal(
    isRevealed(state, revealKey("a1", "email")),
    false,
    "one tap must not hand over both details on the ad",
  );
  assert.equal(revealsLeft(state, at), REVEAL_LIMIT - 1);
});

test("the two channels share one budget rather than getting six each", () => {
  const at = Date.parse("2026-09-02T09:00:00.000Z");
  let state = NO_REVEALS;

  // Three ads opened all the way: six details, and the budget is six details.
  for (const adId of ["a1", "a2", "a3"]) {
    for (const channel of ["phone", "email"]) {
      state = recordReveal(state, revealKey(adId, channel), at);
    }
  }
  assert.equal(totalReveals(state), REVEAL_LIMIT);
  assert.equal(revealsLeft(state, at), 0);

  /*
    The point of the decision, asserted: a device that has spent its hour on
    phone numbers cannot then walk the same rows again collecting addresses.
    If this ever passes, the ceiling on contact details leaving the board has
    quietly doubled without anyone editing REVEAL_LIMIT.
  */
  const refused = recordReveal(state, revealKey("a4", "email"), at + 1000);
  assert.equal(refused, state, "the seventh detail in an hour is refused");
  assert.equal(canReveal(state, revealKey("a4", "email"), at + 1000), false);
  // A channel already open stays open, budget or no budget.
  assert.equal(canReveal(state, revealKey("a1", "email"), at + 1000), true);
});

test("reopening a channel already revealed is still free", () => {
  const at = Date.parse("2026-09-02T09:00:00.000Z");
  const key = revealKey("a1", "email");
  const once = recordReveal(NO_REVEALS, key, at);
  const again = recordReveal(once, key, at + 5000);

  assert.equal(again, once, "a repeat reveal is the same state, untouched");
  assert.equal(revealCount(again, key), 1);
  assert.equal(revealsLeft(again, at + 5000), REVEAL_LIMIT - 1);
});

test("a key needs an ad to be a key at all", () => {
  assert.equal(revealKey("a1", "phone"), "a1:phone");
  // No ad id, no key — and `recordReveal` refuses an empty one, which is what
  // stops a route rendered without params from spending somebody's budget.
  assert.equal(revealKey("", "phone"), "");
  assert.equal(revealKey(undefined, "phone"), "");
  assert.equal(recordReveal(NO_REVEALS, revealKey("", "phone"), 0), NO_REVEALS);
});
