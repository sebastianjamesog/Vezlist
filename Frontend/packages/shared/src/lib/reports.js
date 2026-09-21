import { sellers } from "../data/mock.js";
import { SITE } from "./sites.js";
import { hasId, isNonEmptyString, isObject } from "./guards.js";

/**
 * Reporting and blocking: one taxonomy, one reducer, no React.
 *
 * `ReportsContext` is the only caller, which is what keeps the swap to a real
 * API down to that one file. Screens never import this directly except for the
 * two pure readers at the bottom (`sellerIdFor`, `hideBlocked`), which the feed
 * screens use to drop a blocked seller's rows.
 *
 * ── Where a report actually goes, stated plainly ──────────────────────────
 *
 * Into this origin's localStorage, and nowhere else. There is no server, and
 * the admin console is a third origin with its own separate store (issue #10),
 * so a report raised on vezlist.cc cannot reach admin.vezlist.cc today. That
 * is not something a confirmation toast is allowed to paper over: the copy the
 * reporter sees, the FAQ answer in `mock.js`, and the receipt list in Settings
 * all say the same thing — the report is recorded on this device and is
 * waiting to be sent, not sitting in a moderator's queue.
 *
 * What makes that a queue rather than a bin: a row built here is already in
 * the exact shape the console's Reports table reads (`site`, `targetType`,
 * `targetId`, `reason`, `detail`, `reporter`, `status`), and `adminStore`'s
 * `createReport` is the receiving half of the same shape. When #10 lands, the
 * delivery is a POST of these rows — the shape does not change and neither
 * does any screen.
 *
 * Blocking is different, and this is the honest split worth noticing: a block
 * is enforced entirely in the reader's own browser — it decides what *this*
 * person is shown — so it works completely, today, with no backend at all. A
 * report asks somebody else to act. One of the two can be finished here and
 * the other cannot, so they are not described to the user in the same words.
 */

/* ------------------------------------------------------------- taxonomy */

/**
 * Why somebody is reporting. One flat list rather than three, with each reason
 * naming the targets and the boards it applies to — a reason that reads as
 * nonsense against the thing being reported ("Wrong category" on a live
 * broadcast) is a reason nobody picks and a queue row nobody can action.
 *
 * `sites` is omitted when a reason belongs on both boards. The two that are
 * scoped are scoped because the marketplace sells objects: an ad for a dining
 * table cannot be escort advertising, and offering that as an option on it
 * teaches the reporter that the list was not written for what they are
 * looking at.
 */
export const REPORT_REASONS = [
  {
    id: "scam",
    label: "Scam or fraud",
    targets: ["listing", "user"],
  },
  {
    id: "prohibited",
    label: "Prohibited or illegal",
    targets: ["listing"],
  },
  {
    id: "misleading",
    label: "Misleading or stolen photos",
    targets: ["listing", "user", "stream"],
  },
  {
    id: "duplicate",
    label: "Duplicate posting",
    targets: ["listing"],
  },
  {
    id: "miscategorised",
    label: "Wrong category",
    targets: ["listing"],
  },
  {
    id: "offPlatform",
    label: "Asked to pay off-platform",
    targets: ["listing", "user"],
  },
  {
    id: "escort",
    label: "Escort or paid-sex advertising",
    targets: ["listing", "user", "stream"],
    sites: ["personals"],
  },
  {
    id: "underage",
    label: "Someone appears under 18",
    targets: ["listing", "user", "stream"],
    sites: ["personals"],
  },
  {
    id: "nudity",
    label: "Nudity or explicit content",
    targets: ["listing", "stream"],
  },
  {
    id: "harassment",
    label: "Harassment or abuse",
    targets: ["user", "stream"],
  },
  {
    id: "impersonation",
    label: "Impersonation",
    targets: ["user", "stream"],
  },
  /**
   * Last, always, and the only one that insists on a written detail. A queue
   * row reading "Something else" with nothing under it is a row a moderator
   * has to guess at, which is worse for them than the report never arriving.
   */
  {
    id: "other",
    label: "Something else",
    targets: ["listing", "user", "stream"],
    needsDetail: true,
  },
];

const REASON_BY_ID = new Map(REPORT_REASONS.map((r) => [r.id, r]));

/** The reasons offered for one kind of target on one board. */
export function reasonsFor(targetType, site = SITE) {
  return REPORT_REASONS.filter(
    (r) =>
      r.targets.includes(targetType) && (!r.sites || r.sites.includes(site)),
  );
}

/** The words the console's queue will show. Unknown ids never get that far. */
export const reasonLabel = (id) => REASON_BY_ID.get(id)?.label ?? null;

/** How long a detail may run before the textarea stops taking it. */
export const MAX_DETAIL = 400;

/* ------------------------------------------------------------------ seed */

/** Nothing reported, nobody blocked. */
export const EMPTY = { reports: [], blocked: [] };

const text = (value) => (value ?? "").toString().trim();

/**
 * One report, in the shape the console's Reports table already reads.
 *
 * `id` and `at` are supplied by the caller — a click handler may read
 * `Date.now()`, this may not — so the result is deterministic and can be
 * asserted on.
 *
 * `createdMsAgo` is the console's own convention for a report's age and is
 * relative to render, which a stored row has no way to keep up to date. It is
 * written as 0 here and `at` is carried alongside it, so the receipt in
 * Settings can age the row properly and whatever eventually delivers these can
 * compute the console's field from a real timestamp.
 */
export function buildReport(input, id, at = 0) {
  const reason = REASON_BY_ID.get(input.reasonId);
  if (!reason) return null;
  if (!reason.targets.includes(input.targetType)) return null;
  const detail = text(input.detail).slice(0, MAX_DETAIL);
  if (reason.needsDetail && !detail) return null;
  const targetId = text(input.targetId);
  if (!targetId) return null;

  return {
    id,
    at,
    site: input.site ?? SITE,
    targetType: input.targetType,
    targetId,
    reasonId: reason.id,
    reason: reason.label,
    detail,
    reporter: text(input.reporter) || "A member",
    status: "open",
    createdMsAgo: 0,
  };
}

/* -------------------------------------------------------------- reducer */

const key = (targetType, targetId) => `${targetType}:${targetId}`;

const REPORT_STATUSES = new Set(["open", "resolved", "dismissed"]);

/**
 * A stored report worth keeping. `targetType`/`targetId` are checked because
 * they are the pair every duplicate check and every `reportOf` lookup keys
 * on, and `status` because it is not read with a fallback anywhere it is
 * shown. Everything else — `reason`, `detail`, `reporter` — is left as the
 * row carried it.
 */
function isValidReport(row) {
  return (
    isObject(row) &&
    isNonEmptyString(row.id) &&
    isNonEmptyString(row.targetType) &&
    isNonEmptyString(row.targetId) &&
    REPORT_STATUSES.has(row.status)
  );
}

/**
 * The guard `rehydrate` runs a stored delta through before folding it over
 * `EMPTY` — the pattern `normaliseWallet` in `wallet.js` set. Blocks only
 * need the id `isBlocked`/`hideBlocked` key on; reports need the fields named
 * above. A `reports` or `blocked` that is not an array is dropped rather than
 * merged in, and a top-level key neither name comes back the same way —
 * nothing reads it, so keeping it is not tolerance, it is corruption handed
 * to the next reader.
 */
export function normaliseReportsState(value) {
  if (!isObject(value)) return {};
  const next = {};
  if (Array.isArray(value.reports)) {
    next.reports = value.reports.filter(isValidReport);
  }
  if (Array.isArray(value.blocked)) next.blocked = value.blocked.filter(hasId);
  return next;
}

/**
 * The two verbs a reader has. The clock and the id arrive on the action rather
 * than being read here, so this stays a function of its arguments and React's
 * StrictMode double-invoke cannot make two calls disagree.
 */
export function reducer(state, action) {
  switch (action.type) {
    case "report": {
      const row = buildReport(action, action.id, action.at ?? 0);
      if (!row) return state;
      /**
       * One open report per target per reader.
       *
       * Not a rate limit — it is the difference between reporting a thing and
       * shouting at a queue. A second report of the same ad from the same
       * person tells a moderator nothing the first one did not, and the screen
       * says "you've already reported this" rather than accepting a duplicate
       * and quietly dropping it.
       */
      const k = key(row.targetType, row.targetId);
      if (state.reports.some((r) => key(r.targetType, r.targetId) === k)) {
        return state;
      }
      return { ...state, reports: [row, ...state.reports] };
    }

    case "block": {
      const id = text(action.id);
      if (!id) return state;
      if (state.blocked.some((b) => b.id === id)) return state;
      return {
        ...state,
        blocked: [
          { id, name: text(action.name) || id, at: action.at ?? 0 },
          ...state.blocked,
        ],
      };
    }

    case "unblock":
      return {
        ...state,
        blocked: state.blocked.filter((b) => b.id !== action.id),
      };

    /**
     * Storage handing back what it kept, folded over `EMPTY` rather than used
     * as-is — the same reason `tickets.js` folds a rehydrate over its own
     * empty: a key this shape has grown since the stored copy was written must
     * not arrive `undefined` at a screen that calls `.filter` on it.
     */
    case "rehydrate":
      return { ...EMPTY, ...normaliseReportsState(action.state) };

    default:
      return state;
  }
}

/* ------------------------------------------------------------ selectors */

export const isBlocked = (blocked, id) =>
  !!id && blocked.some((b) => b.id === id);

export const reportOf = (reports, targetType, targetId) =>
  reports.find((r) => r.targetType === targetType && r.targetId === targetId) ??
  null;

/* --------------------------------------------------- block enforcement */

/**
 * Which seller a feed row belongs to.
 *
 * The mock's listings carry no `sellerId` — the only attribution in the data
 * is `sellers[id].listingIds`, so it is read backwards here, once, into a map.
 * A row nobody claims returns `null` and is never hidden: guessing an owner
 * from the business name would hide ads a reader never blocked, and a block
 * that removes the wrong ads is worse than one that removes too few.
 *
 * This is the seam a real backend removes. When a row carries its own
 * `sellerId`, that field wins and this map goes away.
 */
const SELLER_BY_LISTING = new Map(
  Object.values(sellers).flatMap((s) => s.listingIds.map((id) => [id, s.id])),
);

export const sellerIdFor = (listing) =>
  listing?.sellerId ?? SELLER_BY_LISTING.get(listing?.id) ?? null;

/**
 * The feed, minus everyone this reader has blocked.
 *
 * Applied where each board computes the rows it is about to render, after the
 * filters and before the cards — a block is not a filter the reader can see or
 * clear from a chip, it is a row that should never have been offered. Nothing
 * announces "3 ads hidden": the point of blocking somebody is not hearing from
 * them again, and a counter is hearing from them again.
 */
export function hideBlocked(rows, blocked) {
  if (!blocked?.length) return rows;
  const ids = new Set(blocked.map((b) => b.id));
  return rows.filter((row) => {
    const seller = sellerIdFor(row);
    return !seller || !ids.has(seller);
  });
}
