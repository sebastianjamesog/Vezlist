import { api, SITE_SCOPE } from "./client.js";

export function listTickets({ site = SITE_SCOPE, status, limit = 50, offset = 0 } = {}) {
  return api.get("/api/v1/me/tickets", { site, status, limit, offset }, { signal: AbortSignal.timeout(15000) });
}

export function createTicket({ subject, body, site = SITE_SCOPE }) {
  return api.post("/api/v1/me/tickets", { site, subject, body });
}

export function getTicket(id) {
  return api.get(`/api/v1/me/tickets/${encodeURIComponent(id)}`, undefined, { signal: AbortSignal.timeout(15000) });
}

export function replyToTicket(id, body) {
  return api.post(`/api/v1/me/tickets/${encodeURIComponent(id)}/messages`, { body });
}

export function listAdminTickets({ site = SITE_SCOPE, status, limit = 50, offset = 0 } = {}) {
  return api.get("/api/v1/admin/tickets", { site, status, limit, offset }, { signal: AbortSignal.timeout(15000) });
}

export function getAdminTicket(id) {
  return api.get(`/api/v1/admin/tickets/${encodeURIComponent(id)}`, undefined, { signal: AbortSignal.timeout(15000) });
}

export function replyAsStaff(id, body) {
  return api.post(`/api/v1/admin/tickets/${encodeURIComponent(id)}/messages`, { body });
}

export function setAdminTicketStatus(id, status) {
  return api.patch(`/api/v1/admin/tickets/${encodeURIComponent(id)}/status`, { status });
}

export function markTicketRead(id, messageId, { staff = false } = {}) {
  return api.post(`/api/v1/${staff ? "admin" : "me"}/tickets/${encodeURIComponent(id)}/read`, { messageId }, { signal: AbortSignal.timeout(15000) });
}
