import { liveStreams } from "../data/mock.js";

/**
 * The broadcast a creator is running right now, or null.
 *
 * Live streaming has no backend yet — `liveStreams` is the same mock the Live
 * now page renders — so a stream carries a host *name*, not an account id.
 * Until streams come from the API with an owner id, a creator is live when a
 * stream's host matches their display name, compared case- and
 * whitespace-insensitively. Swap this body for an id lookup then; callers
 * only ever pass a display name and get a stream back.
 */
const normalize = (name) =>
  (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export function liveStreamFor(displayName, streams = liveStreams) {
  const key = normalize(displayName);
  if (!key) return null;
  return streams.find((s) => normalize(s.host) === key) ?? null;
}
