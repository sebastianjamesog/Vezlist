"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useNavigate } from "../../lib/nav";

/**
 * Gate for the whole console — every route except `/login` sits behind it.
 *
 * The mirror of the public `RequireAuth`: the session lives in localStorage,
 * which does not exist until after hydration, so this renders nothing on the
 * first pass rather than flashing a signed-out console and correcting itself.
 */
export default function RequireAdmin({ children }) {
  const { signedIn, ready } = useAdminAuth();
  const navigate = useNavigate();
  const pathname = usePathname();

  // Signing out picks its own destination. Without this the guard races it and
  // wins, landing on /login?next=<the page you just chose to leave>. Both the
  // marker and the redirect live in the effect (never read/write `.current`
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
