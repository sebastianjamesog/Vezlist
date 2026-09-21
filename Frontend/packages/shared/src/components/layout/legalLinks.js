import { IS_PERSONALS } from "../../lib/sites";

/**
 * The pages a legal review, a takedown notice or a privacy question has to be
 * able to find, in the order they belong in.
 *
 * One source, the way `navItems.js` is one source for the tab bar and the
 * rail. Below `lg` these rows live in `Settings`; at `lg` and up they live in
 * `Footer`. Two hand-kept copies of this list is how the personals board ends
 * up shipping a footer that links 2257 and a settings screen that does not.
 *
 * Personals-only entries stay personals-only: neither page exists on the
 * marketplace, and a link to a 404 is worse than no link at all.
 */
export const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  ...(IS_PERSONALS
    ? [
        { href: "/2257", label: "18 U.S.C. 2257" },
        { href: "/dmca", label: "DMCA" },
      ]
    : []),
];
