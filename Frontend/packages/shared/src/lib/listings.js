const STATUS = {
  DRAFT: {
    label: "Draft",
    tone: "bg-slate-100 text-slate-700",
  },
  PENDING_REVIEW: {
    label: "In review",
    tone: "bg-amber-100 text-amber-700",
  },
  ACTIVE: {
    label: "Active",
    tone: "bg-emerald-100 text-emerald-700",
  },
  REJECTED: {
    label: "Needs changes",
    tone: "bg-red-100 text-red-700",
  },
  EXPIRED: {
    label: "Expired",
    tone: "bg-slate-100 text-muted",
  },
};

export const LISTING_STATUS_OPTIONS = Object.entries(STATUS).map(
  ([value, details]) => ({ value, ...details }),
);

export function listingStatus(status) {
  return (
    STATUS[status] ?? {
      label: status?.replaceAll("_", " ") ?? "Unknown",
      tone: "bg-slate-100 text-muted",
    }
  );
}

export function listingPayload(draft, site) {
  return {
    site: site.toUpperCase(),
    title: draft.title,
    businessName: draft.business,
    description: draft.description,
    price: draft.price === "" ? null : Number(draft.price),
    categoryId: draft.categoryId,
    provinceId: draft.provinceId,
    locationId: draft.locationId,
    contactEmail: draft.email,
    contactPhone: draft.phone,
    latitude: draft.latitude ?? null,
    longitude: draft.longitude ?? null,
    attributes: draft.attributes ?? {},
  };
}

export function relativeListingTime(value, now = Date.now()) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Recently posted";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return "Posted just now";
  if (minutes < 60) return "Posted " + minutes + " min ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return "Posted " + hours + " hr" + (hours === 1 ? "" : "s") + " ago";
  const days = Math.floor(hours / 24);
  return "Posted " + days + " day" + (days === 1 ? "" : "s") + " ago";
}

export function listingToAd(listing) {
  const media = Array.isArray(listing.media)
    ? listing.media.filter((image) => image.status === "READY" && image.url)
    : [];
  const description = String(listing.description ?? "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  const status = listingStatus(listing.status);

  return {
    id: listing.id,
    remote: true,
    status: listing.status,
    statusLabel: status.label,
    title: listing.title,
    price: listing.price == null ? null : Number(listing.price),
    location: [listing.locationLabel, listing.provinceLabel]
      .filter(Boolean)
      .join(", "),
    postedLabel: relativeListingTime(
      listing.publishedAt ?? listing.submittedAt ?? listing.createdAt,
    ),
    photoCount: media.length,
    photos: media.map((image) => image.url),
    overviewTitle: "Listing overview",
    specs: [
      {
        label: "Category",
        value: listing.categoryLabel,
        icon: "Tag",
        tone: "blue",
      },
      {
        label: "Status",
        value: status.label,
        icon: "ClipboardCheck",
        tone: "green",
      },
      {
        label: "Area",
        value: listing.locationLabel,
        icon: "MapPin",
        tone: "purple",
      },
      {
        label: "Seller",
        value: listing.businessName,
        icon: "User",
        tone: "orange",
      },
    ],
    description: description.length
      ? description
      : ["The seller has not added a description."],
    phone: listing.contactPhone,
    email: listing.contactEmail,
    sellerId: listing.ownerId,
    seller: {
      name: listing.businessName,
      badge: "Vezlist seller",
    },
  };
}
