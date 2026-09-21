import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetRoute } from "./stubs/next-navigation.js";

/**
 * jsdom does no layout, so every element reports `offsetWidth`,
 * `offsetHeight` and `getClientRects()` as empty regardless of what is on
 * screen. `lib/useDialogFocus.js` filters its tab stops on exactly those three
 * — that is how it keeps `ConfirmDialog`'s `display: none` body from
 * swallowing the first Tab — so under an unpatched jsdom every dialog would
 * report zero tab stops and the trap would look broken when it is not.
 *
 * Rather than fake a box per element, the stylesheet below teaches jsdom the
 * one Tailwind utility the focus code depends on (`.hidden` is
 * `display: none`) and `getClientRects` is then answered from the *real*
 * cascade: an element is "rendered" if nothing in its ancestor chain computes
 * to `display: none` and it is attached to the document. That keeps the test
 * asserting on the component's actual class names instead of on a mock.
 */
const stylesheet = document.createElement("style");
stylesheet.textContent = ".hidden{display:none}[hidden]{display:none}";
document.head.append(stylesheet);

const BOX = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 100,
  bottom: 20,
  width: 100,
  height: 20,
  toJSON: () => ({}),
};

function rendered(el) {
  for (let node = el; node instanceof Element; node = node.parentElement) {
    if (getComputedStyle(node).display === "none") return false;
  }
  return el.isConnected;
}

Element.prototype.getClientRects = function getClientRects() {
  const list = rendered(this) ? [BOX] : [];
  list.item = (i) => list[i] ?? null;
  return list;
};
Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return rendered(this)
    ? { ...BOX }
    : { ...BOX, right: 0, bottom: 0, width: 0, height: 0 };
};

// jsdom ships neither of these and several screens read them on mount.
window.matchMedia ??= (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
});
window.scrollTo ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

/**
 * Web Storage, because neither runtime under the test supplies a usable one.
 *
 * Node 26 defines its own `globalThis.localStorage`, which throws unless the
 * process was started with `--localstorage-file`; jsdom's is then not
 * installed over it, and the shared code — `lib/persisted.js` and every
 * context above it — reads the bare global and finds `undefined`. Every one of
 * those reads is inside a `try`, so the failure mode is not an error but a
 * silent "no stored value" on every screen, which would quietly turn every
 * persistence assertion into a tautology.
 *
 * This is the whole `Storage` interface, in memory, per test file. `.clear()`
 * in `beforeEach` is what makes each test start on an empty board.
 */
class MemoryStorage {
  #entries = new Map();
  get length() {
    return this.#entries.size;
  }
  key(i) {
    return [...this.#entries.keys()][i] ?? null;
  }
  getItem(k) {
    return this.#entries.has(String(k)) ? this.#entries.get(String(k)) : null;
  }
  setItem(k, v) {
    this.#entries.set(String(k), String(v));
  }
  removeItem(k) {
    this.#entries.delete(String(k));
  }
  clear() {
    this.#entries.clear();
  }
}

for (const name of ["localStorage", "sessionStorage"]) {
  const store = new MemoryStorage();
  Object.defineProperty(globalThis, name, {
    value: store,
    configurable: true,
    writable: true,
  });
  if (window !== globalThis) window[name] = store;
}

beforeEach(() => {
  resetRoute();
  localStorage.clear();
  sessionStorage.clear();
  // Cookie state leaks between tests otherwise — `lib/cookieStore.js` writes
  // the session and the wallet here and neither is namespaced by test.
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0].trim();
    if (name) document.cookie = `${name}=; max-age=0; path=/`;
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
