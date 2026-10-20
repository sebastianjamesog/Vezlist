import { api } from "./client.js";

/**
 * GET /api/v1/admin/analytics/summary?site= -> AdminAnalyticsSummaryResponse
 * (cc.vezlist.admin.web.AdminAnalyticsController/AdminAnalyticsSummaryResponse):
 * `{site, totalUsers, usersWithListings, suspendedUsers, totalListings, listingsByStatus:{},
 * newListingsLast7Days, newListingsLast30Days, activeReportsCount,
 * openModerationCasesCount}`.
 *
 * `site` is required by the backend (`@RequestParam SiteScope site`, no
 * default) — there is no "both boards" summary, so a caller wanting the
 * whole console's numbers fetches both and adds them, which is what
 * `Analytics.jsx` and `Dashboard.jsx` do when the site scope is "all".
 *
 * Requires MODERATOR or ADMIN — a plain USER gets a 403, same as every other
 * admin endpoint.
 */
export function analyticsSummary(site) {
  return api.get("/api/v1/admin/analytics/summary", { site });
}

export function queueCounts(site) {
  return api.get("/api/v1/admin/analytics/queues", { site });
}
