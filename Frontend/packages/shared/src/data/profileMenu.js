// Navigation configuration, separate from demo account data.
export const profileMenu = [
  {
    id: "dashboard",
    to: "/profile/dashboard",
    label: "Creator dashboard",
    sub: "Views, saves and active ads this week",
    icon: "ChartNoAxesCombined",
    tone: "brand",
    cap: "dashboard.view",
  },
  {
    id: "ads",
    to: "/profile/ads",
    label: "My Ads",
    sub: "Manage your active listings",
    icon: "Megaphone",
    tone: "brand",
    cap: "ad.manage",
  },
  {
    id: "saved",
    to: "/profile/saved",
    label: "Saved Items",
    sub: "View your bookmarked ads",
    icon: "Heart",
    tone: "soft",
  },
  {
    id: "notifications",
    to: "/profile/notifications",
    label: "Notifications",
    sub: "Alerts, messages, and updates",
    icon: "Bell",
    tone: "soft",
    // No static dot here any more: Profile.jsx derives it from whether
    // `notifications` actually has an unread row, same source TopBar reads.
  },
  {
    id: "settings",
    to: "/profile/settings",
    label: "Account Settings",
    sub: "Privacy, security, and preferences",
    icon: "Settings",
    tone: "grey",
  },
  // Both sites carry a support tab as well; help living in two places is what
  // every app does with it, and this is the one people look for first.
  {
    id: "support",
    to: "/support",
    label: "Help & Support",
    sub: "FAQs, tickets, and contact",
    icon: "LifeBuoy",
    tone: "grey",
  },
];
