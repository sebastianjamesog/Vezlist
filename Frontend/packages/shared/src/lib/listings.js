import {
  ads as adBodies,
  listings,
  myAds,
  profile,
  settingsGroups,
} from "../data/mock.js";
import { EMPTY_DRAFT } from "./adDraft.js";
import { isFiniteNumber, isNonEmptyString, isObject } from "./guards.js";

/**
 * The seller's own ads: one seed function and one reducer, no React.
 *
 * Everything a poster does to an ad after the wizard — publishing it, editing
 * it, renewing it, promoting it, deleting it — is a verb below, and My Ads is
 * a view over the rows they produce. Before this existed, publishing was a
 * `console.log` and a toast that claimed otherwise, and My Ads held the mock in
 * a `useState` that a reload reset.
 *
 * A row is self-contained. My Ads used to join `myAds` against `listings` at
 * render time and drop any row whose listing was missing; the join happens once
 * here instead, because an ad posted through the wizard has no `listings` entry
 * to join to and never will — the mock is a fixture, not a table.
 *
 * The honest limit, stated once rather than in every screen: these writes land
 * in this origin's localStorage. There is no server, so the ad a poster submits
 * here does not reach the admin console's review queue (that store is a third
 * origin) and does not appear in Browse — which is the right *outcome* for a
 * pending ad even though it is reached for the wrong reason. Swapping this for
 * an API is one file, ListingsContext, because that is the only caller.
 */

/** A run on the board, first one or renewal. Thirty days either way. */
export const RUN_DAYS = 30;

/**
 * The personals group, carried on the row the same way the draft carries it:
 * present always, `""` when unanswered. Listed once because both directions of
 * the conversion below walk it, and a field named in one and not the other is
 * a detail a poster fills in and never sees again.
 */
const PERSONALS = [
  "age",
  "ethnicity",
  "availability",
  "height",
  "weight",
  "bodyStats",
  "hairColour",
  "eyeColour",
];

const text = (value) => (value ?? "").toString().trim();

/**
 * Draft → the content half of a row.
 *
 * The draft is the form's shape (`images` as objects, everything a string); a
 * row is the screen's shape. One conversion, here, so the wizard and the edit
 * sheet cannot produce two different kinds of row.
 *
 * Every field is named rather than the draft being spread through, for the
 * reason `editListing` in `adminStore` names its own: a spread would let a
 * stray key on the draft overwrite `status`, `views` or the id.
 */
function contentFrom(draft) {
  const fields = {
    title: text(draft.title),
    business: text(draft.business),
    category: draft.category ?? "",
    // `null` and not `""`: a row with no sub-category matches what the mock's
    // listings already carry, and `matches()` in filters.js reads it that way.
    subcategory: draft.subcategory || null,
    price:
      draft.price === "" || draft.price == null ? null : Number(draft.price),
    description: text(draft.description),
    location: text(draft.location),
    email: text(draft.email),
    phone: text(draft.phone),
    // Cover first, which is the promise the photos step makes on screen.
    photos: (draft.images ?? []).map((i) => i.url),
  };
  for (const key of PERSONALS) fields[key] = text(draft[key]);
  return fields;
}

/**
 * ...and back, to seed the edit sheet from an ad that already exists.
 *
 * Every key of `EMPTY_DRAFT` is filled, never left `undefined`: the steps read
 * `draft.title.length` and `draft.phone.replace` without guarding, so a missing
 * key is a crash on open rather than a blank field.
 *
 * The photo ids are derived from the row's id and the index — deterministic,
 * because `Math.random()` here would hand the server and the client two
 * different React keys for the same picture.
 */
export function draftFrom(ad) {
  const draft = {
    ...EMPTY_DRAFT,
    images: (ad.photos ?? []).map((url, i) => ({
      id: `${ad.id}-p${i}`,
      name: `Photo ${i + 1}`,
      url,
    })),
    title: ad.title ?? "",
    business: ad.business ?? "",
    category: ad.category ?? "",
    subcategory: ad.subcategory ?? "",
    price: ad.price == null ? "" : String(ad.price),
    description: ad.description ?? "",
    location: ad.location ?? "",
    email: ad.email ?? "",
    phone: ad.phone ?? "",
  };
  for (const key of PERSONALS) draft[key] = ad[key] ?? "";
  return draft;
}

/* ------------------------------------------------------------------- seed */

/**
 * One row, from the mock's `myAds` entry and the listing it names.
 *
 * The description comes off the ad body the listing points at, joined back into
 * the one string the wizard's textarea holds — the mock stores it as
 * paragraphs, the form asks for prose, and the edit sheet has to open on
 * something a poster recognises as what they wrote.
 */
function seedRow(mine, listing) {
  const body = adBodies[listing.adId];
  return {
    id: mine.id,
    /**
     * The detail page reads `ads` in the mock, so only an ad that came out of
     * the mock has a body to open. Ads posted through the wizard carry `null`
     * and My Ads does not link them anywhere — a link onto the not-found state
     * is worse than a title that is only a title.
     */
    adId: listing.adId,
    title: listing.title,
    business: listing.business,
    category: listing.category,
    subcategory: listing.subcategory ?? null,
    price: listing.price,
    description: (body?.description ?? []).join("\n\n"),
    location: listing.location,
    // The account's own contact details, because that is who these ads belong
    // to. The mock's listings carry neither, and the edit sheet's contact step
    // refuses to save a blank one.
    email: profile.email,
    phone: profile.phone,
    /**
     * One photo, the feed thumbnail. The mock's six-photo bodies are shared by
     * every non-personals listing, so lifting them here would give thirty-odd
     * different ads the same six pictures and none of them the thumbnail their
     * own card shows. A real set arrives with media storage — issue #12.
     */
    photos: [listing.image],
    status: mine.status,
    views: mine.views,
    saves: mine.saves,
    expiresInDays: mine.expiresInDays,
    boost: null,
    boostedUntilDays: 0,
  };
}

/**
 * `mock.js`, folded into the shape My Ads reads. Deterministic, always: this
 * runs on the server and again on the first client render, and a number that
 * differs between the two throws the whole tree out as a hydration mismatch.
 * Nothing here reads a clock or a random.
 */
export function buildSeed() {
  const byId = new Map(listings.map((l) => [l.id, l]));
  return {
    ads: myAds
      .filter((a) => byId.has(a.listingId))
      .map((a) => seedRow(a, byId.get(a.listingId))),
    /**
     * Monotonic, and in the state rather than a module variable — that is what
     * keeps `reducer` a function of its arguments while still telling two ads
     * published inside the same millisecond apart.
     */
    seq: 0,
  };
}

/* ---------------------------------------------------------------- reducer */

const find = (rows, id) => rows.find((r) => r.id === id);

const patch = (rows, id, fields) =>
  rows.map((r) => (r.id === id ? { ...r, ...fields } : r));

/** Every status an ad can be in — the one field the queue's tabs filter on. */
const AD_STATUSES = new Set(["pending", "active", "rejected", "expired"]);

/**
 * A stored row worth showing, not just an object with an id. `photos` is
 * checked because `removePhoto`'s callers assume it — `row.photos.includes`
 * runs with no fallback anywhere it is called — and `status` because a row
 * with no recognised status cannot be filed into any of My Ads' tabs at all.
 * Every other field a screen reads is left as the row carried it: a title
 * that is merely blank is a poster's problem, not storage corruption.
 */
function isValidAdRow(row) {
  return (
    isObject(row) &&
    isNonEmptyString(row.id) &&
    isNonEmptyString(row.title) &&
    Array.isArray(row.photos) &&
    AD_STATUSES.has(row.status)
  );
}

/**
 * The guard `rehydrate` runs stored state through before folding it over a
 * fresh seed — see `normaliseWallet` in `wallet.js` for the pattern this
 * follows. A malformed `ads` (not an array, or full of rows a screen cannot
 * render) is dropped rather than merged in, which is what stops a hand-edited
 * `localStorage` key or a stale shape from an older build reaching a `.map`
 * or `.filter` in My Ads. A top-level key this does not recognise — anything
 * that is not `ads` or `seq` — is dropped the same way: it is not one this
 * store or any screen over it reads, so keeping it would only carry storage
 * corruption one step further rather than any real data.
 */
export function normaliseAdsState(value) {
  if (!isObject(value)) return {};
  const next = {};
  if (Array.isArray(value.ads)) next.ads = value.ads.filter(isValidAdRow);
  if (isFiniteNumber(value.seq)) next.seq = Math.floor(value.seq);
  return next;
}

/**
 * Every verb a poster has, one action each. The clock arrives on the action
 * rather than being read here, so this stays pure and React's StrictMode
 * double-invoke cannot make two calls disagree.
 *
 * One rule runs through `publish`, `edit` and `renew`, and it is the moderation
 * model the admin console already implements: anything that puts new words in
 * front of readers goes past a moderator first. A new ad lands in review, an
 * edit to a live ad sends it back to review, and a repost of an expired ad
 * re-enters review rather than reappearing on the board unread.
 */
export function reducer(state, action) {
  const at = action.at ?? 0;

  switch (action.type) {
    case "publish": {
      const content = contentFrom(action.draft ?? {});
      // A draft with no title and no photos is not an ad. The wizard validates
      // every step before it gets here, so this only catches a call that
      // bypassed it.
      if (!content.title || !content.photos.length) return state;
      const seq = state.seq + 1;
      return {
        ...state,
        seq,
        ads: [
          {
            id: `ad-${at.toString(36)}-${seq.toString(36)}`,
            adId: null,
            ...content,
            status: "pending",
            // An ad in review has been seen by nobody, and saying so beats
            // opening on an invented number.
            views: 0,
            saves: 0,
            expiresInDays: RUN_DAYS,
            boost: null,
            boostedUntilDays: 0,
          },
          ...state.ads,
        ],
      };
    }

    case "edit": {
      const row = find(state.ads, action.id);
      if (!row) return state;
      const content = contentFrom(action.draft ?? {});
      if (!content.title || !content.photos.length) return state;
      return {
        ...state,
        ads: patch(state.ads, action.id, {
          ...content,
          /**
           * Live ads go back in the queue; the other two stay where they are.
           *
           * A pending ad is already queued, and re-stamping it would be a
           * no-op that reads as progress. An expired ad stays expired on
           * purpose: an edit is not a repost, it buys no new days on the
           * board, and quietly relisting an ad somebody was only tidying up
           * is a surprise. Renew is the action that relists, and it is the
           * button next to this one.
           */
          status: row.status === "active" ? "pending" : row.status,
        }),
      };
    }

    case "renew": {
      const row = find(state.ads, action.id);
      // Only an ad whose run has ended has a run to buy again.
      if (!row || row.status !== "expired") return state;
      return {
        ...state,
        ads: patch(state.ads, action.id, {
          status: "pending",
          expiresInDays: RUN_DAYS,
          // The promotion was bought for a run that is over. Carrying it into
          // the new one would be days nobody paid for.
          boost: null,
          boostedUntilDays: 0,
        }),
      };
    }

    case "promote": {
      const row = find(state.ads, action.id);
      const { tier } = action;
      if (!row || !tier) return state;
      // The charge is the wallet's business and happens before this dispatch —
      // see `confirmPromote` in My Ads. This records what was bought.
      return {
        ...state,
        ads: patch(state.ads, action.id, {
          boost: { id: tier.id, label: tier.label },
          boostedUntilDays: tier.days,
        }),
      };
    }

    case "remove": {
      if (!find(state.ads, action.id)) return state;
      return { ...state, ads: state.ads.filter((a) => a.id !== action.id) };
    }

    /**
     * Storage handing back what it kept, folded over a fresh seed rather than
     * used as-is: a key added to `buildSeed` since the stored copy was written
     * would otherwise arrive `undefined` and the screen reading it would throw
     * on `.filter`.
     */
    case "rehydrate":
      return { ...buildSeed(), ...normaliseAdsState(action.state) };

    default:
      return state;
  }
}

/* -------------------------------------------------------------- selectors */

/**
 * The rows behind one tab, and how many there are.
 *
 * They take the rows rather than the whole state because that is what the
 * screen holds — the provider hands out `ads`, not `{ ads, seq }` — and because
 * the tab body and the count on the tab label must be the same filter or the
 * label lies.
 */
export const byStatus = (ads, status) => ads.filter((a) => a.status === status);

export const countOf = (ads, status) => byStatus(ads, status).length;

/* ------------------------------------------------- contact reveal (#25) */

/**
 * How a buyer reaches a seller.
 *
 * There is no messaging in this product and none is planned — issue #2 was
 * closed not-planned, and the only two places anybody types at anybody else
 * are the Live stream chat and a Support ticket. So the contact details on an
 * ad are not a secondary affordance next to a Message button; they are the
 * whole channel, and everything below exists because Settings shipped toggles
 * called "Show phone on ads" and "Show email on ads", both subtitled "Buyers
 * tap Show to reveal it", governing a control that did not exist anywhere in
 * the app.
 *
 * Two channels and not one, because they are not one decision. A poster who
 * will take a call at any hour and a poster who wants everything in writing
 * are both ordinary, and a single "publish my contact details" switch would
 * make each of them publish the half they did not want. So there are two
 * switches, two masks, and two rows on the ad — and, deliberately, one budget
 * across both (see `REVEAL_LIMIT`).
 *
 * Both values are already on the model: `contentFrom` carries `phone` and
 * `email` off the wizard's contact step and `seedRow` fills them from the
 * account's profile. What was missing was the reader's half.
 */

/**
 * Where the seller's own preferences are kept. Settings writes this key;
 * the ad detail page reads it to decide whether a number may be shown at all.
 *
 * The honest limit, and it is a real one: there is no server, so there is no
 * per-seller preference to look up. This is one device's store, so a reader
 * and a seller sharing a browser share the switch. When accounts are real the
 * flag arrives on the ad row and `showsPhone` takes it from there instead —
 * every caller of this module is already asking the question in those words.
 */
export const SETTINGS_TOGGLES_KEY = "vezlist:settings-toggles";

/**
 * The seed's answer for every toggle, read once at module load rather than on
 * every mount — re-reading it per render is what threw away a saved toggle on
 * reload before this was hoisted.
 */
export const DEFAULT_TOGGLES = Object.fromEntries(
  settingsGroups.flatMap((g) =>
    g.items.filter((i) => i.type === "toggle").map((i) => [i.id, i.value]),
  ),
);

/** Has the seller agreed to their number being shown? */
export const showsPhone = (stored) =>
  ({ ...DEFAULT_TOGGLES, ...stored }).phone === true;

/**
 * ...and the same question for the address.
 *
 * The id is `contactEmail`, not `email`. There is an `email` toggle in the
 * Notifications group and it is the weekly digest — a marketing preference.
 * Keying both off one stored flag would mean unsubscribing from a newsletter
 * silently pulled a contact channel off every ad the account has running.
 */
export const showsEmail = (stored) =>
  ({ ...DEFAULT_TOGGLES, ...stored }).contactEmail === true;

/**
 * The number as it appears before anybody taps.
 *
 * The dialling code and the area stay — that is what tells a reader whether
 * this is a local seller before they spend one of their reveals on it — and
 * the part that identifies a person is what is held back. A number that does
 * not split into groups is masked whole rather than guessed at.
 */
export function maskPhone(phone) {
  const parts = (phone ?? "").toString().trim().split(/\s+/);
  if (parts.length < 3) return "•••• ••••";
  return parts.map((p, i) => (i < 2 ? p : "•".repeat(p.length))).join(" ");
}

/**
 * The address as it appears before anybody taps, on the same principle.
 *
 * Which half survives is the whole design of a mask, and for an address it is
 * the opposite half from a phone number's: the domain is the informative part
 * and the local part is the identifying one. `@gmail.com` and
 * `@victoria-realty.ca` tell a reader something worth knowing before they
 * spend a reveal — whether they are about to write to a person or to a
 * business — while the name in front of the `@` is exactly what a scraper is
 * after and tells the reader nothing they cannot already read off the ad.
 *
 * The dot count matches the hidden characters, the way `maskPhone` keeps each
 * hidden group's length: the mask is the shape of the value, so the row does
 * not lurch sideways when it resolves. Length is not the identifying part.
 *
 * Anything that is not an address with something on both sides of an `@` is
 * masked whole rather than half-guessed at — same rule, same reason, and the
 * reason this cannot throw on the malformed strings a hand-edited draft or an
 * older stored row can put on a row.
 */
export function maskEmail(email) {
  const value = (email ?? "").toString().trim();
  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1) return "••••••";
  return `${"•".repeat(at)}${value.slice(at)}`;
}

/** Nothing revealed yet. */
export const NO_REVEALS = { counts: {}, log: [] };

/**
 * Where a reader's reveals are kept, and what a seller's contact volume is
 * counted in. Exported so anything that wants to report the number — the
 * creator dashboard is the obvious candidate — reads the same store through
 * `usePersistedObject` rather than keeping a second count that can disagree.
 *
 * `v2` because the shape of the keys inside changed, not the shape of the
 * object: v1 counted per ad, this counts per ad *and channel* (`revealKey`).
 * A v1 store read as a v2 one would answer "not revealed" for every row while
 * its stale ad-keyed counts went on inflating `totalReveals` forever, so it is
 * left behind under its own key rather than migrated — a reader loses at worst
 * the memory of a tap, which is a good deal cheaper than a wrong count.
 */
export const REVEALS_KEY = "vezlist:reveals:v2";

/**
 * One reveal is one channel on one ad. Both halves are in the key, and the
 * separator is a colon because neither an ad id nor a channel name contains
 * one.
 */
export const revealKey = (adId, channel) => (adId ? `${adId}:${channel}` : "");

/**
 * The harvesting brake: six contact details an hour, per device.
 *
 * Six *details*, not six ads, and that distinction is the whole decision here.
 * Keying the budget by ad — which is what v1 did, when a phone number was the
 * only thing to open — would have meant that adding email to the page silently
 * doubled the ceiling: the same six taps would now walk off with six numbers
 * *and* six addresses, without anybody editing this constant or noticing that
 * the brake had been loosened. So the budget is shared across the two channels
 * and each one costs a slot. The ceiling on contact details leaving this board
 * per device per hour is the same number it has always been.
 *
 * What the reader loses is small and the right thing to lose: opening both
 * channels on one ad costs two of six, so a device can fully open three ads an
 * hour, or reach six sellers by whichever channel it picked. Someone working
 * down the board collecting addresses still hits the wall in a minute, and
 * somebody reopening the one ad they are actually interested in never sees it,
 * because re-revealing a channel already revealed is free (see `recordReveal`).
 */
export const REVEAL_LIMIT = 6;
export const REVEAL_WINDOW_MS = 60 * 60 * 1000;

const activeLog = (state, at) =>
  (state?.log ?? []).filter((t) => at - t < REVEAL_WINDOW_MS);

/**
 * Already asked for this one — it stays out, and costs nothing.
 *
 * Every function below takes a `key` and not an ad id: the caller decides what
 * a reveal is *of* by building the key, and since that key now names a channel
 * as well as an ad, nothing here has to know that phone and email exist. A
 * third channel is a `revealKey` call at the screen and no change at all here.
 */
export const isRevealed = (state, key) => (state?.counts?.[key] ?? 0) > 0;

/** How many more details this device may open in the current window. */
export const revealsLeft = (state, at) =>
  Math.max(0, REVEAL_LIMIT - activeLog(state, at).length);

export const canReveal = (state, key, at) =>
  isRevealed(state, key) || revealsLeft(state, at) > 0;

/**
 * Record one reveal. Pure: the clock is an argument, never read here.
 *
 * Three outcomes and the caller can tell them apart by identity — an unchanged
 * state back means the reveal was refused, which is what the screen turns into
 * "you've opened six contact details in the last hour" rather than a silent
 * no-op.
 */
export function recordReveal(state, key, at) {
  const current = state ?? NO_REVEALS;
  if (!key) return current;
  // Reopening a channel this reader has already seen is not a new reveal: it
  // is neither new contact volume for the seller nor another detail harvested,
  // so it costs nothing and is not counted twice. The *other* channel on the
  // same ad is a different key and does cost — that is the point of the key
  // carrying the channel.
  if (isRevealed(current, key)) return current;
  const log = activeLog(current, at);
  if (log.length >= REVEAL_LIMIT) return current;
  return {
    counts: { ...current.counts, [key]: (current.counts?.[key] ?? 0) + 1 },
    log: [...log, at],
  };
}

/**
 * How many readers asked for one channel on one ad, and for all of them.
 *
 * The honest limit again, and it is the reason no dashboard tile is being
 * built on this yet: with no server, a reveal is recorded in the *reader's*
 * browser. A seller reading this count is reading reveals that happened in
 * their own browser and nobody else's. It is a true number of a smaller thing
 * than "contact volume", and the tile that says otherwise should wait for the
 * backend rather than round the difference off.
 */
export const revealCount = (state, key) => state?.counts?.[key] ?? 0;

export const totalReveals = (state) =>
  Object.values(state?.counts ?? {}).reduce((sum, n) => sum + n, 0);
