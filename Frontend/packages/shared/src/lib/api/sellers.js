import { api } from "./client.js";

/**
 * GET /api/v1/sellers/{sellerId}?site=&limit= -> SellerPageResponse
 * ({ seller: SellerResponse, activeListingCount, viewCount, likeCount,
 *   items: DiscoveryListingResponse[], hasMore }).
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

/**
 * GET /api/v1/sellers/trending?site=&limit= -> TrendingSellerResponse[]
 * (cc.vezlist.sellers.web.SellerController#trending)
 *
 * Creators ranked by engagement on their live posts: views, plus likes
 * (saves) weighted five times. Each row carries `id, displayName, avatarUrl,
 * verified, postCount, viewCount, likeCount, coverUrl, coverListingId` — the cover being a
 * short-lived signed URL for their best-performing post, or null. Public.
 */
export function getTrendingSellers({ site, limit, signal } = {}) {
  return api.get("/api/v1/sellers/trending", { site, limit }, { signal });
}
