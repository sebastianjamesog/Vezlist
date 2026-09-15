/**
 * Where the pins are, and which of them collapse into one.
 *
 * The feed rows in `data/mock.js` describe ads, not places — they carry a
 * `location` label and a `distanceKm`, and nothing else that a map can use.
 * Rather than add coordinates to the mock (that file is the shared data layer
 * and every screen reads it; widening it for one screen is the kind of change
 * that has to be argued for elsewhere), the map derives its own. Nothing here
 * touches Leaflet or the DOM, so it stays unit-testable and safe to import from
 * anywhere.
 */

/**
 * FNV-1a, the same technique `mock.js` uses to pick a sub-category from a
 * title. `Math.random()` is the obvious alternative and the wrong one: this map
 * is client-only so hydration is not the hazard, but a pin whose latitude is
 * re-rolled on every render walks across the map whenever a filter chip is
 * tapped, and two renders of the same listing would disagree about where it is.
 * A hash of the id is the same number forever.
 */
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Two independent 0..1 draws out of one hash — high bits and low bits. */
const unitPair = (h) => [((h >>> 16) & 0xffff) / 0xffff, (h & 0xffff) / 0xffff];

/** Degrees of latitude per kilometre. Close enough at city scale. */
const KM_PER_DEG_LAT = 110.574;

/**
 * Scatter a feed around a centre point.
 *
 * The bearing comes out of the hash, but the *radius* is the listing's real
 * `distanceKm`, so a pin sitting three rings out from the middle is the same ad
 * the sheet below describes as "3.2 km away". Deriving the radius from the hash
 * too would have been one line shorter and would have let the map contradict
 * the list it sits on top of, which is the sort of thing nobody notices in
 * review and everybody notices in use.
 *
 * A small hashed jitter is folded in so that two ads recorded at the same
 * distance do not land on the same circle at the same angle by coincidence.
 */
export function scatterAround(items, [centerLat, centerLng]) {
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180);

  return items.map((item) => {
    const h = hashString(String(item.id ?? item.title ?? ""));
    const [bearingSeed, jitterSeed] = unitPair(h);

    const bearing = bearingSeed * Math.PI * 2;
    // ±18% on the radius: enough to break up rings, small enough that the
    // distance the card claims still reads as true.
    const km = Math.max(
      0.2,
      (item.distanceKm ?? 2) * (0.82 + jitterSeed * 0.36),
    );

    return {
      id: item.id,
      listing: item,
      lat: centerLat + (km * Math.cos(bearing)) / KM_PER_DEG_LAT,
      lng: centerLng + (km * Math.sin(bearing)) / kmPerDegLng,
    };
  });
}

/**
 * Only draw what is on screen, plus a margin.
 *
 * Thirty-five mock rows would survive being rendered all at once; a real feed
 * would not, and the cheapest time to put the bound in is before there is a
 * feed to break. The margin means panning a short way reveals pins that are
 * already mounted instead of popping them in at the edge.
 */
export function pointsInView(points, map, padRatio = 0.35) {
  const bounds = map.getBounds().pad(padRatio);
  return points.filter((p) => bounds.contains([p.lat, p.lng]));
}

/**
 * Grid clustering, in screen space rather than in degrees.
 *
 * Bucketing by rounded lat/lng is the usual shortcut and it distorts: a cell of
 * 0.01° is a different number of pixels at every zoom level and a different
 * shape at every latitude. Projecting each point to the map's layer pixels
 * first and bucketing on that gives cells that are square and the same size on
 * screen at every zoom — which is what "these pins overlap" actually means.
 *
 * `cellPx` is a little wider than a pin so that neighbours merge just before
 * they would visibly collide. Recompute on `zoomend`/`moveend`; layer points
 * are only stable within one zoom level.
 */
export function clusterPoints(points, map, cellPx = 72) {
  const buckets = new Map();

  for (const p of points) {
    const px = map.latLngToLayerPoint([p.lat, p.lng]);
    const key = `${Math.floor(px.x / cellPx)}:${Math.floor(px.y / cellPx)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(p);
    else buckets.set(key, [p]);
  }

  return [...buckets.entries()].map(([key, members]) => ({
    key,
    members,
    // The cluster sits at the mean of its members rather than at the centre of
    // the cell, so expanding it zooms towards the pins and not towards a grid
    // line that only exists in this function.
    lat: members.reduce((s, p) => s + p.lat, 0) / members.length,
    lng: members.reduce((s, p) => s + p.lng, 0) / members.length,
  }));
}

/**
 * Honoured in JS as well as in CSS. `index.css` already squashes every
 * transition and animation under `prefers-reduced-motion`, but a pin's
 * entrance animation is markup we build by hand, and the honest fix is to not
 * emit the animated class at all rather than to emit it and let a global rule
 * clip it to 0.01ms — a squashed keyframe still flickers.
 */
export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
