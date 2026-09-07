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
  // wins, landing you on /login?next=<the page you just chose to leave>.
  const hadSession = useRef(false);
  if (signedIn) hadSession.current = true;

  useEffect(() => {
    if (!ready || signedIn || hadSession.current) return;
    navigate(`/login?next=${encodeURIComponent(pathname)}`, { replace: true });
  }, [ready, signedIn, navigate, pathname]);

  if (!ready || !signedIn) return null;
  return children;
}
