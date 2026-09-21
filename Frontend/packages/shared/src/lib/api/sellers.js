import { api } from "./client.js";

/**
 * GET /api/v1/sellers/{sellerId}?site=&limit= -> SellerPageResponse
 * ({ seller: SellerResponse, activeListingCount, items: DiscoveryListingResponse[], hasMore }).
 * (cc.vezlist.sellers.web.SellerController#publicProfile)
 *
 * Public — no auth required, and `SellerResponse` is already the redacted
 * public projection (`id, displayName, avatarUrl, memberSince, verified,
 * responseTime`; no contact info, no bio, no roles). `limit` is optional and
 * caps `items`, the seller's own active listings; omit it for the server's
 * default.
 */
export function getSellerProfile(sellerId, { site, limit } = {}) {
  return api.get(`/api/v1/sellers/${sellerId}`, { site, limit });
}
