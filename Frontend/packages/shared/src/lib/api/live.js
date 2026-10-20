import { api } from "./client.js";

export const listLiveCreators = (limit = 30, options) =>
  api.get("/api/v1/live", { limit }, options);
export const listLivePlans = () => api.get("/api/v1/live/plans");
export const getMyLiveSession = () => api.get("/api/v1/live/me");
export const getLiveSession = (id) =>
  api.get(`/api/v1/live/sessions/${encodeURIComponent(id)}`);
export const getLivePaymentDetails = () =>
  api.get("/api/v1/live/payment-details");
export const saveLivePaymentDetails = (items) =>
  api.put("/api/v1/live/payment-details", { items });
export const createLiveSession = (request, idempotencyKey) =>
  api.post("/api/v1/live/sessions", request, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
export const endLiveSession = (id) =>
  api.post(`/api/v1/live/sessions/${encodeURIComponent(id)}/end`);
export const getBroadcastTicket = (id) =>
  api.post(`/api/v1/live/sessions/${encodeURIComponent(id)}/broadcast-ticket`);

export const getLiveViewerTicket = (id) =>
  api.post(`/api/v1/live/sessions/${encodeURIComponent(id)}/viewer-ticket`);
export const deleteLiveChatMessage = (sessionId, messageId) =>
  api.delete(
    `/api/v1/live/sessions/${encodeURIComponent(sessionId)}/chat/${encodeURIComponent(messageId)}`,
  );
export const muteLiveChatUser = (sessionId, userId, muted) =>
  api.put(
    `/api/v1/live/sessions/${encodeURIComponent(sessionId)}/chat/mutes/${encodeURIComponent(userId)}`,
    { muted },
  );
