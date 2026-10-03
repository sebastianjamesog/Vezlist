import { api } from "./client.js";

/** Read counts for the cards currently mounted in a feed without recording a view. */
export function getListingViewCounts(ids, site) {
  return api.get("/api/v1/listings/views", { ids: ids.join(","), site });
}

/** Record one opened ad. The key makes retries and duplicate effects safe. */
export function recordListingView(id, site, idempotencyKey) {
  return api.post(
    `/api/v1/listings/${encodeURIComponent(id)}/views?site=${encodeURIComponent(site)}`,
    undefined,
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
}
