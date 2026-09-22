/**
 * What kind of account you signed up as.
 *
 * The public sites had one account shape — everyone got My Ads — and most
 * people who use a classifieds board never post anything. So there are two
 * now: someone who is here to look, and someone who is here to sell. One
 * matrix, read by the shell to decide which tabs exist and by the profile to
 * decide which menu it draws.
 *
 * Same honesty as the rest of this build: there is no server, so this shapes
 * what the UI offers. It is not a security boundary — the client owns the
 * store. On a real backend the matrix moves to the server and stays here only
 * to hide buttons.
 *
 * The console has its own tiers in `adminRoles.js`; these are the public ones
 * and the two never mix.
 */

export const ACCOUNT_ROLES = {
  user: {
    id: "user",
    label: "Browsing",
    short: "Member",
    blurb: "Browse, save and contact. No ads to manage.",
    icon: "User",
  },
  creator: {
    id: "creator",
    label: "Ads creator",
    short: "Creator",
    blurb: "Post ads and watch how they perform.",
    icon: "Megaphone",
  },
};

export const ACCOUNT_ROLE_LIST = Object.values(ACCOUNT_ROLES);

/**
 * What you are when nobody is signed in. Browsing needs no account — that is
 * the point of it — so a guest is a browsing account with no name attached.
 */
export const DEFAULT_ROLE = "user";

/**
 * What making an account makes you.
 *
 * Signup does not ask, because the question had no good answer. Somebody who
 * only wants to look is already able to look; the one thing an account buys you
 * is the ability to put something on the board. Offering "Browsing" on the
 * signup form invited people to pick the account that cannot do the thing they
 * opened the form to do, and then to discover it later on a screen that was
 * missing.
 *
 * Browsing survives as a role you move *down* to in Settings when you have
 * stopped selling, and as what a signed-out visitor is.
 */
export const SIGNUP_ROLE = "creator";

const EVERYONE = ["user", "creator"];
const CREATORS = ["creator"];

/**
 * Capability -> the roles that hold it.
 *
 * Saving is what a board is *for*, so it stays with everyone; everything that
 * puts something on the board is the creator's.
 */
export const CAPABILITIES = {
  "listing.save": EVERYONE,
  "ticket.open": EVERYONE,

  "ad.create": CREATORS,
  "ad.manage": CREATORS,
  "status.post": CREATORS,
  "live.host": CREATORS,
  "dashboard.view": CREATORS,
};

/** Can this role do this thing? An unknown capability is denied, never granted. */
export function can(role, capability) {
  const holders = CAPABILITIES[capability];
  if (!holders) return false;
  return holders.includes(role);
}

/** A stored role that is no longer in the table falls back rather than breaking a screen. */
export function normaliseRole(role) {
  return ACCOUNT_ROLES[role] ? role : DEFAULT_ROLE;
}

export const isCreatorRole = (role) => normaliseRole(role) === "creator";
