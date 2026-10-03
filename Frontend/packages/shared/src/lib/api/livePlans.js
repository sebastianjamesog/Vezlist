import { api } from "./client.js";

function readPlan(plan) {
  if (
    !plan ||
    typeof plan.id !== "string" ||
    typeof plan.name !== "string" ||
    !Number.isFinite(Number(plan.price)) ||
    Number(plan.price) < 0 ||
    !["CAD", "USD", "EUR", "GBP"].includes(plan.currency) ||
    !Number.isInteger(plan.durationMinutes) ||
    plan.durationMinutes < 1 ||
    plan.durationMinutes > 180 ||
    typeof plan.enabled !== "boolean" ||
    !Number.isInteger(plan.sortOrder) ||
    !Number.isInteger(plan.version) ||
    (plan.badge != null && typeof plan.badge !== "string")
  ) {
    throw new Error(
      "The server returned an invalid live plan. Please reload and try again.",
    );
  }
  return { ...plan, price: Number(plan.price) };
}

export async function listLivePlans() {
  const response = await api.get("/api/v1/admin/live-plans");
  if (!Array.isArray(response?.items))
    throw new Error("Could not read live plans from the server.");
  return { items: response.items.map(readPlan) };
}

export async function createLivePlan(request) {
  return readPlan(await api.post("/api/v1/admin/live-plans", request));
}

export async function updateLivePlan(id, request) {
  return readPlan(
    await api.put(
      `/api/v1/admin/live-plans/${encodeURIComponent(id)}`,
      request,
    ),
  );
}

export async function listLiveSessions(limit = 50) {
  const response = await api.get("/api/v1/admin/live", { limit });
  if (!Array.isArray(response?.items) || !Number.isInteger(response.total)) {
    throw new Error("Could not read live sessions from the server.");
  }
  return response;
}

export function endLiveSession(id) {
  return api.post(`/api/v1/admin/live/${encodeURIComponent(id)}/end`);
}
