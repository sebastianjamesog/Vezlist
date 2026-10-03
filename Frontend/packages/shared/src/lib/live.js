/** Match real active sessions by immutable account ID, never display name. */
export function liveStreamFor(ownerId, streams = []) {
  if (!ownerId) return null;
  return (
    streams.find(
      (stream) =>
        stream.ownerId === ownerId &&
        (stream.status === "LIVE" || stream.status === "RECONNECTING"),
    ) ?? null
  );
}
