"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "../lib/nav";

/**
 * Gate for the account screens. The session lives in localStorage, which does
 * not exist until after hydration, so this renders nothing on the first pass
 * rather than flashing a signed-out screen and then correcting itself.
 *
 * Where you were going is carried to the form as `?next=`, so signing in puts
 * you back on the page you asked for instead of the home screen.
 */
export default function RequireAuth({ children }) {
  const { signedIn, ready } = useAuth();
  const navigate = useNavigate();
  const pathname = usePathname();

  // Logging out picks its own destination. Without this the guard races it and
  // wins, landing you on /login?next=<the page you just chose to leave>. Both
  // the marker and the redirect live in the effect (never read/write `.current`
  // during render): the write only needs to land before the *next* render that
  // could see `signedIn` flip to false, and an effect always commits ahead of
  // that, since flipping `signedIn` is itself a separate, later state update.
  const hadSession = useRef(false);

  useEffect(() => {
    if (signedIn) {
      hadSession.current = true;
      return;
    }
    if (!ready || hadSession.current) return;
    navigate(`/login?next=${encodeURIComponent(pathname)}`, { replace: true });
  }, [ready, signedIn, navigate, pathname]);

  if (!ready || !signedIn) return null;
  return children;
}
