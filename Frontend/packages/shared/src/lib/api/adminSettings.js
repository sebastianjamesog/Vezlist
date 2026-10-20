import { api } from "./client.js";

export const getAdminSettings = () => api.get("/api/v1/admin/settings");
export const updateAdminSettings = (settings) => api.put("/api/v1/admin/settings", settings);
export const getPublicSettings = () => api.get("/api/v1/public/settings");
