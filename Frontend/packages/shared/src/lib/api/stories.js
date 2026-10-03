import { api } from "./client.js";
import { sha256Hex } from "./media.js";

export const listStoryPlans = () => api.get("/api/v1/stories/plans");
export const listStories = (query = {}) => api.get("/api/v1/stories", query);
export const listMyStories = () => api.get("/api/v1/stories/me");
export const listCreatorStories = (ownerId) =>
  api.get(`/api/v1/stories/creator/${encodeURIComponent(ownerId)}`);
export const deleteStory = (id) =>
  api.delete(`/api/v1/stories/${encodeURIComponent(id)}`);
export const publishStory = (id, payload) =>
  api.post(`/api/v1/stories/${encodeURIComponent(id)}/publish`, payload);

export async function uploadStory(file) {
  const checksumSha256 = await sha256Hex(await file.arrayBuffer());
  const upload = await api.post("/api/v1/stories/uploads", {
    filename: file.name,
    contentType: file.type,
    sizeBytes: file.size,
    checksumSha256,
  });
  try {
    const response = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: upload.headers || upload.requiredHeaders || {},
      body: file,
      credentials: "omit",
    });
    if (!response.ok)
      throw new Error("Your media could not be uploaded. Please try again.");
    return await api.post(
      `/api/v1/stories/${encodeURIComponent(upload.id)}/complete`,
    );
  } catch (error) {
    // An incomplete object must not become a resumable draft.
    await deleteStory(upload.id).catch(() => {});
    throw error;
  }
}
