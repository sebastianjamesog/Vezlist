import {
  House,
  LayoutGrid,
  LifeBuoy,
  MapPin,
  SquarePlus,
  User,
} from "lucide-react";

import { DEFAULT_ROLE, can } from "../../lib/accountRoles";
import { MARKETPLACE_URL } from "../../lib/sites";

/**
 * Shared by the mobile tab bar and the desktop rail. `create` is not a route —
 * it opens the create sheet, and sits in the middle the way Instagram's does.
 *
 * Both sites serve the same five. Status is not one of them: it has a whole
 * section with the rail on the personals home screen, which is more reachable
 * than a tab, and the bar only has five slots before the chain gets too tall.
 *
 * A slot may name a capability in `cap`, and `navItemsFor` drops a slot whose
 * capability the account does not hold. No slot names one today — see the note
 * on `navItemsFor` for why Create stopped — but the hook stays because a slot
 * that is genuinely meaningless to a role is better absent than dead, and this
 * is where that would be said. The table stays a table either way; it never
 * does the deciding.
 */
export const navItems = [
  { id: "home", to: "/", label: "Home", Icon: House, end: true, solid: true },
  { id: "nearby", to: "/nearby", label: "Nearby", Icon: MapPin, solid: true },
  { id: "create", label: "Create", Icon: SquarePlus, action: "create" },
  { id: "support", to: "/support", label: "Support", Icon: LifeBuoy },
  { id: "profile", to: "/profile", label: "Profile", Icon: User, avatar: true },
];

/**
 * Both bars serve the same five slots, but not always pointed at the same five
 * places. An override is merged into the slot it names — the marketplace's Home
 * goes to the feed rather than back to its launcher — without either bar
 * learning which site it is drawing.
 *
 * Both shift the same two: Category takes the second slot and Nearby drops
 * into the one support left behind — help is a row in the profile menu, which
 * is where people look for it first. The marketplace's Category is its own
 * launcher; personals has no categories of its own, so its slot carries an
 * `href` and leaves for the marketplace origin (a real navigation, not a
 * router push).
 *
 * Sites select a preset by name rather than passing the table: the layouts that
 * choose one are server components, and an override may carry an icon, which is
 * a function, which is not a thing a server component may hand to a client one.
 */
const NAV_PRESETS = {
  marketplace: {
    home: { to: "/browse" },
    nearby: {
      id: "category",
      to: "/",
      label: "Category",
      Icon: LayoutGrid,
      end: true,
    },
    support: {
      id: "nearby",
      to: "/nearby",
      label: "Nearby",
      Icon: MapPin,
      solid: true,
    },
  },
  personals: {
    nearby: {
      id: "category",
      to: undefined,
      href: MARKETPLACE_URL,
      label: "Category",
      Icon: LayoutGrid,
    },
    support: {
      id: "nearby",
      to: "/nearby",
      label: "Nearby",
      Icon: MapPin,
      solid: true,
    },
  },
};

/**
 * The slots for one site and one account, in order.
 *
 * Create used to be conditional. It carried `cap: "ad.create"`, and an account
 * without that capability — a browsing account, and every signed-out visitor,
 * since the default role is browsing — got Saved in the middle slot instead.
 * The reasoning was that a button an account cannot use should not be drawn,
 * and that swapping rather than dropping kept the bar five slots wide so the
 * geometry never moved.
 *
 * It was the wrong call, and the complaint that killed it is the obvious one:
 * the plus is the thing people come to a classifieds app to press, and hiding
 * it does not tell anybody how to get it back. A visitor who has never signed
 * in is exactly the person the button is for, and they were the person least
 * likely to ever see it. So Create is now in the middle for everyone, and the
 * refusal moved to the moment of the tap, where it can say *why* and hand over
 * a route to fix it — see `openPost` in `AppLayout`. Offering a control and
 * answering it honestly beats a control that quietly is not there.
 *
 * Still a plain function called with a role rather than a hook reading one:
 * the site layouts that pick a preset are server components, and this module
 * has to stay importable from them. The two bars are client components, so they
 * are the ones that hold `useAccount()` and pass the role down. Nothing in the
 * table reads it at the moment; the parameter stays because the `cap` filter
 * below is still the way a slot would opt out, and because a bar that has to
 * re-learn how to ask would be a worse place to start from than one that
 * already does.
 *
 * The role still defaults to browsing, which now costs nothing: every role
 * gets the same five slots, so the pre-hydration render and the post-hydration
 * one are the same bar and there was never a flip to reflow around.
 */
export function navItemsFor(preset, role = DEFAULT_ROLE) {
  const overrides = NAV_PRESETS[preset];
  const items = overrides
    ? navItems.map((i) => (overrides[i.id] ? { ...i, ...overrides[i.id] } : i))
    : navItems;

  // A slot whose capability this account lacks is dropped, not stood in for.
  // Both bars derive their geometry from the item count, so a shorter bar is a
  // supported outcome rather than a rendering bug waiting to happen.
  return items.filter((i) => !i.cap || can(role, i.cap));
}
