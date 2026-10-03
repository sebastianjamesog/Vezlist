import { api } from "./client.js";

function readPlan(plan) {
  if (
    !plan ||
    typeof plan.id !== "string" ||
    typeof plan.name !== "string" ||
    !Number.isFinite(Number(plan.price)) ||
    Number(plan.price) < 0 ||
    !/^[A-Z]{3}$/.test(plan.currency) ||
    !Number.isInteger(plan.storyCount) ||
    plan.storyCount < 1 ||
    typeof plan.enabled !== "boolean" ||
    !Number.isInteger(plan.sortOrder) ||
    !Number.isInteger(plan.version)
  ) {
    throw new Error(
      "The server returned an invalid story pack. Please reload and try again.",
    );
  }
  return { ...plan, price: Number(plan.price) };
}

export async function listStoryPlans() {
  const response = await api.get("/api/v1/admin/story-plans");
  if (!Array.isArray(response?.items))
    throw new Error("Could not read story packs from the server.");
  return {
    items: response.items.map(readPlan),
    demoPurchaseAvailable: response.demoPurchaseAvailable === true,
  };
}

export async function createStoryPlan(request) {
  return readPlan(await api.post("/api/v1/admin/story-plans", request));
}

export async function updateStoryPlan(id, request) {
  return readPlan(
    await api.put(
      `/api/v1/admin/story-plans/${encodeURIComponent(id)}`,
      request,
    ),
  );
}
