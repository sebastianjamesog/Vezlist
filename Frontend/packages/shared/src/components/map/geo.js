/**
 * Where the pins are, and which of them collapse into one.
 *
 * Real listings from `lib/api/discovery.js` carry their own latitude and
 * longitude, so there is no fabrication to do here any more — `MapView`
 * reads coordinates straight off the row. What is left is projection-aware
 * geometry (which pins are on screen, which overlap at this zoom), which
 * has nothing to do with where the coordinates came from. Nothing here
 * touches Leaflet or the DOM, so it stays unit-testable and safe to import
 * from anywhere.
 */

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
