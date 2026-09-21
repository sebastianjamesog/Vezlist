import { api } from "./client.js";

/**
 * GET /api/v1/admin/audit?site=&cursor=&limit= -> AdminAuditPageResponse
 * (cc.vezlist.admin.web.AdminAuditController): `{items:[{id, actorId,
 * actorName, action, targetType, targetId, details, createdAt}], nextCursor,
 * hasMore}`.
 *
 * `site` is optional on this one (unlike analytics) — omitted, it's every
 * admin action across both boards, which is what the console's own Audit
 * screen (not scoped by the site switcher — see its own doc comment) wants.
 * `cursor` is opaque, taken from a previous page's `nextCursor`, not a
 * page number.
 */
export function auditFeed({ site, cursor, limit } = {}) {
  return api.get("/api/v1/admin/audit", { site, cursor, limit });
}
