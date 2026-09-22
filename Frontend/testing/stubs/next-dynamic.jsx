/**
 * `next/dynamic` for jsdom.
 *
 * There is exactly one call site — `Nearby` pulling in `MapView` with
 * `ssr: false`, because Leaflet reads `window` at import time. jsdom has a
 * `window`, but it has no layout, so Leaflet mounts a map of zero size and
 * every pin lands in the same place; testing the map through it would assert
 * nothing true. The stub renders the placeholder Next would render while the
 * chunk is in flight, which is also what the screen looks like to anyone whose
 * tiles never arrive — and `Nearby`'s own contract is that the list below the
 * map is the real route to every ad, so that is what the smoke test reads.
 */
export default function dynamic(_loader, _options) {
  return function DynamicStub() {
    return <div data-testid="next-dynamic-stub" />;
  };
}
