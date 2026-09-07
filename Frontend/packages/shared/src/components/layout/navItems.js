import { House, LifeBuoy, MapPin, SquarePlus, User } from "lucide-react";

/**
 * Shared by the mobile tab bar and the desktop rail. `create` is not a route —
 * it opens the create sheet, and sits in the middle the way Instagram's does.
 *
 * Both sites serve the same five. Status is not one of them: it has a whole
 * section with the rail on the personals home screen, which is more reachable
 * than a tab, and the bar only has five slots before the chain gets too tall.
 */
export const navItems = [
  { id: "home", to: "/", label: "Home", Icon: House, end: true, solid: true },
  { id: "nearby", to: "/nearby", label: "Nearby", Icon: MapPin, solid: true },
  { id: "create", label: "Create", Icon: SquarePlus, action: "create" },
  { id: "support", to: "/support", label: "Support", Icon: LifeBuoy },
  { id: "profile", to: "/profile", label: "Profile", Icon: User, avatar: true },
];
