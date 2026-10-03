import { api } from "./client.js";

export function listArticles({ limit = 50, offset = 0 } = {}) {
  return api.get("/api/v1/support/articles", { limit, offset });
}

export function listAdminArticles({ limit = 50, offset = 0 } = {}) {
  return api.get("/api/v1/support/articles/admin", { limit, offset });
}

export function createArticle(article) {
  return api.post("/api/v1/support/articles/admin", article);
}

export function updateArticle(id, article) {
  return api.put(`/api/v1/support/articles/admin/${encodeURIComponent(id)}`, article);
}

export function deleteArticle(id) {
  return api.delete(`/api/v1/support/articles/admin/${encodeURIComponent(id)}`);
}
