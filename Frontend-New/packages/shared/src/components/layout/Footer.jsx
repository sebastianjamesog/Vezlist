import Link from "next/link";
import { SITE_NAME } from "../../lib/sites";
import { LEGAL_LINKS } from "./legalLinks";

// Support is not a legal page, but it is the other thing somebody scanning the
// bottom of a desktop window is looking for, so it rides along here and not in
// `LEGAL_LINKS`. On a phone it needs no link at all: it is a tab in the bar.
const LINKS = [...LEGAL_LINKS, { href: "/support", label: "Support" }];

/**
 * The desktop-only version of the links a legal review, a support request or a
 * takedown notice needs to find. There was no footer before this — grep
 * confirmed it — and the sign-up checkbox in Login.jsx pointed at "the terms of
 * service and privacy policy" with nothing behind either word.
 *
 * ── Why it is `hidden` below lg ───────────────────────────────────────────
 *
 * On a phone this row sat at the bottom of every screen the shell wraps, above
 * a floating tab bar it had to reserve `--spacing-nav` to clear — roughly 120px
 * of chrome under sixty-odd screens, to hold four links nobody taps mid-feed.
 * The phone build puts the same links where a phone user goes looking for
 * them: the Legal card in `Settings`, plus a row at the foot of `Support` for
 * anyone who is not signed in (everything under `/profile` is behind
 * `RequireAuth`, so the settings copy alone would be unreachable signed-out).
 *
 * Desktop keeps the footer: there is no floating nav to clear, the window is
 * wide enough that the row costs nothing, and a footer is where a reader on a
 * desktop looks for exactly this.
 *
 * Mounted once, in `AppLayout`'s `Shell`, rather than by each of the screens it
 * draws under — the same reasoning as `BottomNav` and `Sidebar`: chrome that
 * belongs to the shell should not be a thing every page remembers to import.
 * It sits inside `<main>`, after the screen, as a `shrink-0` row rather than
 * inside the page's own scrolling container (`[data-scroll]` in `PageBody`);
 * mounting it there would mean editing every page instead of the one shell
 * they all pass through.
 */
export default function Footer() {
  return (
    <footer className="hidden shrink-0 border-t border-line px-4 py-3 lg:block lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] font-semibold text-muted lg:justify-start">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="transition-colors hover:text-ink hover:underline"
          >
            {link.label}
          </Link>
        ))}
        <span className="text-[11px] font-medium text-muted">
          &copy; {new Date().getFullYear()} {SITE_NAME}
        </span>
      </div>
    </footer>
  );
}
