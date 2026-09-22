"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import Icon from "../ui/Icon";
import { NavLink, useNavigate } from "../../lib/nav";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useAdminData } from "../../context/AdminDataContext";
import { counts } from "../../lib/adminStore";
import { ALL_SITES, useSiteScope } from "../../lib/adminScope";
import { MARKETPLACE_URL, PERSONALS_URL, SITES } from "../../lib/sites";
import { adminNav, pathIsScoped } from "./adminNav";
import RequireAdmin from "./RequireAdmin";
import MediaImage from "../media/MediaImage.jsx";

/**
 * The console shell.
 *
 * The public `AppLayout` is not reused, and that is a decision rather than an
 * oversight: it is a phone mockup with five bottom-nav slots, and five slots do
 * not hold thirteen sections. This is the other shape — a fixed rail, a wide
 * content column, and no pretending to be a phone.
 *
 * Three widths: a drawer below `lg`, an icon-only rail from `lg`, and the full
 * 240px rail from `xl`. The middle one exists because a 13" laptop with a
 * table on it wants the horizontal room more than it wants the labels.
 */

const SCOPES = [{ id: ALL_SITES, label: "Both sites" }, ...SITES];

export default function AdminLayout({ children }) {
  const [drawer, setDrawer] = useState(false);
  const close = () => setDrawer(false);

  return (
    <RequireAdmin>
      <div className="flex h-full bg-canvas">
        <Rail className="hidden lg:flex" />

        {drawer && (
          <div className="fixed inset-0 z-[900] lg:hidden">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
              onClick={close}
              aria-hidden="true"
            />
            <div className="relative flex h-full w-64 flex-col bg-surface shadow-lift">
              <button
                type="button"
                onClick={close}
                aria-label="Close navigation"
                className="absolute right-2 top-3 z-10 grid size-9 place-items-center rounded-xl text-muted hover:bg-canvas hover:text-ink"
              >
                <X className="size-5" strokeWidth={2.4} />
              </button>
              <Rail
                className="flex h-full w-64 border-r-0"
                expanded
                onNavigate={close}
              />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onMenu={() => setDrawer(true)} />
          <div data-scroll className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1600px] px-4 py-5 lg:px-8 lg:py-7">
              {children}
            </div>
          </div>
        </div>
      </div>
    </RequireAdmin>
  );
}

/* -------------------------------------------------------------------- rail */

function Rail({ className = "", expanded = false, onNavigate }) {
  const { state } = useAdminData();
  const { can } = useAdminAuth();
  // Scoped, so the badge and the screen it leads to always name the same
  // number — switching the top bar to Personals must not leave a rail badge
  // counting marketplace work.
  const [site] = useSiteScope();
  const tallies = counts(state, site);
  // The drawer is always labelled; the rail earns its labels at xl.
  const label = expanded ? "flex" : "hidden xl:flex";
  const width = expanded ? "" : "w-[76px] xl:w-60";

  return (
    <aside
      className={`shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface px-3 py-4 ${width} ${className}`}
    >
      <Link
        href="/"
        onClick={onNavigate}
        className="mb-4 flex items-center gap-2.5 px-2 py-1"
        aria-label="Vezlist console, dashboard"
      >
        <span className="brand-gradient grid size-9 shrink-0 place-items-center rounded-xl text-on-brand">
          <Icon name="Gauge" className="size-5" strokeWidth={2.6} />
        </span>
        <span className={`min-w-0 flex-col ${label}`}>
          <span className="text-[15px] font-extrabold leading-tight text-ink">
            Vezlist
          </span>
          <span className="text-[12px] font-semibold leading-tight text-muted">
            Console
          </span>
        </span>
      </Link>

      {adminNav.map((group) => {
        // A link to a screen that will only tell you no is worse than no link,
        // so an entry the role cannot use does not appear — and a group left
        // empty by that filtering takes its heading with it.
        const items = group.items.filter(
          (item) => !item.permission || can(item.permission),
        );
        if (!items.length) return null;

        return (
          <div key={group.title} className="mb-1">
            <p
              className={`px-2 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-muted ${label}`}
            >
              {group.title}
            </p>
            {items.map((item) => {
              const badge = item.badge ? tallies[item.badge] : 0;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={item.label}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `group relative mb-0.5 flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-[14px] font-semibold transition-colors ${
                      isActive
                        ? "bg-brand-soft text-brand"
                        : "text-ink hover:bg-canvas"
                    }`
                  }
                >
                  <span className="relative grid size-6 shrink-0 place-items-center">
                    <Icon
                      name={item.icon}
                      className="size-5"
                      strokeWidth={2.3}
                    />
                    {/* Collapsed, there is no room for the count beside the
                      label, so it becomes a dot on the glyph. */}
                    {badge > 0 && (
                      <span
                        className={`absolute -right-1 -top-1 size-2 rounded-full bg-red-500 ${expanded ? "hidden" : "xl:hidden"}`}
                      />
                    )}
                  </span>
                  <span className={`min-w-0 flex-1 truncate ${label}`}>
                    {item.label}
                  </span>
                  {badge > 0 && (
                    <span
                      className={`shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700 ${label}`}
                    >
                      {badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        );
      })}

      <div className={`mt-auto flex-col gap-1 pt-4 ${label}`}>
        <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted">
          Open site
        </p>
        {/* Separate deployments, so these are real navigations, not router
            links — the same rule the public top bars follow. */}
        <a
          href={MARKETPLACE_URL}
          className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-muted hover:text-brand"
        >
          vezlist.cc ↗
        </a>
        <a
          href={PERSONALS_URL}
          className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-muted hover:text-brand"
        >
          personals ↗
        </a>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ topbar */

function TopBar({ onMenu }) {
  const { admin, signOut } = useAdminAuth();
  const [site, setSite] = useSiteScope();
  const [menu, setMenu] = useState(false);
  const navigate = useNavigate();
  const scoped = pathIsScoped(usePathname());

  /**
   * Signing out has to pick its own destination.
   *
   * `RequireAdmin` deliberately refuses to redirect a session it has already
   * seen — otherwise it races a sign-out and lands you on
   * `/login?next=<the page you just chose to leave>`. The cost of that guard is
   * that the sign-out is now responsible for the navigation: without this the
   * gate returns `null`, the whole console goes blank, and only a manual URL
   * edit gets it back. The public `Profile` and `Sidebar` do the same pairing.
   */
  function endSession() {
    setMenu(false);
    signOut();
    navigate("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3 lg:px-8">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open navigation"
        className="grid size-9 shrink-0 place-items-center rounded-xl border border-line text-ink lg:hidden"
      >
        <Menu className="size-5" strokeWidth={2.4} />
      </button>

      {/* The site scope is a filter every list screen reads, and it lives in
          the URL — which is what makes a filtered queue a link you can send.
          It is hidden where it cannot change anything: a global control that
          silently does nothing reads as broken, not as inapplicable. */}
      {scoped ? (
        <div
          role="group"
          aria-label="Site scope"
          className="flex gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line"
        >
          {SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={site === s.id}
              onClick={() => setSite(s.id)}
              className={`rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                site === s.id
                  ? "bg-surface text-ink shadow-card"
                  : "text-muted hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[13px] font-medium text-muted">
          Applies to both sites
        </p>
      )}

      <div className="relative ml-auto">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          aria-expanded={menu}
          aria-haspopup="menu"
          className="flex items-center gap-2 rounded-2xl border border-line py-1.5 pl-1.5 pr-3 transition-colors hover:bg-canvas"
        >
          <MediaImage
            src={admin?.avatar}
            alt=""
            width={28}
            height={28}
            className="size-7 shrink-0 rounded-full object-cover"
          />
          <span className="hidden text-left sm:block">
            <span className="block text-[13px] font-bold leading-tight text-ink">
              {admin?.name}
            </span>
            <span className="block text-[11px] leading-tight text-muted">
              {admin?.role}
            </span>
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-muted"
            strokeWidth={2.6}
          />
        </button>

        {menu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenu(false)}
              aria-hidden="true"
            />
            <div
              role="menu"
              className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-card bg-surface p-1.5 shadow-lift ring-1 ring-line"
            >
              <div className="px-3 py-2">
                <p className="truncate text-[14px] font-bold text-ink">
                  {admin?.name}
                </p>
                <p className="truncate text-[12px] text-muted">
                  {admin?.email}
                </p>
              </div>
              <Link
                href="/settings"
                role="menuitem"
                onClick={() => setMenu(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] font-semibold text-ink hover:bg-canvas"
              >
                <Icon name="Settings" className="size-4" strokeWidth={2.4} />
                Console settings
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={endSession}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold text-danger hover:bg-danger-soft"
              >
                <LogOut className="size-4" strokeWidth={2.4} />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
