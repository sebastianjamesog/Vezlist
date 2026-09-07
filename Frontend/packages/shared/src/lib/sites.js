/**
 * The two origins. They are separate deployments, so moving between them is a
 * real navigation — an <a href>, not a router link.
 *
 * Overridable per build with NEXT_PUBLIC_MARKETPLACE_URL /
 * NEXT_PUBLIC_PERSONALS_URL; the dev defaults match the ports each app's
 * package.json pins.
 */
const dev = process.env.NODE_ENV !== "production";

/** Which of the two builds this bundle is. Set by each app's next.config.mjs. */
export const SITE = process.env.NEXT_PUBLIC_SITE ?? "marketplace";
export const IS_PERSONALS = SITE === "personals";

/**
 * Where the ads actually are. On the marketplace, home is a category
 * launcher and the feed sits behind it; on personals the board is home.
 */
export const FEED_PATH = IS_PERSONALS ? "/" : "/browse";

export const SITE_NAME = IS_PERSONALS ? "Personals" : "Vezlist";
export const SITE_TAGLINE = IS_PERSONALS
  ? "Adults only. 18+."
  : "Post, Promote, Grow.";

export const MARKETPLACE_URL =
  process.env.NEXT_PUBLIC_MARKETPLACE_URL ??
  (dev ? "http://localhost:3000" : "https://vezlist.cc");

export const PERSONALS_URL =
  process.env.NEXT_PUBLIC_PERSONALS_URL ??
  (dev ? "http://localhost:3001" : "https://personals.vezlist.cc");
