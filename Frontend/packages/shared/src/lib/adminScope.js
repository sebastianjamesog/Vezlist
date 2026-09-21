"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Which of the two boards the console is looking at.
 *
 * It lives in the URL rather than in a context because that is what makes a
 * queue view a link: `/listings?status=pending&site=personals` is something a
 * moderator can paste to a second moderator, and a scope held in React state
 * is not. Every list screen reads it; `all` is the default and is not written
 * to the query at all.
 */
export const ALL_SITES = "all";

/** Read and write one query parameter without losing the others. */
export function useQueryParam(key, fallback = ALL_SITES) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(key) ?? fallback;

  const setValue = useCallback(
    (next) => {
      const merged = new URLSearchParams(params);
      // The default is the absence of the parameter, so a cleared filter
      // leaves a clean URL instead of `?site=all&status=all`.
      if (!next || next === fallback) merged.delete(key);
      else merged.set(key, next);
      const qs = merged.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname, key, fallback],
  );

  return [value, setValue];
}

export function useSiteScope() {
  return useQueryParam("site");
}

/** Does this row belong to the scope in force? */
export const inScope = (row, site) => site === ALL_SITES || row.site === site;
