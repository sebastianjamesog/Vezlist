import { provinces } from "../data/locations.js";
import { ACTION_PERMISSION, ROLES, can } from "./adminRoles.js";
import {
  adminUsers,
  ads,
  allFaqs,
  cannedReplies,
  broadcasts,
  categories,
  contactChannels,
  ethnicities,
  faqCategories,
  homeCategories,
  liveStreams,
  listings,
  myAds,
  notifications,
  pendingTitles,
  people,
  personalsCategories,
  personalsListings,
  profile,
  rejectedTitles,
  reports,
  sellers,
  stories,
  supportTopics,
  ticketThreads,
  tickets,
} from "../data/mock.js";
// The one shape the console shares with the public boards: a report built
// there and a report accepted here are the same function's output.
import { buildReport } from "./reports.js";
import {
  hasId,
  isFiniteNumber,
  isNonEmptyString,
  isObject,
  isString,
} from "./guards.js";

/**
 * The console's whole model: one seed function and one reducer, no React.
 *
 * This is the file to read to understand the admin. Every screen is a view
 * over the state `buildSeed()` returns and a dispatcher of the verbs below;
 * nothing else in the console mutates anything.
 *
 * The honest limit, stated once here rather than in every screen: these writes
 * land in the console's own localStorage. The public sites are two other
 * origins with two other storages and no server between them, so an approval
 * here does not publish an ad there. Swapping this for an API is one file —
 * AdminDataContext — because that is the only place this module is called.
 */

/** Everything the seed derives is stamped against one fixed instant. */
const SEED_AT = Date.parse("2026-08-20T09:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Newest entries first, and the tail is dropped rather than kept forever. */
export const AUDIT_CAP = 200;

/**
 * Same reasoning as `AUDIT_CAP`, applied to the one other collection that
 * grows on every dispatch rather than only when an admin deliberately adds a
 * row: a broadcast sent to the whole user base every day for a year is a
 * localStorage blob no session needs to carry in full.
 */
export const BROADCAST_CAP = 200;

/**
 * FNV-1a. Listings with no `myAds` row still need view and save counts, and
 * `Math.random()` would render one number on the server and a different one on
 * the client — React throws out the whole tree when that happens. A hash of
 * the id is stable in both places and across reloads.
 */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");

const byListingId = new Map(myAds.map((a) => [a.listingId, a]));

/**
 * One listing row. `site` is stamped here, once, from the array the listing
 * came out of — every screen filters on it and nothing re-derives it.
 */
function listingRow(l, site, ownerByName) {
  const mine = byListingId.get(l.id);
  const rejection = rejectedTitles.get(l.title);
  const status = rejection
    ? "rejected"
    : (mine?.status ?? (pendingTitles.has(l.title) ? "pending" : "active"));
  // The mock carries two full ad bodies and thirty-five feed rows, so a row
  // borrows the body its `adId` points at. Folded in here rather than looked
  // up by the detail screen: screens read the store and nothing else, which is
  // what keeps the swap to an API down to one file.
  const body = ads[l.adId];

  return {
    id: l.id,
    site,
    title: l.title,
    business: l.business,
    // Ownership is an id, resolved once here. Joining on the display name at
    // read time is what made the user table and the detail screen disagree —
    // and `people` has three profiles called "Priya S.", so a name is not an
    // identity in this data.
    ownerId: ownerByName.get(l.business) ?? null,
    categoryId: l.categoryId,
    category: l.category,
    // The optional second level, carried onto the row rather than resolved at
    // read time. The console has to count the ads filed under one sub-category
    // *before* an owner removes it, and a warning that arrives after the click
    // is not a warning.
    subcategory: l.subcategory ?? null,
    personalsCategory: l.personalsCategory ?? null,
    location: l.location,
    province: l.province,
    price: l.price,
    image: l.image,
    adId: l.adId,
    photos: body?.photos ?? [l.image],
    // An array of paragraphs, which is the shape the mock's ad bodies use.
    description: body?.description ?? [],
    specs: body?.specs ?? [],
    verified: l.verified,
    postedMsAgo: l.postedMsAgo,
    status,
    rejectionReason: rejection ?? null,
    // Live ads carry the real numbers where My Ads has them and derived ones
    // otherwise; an ad still in review has been seen by nobody.
    views: mine?.views ?? (status === "active" ? 40 + (hash(l.id) % 1860) : 0),
    saves: mine?.saves ?? (status === "active" ? hash(`${l.id}s`) % 90 : 0),
    expiresInDays: mine?.expiresInDays ?? (status === "expired" ? 0 : 30),
  };
}

/**
 * Sellers, personals profiles and the account holder, in one table.
 *
 * `listingIds` is deliberately NOT set here. The mock disagrees with itself
 * about ownership — `sellers.listingIds` and `myAds` both name ads whose
 * `business` is somebody else — and a user table that claims four ads beside a
 * detail screen showing none is worse than either answer alone. So ownership
 * is derived once, in `buildSeed`, from the one rule every screen can also
 * see: the name the ad was posted under.
 */
function userRows() {
  const fromSellers = Object.values(sellers).map((s) => ({
    id: s.id,
    kind: "seller",
    site: "marketplace",
    name: s.name,
    avatar: s.avatar,
    location: s.location,
    joined: s.since,
    verified: true,
    status: "active",
  }));

  const fromPeople = people.map((p) => ({
    id: p.id,
    kind: "person",
    site: "personals",
    name: p.name,
    avatar: p.avatar,
    location: "Personals board",
    joined: 2025,
    verified: p.badge === "verified",
    status: "active",
  }));

  const account = {
    id: "u-me",
    kind: "member",
    site: "marketplace",
    name: profile.name,
    email: profile.email,
    avatar: profile.avatar,
    location: profile.location,
    joined: 2026 - profile.yearsActive,
    verified: profile.verified,
    status: "active",
  };

  /**
   * ...and one account for every other name ads were posted under.
   *
   * `sellers` describes two of them; the feed carries thirty-odd. Without this
   * most ads answer to nobody — the users table reads "0 live ads" down the
   * column and every seller card on a detail screen says the account is
   * missing. A board has an account behind each listing, so the console shows
   * one.
   */
  const known = new Set(
    [account, ...fromSellers, ...fromPeople].map((u) => u.name),
  );
  const derived = new Map();
  for (const [rows, site] of [
    [listings, "marketplace"],
    [personalsListings, "personals"],
  ]) {
    for (const l of rows) {
      if (known.has(l.business) || derived.has(l.business)) continue;
      derived.set(l.business, {
        id: `b-${slug(l.business).replace(/\./g, "-")}`,
        // On the marketplace a poster is a business; on the board it is a
        // person. The two boards do not sell the same kind of thing.
        kind: site === "personals" ? "person" : "seller",
        site,
        name: l.business,
        avatar: `https://picsum.photos/seed/${slug(l.business)}/160/160`,
        location: l.location,
        joined: 2024,
        verified: false,
        status: "active",
      });
    }
  }

  // Emails are derived from the name, and `people` carries "Priya S." three
  // times — so a bare slug would hand three different accounts one address and
  // make them indistinguishable in the users table. The id breaks the tie.
  const seen = new Map();
  return [account, ...fromSellers, ...fromPeople, ...derived.values()].map(
    (u) => {
      if (u.email) return u;
      const base = slug(u.name);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return {
        ...u,
        email: `${base}${n > 1 ? `.${u.id}` : ""}@example.com`,
      };
    },
  );
}

/** Public ticket statuses are prose; the console sorts on two words. */
const TICKET_STATUS = { "In Progress": "open", Resolved: "resolved" };

function ticketRows() {
  return tickets.map((t) => {
    const thread = ticketThreads[t.id];
    return {
      id: t.id,
      subject: thread?.subject ?? t.title,
      status: TICKET_STATUS[t.status] ?? "open",
      site: "marketplace",
      requester: profile.name,
      icon: t.icon,
      opened: thread?.opened ?? t.meta,
      openedMsAgo: (t.id === "1234" ? 3 : 8) * DAY,
      // Unassigned until somebody picks it up — an open ticket nobody owns is
      // the one the queue is for.
      assigneeId: null,
      messages: (thread?.messages ?? []).map((m) => ({ ...m })),
    };
  });
}

/**
 * The account a suspension appeal in the demo seed points at.
 *
 * `userRows()` gives Sofia R. no listings under the id-based ownership rule
 * (see the comment there), which is exactly why she is the one seeded
 * suspended: reversing this later, on the appeal below, has one thing to
 * change — her `status` — and nothing else to get wrong.
 */
const SEED_SUSPENDED_USER_ID = "s2";

/** A console that opens with an empty audit feed looks broken, not new. */
const seedAudit = [
  /**
   * Newest first, like the module doc says. Six entries now instead of
   * three: the three that were already here, plus the account suspension and
   * the two appeals against it and against the rejected listing below —
   * logged by a moderator, never by the affected member, for the reason
   * `raiseAppeal`'s docstring gives.
   */
  {
    id: "au-seed-6",
    at: SEED_AT - 1 * HOUR,
    actor: "Priya Nair",
    action: "raiseAppeal",
    entity: "appeal",
    entityId: "ap-seed-1",
    note: "Theo L. — Someone to Watch Films With",
  },
  {
    id: "au-seed-5",
    at: SEED_AT - 2 * HOUR,
    actor: "Priya Nair",
    action: "approve",
    entity: "listing",
    entityId: "l31",
    note: "Saturday Night Jazz at the Wharf",
  },
  {
    id: "au-seed-4",
    at: SEED_AT - 3 * HOUR,
    actor: "Priya Nair",
    action: "raiseAppeal",
    entity: "appeal",
    entityId: "ap-seed-2",
    note: "Sofia R. — account suspension",
  },
  {
    id: "au-seed-3",
    at: SEED_AT - 6 * HOUR,
    actor: "Sam Okafor",
    action: "resolveReport",
    entity: "report",
    entityId: "r6",
    note: "Duplicate posting — merged to one ad",
  },
  {
    id: "au-seed-2",
    at: SEED_AT - 10 * HOUR,
    actor: "Priya Nair",
    action: "suspendUser",
    entity: "user",
    entityId: SEED_SUSPENDED_USER_ID,
    note: "Repeated no-shows reported by three buyers.",
  },
  {
    id: "au-seed-1",
    at: SEED_AT - 30 * HOUR,
    actor: "Priya Nair",
    action: "reject",
    entity: "listing",
    entityId: "l18",
    note: "Contact details in the photos.",
  },
];

/**
 * Two appeals, pre-filed, so the queue Task 2 adds is demonstrable on first
 * load rather than only after clicking "Log appeal" yourself.
 *
 * Both point at entities the seed above already put in an appealable state:
 * `l18` (rejected) and `SEED_SUSPENDED_USER_ID` (suspended). Ids are fixed
 * strings rather than derived from `SEED_AT`, unlike the audit log's, because
 * the audit entries above name them directly and both have to agree.
 */
const seedAppeals = [
  {
    id: "ap-seed-1",
    at: SEED_AT - 1 * HOUR,
    site: "personals",
    targetType: "listing",
    targetId: "l18",
    targetLabel: "Someone to Watch Films With",
    originalAction: "reject",
    originalNote: "Contact details in the photos.",
    appellant: "Theo L.",
    message:
      "I re-cropped the photo before reposting — there's no phone number or handle in it now.",
    status: "pending",
    decidedNote: "",
    raisedMsAgo: 1 * HOUR,
  },
  {
    id: "ap-seed-2",
    at: SEED_AT - 3 * HOUR,
    site: "marketplace",
    targetType: "user",
    targetId: SEED_SUSPENDED_USER_ID,
    targetLabel: "Sofia R.",
    originalAction: "suspendUser",
    originalNote: "Repeated no-shows reported by three buyers.",
    appellant: "Sofia R.",
    message:
      "Two of the three buyers cancelled on me first — I have the message threads if support wants to see them.",
    status: "pending",
    decidedNote: "",
    raisedMsAgo: 3 * HOUR,
  },
];

export const DEFAULT_SETTINGS = {
  ageGateTitle: "This board is for adults.",
  ageGateBody:
    "Personals carries adult content. Confirm you are 18 or older to continue.",
  discreetByDefault: true,
  liveEnabled: true,
  statusEnabled: true,
  autoApproveMarketplace: false,
  autoApprovePersonals: false,
  reviewSlaHours: 2,
  ticketSlaHours: 24,
  // Reports and appeals share the same shape of clock: a queue row is late
  // once it has sat open longer than this, the way `ticketSlaHours` already
  // governs Tickets.
  reportSlaHours: 48,
};

/** `mock.js`, folded into one admin-shaped state. Deterministic, always. */
export function buildSeed() {
  const users = userRows();
  // First account with a given display name owns what was posted under it.
  // Ownership cannot be shared, and the mock has three "Priya S." profiles —
  // so somebody has to win, and it may as well be deterministic.
  const ownerByName = new Map();
  for (const u of users) {
    if (!ownerByName.has(u.name)) ownerByName.set(u.name, u.id);
  }

  const rows = [
    ...listings.map((l) => listingRow(l, "marketplace", ownerByName)),
    ...personalsListings.map((l) => listingRow(l, "personals", ownerByName)),
  ];

  return {
    listings: rows,
    // Derived from the same rule the screens read, so the count in the table
    // and the list on the detail screen can never disagree.
    users: users.map((u) => ({
      ...u,
      listingIds: rows.filter((l) => l.ownerId === u.id).map((l) => l.id),
      // One account seeded already suspended, so the appeals queue below has
      // a real suspension to reconsider rather than needing a moderator to
      // suspend somebody first. Set here rather than through `suspendUser`
      // itself: the seed is data, not a sequence of dispatches, the way
      // `rejectedTitles` already marks a listing rejected without routing it
      // through `reject`.
      status: u.id === SEED_SUSPENDED_USER_ID ? "suspended" : u.status,
    })),
    appeals: seedAppeals.map((a) => ({ ...a })),
    tickets: ticketRows(),
    reports: reports.map((r) => ({ ...r })),
    streams: liveStreams.map((s, i) => ({
      ...s,
      site: "personals",
      // One ended broadcast, so the screen has both states out of the box.
      status: i === 4 ? "ended" : "live",
    })),
    stories: stories
      .filter((s) => !s.own)
      .map((s) => ({ ...s, site: "personals", updates: [...s.updates] })),
    faqs: allFaqs.map((f, i) => ({ id: `faq${i + 1}`, ...f })),
    faqCategories: [...faqCategories],
    topics: supportTopics.map((t) => ({ ...t })),
    channels: contactChannels.map((c) => ({ ...c })),
    // `subs` is copied out of the mock rather than spread through by
    // reference, for the reason `provinces.areas` just below is: the console
    // owns its own copy of the taxonomy, and a state that shares an array with
    // `mock.js` is one careless splice away from editing what the public sites
    // read out of the module cache.
    categories: categories.map((c) => ({
      ...c,
      primary: Boolean(c.primary),
      subs: [...(c.subs ?? [])],
    })),
    homeCategories: [...homeCategories],
    // The personals board is described by two flat word-lists of its own. The
    // marketplace's nineteen categories name objects, and none of them fits a
    // person — so the board carries its own vocabulary, and the console has to
    // edit it or it is only half a taxonomy screen.
    personalsCategories: [...personalsCategories],
    ethnicities: [...ethnicities],
    provinces: provinces.map((p) => ({ ...p, areas: [...p.areas] })),
    notifications: notifications.map((n) => ({ ...n })),
    broadcasts: broadcasts.map((b) => ({ ...b })),
    admins: adminUsers.map((a) => ({ ...a })),
    cannedReplies: cannedReplies.map((r) => ({ ...r })),
    settings: { ...DEFAULT_SETTINGS },
    audit: seedAudit.map((a) => ({ ...a })),
    // Monotonic, and in the state rather than in a module variable — that is
    // what lets two entries written inside the same millisecond still differ,
    // and what keeps `reducer` a function of its arguments.
    auditSeq: 0,
  };
}

/* ------------------------------------------------------------------ audit */

/**
 * Every handler below routes through this, so "did anything change without a
 * record?" has one answer. Newest first; the tail past AUDIT_CAP is dropped.
 *
 * The clock arrives on the action and the sequence lives in the state, so this
 * is a function of `(state, action)` and nothing else — which is what the
 * docstring on `reducer` claims and what React's StrictMode double-invoke
 * would otherwise expose. A bulk approve dispatches a dozen actions inside one
 * millisecond, so the timestamp alone is not a unique id; the sequence is.
 */
function log(state, next, entry) {
  const seq = state.auditSeq + 1;
  const at = entry.at ?? 0;
  const line = {
    id: `au${at.toString(36)}-${seq.toString(36)}`,
    at,
    actor: entry.actor ?? "Unknown",
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    note: entry.note ?? "",
  };
  // ponytail: audit capped at 200 entries — page it out of a real store when
  // there is one to page.
  return {
    ...next,
    auditSeq: seq,
    audit: [line, ...state.audit].slice(0, AUDIT_CAP),
  };
}

/** Replace one row in one collection, leaving the rest untouched. */
const patch = (rows, id, fields) =>
  rows.map((r) => (r.id === id ? { ...r, ...fields } : r));

const find = (rows, id) => rows.find((r) => r.id === id);

const trimmed = (value) => (value ?? "").trim();

/**
 * The state keys `addTerm` / `removeTerm` / `reorderTerm` are allowed to name.
 * Both are personals-only vocabularies held as plain strings rather than rows,
 * because a person picks the word they use for themselves and a taxonomy with
 * ids would make them pick twice.
 */
export const TERM_LISTS = new Set(["personalsCategories", "ethnicities"]);

/** Role ids an admin row may carry — anything else is a typo, not a tier. */
const ROLE_IDS = new Set(Object.keys(ROLES));

/**
 * An id nothing in `rows` already answers to.
 *
 * Adding a category called "Vehicles" derives the id `vehicles`, which the seed
 * already holds — and two rows sharing an id means a duplicate React key, a
 * `patch` that edits both, and a delete that removes both. Suffixing is ugly
 * and correct; a server would use a sequence.
 */
function freeId(rows, base) {
  if (!find(rows, base)) return base;
  let n = 2;
  while (find(rows, `${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/* ------------------------------------------------------------ rehydration */

/**
 * Every collection that is an array of id-keyed rows, and nothing more
 * specific than that a row exists and has an id — `find`/`patch` are the only
 * thing every one of these has in common. Sixteen collections is too many to
 * write a per-field schema for each without the schema drifting from the
 * shapes above it the moment either one changes, so this is the floor, not
 * the ceiling: `ROW_CHECKS` below adds the one extra requirement a handful of
 * these actually lean on without a `?? []` to fall back on.
 */
const ID_ROW_COLLECTIONS = [
  "listings",
  "users",
  "tickets",
  "reports",
  "appeals",
  "streams",
  "stories",
  "faqs",
  "topics",
  "channels",
  "categories",
  "notifications",
  "broadcasts",
  "admins",
  "cannedReplies",
  "audit",
];

/** Flat lists of words, not rows — the personals vocabularies and the two menus. */
const STRING_LIST_COLLECTIONS = [
  "faqCategories",
  "homeCategories",
  "personalsCategories",
  "ethnicities",
];

const APPEAL_STATUSES = new Set(["pending", "upheld", "overturned"]);

/**
 * The one extra check a handful of collections need beyond `hasId`, because
 * the reducer reads a nested field on them with no fallback — unlike
 * `category.subs` or `province`'s own entry below, which every read already
 * guards with `?? []`:
 *
 * - `listings`: `removePhoto` calls `row.photos.includes(...)` directly.
 * - `tickets`: `replyTicket` calls `row.messages.at(-1)` directly.
 * - `stories`: `removeUpdate` calls `story.updates.filter(...)` directly.
 * - `reports`/`appeals`: the fields the queues and the duplicate checks
 *   (`report`'s and `raiseAppeal`'s) actually key on, mirroring the check
 *   `reports.js`'s own `normaliseReportsState` applies to the public store.
 *
 * A row that fails its collection's check here is dropped the same way one
 * that fails `hasId` is — this is not a second, stricter pass, it is the
 * first one finishing.
 */
const ROW_CHECKS = {
  listings: (row) => Array.isArray(row.photos),
  tickets: (row) => Array.isArray(row.messages),
  stories: (row) => Array.isArray(row.updates),
  reports: (row) =>
    isNonEmptyString(row.targetType) && isNonEmptyString(row.targetId),
  appeals: (row) =>
    isNonEmptyString(row.targetType) &&
    isNonEmptyString(row.targetId) &&
    APPEAL_STATUSES.has(row.status),
};

const isValidRow = (collection, row) =>
  hasId(row) && (ROW_CHECKS[collection]?.(row) ?? true);

/**
 * The guard `rehydrate` runs stored state through before folding it over a
 * fresh seed — the same pattern `normaliseAdsState` in `listings.js` sets,
 * scaled to sixteen collections instead of one. Each collection is checked
 * against its own expected shape (an array of id-rows, a flat list of
 * strings, or — `provinces` and `settings` — something more specific still);
 * one that fails is left out of the result entirely, so the spread in
 * `rehydrate` falls back to `buildSeed()`'s copy rather than merging in a
 * `.filter` call's worth of `undefined`. A top-level key this function does
 * not recognise is dropped the same way: nothing downstream reads it by that
 * name, so carrying it forward would not be tolerance, it would be corruption
 * handed to the next reader. Within a row that *is* the right shape, every
 * field this does not explicitly check is left exactly as it arrived.
 */
export function normaliseAdminState(value) {
  if (!isObject(value)) return {};
  const next = {};

  for (const collection of ID_ROW_COLLECTIONS) {
    if (Array.isArray(value[collection])) {
      next[collection] = value[collection].filter((row) =>
        isValidRow(collection, row),
      );
    }
  }

  for (const collection of STRING_LIST_COLLECTIONS) {
    if (Array.isArray(value[collection])) {
      next[collection] = value[collection].filter(isString);
    }
  }

  // `addArea`/`removeArea` call `province.areas.includes(...)` with no
  // fallback, so a province with no `areas` array at all is worse than one
  // that is merely missing from storage.
  if (Array.isArray(value.provinces)) {
    next.provinces = value.provinces
      .filter((p) => hasId(p) && Array.isArray(p.areas))
      .map((p) => ({ ...p, areas: p.areas.filter(isString) }));
  }

  if (isObject(value.settings)) next.settings = value.settings;

  if (isFiniteNumber(value.auditSeq)) {
    next.auditSeq = Math.floor(value.auditSeq);
  }

  return next;
}

/* ---------------------------------------------------------------- reducer */

/**
 * Every admin verb, one action each. `actor` rides on the action rather than
 * living in the store: the reducer is pure, and who is signed in is the
 * caller's fact, not the data's.
 */
export function reducer(state, action) {
  const actor = action.actor;
  // The wall clock is an input, not something the reducer reaches for.
  const at = action.at ?? 0;

  /**
   * Permission is checked here as well as in the screens.
   *
   * Hiding a button stops the button; it does not stop the dispatch. Every
   * mutation passes through this function, so this is the one place that can
   * answer "was this allowed?" for all of them. A refused action returns the
   * state unchanged — the same shape as any other no-op — rather than throwing,
   * because a moderator clicking something stale should get nothing, not a
   * crash.
   */
  const needed = ACTION_PERMISSION[action.type];
  if (needed && !can(action.role, needed)) return state;

  switch (action.type) {
    /* ---- listings ---- */
    case "approve": {
      const row = find(state.listings, action.id);
      if (!row) return state;
      return log(
        state,
        {
          ...state,
          listings: patch(state.listings, action.id, {
            status: "active",
            rejectionReason: null,
          }),
        },
        {
          actor,
          at,
          action: "approve",
          entity: "listing",
          entityId: action.id,
          note: row.title,
        },
      );
    }

    case "reject": {
      const row = find(state.listings, action.id);
      if (!row) return state;
      // A rejection with no reason is a support ticket waiting to happen, so
      // the reason is what the audit entry carries.
      const reason = trimmed(action.reason) || "No reason given";
      return log(
        state,
        {
          ...state,
          listings: patch(state.listings, action.id, {
            status: "rejected",
            rejectionReason: reason,
          }),
        },
        {
          actor,
          at,
          action: "reject",
          entity: "listing",
          entityId: action.id,
          note: reason,
        },
      );
    }

    case "toggleVerified": {
      const row = find(state.listings, action.id);
      if (!row) return state;
      return log(
        state,
        {
          ...state,
          listings: patch(state.listings, action.id, {
            verified: !row.verified,
          }),
        },
        {
          actor,
          at,
          action: row.verified ? "unverifyListing" : "verifyListing",
          entity: "listing",
          entityId: action.id,
          note: row.title,
        },
      );
    }

    case "expire": {
      const row = find(state.listings, action.id);
      if (!row) return state;
      return log(
        state,
        {
          ...state,
          listings: patch(state.listings, action.id, {
            status: "expired",
            expiresInDays: 0,
          }),
        },
        {
          actor,
          at,
          action: "expire",
          entity: "listing",
          entityId: action.id,
          note: row.title,
        },
      );
    }

    case "deleteListing": {
      const row = find(state.listings, action.id);
      if (!row) return state;
      return log(
        state,
        {
          ...state,
          listings: state.listings.filter((l) => l.id !== action.id),
          // A report pointing at a row that no longer exists is a dead end in
          // the queue, so deleting the target closes it out.
          reports: state.reports.map((r) =>
            r.targetType === "listing" && r.targetId === action.id
              ? { ...r, status: "resolved" }
              : r,
          ),
        },
        {
          actor,
          at,
          action: "deleteListing",
          entity: "listing",
          entityId: action.id,
          note: row.title,
        },
      );
    }

    case "editListing": {
      const row = find(state.listings, action.id);
      if (!row) return state;
      // Only the fields a moderator may rewrite. Spreading `action.fields`
      // wholesale would let a form typo overwrite `status` or `ownerId`.
      const fields = {};
      for (const key of [
        "title",
        "price",
        "categoryId",
        "category",
        "location",
      ]) {
        if (action.fields?.[key] !== undefined)
          fields[key] = action.fields[key];
      }
      if (Object.keys(fields).length === 0) return state;

      /**
       * Moving an ad to another category takes its sub-category with it, and a
       * sub-category does not survive the move.
       *
       * `removeSubcategory` goes to the trouble of nulling the ads it orphans,
       * for the reason written there: a sub-category the picker can no longer
       * offer is a filter nothing matches, so the ad falls out of every cut of
       * the feed while its detail line still claims it. Re-filing an ad from
       * Vehicles to Pets produces exactly that state — "Boats" under Pets — by
       * a different route, so it gets the same answer rather than a second
       * opinion. `null` is what the ads with no sub-category already are.
       */
      const nextCategory = fields.category ?? row.category;
      if (row.subcategory && nextCategory !== row.category) {
        const subs =
          find(state.categories, fields.categoryId ?? row.categoryId)?.subs ??
          [];
        if (!subs.includes(row.subcategory)) fields.subcategory = null;
      }

      return log(
        state,
        { ...state, listings: patch(state.listings, action.id, fields) },
        {
          actor,
          at,
          action: "editListing",
          entity: "listing",
          entityId: action.id,
          note: Object.keys(fields).join(", "),
        },
      );
    }

    case "removePhoto": {
      const row = find(state.listings, action.id);
      if (!row || !row.photos.includes(action.photo)) return state;
      // An ad with no photos at all is not an ad; the last one stays.
      if (row.photos.length <= 1) return state;
      return log(
        state,
        {
          ...state,
          listings: patch(state.listings, action.id, {
            photos: row.photos.filter((p) => p !== action.photo),
          }),
        },
        {
          actor,
          at,
          action: "removePhoto",
          entity: "listing",
          entityId: action.id,
          note: row.title,
        },
      );
    }

    /* ---- users ---- */
    case "suspendUser":
    case "unsuspendUser": {
      const row = find(state.users, action.id);
      if (!row) return state;
      const suspend = action.type === "suspendUser";
      return log(
        state,
        {
          ...state,
          users: patch(state.users, action.id, {
            status: suspend ? "suspended" : "active",
          }),
          // Suspending an account takes its live ads down with it; leaving
          // them up is how a suspended seller keeps trading. Matched on
          // `ownerId`, so a namesake's ads are not caught in the net.
          listings: suspend
            ? state.listings.map((l) =>
                l.ownerId === row.id && l.status === "active"
                  ? { ...l, status: "expired" }
                  : l,
              )
            : state.listings,
        },
        {
          actor,
          at,
          action: action.type,
          entity: "user",
          entityId: action.id,
          note: suspend ? trimmed(action.reason) || row.name : row.name,
        },
      );
    }

    case "verifyUser": {
      const row = find(state.users, action.id);
      if (!row) return state;
      return log(
        state,
        { ...state, users: patch(state.users, action.id, { verified: true }) },
        {
          actor,
          at,
          action: "verifyUser",
          entity: "user",
          entityId: action.id,
          note: row.name,
        },
      );
    }

    /* ---- tickets ---- */
    case "replyTicket": {
      const row = find(state.tickets, action.id);
      const body = trimmed(action.body);
      if (!row || !body) return state;
      // `ticketThreads` already models `from: "agent"`, so the reply appends
      // to a shape that exists rather than inventing one.
      const message = {
        id: (row.messages.at(-1)?.id ?? 0) + 1,
        from: "agent",
        author: `${(actor ?? "Support").split(" ")[0]} · Support`,
        time: "Just now",
        body,
      };
      return log(
        state,
        {
          ...state,
          tickets: patch(state.tickets, action.id, {
            messages: [...row.messages, message],
            // Answering a closed ticket reopens it — the requester has the
            // last word on whether it is done.
            status: row.status === "resolved" ? "open" : row.status,
          }),
        },
        {
          actor,
          at,
          action: "replyTicket",
          entity: "ticket",
          entityId: action.id,
          note: row.subject,
        },
      );
    }

    case "setTicketStatus": {
      const row = find(state.tickets, action.id);
      if (!row) return state;
      return log(
        state,
        {
          ...state,
          tickets: patch(state.tickets, action.id, { status: action.status }),
        },
        {
          actor,
          at,
          action: "setTicketStatus",
          entity: "ticket",
          entityId: action.id,
          note: `${row.subject} → ${action.status}`,
        },
      );
    }

    case "assignTicket": {
      const row = find(state.tickets, action.id);
      if (!row) return state;
      const to = action.adminId ? find(state.admins, action.adminId) : null;
      if (action.adminId && !to) return state;
      return log(
        state,
        {
          ...state,
          tickets: patch(state.tickets, action.id, {
            assigneeId: action.adminId ?? null,
          }),
        },
        {
          actor,
          at,
          action: action.adminId ? "assignTicket" : "unassignTicket",
          entity: "ticket",
          entityId: action.id,
          note: to ? `${row.subject} → ${to.name}` : row.subject,
        },
      );
    }

    /* ---- reports ---- */

    /**
     * A report arriving from outside the console — the receiving half of what
     * a reader raises on the public boards (issue #4).
     *
     * It carries no permission requirement in `ACTION_PERMISSION` on purpose:
     * every other action here is a moderator acting, and this one is a member
     * being heard. Refusing it on a role would mean the queue could only be
     * fed by the people who work it, which is the state this action exists to
     * end.
     *
     * `buildReport` is shared with `lib/reports.js`, so the row a public app
     * stores and the row this reducer accepts cannot drift into two shapes.
     * The honest limit is written out there and is worth repeating here: no
     * transport exists between the two origins yet, so nothing is calling this
     * from the public side today. This is the half that is ready; #10 is the
     * half that is not.
     */
    case "createReport": {
      const seq = state.auditSeq + 1;
      const row = buildReport(
        action,
        `r-${at.toString(36)}-${seq.toString(36)}`,
        at,
      );
      if (!row) return state;
      // A report pointing at nothing is a dead row in the queue: the target
      // has to be something this console can open.
      const targets =
        row.targetType === "listing"
          ? state.listings
          : row.targetType === "user"
            ? state.users
            : state.streams;
      if (!find(targets, row.targetId)) return state;
      return log(
        state,
        { ...state, reports: [row, ...state.reports] },
        {
          actor: row.reporter,
          at,
          action: "createReport",
          entity: "report",
          entityId: row.id,
          note: row.reason,
        },
      );
    }

    case "resolveReport":
    case "dismissReport": {
      const row = find(state.reports, action.id);
      if (!row) return state;
      const status = action.type === "resolveReport" ? "resolved" : "dismissed";
      return log(
        state,
        { ...state, reports: patch(state.reports, action.id, { status }) },
        {
          actor,
          at,
          action: action.type,
          entity: "report",
          entityId: action.id,
          note: trimmed(action.note) || row.reason,
        },
      );
    }

    /* ---- appeals ---- */

    /**
     * A rejected listing or a suspended account, asking to be looked at
     * again.
     *
     * Unlike `createReport` just above, this one *is* permission-checked —
     * `ACTION_PERMISSION` in `adminRoles.js` requires `appeal.raise`. A
     * member cannot dispatch into this console from the public site (#10 is
     * still open, same as it is for reports), so nothing here arrives on its
     * own; every row is logged by a moderator on the member's behalf, the way
     * a phone call or an email reply gets typed into a ticket. `appellant`
     * names who is appealing; `actor`/`role` name the admin who logged it,
     * and it is the admin's authority the permission checks — never the
     * appellant's, because the appellant never touched this console.
     */
    case "raiseAppeal": {
      const targetType = action.targetType;
      const collection =
        targetType === "listing" ? state.listings : state.users;
      const target = find(collection, action.targetId);
      if (!target) return state;
      // Only a decision with something to reconsider can be appealed.
      const appealable =
        targetType === "listing"
          ? target.status === "rejected"
          : target.status === "suspended";
      if (!appealable) return state;
      // One open appeal per target at a time — a second one tells the queue
      // nothing the first did not, the same rule `reports.js`'s `report`
      // case applies to a duplicate report of the same thing.
      const already = state.appeals.some(
        (a) =>
          a.targetType === targetType &&
          a.targetId === action.targetId &&
          a.status === "pending",
      );
      if (already) return state;

      const appellant = trimmed(action.appellant) || "The affected member";
      const seq = state.auditSeq + 1;
      const row = {
        id: `ap-${at.toString(36)}-${seq.toString(36)}`,
        at,
        site: target.site,
        targetType,
        targetId: target.id,
        targetLabel: targetType === "listing" ? target.title : target.name,
        originalAction: targetType === "listing" ? "reject" : "suspendUser",
        // The reason on record for the decision being appealed — read off
        // the listing directly, or off its own history for a user, since a
        // suspended account carries no reason field of its own.
        originalNote:
          targetType === "listing"
            ? target.rejectionReason
            : (state.audit.find(
                (e) =>
                  e.entity === "user" &&
                  e.entityId === target.id &&
                  e.action === "suspendUser",
              )?.note ?? null),
        appellant,
        message: trimmed(action.message),
        status: "pending",
        decidedNote: "",
        raisedMsAgo: 0,
      };
      return log(
        state,
        { ...state, appeals: [row, ...state.appeals] },
        {
          actor,
          at,
          action: "raiseAppeal",
          entity: "appeal",
          entityId: row.id,
          note: `${appellant} — ${row.targetLabel}`,
        },
      );
    }

    case "upholdAppeal": {
      const appeal = find(state.appeals, action.id);
      if (!appeal || appeal.status !== "pending") return state;
      const note = trimmed(action.note);
      return log(
        state,
        {
          ...state,
          appeals: patch(state.appeals, action.id, {
            status: "upheld",
            decidedNote: note,
          }),
        },
        {
          actor,
          at,
          action: "upholdAppeal",
          entity: "appeal",
          entityId: appeal.id,
          note: note || "Original decision stands",
        },
      );
    }

    /**
     * The one action in this reducer that logs twice. Overturning is not
     * "mark the appeal resolved" — it is the reversal itself, so the
     * reversal is written under the target's own entity (`listing` or
     * `user`) first, the same shape `approve` and `unsuspendUser` already
     * write, which is what lets `ListingDetail`/`UserDetail`'s decision
     * history show it without either screen knowing appeals exist. The
     * second entry, under `entity: "appeal"`, is the appeal's own record.
     */
    case "overturnAppeal": {
      const appeal = find(state.appeals, action.id);
      if (!appeal || appeal.status !== "pending") return state;
      const note = trimmed(action.note);
      const reversalNote = note || "Reinstated on appeal";

      const after =
        appeal.targetType === "listing"
          ? log(
              state,
              {
                ...state,
                // The same reversal `approve` performs — overturning a
                // rejection is not a different action from approving the ad,
                // it is that action taken late.
                listings: patch(state.listings, appeal.targetId, {
                  status: "active",
                  rejectionReason: null,
                }),
              },
              {
                actor,
                at,
                action: "approve",
                entity: "listing",
                entityId: appeal.targetId,
                note: reversalNote,
              },
            )
          : log(
              state,
              {
                ...state,
                // The same reversal `unsuspendUser` performs. Listings the
                // suspension already expired stay expired — restoring the
                // account does not resurrect them, for the same reason
                // `unsuspendUser` itself does not.
                users: patch(state.users, appeal.targetId, {
                  status: "active",
                }),
              },
              {
                actor,
                at,
                action: "unsuspendUser",
                entity: "user",
                entityId: appeal.targetId,
                note: reversalNote,
              },
            );

      return log(
        after,
        {
          ...after,
          appeals: patch(after.appeals, action.id, {
            status: "overturned",
            decidedNote: note,
          }),
        },
        {
          actor,
          at,
          action: "overturnAppeal",
          entity: "appeal",
          entityId: appeal.id,
          note: note || `${appeal.targetLabel} reinstated`,
        },
      );
    }

    /* ---- live and status ---- */
    case "endStream": {
      const row = find(state.streams, action.id);
      if (!row) return state;
      return log(
        state,
        {
          ...state,
          streams: patch(state.streams, action.id, { status: "ended" }),
        },
        {
          actor,
          at,
          action: "endStream",
          entity: "stream",
          entityId: action.id,
          note: trimmed(action.reason) || row.title,
        },
      );
    }

    case "verifyHost": {
      const row = find(state.streams, action.id);
      if (!row) return state;
      return log(
        state,
        {
          ...state,
          streams: patch(state.streams, action.id, { verified: true }),
        },
        {
          actor,
          at,
          action: "verifyHost",
          entity: "stream",
          entityId: action.id,
          note: row.host,
        },
      );
    }

    case "removeUpdate": {
      const story = find(state.stories, action.storyId);
      if (!story) return state;
      return log(
        state,
        {
          ...state,
          stories: patch(state.stories, action.storyId, {
            updates: story.updates.filter((u) => u.id !== action.id),
          }),
        },
        {
          actor,
          at,
          action: "removeUpdate",
          entity: "update",
          entityId: action.id,
          note: story.name,
        },
      );
    }

    case "removeStory": {
      const story = find(state.stories, action.id);
      if (!story) return state;
      return log(
        state,
        { ...state, stories: state.stories.filter((s) => s.id !== action.id) },
        {
          actor,
          at,
          action: "removeStory",
          entity: "story",
          entityId: action.id,
          note: story.name,
        },
      );
    }

    /* ---- content ---- */
    case "upsertFaq": {
      const { faq } = action;
      const exists = Boolean(faq.id && find(state.faqs, faq.id));
      const id = exists ? faq.id : `faq-${Date.now().toString(36)}`;
      return log(
        state,
        {
          ...state,
          faqs: exists
            ? patch(state.faqs, id, faq)
            : [...state.faqs, { ...faq, id }],
        },
        {
          actor,
          at,
          action: exists ? "updateFaq" : "createFaq",
          entity: "faq",
          entityId: id,
          note: faq.q,
        },
      );
    }

    case "deleteFaq": {
      const row = find(state.faqs, action.id);
      if (!row) return state;
      return log(
        state,
        { ...state, faqs: state.faqs.filter((f) => f.id !== action.id) },
        {
          actor,
          at,
          action: "deleteFaq",
          entity: "faq",
          entityId: action.id,
          note: row.q,
        },
      );
    }

    case "upsertTopic": {
      const { topic } = action;
      const exists = Boolean(topic.id && find(state.topics, topic.id));
      const id = exists
        ? topic.id
        : freeId(state.topics, slug(topic.label).replace(/\./g, "-"));
      return log(
        state,
        {
          ...state,
          topics: exists
            ? patch(state.topics, id, topic)
            : [...state.topics, { ...topic, id }],
        },
        {
          actor,
          at,
          action: exists ? "updateTopic" : "createTopic",
          entity: "topic",
          entityId: id,
          note: topic.label,
        },
      );
    }

    case "deleteTopic": {
      const row = find(state.topics, action.id);
      if (!row) return state;
      return log(
        state,
        { ...state, topics: state.topics.filter((t) => t.id !== action.id) },
        {
          actor,
          at,
          action: "deleteTopic",
          entity: "topic",
          entityId: action.id,
          note: row.label,
        },
      );
    }

    /* ---- taxonomy ---- */
    case "upsertCategory": {
      const { category } = action;
      const exists = Boolean(
        category.id && find(state.categories, category.id),
      );
      const id = exists
        ? category.id
        : freeId(state.categories, slug(category.label).replace(/\./g, "-"));
      return log(
        state,
        {
          ...state,
          categories: exists
            ? patch(state.categories, id, category)
            : [...state.categories, { ...category, id }],
        },
        {
          actor,
          at,
          action: exists ? "updateCategory" : "createCategory",
          entity: "category",
          entityId: id,
          note: category.label,
        },
      );
    }

    case "deleteCategory": {
      const row = find(state.categories, action.id);
      if (!row) return state;
      return log(
        state,
        {
          ...state,
          categories: state.categories.filter((c) => c.id !== action.id),
          // A launcher tile pointing at a category that is gone renders an
          // empty feed, so the tile goes with it.
          homeCategories: state.homeCategories.filter((c) => c !== action.id),
        },
        {
          actor,
          at,
          action: "deleteCategory",
          entity: "category",
          entityId: action.id,
          note: row.label,
        },
      );
    }

    case "reorderCategories": {
      const { id, delta } = action;
      const from = state.categories.findIndex((c) => c.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= state.categories.length) return state;
      const next = [...state.categories];
      [next[from], next[to]] = [next[to], next[from]];
      return log(
        state,
        { ...state, categories: next },
        {
          actor,
          at,
          action: "reorderCategories",
          entity: "category",
          entityId: id,
          note: `moved ${delta < 0 ? "up" : "down"}`,
        },
      );
    }

    case "setHomeCategories":
      return log(
        state,
        { ...state, homeCategories: [...action.ids] },
        {
          actor,
          at,
          action: "setHomeCategories",
          entity: "taxonomy",
          entityId: "home",
          note: `${action.ids.length} tiles`,
        },
      );

    /**
     * A category's sub-categories — the second and last level of the tree.
     *
     * Held as plain strings on the category row, in the shape `subs` already
     * arrives from `mock.js`, because that is what an ad stores: `subcategory`
     * on a listing is the label itself. Giving them ids was the alternative
     * and it loses twice — every ad would carry an id the public sites have no
     * table to resolve, and the console would still have to keep the label in
     * step. The price is that the label *is* the key, which is why `rename`
     * below has to move the ads with it and `remove` has to decide what
     * happens to them.
     *
     * All four log against `entity: "category"`, so `auditFor(state,
     * "category", id)` shows a category's structural edits and its
     * sub-category edits as one history rather than two.
     */
    case "addSubcategory": {
      const row = find(state.categories, action.categoryId);
      const value = trimmed(action.value);
      if (!row || !value) return state;
      const subs = row.subs ?? [];
      // Compared case-insensitively, unlike `addTerm` below. A sub-category is
      // written onto the ad as text, so "Boats" and "boats" would not read as
      // one option in the picker and would split one sub-category's ads into
      // two buckets that no filter can put back together.
      if (subs.some((s) => s.toLowerCase() === value.toLowerCase())) {
        return state;
      }
      return log(
        state,
        {
          ...state,
          categories: patch(state.categories, row.id, {
            subs: [...subs, value],
          }),
        },
        {
          actor,
          at,
          action: "addSubcategory",
          entity: "category",
          entityId: row.id,
          note: `${row.label} › ${value}`,
        },
      );
    }

    case "renameSubcategory": {
      const row = find(state.categories, action.categoryId);
      const to = trimmed(action.to);
      const { from } = action;
      const subs = row?.subs ?? [];
      if (!row || !to || !subs.includes(from) || to === from) return state;
      // The row being renamed is exempt from the duplicate check, so fixing
      // only the casing of a label is still a rename and not a collision.
      if (
        subs.some((s) => s !== from && s.toLowerCase() === to.toLowerCase())
      ) {
        return state;
      }
      return log(
        state,
        {
          ...state,
          categories: patch(state.categories, row.id, {
            subs: subs.map((s) => (s === from ? to : s)),
          }),
          // The ads come along. They name their sub-category by its text, so
          // leaving them on the old string would file them under a label that
          // no longer exists — the same hole `removeSubcategory` has to fill,
          // except that here there is a correct new answer to give them.
          listings: state.listings.map((l) =>
            l.categoryId === row.id && l.subcategory === from
              ? { ...l, subcategory: to }
              : l,
          ),
        },
        {
          actor,
          at,
          action: "renameSubcategory",
          entity: "category",
          entityId: row.id,
          note: `${from} → ${to}`,
        },
      );
    }

    case "removeSubcategory": {
      const row = find(state.categories, action.categoryId);
      if (!row || !(row.subs ?? []).includes(action.value)) return state;
      const filed = state.listings.filter(
        (l) => l.categoryId === row.id && l.subcategory === action.value,
      ).length;
      return log(
        state,
        {
          ...state,
          categories: patch(state.categories, row.id, {
            subs: row.subs.filter((s) => s !== action.value),
          }),
          /**
           * The ads filed under it fall back to the parent category. They are
           * never deleted: tidying a picker is not a moderation decision, and
           * an owner dropping "RVs & Campers" has not asked for the nine ads
           * under it to come down.
           *
           * The real choice is between leaving the string dangling and nulling
           * it out, and dangling loses. `matches()` in `filters.js` narrows
           * only on a sub-category the picker can still offer, so an ad
           * pointing at a removed one is reachable through no filter at all
           * while its own detail line goes on claiming a sub-category that is
           * gone. `null` already means "no sub-category" everywhere — one ad
           * in five ships that way on purpose — so nulling puts these ads back
           * where a plain Vehicles filter finds them. The cost, stated
           * honestly: re-adding the label does not bring them back, because
           * the fact that they were ever under it is not recorded anywhere but
           * the audit note.
           */
          listings: filed
            ? state.listings.map((l) =>
                l.categoryId === row.id && l.subcategory === action.value
                  ? { ...l, subcategory: null }
                  : l,
              )
            : state.listings,
        },
        {
          actor,
          at,
          action: "removeSubcategory",
          entity: "category",
          entityId: row.id,
          // The count is the part worth reading back later: it is how many ads
          // this one click moved up to the parent, and it is not recoverable
          // from the state afterwards.
          note: filed
            ? `${action.value} · ${filed} ads back to ${row.label}`
            : action.value,
        },
      );
    }

    case "reorderSubcategory": {
      const row = find(state.categories, action.categoryId);
      const subs = row?.subs ?? [];
      const from = subs.indexOf(action.value);
      const to = from + action.delta;
      if (from < 0 || to < 0 || to >= subs.length) return state;
      const next = [...subs];
      [next[from], next[to]] = [next[to], next[from]];
      return log(
        state,
        {
          ...state,
          categories: patch(state.categories, row.id, { subs: next }),
        },
        {
          actor,
          at,
          action: "reorderSubcategory",
          entity: "category",
          entityId: row.id,
          note: `${action.value} moved ${action.delta < 0 ? "up" : "down"}`,
        },
      );
    }

    /**
     * The personals vocabularies. One trio of verbs rather than six, because
     * "a flat list of words on the board" is one idea with two instances —
     * and `TERM_LISTS` is what stops an action naming any other state key.
     */
    case "addTerm": {
      const { list } = action;
      const value = trimmed(action.value);
      if (!TERM_LISTS.has(list) || !value) return state;
      // Adding a word the list already holds is not an edit.
      if (state[list].includes(value)) return state;
      return log(
        state,
        { ...state, [list]: [...state[list], value] },
        {
          actor,
          at,
          action: "addTerm",
          entity: list,
          entityId: value,
          note: value,
        },
      );
    }

    case "removeTerm": {
      const { list, value } = action;
      if (!TERM_LISTS.has(list) || !state[list].includes(value)) return state;
      return log(
        state,
        { ...state, [list]: state[list].filter((t) => t !== value) },
        {
          actor,
          at,
          action: "removeTerm",
          entity: list,
          entityId: value,
          note: value,
        },
      );
    }

    case "reorderTerm": {
      const { list, value, delta } = action;
      if (!TERM_LISTS.has(list)) return state;
      const from = state[list].indexOf(value);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= state[list].length) return state;
      const next = [...state[list]];
      [next[from], next[to]] = [next[to], next[from]];
      return log(
        state,
        { ...state, [list]: next },
        {
          actor,
          at,
          action: "reorderTerm",
          entity: list,
          entityId: value,
          note: `moved ${delta < 0 ? "up" : "down"}`,
        },
      );
    }

    case "addArea": {
      const province = find(state.provinces, action.provinceId);
      const area = trimmed(action.area);
      if (!province || !area || province.areas.includes(area)) return state;
      return log(
        state,
        {
          ...state,
          provinces: patch(state.provinces, action.provinceId, {
            areas: [...province.areas, area],
          }),
        },
        {
          actor,
          at,
          action: "addArea",
          entity: "province",
          entityId: action.provinceId,
          note: area,
        },
      );
    }

    case "removeArea": {
      const province = find(state.provinces, action.provinceId);
      // Removing something that is not there is not an edit. Without this the
      // second click of a double-click spends an audit slot saying nothing.
      if (!province || !province.areas.includes(action.area)) return state;
      return log(
        state,
        {
          ...state,
          provinces: patch(state.provinces, action.provinceId, {
            areas: province.areas.filter((a) => a !== action.area),
          }),
        },
        {
          actor,
          at,
          action: "removeArea",
          entity: "province",
          entityId: action.provinceId,
          note: action.area,
        },
      );
    }

    /* ---- notifications ---- */
    case "sendBroadcast": {
      const { broadcast } = action;
      const id = `bc-${Date.now().toString(36)}`;
      const audience = state.users.filter(
        (u) => broadcast.site === "all" || u.site === broadcast.site,
      ).length;
      return log(
        state,
        {
          ...state,
          broadcasts: [
            // Reach is the audience the console can actually name, scaled to
            // the install base the mock pretends to have.
            { ...broadcast, id, sentMsAgo: 0, reach: audience * 1000 },
            ...state.broadcasts,
          ].slice(0, BROADCAST_CAP),
        },
        {
          actor,
          at,
          action: "sendBroadcast",
          entity: "broadcast",
          entityId: id,
          note: broadcast.title,
        },
      );
    }

    /* ---- admins ---- */
    case "upsertAdmin": {
      const { admin } = action;
      const email = trimmed(admin.email).toLowerCase();
      const name = trimmed(admin.name);
      if (!email || !name || !ROLE_IDS.has(admin.role)) return state;
      const existing = admin.id && find(state.admins, admin.id);
      // Email is the identity here, so a second row claiming one already in
      // use is a mistake, not a new colleague.
      const clash = state.admins.find(
        (a) => a.email === email && a.id !== admin.id,
      );
      if (clash) return state;

      const id = existing ? admin.id : `ad-${at.toString(36)}`;
      const row = {
        ...(existing ?? {
          avatar: `https://picsum.photos/seed/${slug(name)}/160/160`,
          joined: String(new Date(at).getFullYear() || 2026),
        }),
        ...admin,
        id,
        email,
        name,
      };
      return log(
        state,
        {
          ...state,
          admins: existing
            ? patch(state.admins, id, row)
            : [...state.admins, row],
        },
        {
          actor,
          at,
          action: existing ? "updateAdmin" : "createAdmin",
          entity: "admin",
          entityId: id,
          note: `${name} · ${admin.role}`,
        },
      );
    }

    case "removeAdmin": {
      const row = find(state.admins, action.id);
      if (!row) return state;
      // The last owner cannot be removed. A console nobody can administer is
      // a console that needs a database edit to recover.
      const owners = state.admins.filter((a) => a.role === "owner");
      if (row.role === "owner" && owners.length <= 1) return state;
      return log(
        state,
        {
          ...state,
          admins: state.admins.filter((a) => a.id !== action.id),
          // Their open tickets go back on the pile rather than to a ghost.
          tickets: state.tickets.map((t) =>
            t.assigneeId === action.id ? { ...t, assigneeId: null } : t,
          ),
        },
        {
          actor,
          at,
          action: "removeAdmin",
          entity: "admin",
          entityId: action.id,
          note: row.name,
        },
      );
    }

    /* ---- settings ---- */
    case "setSetting":
      return log(
        state,
        {
          ...state,
          settings: { ...state.settings, [action.key]: action.value },
        },
        {
          actor,
          at,
          action: "setSetting",
          entity: "settings",
          entityId: action.key,
          note: String(action.value),
        },
      );

    /**
     * The single most destructive action in the console, so it is the one
     * action that must not leave silence behind. `buildSeed()` starts a brand
     * new audit trail — that is the whole point of a reset — but the fact that
     * a reset happened, who did it and when, is logged into *that* fresh trail
     * before it is handed back. The record survives the wipe because it is
     * written after the wipe, not before it.
     */
    case "resetToSeed": {
      const seeded = buildSeed();
      return log(seeded, seeded, {
        actor,
        at,
        action: "resetToSeed",
        entity: "system",
        entityId: "seed",
        note: "Console data reset to seed",
      });
    }

    /**
     * Storage handing back what it kept. Folded over a fresh seed rather than
     * used as-is: a collection added to `buildSeed` since the stored copy was
     * written would otherwise arrive `undefined`, and every screen reading it
     * would throw on `.filter`.
     */
    case "rehydrate":
      return { ...buildSeed(), ...normaliseAdminState(action.state) };

    default:
      return state;
  }
}

/* -------------------------------------------------------------- selectors */

/**
 * The handful of derivations more than one screen needs. They live here rather
 * than in the screens so the dashboard and the queue cannot disagree about
 * what "pending" counts.
 */

export const isPending = (l) => l.status === "pending";

/**
 * The tallies the dashboard tiles and the rail badges both show.
 *
 * `site` is a parameter rather than something the caller pre-filters, so the
 * two cannot disagree — a rail badge reading 7 beside a dashboard tile reading
 * 3 is a bug report, and it is the one this signature prevents.
 */
export function counts(state, site = "all") {
  const scoped = (rows) =>
    site === "all" ? rows : rows.filter((r) => r.site === site);

  return {
    pending: scoped(state.listings).filter(isPending).length,
    openReports: scoped(state.reports).filter((r) => r.status === "open")
      .length,
    openTickets: scoped(state.tickets).filter((t) => t.status === "open")
      .length,
    openAppeals: scoped(state.appeals).filter((a) => a.status === "pending")
      .length,
    liveNow: scoped(state.streams).filter((s) => s.status === "live").length,
    active: scoped(state.listings).filter((l) => l.status === "active").length,
    suspended: scoped(state.users).filter((u) => u.status === "suspended")
      .length,
  };
}

/** Ads a user owns. Joined on the id stamped at seed time, never on the name. */
export const listingsFor = (state, user) =>
  state.listings.filter((l) => l.ownerId === user.id);

/** The audit trail for one row, for the per-entity panels. */
export const auditFor = (state, entity, entityId) =>
  state.audit.filter((a) => a.entity === entity && a.entityId === entityId);

/* ------------------------------------------------------------- analytics */

/**
 * The analytics screen's numbers, all derived from the store rather than
 * invented.
 *
 * Where the mock has no time series — it has no signup dates, and `postedMsAgo`
 * only reaches back a couple of weeks — the series is built by bucketing what
 * does exist rather than by faking a trend. A chart of made-up numbers is worse
 * than no chart: it reads as data.
 */

const WEEK = 7 * 86_400_000;

/** Listings per week, oldest bucket first, from how long ago each was posted. */
export function postingSeries(state, site = "all", weeks = 8) {
  const rows = state.listings.filter((l) => inScopeSite(l, site));
  const buckets = Array.from({ length: weeks }, () => 0);
  for (const l of rows) {
    // Bucket 0 is the oldest; the last bucket is this week.
    const back = Math.floor(l.postedMsAgo / WEEK);
    const i = weeks - 1 - Math.min(back, weeks - 1);
    buckets[i] += 1;
  }
  return buckets;
}

/** How the queue is split right now. */
export function statusBreakdown(state, site = "all") {
  const rows = state.listings.filter((l) => inScopeSite(l, site));
  const order = ["active", "pending", "rejected", "expired"];
  return order.map((status) => ({
    key: status,
    value: rows.filter((l) => l.status === status).length,
  }));
}

/** Listings per category, biggest first, for the ranked bars. */
export function categoryBreakdown(state, site = "all", limit = 8) {
  const rows = state.listings.filter((l) => inScopeSite(l, site));
  const tally = new Map();
  for (const l of rows) {
    const label = l.site === "personals" ? "Personals" : l.category;
    tally.set(label, (tally.get(label) ?? 0) + 1);
  }
  return [...tally]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Who has been doing the moderating, from the audit log. */
export function moderatorThroughput(state) {
  const tally = new Map();
  for (const entry of state.audit) {
    tally.set(entry.actor, (tally.get(entry.actor) ?? 0) + 1);
  }
  return [...tally]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value);
}

/** Accounts per board, for the split tile. */
export function usersBySite(state) {
  return ["marketplace", "personals"].map((site) => ({
    key: site,
    value: state.users.filter((u) => u.site === site).length,
  }));
}

/** Duplicated from adminScope so this module stays free of React imports. */
const inScopeSite = (row, site) => site === "all" || row.site === site;
