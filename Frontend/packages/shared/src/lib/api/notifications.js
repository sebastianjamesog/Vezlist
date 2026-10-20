import { api, SITE_SCOPE } from "./client.js";

/**
 * GET /api/v1/me/notifications -> NotificationService.Page
 * ({items: [{id, type, title, message, href, createdAt, readAt}], nextCursor}).
 * `site` defaults to this build's SITE_SCOPE — notifications are per-site.
 */
export function listNotifications({ limit, cursor, site = SITE_SCOPE } = {}) {
  return api.get("/api/v1/me/notifications", { site, limit, cursor });
}

/** GET /api/v1/me/notifications/unread-count -> NotificationService.Count ({count}). */
export function getUnreadCount({ site = SITE_SCOPE } = {}) {
  return api.get("/api/v1/me/notifications/unread-count", { site });
}

/**
 * POST /api/v1/me/notifications/{id}/read -> Count. 404 (ApiError) if the id
 * isn't this user's. `api.post` has no query-param helper (unlike `.get`/
 * `.delete`), so the site scope is appended by hand here.
 */
export function markNotificationRead(id, { site = SITE_SCOPE } = {}) {
  return api.post(
    `/api/v1/me/notifications/${encodeURIComponent(id)}/read?site=${encodeURIComponent(site)}`,
  );
}

/** POST /api/v1/me/notifications/read-all -> Count. */
export function markAllNotificationsRead({ site = SITE_SCOPE } = {}) {
  return api.post(
    `/api/v1/me/notifications/read-all?site=${encodeURIComponent(site)}`,
  );
}
