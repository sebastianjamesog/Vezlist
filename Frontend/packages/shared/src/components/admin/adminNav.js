/**
 * One nav source the rail and the drawer both read, the way `navItems.js`
 * already serves both public bars.
 *
 * `badge` names a key on `counts(state)` rather than carrying a number: the
 * nav is a static list, and the number is whatever the store says this render.
 *
 * `permission` names what a role must hold to see the entry at all. A nav
 * link to a screen that will only tell you no is worse than no link.
 *
 * `scoped: false` means the site switcher cannot move this screen — the help
 * centre is one help centre and the console's own settings belong to neither
 * board. The top bar hides the control there rather than leaving a global
 * switch that silently does nothing, which reads as broken and not as
 * inapplicable.
 */
export const adminNav = [
  {
    title: "Overview",
    items: [
      { to: "/", label: "Dashboard", icon: "Gauge", end: true },
      {
        to: "/analytics",
        label: "Analytics",
        icon: "ChartColumn",
        permission: "analytics.view",
      },
    ],
  },
  {
    title: "Moderation",
    items: [
      {
        to: "/listings",
        label: "Listings",
        icon: "Megaphone",

      },
      { to: "/reviews", label: "Review queue", icon: "ClipboardCheck", badge: "pending", permission: "listing.moderate" },
      {
        to: "/reports",
        label: "Reports",
        icon: "ShieldCheck",
        badge: "openReports",
      },
      {
        to: "/appeals",
        label: "Appeals",
        icon: "ClipboardCheck",
        badge: "openAppeals",
      },
      {
        to: "/verifications",
        label: "Verifications",
        icon: "BadgeCheck",
        badge: "openVerifications",
      },
    ],
  },
  {
    title: "People",
    items: [
      { to: "/users", label: "Users", icon: "User" },
      {
        to: "/live",
        label: "Live",
        icon: "Radio",
        scoped: false,
        permission: "stream.moderate",
      },
      { to: "/status", label: "Status", icon: "Clapperboard" },
    ],
  },
  {
    title: "Support",
    items: [
      {
        to: "/tickets",
        label: "Tickets",
        icon: "LifeBuoy",
        badge: "openTickets",
      },
      { to: "/content", label: "Content", icon: "FileText", scoped: false },
    ],
  },
  {
    title: "Configuration",
    items: [
      { to: "/taxonomy", label: "Taxonomy", icon: "Tag" },
      {
        to: "/live-plans",
        label: "Live plans",
        icon: "Radio",
        scoped: false,
        permission: "livePlans.manage",
      },
      {
        to: "/story-plans",
        label: "Story packs",
        icon: "Clapperboard",
        scoped: false,
        permission: "storyPlans.manage",
      },
      { to: "/notifications", label: "Notifications", icon: "Bell" },
      {
        to: "/admins",
        label: "Admins",
        icon: "ShieldCheck",
        scoped: false,
        permission: "admins.manage",
      },
      // No `site` of its own — a reset or a settings edit belongs to neither
      // board — so it sits alongside Content and Settings as unscoped.
      { to: "/audit", label: "Audit log", icon: "Clock", scoped: false },
      { to: "/settings", label: "Settings", icon: "Settings", scoped: false },
    ],
  },
];

/** Flat, for the "where am I" lookup the top bar does. */
export const adminRoutes = adminNav.flatMap((group) => group.items);

/**
 * Does the site switcher do anything on this path?
 *
 * Detail screens are one row, already belonging to one board, so scoping them
 * is meaningless too — `/listings/l1` is not a marketplace-or-personals
 * question, it is a specific ad.
 */
export function pathIsScoped(pathname) {
  const match = adminRoutes.find(
    (item) =>
      item.to === pathname ||
      (item.to !== "/" && pathname.startsWith(`${item.to}/`)),
  );
  if (!match) return false;
  // A path deeper than the nav entry is a detail screen.
  if (match.to !== pathname) return false;
  return match.scoped !== false;
}
