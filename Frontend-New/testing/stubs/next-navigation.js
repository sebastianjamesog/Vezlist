import { useSyncExternalStore } from "react";
import { vi } from "vitest";

/**
 * `next/navigation` for jsdom, as a tiny working router rather than four
 * hooks that return constants.
 *
 * The read-only version was not enough. Half the console puts its state in the
 * URL on purpose — `useQueryParam` writes the status filter, the site scope
 * and the search box through `router.replace`, so that a filtered queue is a
 * link one moderator can send another — and a stub whose `replace` only
 * records the call leaves every one of those screens frozen on its initial
 * query. So the stub keeps a location, notifies on change, and the hooks read
 * it through `useSyncExternalStore`: pushing re-renders the tree the way the
 * real router does.
 *
 * `push` and `replace` are still `vi.fn`s, so a test that wants to assert
 * "this row navigated to that ad" can, and a test that wants to follow the
 * navigation gets to.
 */
let pathname = "/";
let params = {};
let search = "";
const listeners = new Set();

function emit() {
  for (const listen of listeners) listen();
}

const subscribe = (listen) => {
  listeners.add(listen);
  return () => listeners.delete(listen);
};

/** Split "/path?a=b" the way the router does before storing it. */
function go(to) {
  if (typeof to !== "string") return;
  const [path, qs = ""] = to.split("?");
  if (path) pathname = path;
  search = qs;
  emit();
}

export const router = {
  push: vi.fn(go),
  replace: vi.fn(go),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

/** Point the stubbed router at a route. Call before `render`. */
export function setRoute({ path = "/", query = "", params: p = {} } = {}) {
  pathname = path;
  search = String(query);
  params = p;
  emit();
}

/** Back to `/` with no params. Called from the global `beforeEach`. */
export function resetRoute() {
  listeners.clear();
  setRoute();
  for (const fn of Object.values(router)) fn.mockClear();
}

/** The current location, for a test that would rather read than assert. */
export const currentUrl = () => (search ? `${pathname}?${search}` : pathname);

export const useRouter = () => router;

export const usePathname = () =>
  useSyncExternalStore(
    subscribe,
    () => pathname,
    () => pathname,
  );

export const useParams = () => params;

// `useSearchParams` must hand back a stable object for a given query string,
// or `useSyncExternalStore` sees a new snapshot on every render and loops.
let cachedSearch = null;
let cachedParams = new URLSearchParams();
function searchParams() {
  if (search !== cachedSearch) {
    cachedSearch = search;
    cachedParams = new URLSearchParams(search);
  }
  return cachedParams;
}

export const useSearchParams = () =>
  useSyncExternalStore(subscribe, searchParams, searchParams);
