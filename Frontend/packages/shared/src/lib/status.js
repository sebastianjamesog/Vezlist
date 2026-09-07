const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * WhatsApp-style age label for a status update: precise while it is fresh,
 * vaguer as it ages out.
 */
export function statusTime(msAgo) {
  if (msAgo < MINUTE) return "Just now";
  if (msAgo < HOUR) {
    const n = Math.floor(msAgo / MINUTE);
    return `${n} minute${n > 1 ? "s" : ""} ago`;
  }
  if (msAgo < DAY) {
    const n = Math.floor(msAgo / HOUR);
    return `Today, ${n} hour${n > 1 ? "s" : ""} ago`;
  }
  const n = Math.floor(msAgo / DAY);
  return n === 1 ? "Yesterday" : `${n} days ago`;
}

/**
 * Splits the feed the way the Updates tab does: your own entry, then unseen
 * updates newest-first, then everything already viewed.
 */
export function groupStatuses(stories, seenIds = []) {
  const mine = stories.find((s) => s.own) ?? null;
  const others = stories
    .filter((s) => !s.own && s.updates?.length)
    .sort((a, b) => a.msAgo - b.msAgo);

  return {
    mine,
    recent: others.filter((s) => !seenIds.includes(s.id)),
    viewed: others.filter((s) => seenIds.includes(s.id)),
  };
}

/** Dash pattern for the ring: one arc per update, with a gap between arcs. */
export function ringDashes(count, circumference, gap = 5) {
  if (count <= 1) return `${circumference} 0`;
  const segment = circumference / count - gap;
  return `${segment} ${gap}`;
}
