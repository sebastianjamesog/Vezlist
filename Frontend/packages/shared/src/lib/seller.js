export function sellerProfilePath(id, site, limit = 24) {
  const sellerId = typeof id === "string" ? id.trim() : String(id ?? "").trim();
  if (!sellerId) throw new TypeError("seller id is required");
  const pageSize = Number(limit);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new RangeError("limit must be an integer between 1 and 50");
  }
  const params = new URLSearchParams({
    site: String(site ?? "").trim().toUpperCase(),
    limit: String(pageSize),
  });
  if (!params.get("site")) throw new TypeError("site is required");
  return `/sellers/${encodeURIComponent(sellerId)}?${params}`;
}

export function publicSeller(page) {
  const seller = page?.seller;
  if (!seller?.id || !seller?.displayName) return null;
  return {
    id: seller.id,
    name: seller.displayName,
    avatar: seller.avatarUrl ?? null,
    verified: Boolean(seller.verified),
    responseTime: seller.responseTime ?? null,
  };
}
