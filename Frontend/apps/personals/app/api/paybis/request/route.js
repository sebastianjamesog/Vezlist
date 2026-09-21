/**
 * `POST /api/paybis/request` — the only place the Paybis API key is read.
 *
 * The handler is shared with the other app because the credit packs, the
 * prices and the merchant account are the same on both; only the origin the
 * buyer returns to differs, and that comes off the request. See
 * `packages/shared/src/server/paybisRequest.js`.
 */
export { POST } from "@vezlist/shared/server/paybisRequest.js";
