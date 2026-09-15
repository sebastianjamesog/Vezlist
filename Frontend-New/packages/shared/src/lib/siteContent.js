export const MARKETPLACE_SITE = "marketplace";
export const PERSONALS_SITE = "personals";

function isPersonalsAd(ad) {
  return ad?.category === "Personals";
}

export function adForSite(ads, id, site) {
  const ad = ads[id];
  if (!ad) return null;
  return isPersonalsAd(ad) === (site === PERSONALS_SITE) ? ad : null;
}

export function adIdsForSite(ads, site) {
  return Object.keys(ads).filter((id) => adForSite(ads, id, site));
}

function listingIdSet(listings) {
  return new Set(listings.map((listing) => listing.id));
}

export function sellerForListings(sellers, id, listings) {
  const seller = sellers[id];
  if (!seller) return null;
  const allowed = listingIdSet(listings);
  return seller.listingIds?.some((listingId) => allowed.has(listingId))
    ? seller
    : null;
}

export function sellerIdsForListings(sellers, listings) {
  return Object.keys(sellers).filter((id) =>
    sellerForListings(sellers, id, listings),
  );
}
