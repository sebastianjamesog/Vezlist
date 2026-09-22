/** "5 hours Ago" style relative label from a millisecond offset into the past. */
export function timeAgo(msAgo) {
  const units = [
    ["minute", 60_000],
    ["hour", 3_600_000],
    ["day", 86_400_000],
  ];
  let label = "Just now";
  for (const [name, size] of units) {
    const n = Math.floor(msAgo / size);
    if (n >= 1) label = `${n} ${name}${n > 1 ? "s" : ""} Ago`;
  }
  return label;
}

/**
 * Viewer counts the way every live product writes them: exact until a
 * thousand, then one decimal place and a suffix. Numbers on a live screen move
 * every few seconds, so the width has to stop growing or the header reflows
 * under the reader.
 */
export function compactCount(n) {
  if (!Number.isFinite(n) || n < 0) return "0";
  for (const [size, suffix] of [
    [1_000_000, "M"],
    [1_000, "K"],
  ]) {
    if (n >= size) {
      const scaled = n / size;
      // 12.4K reads as noise; 12K is the same number. One decimal only while
      // it still carries information.
      return scaled >= 100
        ? `${Math.round(scaled)}${suffix}`
        : `${Number(scaled.toFixed(1))}${suffix}`;
    }
  }
  return String(Math.round(n));
}

/**
 * A dated row on a record — an audit log entry, a support ticket — from an
 * epoch-millisecond stamp. "12 Aug 2026".
 *
 * Deliberately not `timeAgo`. That one derives from `Date.now()`, and these
 * rows prerender at build time: the server would render one label and the
 * browser another, and React discards the whole tree when they disagree. It is
 * also the wrong unit — people reconcile a record against a dated entry, not
 * against "a while back".
 *
 * Locale and time zone are pinned for that same reason: the build machine's
 * defaults are not the reader's. The cost is that a late-evening purchase can
 * be dated to the next UTC day, which is what a card issuer does anyway.
 */
const STATEMENT_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function statementDate(ms) {
  return Number.isFinite(ms) ? STATEMENT_DATE.format(new Date(ms)) : "";
}
