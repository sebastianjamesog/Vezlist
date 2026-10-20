import { api } from "./client.js";
export const listAdminStories = (query = {}) => api.get("/api/v1/admin/stories", query);
export const removeAdminStory = (id) => api.delete(`/api/v1/admin/stories/${encodeURIComponent(id)}`);
export const removeCreatorStories = (id) => api.delete(`/api/v1/admin/stories/creator/${encodeURIComponent(id)}`);
