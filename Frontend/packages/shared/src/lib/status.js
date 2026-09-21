import { isNonEmptyString, isObject } from "./guards.js";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * Everything in this file is named "status"; on screen it all reads "Stories".
 * The label changed and the identifiers did not, deliberately — the context,
 * the route and these helpers are one set of names, and renaming part of it
 * would leave the codebase saying both.
 */

/**
 * WhatsApp-style age label for a story update: precise while it is fresh,
 * vaguer as it ages out.
 */
export function statusTime(msAgo) {
  if (msAgo < MINUTE) return "Just now";
  if (msAgo < HOUR) {
    const n = Math.floor(msAgo / MINUTE);
    return `${n} minute${n > 1 ? "s" : ""} ago`;
  }
  if (msAgo < DAY) {
    const n = Math.floor(msAgo / HOUR);
    return `Today, ${n} hour${n > 1 ? "s" : ""} ago`;
  }
  const n = Math.floor(msAgo / DAY);
  return n === 1 ? "Yesterday" : `${n} days ago`;
}

/* ------------------------------------------------------- expiry (#30) */

/**
 * How long a story stays in the rail and the viewer once posted: 24 hours,
 * the point `statusTime` already calls "Yesterday" rather than "Today".
 *
 * `msAgo` on a fixture story is a fixed number baked into `data/mock.js` —
 * how old the story was written to look, not a value that ticks forward
 * with the clock — so whether a story is past its TTL reads the same on
 * every render, server or client, with no `Date.now()` anywhere in this
 * file. That is what keeps this SSR-safe: the trap this repo has hit
 * before is a derivation that reads the clock itself (during render, or
 * while seeding state), which hands the server and the first client render
 * two different answers and React throws the tree out as a hydration
 * mismatch. `s5` in the mock is seeded at 28 hours specifically so this
 * has a fixture to prove itself against — see `status.test.js`.
 *
 * A story this device posted is the other case, and it is the one that
 * needs a clock. `StoryComposer` stamps every update it saves with a real
 * `postedAt`, read off the action the way `listings.js`'s `publish` takes
 * `at` rather than reading `Date.now()` inside the reducer — so the
 * comparison below takes `now` as an argument instead of reading it. The
 * clock is read in exactly one place, an effect in `StatusContext`, and
 * nothing in this file reads it at all. That is the same rule as above
 * arrived at from the other direction: a fixture's age is fixed, and a real
 * timestamp is measured against a `now` that no render ever sees.
 */
export const STORY_TTL_MS = DAY;

/** A story new enough to still belong in the rail or the viewer. */
export function isStoryActive(story, ttl = STORY_TTL_MS) {
  return typeof story?.msAgo !== "number" || story.msAgo < ttl;
}

/**
 * One update new enough to still belong in the story it was posted to.
 *
 * The story-level check above cannot answer this. A story is a bag of
 * updates posted at different times, and `mine` carries no `msAgo` at all,
 * so "has your story expired" is really "has each update in it expired",
 * asked one at a time — which is also what lets yesterday's post drop out
 * from under this morning's instead of taking it with it.
 *
 * An update with no `postedAt` is kept rather than dropped: every fixture in
 * `mock.js` is one, and so is anything written by a build older than the
 * composer. Expiring the updates whose age is unknown would empty the seed
 * story on sight, which is the opposite of what a TTL is for.
 */
export function isUpdateActive(update, now, ttl = STORY_TTL_MS) {
  if (typeof update?.postedAt !== "number") return true;
  return now - update.postedAt < ttl;
}

/**
 * Splits the feed three ways: your own entry, then unseen updates
 * newest-first, then everything already viewed. Expired stories never make
 * it into `others` at all — not hidden with a style, dropped, the same way
 * an ad with no title never reaches `My Ads`.
 *
 * `mine` survives for the player, which still rolls through your own story
 * when you have one. The board's rail ignores it — adding a story is an
 * account action now, not the first bubble in the tray. It is not run
 * through `isStoryActive`: it carries no `msAgo` today (see `data/mock.js`)
 * and a story you are still looking at is never "expired" out from under
 * you mid-view.
 */
export function groupStatuses(stories, seenIds = []) {
  const mine = stories.find((s) => s.own) ?? null;
  const others = stories
    .filter((s) => !s.own && s.updates?.length && isStoryActive(s))
    .sort((a, b) => a.msAgo - b.msAgo);

  return {
    mine,
    recent: others.filter((s) => !seenIds.includes(s.id)),
    viewed: others.filter((s) => seenIds.includes(s.id)),
  };
}

/**
 * The one story a given id resolves to, or `null` when there is none — a
 * missing id and an expired one are the same answer, both to a deep link
 * and to the "roll to the next story" logic in `StatusViewer`, which is
 * exactly what a screen that has already fully expired one should be.
 */
export function findActiveStory(stories, id) {
  const story = stories.find((s) => s.id === id) ?? null;
  if (!story) return null;
  if (!story.own && !isStoryActive(story)) return null;
  return story;
}

/** Dash pattern for the ring: one arc per update, with a gap between arcs. */
export function ringDashes(count, circumference, gap = 5) {
  if (count <= 1) return `${circumference} 0`;
  const segment = circumference / count - gap;
  return `${segment} ${gap}`;
}

/* ----------------------------------------------------- reactions (#30) */

/**
 * A viewer's reaction to one story update, kept on this device and nowhere
 * else.
 *
 * There is no server, so a reaction here is exactly what a report is in
 * `lib/reports.js` and a reveal is in `lib/listings.js`: true about the
 * device that made it, and silent about everyone else's. It never reaches
 * the poster — there is nowhere for it to go — so this is a way for a
 * viewer to mark an update for themselves, not a signal sent anywhere. The
 * emoji picked back is proof of that: it is *this device's* choice being
 * played back to it, never a tally of anyone else's.
 */
export const REACTION_EMOJIS = ["❤️", "🔥", "😂", "😮", "👏"];

/** Nothing reacted to yet. */
export const EMPTY_REACTIONS = {};

/** One update's reaction lives under `"<storyId>:<updateId>"`. */
export const reactionKey = (storyId, updateId) => `${storyId}:${updateId}`;

/** This device's reaction to one update, or `null`. */
export function reactionFor(reactions, storyId, updateId) {
  return reactions?.[reactionKey(storyId, updateId)] ?? null;
}

/**
 * The guard `rehydrate` runs stored reactions through before they land in
 * state — the same `normaliseWallet`/`normaliseTicketsState` pattern every
 * other store in this app follows. A key that is not a non-empty string, or
 * a value that is not one of the emoji this build actually offers (a
 * hand-edited `localStorage` entry, or an emoji a later build retired), is
 * dropped rather than rendered as a reaction nobody could have picked.
 */
export function normaliseReactionsState(value) {
  if (!isObject(value)) return {};
  const next = {};
  for (const [key, reaction] of Object.entries(value)) {
    if (isNonEmptyString(key) && REACTION_EMOJIS.includes(reaction)) {
      next[key] = reaction;
    }
  }
  return next;
}

/**
 * One action: react to an update, or clear the reaction already there.
 * Pure, like every other reducer in this app — no clock to take, since a
 * reaction carries no timestamp for anything downstream to read.
 */
export function reactionsReducer(reactions, action) {
  switch (action.type) {
    case "react": {
      const key = reactionKey(action.storyId, action.updateId);
      // Tapping the reaction already showing clears it — the toggle every
      // reaction picker of this shape uses, and the only way to remove one
      // once it's set.
      if (reactions[key] === action.emoji) {
        const next = { ...reactions };
        delete next[key];
        return next;
      }
      return { ...reactions, [key]: action.emoji };
    }

    case "rehydrate":
      return normaliseReactionsState(action.state);

    default:
      return reactions;
  }
}
