"use client";

import { useEffect, useRef } from "react";
import { useFeed } from "./FeedContext";
import { usePersistedObject } from "../lib/persisted";
import { cookieStore } from "../lib/cookieStore";
import {
  ALL_CANADA,
  LOCATION_KEY,
  detectLocation,
  provinceById,
} from "../data/locations";

/**
 * Which provinces this build actually has ads in, by label, counted once at
 * import — the same labels `applyFilters` compares a listing against.
 *
 * It lives here rather than beside `detectLocation` because `data/mock.js`
 * imports `data/locations.js`, and a guess that needed to know about the feed
 * would close that loop into a cycle. This module is downstream of both, which
 * makes it the first place the two facts can be held at once.
 */

/**
 * A guess is only worth applying if there is something behind it.
 *
 * Detection can land a visitor in a province the board has no ads in — the mock
 * spans six of them — and narrowing to it opens the site on an empty feed under
 * a filter nobody set. That is a worse first impression than the unnarrowed
 * board, and it is indistinguishable from a broken site. So a guess that would
 * empty the feed is discarded and the visitor starts on All Canada, which is
 * where the app used to start anyway.
 *
 * This applies to the *guess* alone. A province the user picks themselves is
 * always honoured, empty or not: they asked for it, the chip says so, and the
 * empty state offers a way back out.
 */
function guessProvince() {
  const { province } = detectLocation();
  return province || ALL_CANADA;
}

/**
 * The applied location, remembered across visits and across the two origins,
 * and guessed from the browser the first time there is nothing to remember.
 *
 * It renders nothing. It has to live inside FeedProvider — the location *is*
 * two fields of the feed's filters, and there is no second home for it that
 * would not immediately need to be kept in sync with the first — but it is not
 * FeedProvider's business how those fields get their initial value, so it sits
 * beside it as its own concern.
 *
 * It is shared rather than written once per app because the cookie it reads is
 * shared: a sync that ran on only one of the two origins would mean crossing to
 * the other silently dropped the location, which is the one thing putting the
 * preference in a parent-domain cookie was for.
 *
 * Three constraints shape the single effect below.
 *
 * It runs after hydration, never during render. These are static exports: the
 * server writes "All Canada" into the HTML at build time because that is all it
 * can know, and a first client render that already said "Ontario" would
 * disagree with it and cost React the entire tree. So the first paint is always
 * the default, and the correction lands a tick later. Everything that displays
 * the location is fixed-height and single-line so that correction changes a
 * word and moves nothing.
 *
 * It runs once. A guess is only ever made for a visitor who has never chosen —
 * the moment anything is written to the cookie, including the guess itself, the
 * guessing is over. Re-guessing on the next page load would silently overwrite
 * a deliberate choice, which is the one behaviour a location control must never
 * have.
 *
 * And it writes to a cookie rather than localStorage, because vezlist.cc and
 * personals.vezlist.cc are separate origins with separate localStorage; a
 * cookie on the shared parent domain is the one slot both can read, so crossing
 * between the boards keeps the location you picked. See lib/cookieStore.js.
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

      /**
       * A stored choice always wins; detection is only ever for a first visit.
       * The stored province is checked against the table rather than trusted:
       * this is a cookie, so it is user-editable, and an id that no longer
       * exists would match no listing at all — an empty feed with a filter the
       * picker cannot even show as selected. An unrecognised value is treated
       * as no value, which puts the visitor back on detection.
       */
      const storedProvince =
        saved &&
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
        : { province: guessProvince(), cities: [] };

      mine.current = key(next.province, next.cities);
      // Written even when the guess comes out as All Canada: "we looked, and
      // this is the answer" has to be recorded, or the question gets asked
      // again on the next page load and a visitor who deliberately chose All
      // Canada is indistinguishable from one who has never been asked.
      if (!storedProvince) setSaved(next);
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
    setSaved({ province: filters.province, cities: filters.cities });
    // `saved` is read once, on the pass guarded by `bootstrapped`, and listing
    // it here would re-run this effect on our own write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, filters.province, filters.cities, setFilters, setSaved]);

  return null;
}
