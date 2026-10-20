"use client";

import { useEffect, useRef } from "react";
import { useFeed } from "./FeedContext";
import { usePersistedObject } from "../lib/persisted";
import { cookieStore } from "../lib/cookieStore";
import { ALL_CANADA, LOCATION_KEY, provinceById } from "../data/locations";

/** Start across Canada; remember only a location the visitor explicitly chose.
 * Legacy cookies may contain a timezone guess, so they are intentionally ignored.
 * The parent-domain cookie shares deliberate choices between the two boards.
 */
export default function LocationSync() {
  const { filters, setFilters } = useFeed();
  const [saved, setSaved, loaded] = usePersistedObject(
    LOCATION_KEY,
    cookieStore,
  );
  const bootstrapped = useRef(false);
  /**
   * The location this component last put into play, as a comparable string.
   *
   * It is what separates "the user moved the location" from "the location moved
   * because we just moved it". Both arrive at this effect as the same filter
   * change, and without the distinction the mirror below would either fight the
   * bootstrap or write the pre-bootstrap default straight back over the guess.
   */
  const mine = useRef(null);
  /**
   * Whether the bootstrap's own filter change has landed yet. Until it has,
   * this effect can be re-entered — StrictMode double-invokes an effect on
   * mount, and a batched setFilters has not applied by the time it does — and
   * the filters it would read are still the pre-bootstrap default. Mirroring
   * that back would write All Canada straight over the guess that was just
   * made. So the mirror stays disarmed until what it sees matches what this
   * component asked for.
   */
  const armed = useRef(false);

  const key = (province, cities) => JSON.stringify({ province, cities });

  useEffect(() => {
    if (!loaded) return;

    if (!bootstrapped.current) {
      bootstrapped.current = true;

      const storedProvince =
        saved?.source === "manual" &&
        typeof saved.province === "string" &&
        provinceById(saved.province).id === saved.province
          ? saved.province
          : null;

      const next = storedProvince
        ? {
            province: storedProvince,
            cities: Array.isArray(saved.cities)
              ? saved.cities.filter((c) => typeof c === "string")
              : [],
          }
        : { province: ALL_CANADA, cities: [] };

      mine.current = key(next.province, next.cities);
      if (mine.current === key(filters.province, filters.cities)) {
        // Already exactly what the feed holds — nothing to apply, and nothing
        // to wait for before the mirror can be trusted.
        armed.current = true;
      } else {
        setFilters((f) => ({ ...f, ...next }));
      }
      return;
    }

    // Past the first pass this is a mirror: whatever the user does to the
    // location, on this screen or any other, ends up in the cookie.
    const now = key(filters.province, filters.cities);
    if (now === mine.current) {
      // The bootstrap's change has landed. Everything after this is the user.
      armed.current = true;
      return;
    }
    if (!armed.current) return;
    mine.current = now;
    setSaved({
      province: filters.province,
      cities: filters.cities,
      source: "manual",
    });
    // `saved` is read once, on the pass guarded by `bootstrapped`, and listing
    // it here would re-run this effect on our own write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, filters.province, filters.cities, setFilters, setSaved]);

  return null;
}
