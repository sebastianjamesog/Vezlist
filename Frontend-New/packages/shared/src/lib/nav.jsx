"use client";

import { useCallback, useEffect, useMemo } from "react";
import NextLink from "next/link";
import {
  usePathname,
  useRouter,
  useSearchParams as useNextSearchParams,
} from "next/navigation";

/**
 * The handful of react-router APIs the screens were written against, backed by
 * the Next router. A shim rather than a rewrite: `navigate(-1)` and
 * `setParams({cat})` read the same at 30-odd call sites, and the ones that
 * genuinely differ (there is no `location.key`) are called out below.
 */

/** react-router's `navigate`: a path, `{ replace }`, or a history delta. */
export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (to, opts) => {
      if (typeof to === "number") {
        // Only ±1 was ever used, and Next exposes exactly that.
        if (to < 0) router.back();
        else router.forward();
        return;
      }
      if (opts?.replace) router.replace(to);
      else router.push(to);
    },
    [router],
  );
}

/**
 * `useLocation().pathname` is all the screens read. There is no `key`: Next has
 * no per-entry history key, so "did I arrive here from inside the app?" is
 * `window.history.length` instead — see StatusViewer.
 */
export function useLocation() {
  const pathname = usePathname();
  return useMemo(() => ({ pathname }), [pathname]);
}

/**
 * react-router's tuple. Next's own hook is read-only, so the setter writes the
 * query back through the router. Accepts a plain object the way the call sites
 * pass one; replaces rather than pushes, so toggling a tab doesn't stack
 * history entries you have to click back through.
 */
export function useSearchParams() {
  const params = useNextSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const setParams = useCallback(
    (next) => {
      const qs = new URLSearchParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  return [params, setParams];
}

/**
 * `<NavLink>` over `next/link`. Keeps the render-prop shape both bars use:
 * `className` and `children` may each be a function of `{ isActive }`.
 *
 * `end` means "exact match only" — without it `/` would light up on every page.
 */
export function NavLink({ to, end, className, children, ...props }) {
  const pathname = usePathname();
  const isActive = end
    ? pathname === to
    : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <NextLink
      href={to}
      aria-current={isActive ? "page" : undefined}
      className={
        typeof className === "function" ? className({ isActive }) : className
      }
      {...props}
    >
      {typeof children === "function" ? children({ isActive }) : children}
    </NextLink>
  );
}

/** Declarative redirect for a screen that decides, after its hooks, it has nothing to show. */
export function Navigate({ to, replace }) {
  const router = useRouter();
  useEffect(() => {
    if (replace) router.replace(to);
    else router.push(to);
  }, [router, to, replace]);
  return null;
}
