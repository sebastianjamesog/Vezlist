import { api } from "./client.js";

/**
 * GET /api/v1/admin/audit?site=&cursor=&limit= -> AdminAuditPageResponse
 * (cc.vezlist.admin.web.AdminAuditController): `{items:[{id, actorId,
 * actorName, action, targetType, targetId, details, createdAt, ipAddress,
 * userAgent}], nextCursor, hasMore}`.
 *
 * `ipAddress`/`userAgent` are only set on the security-event rows this feed
 * also carries (`LOGIN_SUCCESS`/`LOGIN_FAILURE`/`LOGIN_BLOCKED_SUSPENDED`/
 * `LOGOUT`/`REGISTER`/`PASSWORD_CHANGED`/`PASSWORD_CHANGE_FAILED`,
 * `targetType: "SECURITY"`) — `null` on ordinary admin/moderation rows,
 * which have no request to attribute one to. A `LOGIN_FAILURE`/
 * `LOGIN_BLOCKED_SUSPENDED` row's `actorId` is `null` too when the
 * attempted email didn't resolve to a real account; `actorName` carries
 * the attempted email itself in that case rather than being blank.
 *
 * `site` is optional on this one (unlike analytics) — omitted, it's every
 * admin action across both boards, which is what the console's own Audit
 * screen (not scoped by the site switcher — see its own doc comment) wants.
 * Security events are never site-scoped regardless (one account serves
 * both boards), so they're included either way. `cursor` is opaque, taken
 * from a previous page's `nextCursor`, not a page number.
 */
export function auditFeed({ site, cursor, limit } = {}) {
  return api.get("/api/v1/admin/audit", { site, cursor, limit });
}
