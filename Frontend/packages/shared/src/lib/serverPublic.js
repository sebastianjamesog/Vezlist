/** Server-only reads for route metadata and sitemap generation. */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? null : "http://localhost:8080");

async function publicGet(path) {
  if (!API_ORIGIN) return null;
  try {
    const response = await fetch(`${API_ORIGIN}${path}`, { cache: "no-store" });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export function publicListing(id, site) {
  return publicGet(`/api/v1/listings/${encodeURIComponent(id)}?site=${site}`);
}

export function publicSeller(id, site) {
  return publicGet(`/api/v1/sellers/${encodeURIComponent(id)}?site=${site}&limit=1`);
}

export function publicCategories(site) {
  return publicGet(`/api/v1/categories?site=${site}`);
}

export function publicDiscovery(site, cursor, categoryId) {
  const params = new URLSearchParams({ site, limit: "50" });
  if (cursor) params.set("cursor", cursor);
  if (categoryId) params.set("category", categoryId);
  return publicGet(`/api/v1/listings?${params}`);
}

export function safeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
