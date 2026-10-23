"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useNavigate } from "../lib/nav";
import { useParams } from "next/navigation";
import {
  Flag,
  Heart,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
} from "lucide-react";
import TopBar from "../components/layout/TopBar";
import PageBody from "../components/layout/PageBody";
import Button from "../components/ui/Button";
import ReportDialog from "../components/ReportDialog";
import { useToast } from "../context/ToastContext";
import { useReports } from "../context/ReportsContext";
import { useAuth } from "../context/AuthContext.jsx";
import { useSaved } from "../context/SavedContext.jsx";
import { getListingDetail } from "../lib/api/discovery.js";
import { recordListingView } from "../lib/api/views.js";
import { getSellerProfile } from "../lib/api/sellers.js";
import { SITE_SCOPE } from "../lib/api/client.js";
import { ApiError } from "../lib/api/client.js";
import { categoryPath } from "../lib/taxonomy";
import { timeAgo } from "../lib/format";
import { FEED_PATH, IS_PERSONALS } from "../lib/sites";
import { usePersistedObject } from "../lib/persisted";
import useLiveViewCount, { publishLiveViewCount } from "../lib/useLiveViewCount.js";
import MediaImage from "../components/media/MediaImage.jsx";
import AdPhotoGallery from "../components/media/AdPhotoGallery.jsx";
import {
  NO_REVEALS,
  REVEALS_KEY,
  REVEAL_LIMIT,
  SETTINGS_TOGGLES_KEY,
  canReveal,
  isRevealed,
  maskEmail,
  maskPhone,
  recordReveal,
  revealKey,
  showsEmail,
  showsPhone,
} from "../lib/listings";

const CARD = "rounded-card bg-surface p-4 shadow-card lg:p-6";

const PILL =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl brand-gradient px-3.5 text-[13px] font-semibold text-on-brand shadow-pop transition-all duration-150 hover:brightness-110 active:scale-[0.98] active:brightness-95";

function ContactRow({
  channel,
  icon: ChannelIcon,
  masked,
  value,
  href,
  actionLabel,
  revealed,
  onReveal,
}) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
        <ChannelIcon className="size-[18px]" strokeWidth={2.4} />
      </span>

      {revealed ? (
        <a href={href} className={PILL}>
          {actionLabel}
          <span className="sr-only"> {channel}</span>
        </a>
      ) : (
        <button type="button" onClick={onReveal} className={PILL}>
          Show
          <span className="sr-only"> {channel}</span>
        </button>
      )}

      <span className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-tight text-ink">
        <span className="sr-only">{channel}: </span>
        {revealed ? value : masked}
      </span>
    </div>
  );
}

/** Loading skeleton — fixed-height blocks in the same layout the real page fills. */
function DetailSkeleton({ onBack, headerActions }) {
  return (
    <>
      <TopBar variant="detail" onBack={onBack} actions={headerActions} />
      <PageBody className="px-4 pb-6 lg:px-8 lg:py-8">
        <div className="lg:grid lg:grid-cols-[1.35fr_1fr] lg:items-start lg:gap-x-8 lg:gap-y-6">
          <div className="h-64 animate-pulse rounded-card bg-surface shadow-card lg:h-[440px]" />
          <div className="mt-4 h-40 animate-pulse rounded-card bg-surface shadow-card lg:mt-0" />
          <div className="mt-4 h-32 animate-pulse rounded-card bg-surface shadow-card lg:mt-0" />
          <div className="mt-4 h-32 animate-pulse rounded-card bg-surface shadow-card lg:mt-0" />
        </div>
      </PageBody>
    </>
  );
}

const OVERVIEW_FIELDS = [
  ["eyeColour", "Eye colour"],
  ["weight", "Weight"],
  ["hairColour", "Hair colour"],
  ["height", "Height"],
  ["age", "Age"],
  ["ethnicity", "Ethnicity"],
  ["bodyStats", "Body stats"],
];

function attributesToRows(attributes) {
  if (!attributes) return [];
  const labels = Object.fromEntries(OVERVIEW_FIELDS);
  const keys = [...OVERVIEW_FIELDS.map(([key]) => key), ...Object.keys(attributes)];
  return [...new Set(keys)]
    .map((key) => [key, attributes[key]])
    .filter(([, v]) => v != null && v !== "")
    .map(([key, value]) => ({
      key,
      label: labels[key] ?? key
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/^./, (letter) => letter.toUpperCase()),
      value,
    }));
}

export default function AdDetail({ listingId, onClose, headerActions, loadDetail, onSwipeAd, onReady } = {}) {
  const params = useParams();
  const id = listingId ?? params.id;
  const navigate = useNavigate();
  const toast = useToast();
  const { reportOf } = useReports();
  const { signedIn } = useAuth();
  const { isSaved, toggle: toggleSaved } = useSaved();

  const [listing, setListing] = useState(null);
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const recordedViews = useRef(new Set());
  const liveViewCount = useLiveViewCount(listing?.id, listing?.viewCount, SITE_SCOPE);

  const [reporting, setReporting] = useState(false);

  const [toggles] = usePersistedObject(SETTINGS_TOGGLES_KEY);
  const [reveals, setReveals] = usePersistedObject(REVEALS_KEY);

  const loadVersion = useRef(0);
  function load() {
    const version = ++loadVersion.current;
    setLoading(true);
    setError(null);
    setNotFound(false);
    (loadDetail ? loadDetail(id) : getListingDetail(id, SITE_SCOPE))
      .then((row) => {
        if (loadVersion.current !== version) return null;
        setListing(row);
        // `limit: 1` rather than 0 — the service rejects anything outside
        // 1-50 — and this page only reads `sellerPage.seller`, not `items`.
        return getSellerProfile(row.ownerId, { site: SITE_SCOPE, limit: 1 }).catch(
          () => null,
        );
      })
      .then((sellerPage) => { if (loadVersion.current === version) setSeller(sellerPage?.seller ?? null); })
      .catch((err) => {
        if (loadVersion.current !== version) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
          setNotFound(true);
        } else {
          setError(err);
        }
      })
      .finally(() => { if (loadVersion.current === version) setLoading(false); });
  }

  useEffect(() => {
    if (id) load();
    return () => { loadVersion.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (listing?.id !== id || recordedViews.current.has(id)) return undefined;

    function recordOpen() {
      // Personals mounts its page behind an inert age gate. Wait until the
      // visitor enters before treating that page load as an ad view.
      if (IS_PERSONALS && document.documentElement.dataset.ageGate !== "ok") return;
      if (recordedViews.current.has(id)) return;
      recordedViews.current.add(id);
      recordListingView(id, SITE_SCOPE, crypto.randomUUID())
        .then(({ viewCount }) => {
          publishLiveViewCount(id, viewCount, SITE_SCOPE);
          setListing((current) => current?.id === id ? { ...current, viewCount } : current);
        })
        .catch(() => {});
    }

    recordOpen();
    if (IS_PERSONALS && !recordedViews.current.has(id)) {
      const observer = new MutationObserver(recordOpen);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-age-gate"],
      });
      return () => observer.disconnect();
    }
    return undefined;
  }, [id, listing?.id]);

  useEffect(() => {
    if (!loading) onReady?.();
  }, [loading, onReady]);

  const reveal = (channel) => () => {
    const at = Date.now();
    const current = reveals ?? NO_REVEALS;
    const key = revealKey(id, channel);
    if (!canReveal(current, key, at)) {
      toast(
        `You've opened ${REVEAL_LIMIT} contact details in the last hour — try again later`,
      );
      return;
    }
    setReveals(recordReveal(current, key, at));
  };

  function onToggleSave() {
    if (!signedIn) {
      toast("Sign in to save ads");
      return;
    }
    if (savePending) return;
    setSavePending(true);
    toggleSaved(id)
      .catch(() => toast("Couldn't update saved ads — try again"))
      .finally(() => setSavePending(false));
  }

  if (loading) {
    return <DetailSkeleton onBack={onClose ?? (() => navigate(-1))} headerActions={headerActions} />;
  }

  if (notFound || (!listing && !error)) {
    return (
      <>
        <TopBar
          variant="detail"
          actions={headerActions}
          onBack={onClose ?? (() => navigate(-1))}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[18px] font-bold text-ink">
            This ad is no longer available.
          </p>
          <Button to={FEED_PATH} variant="soft">
            Back to listings
          </Button>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <TopBar
          variant="detail"
          actions={headerActions}
          onBack={onClose ?? (() => navigate(-1))}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[18px] font-bold text-ink">
            Couldn't load this ad.
          </p>
          <p className="text-[14px] text-muted">
            {error.message || "Something went wrong."}
          </p>
          <Button onClick={load}>Retry</Button>
        </div>
      </>
    );
  }

  const path = categoryPath(listing.categoryLabel, null);
  const photos = (listing.media ?? [])
    .filter((m) => m.url)
    .sort((a, b) => a.position - b.position)
    .map((m) => ({ url: m.url, verified: m.verified === true }));

  const mailHref = `mailto:${listing.contactEmail}?subject=${encodeURIComponent(listing.title)}`;
  const telHref = `tel:${(listing.contactPhone ?? "").replace(/\s+/g, "")}`;
  const hasCoordinates = Number.isFinite(listing.latitude)
    && Number.isFinite(listing.longitude)
    && Math.abs(listing.latitude) <= 90
    && Math.abs(listing.longitude) <= 180;
  const locationLabel = listing.locationLabel || listing.provinceLabel;
  const mapQuery = hasCoordinates
    ? `${listing.latitude},${listing.longitude}`
    : locationLabel
      ? [listing.locationLabel, listing.provinceLabel, "Canada"].filter(Boolean).join(", ")
      : null;
  const mapHref = mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
    : null;

  const phoneShown = showsPhone(toggles) && Boolean(listing.contactPhone);
  const emailShown = showsEmail(toggles) && Boolean(listing.contactEmail);

  const channels = [
    phoneShown && {
      id: "phone",
      channel: "phone number",
      icon: Phone,
      value: listing.contactPhone,
      masked: maskPhone(listing.contactPhone),
      href: telHref,
      actionLabel: "Call",
      showLabel: "Show number",
    },
    emailShown && {
      id: "email",
      channel: "email address",
      icon: Mail,
      value: listing.contactEmail,
      masked: maskEmail(listing.contactEmail),
      href: mailHref,
      actionLabel: "Email",
      showLabel: "Show email",
    },
  ]
    .filter(Boolean)
    .map((c) => ({ ...c, revealed: isRevealed(reveals, revealKey(id, c.id)) }));

  const notes = [
    phoneShown &&
      !emailShown &&
      "This seller has not published an email address.",
    emailShown &&
      !phoneShown &&
      "This seller has not published a phone number.",
    channels.some((c) => !c.revealed) &&
      `${REVEAL_LIMIT} contact details an hour, per device — a number and an address cost one each.`,
    channels.some((c) => c.revealed) &&
      "This is how you reach a seller on Vezlist — there is no messaging here. Never send a deposit before you have seen the item.",
  ]
    .filter(Boolean)
    .join(" ");

  const sellerName = seller?.displayName ?? "Vezlist seller";
  const reported = reportOf("listing", id);
  const rows = attributesToRows(listing.attributes);
  const saved = isSaved(id);
  const postedLabel = listing.publishedAt
    ? `Posted ${timeAgo(Date.now() - new Date(listing.publishedAt).getTime())}`
    : "Not yet published";

  return (
    <>
      <TopBar
        variant="detail"
        actions={headerActions}
        title={listing.title}
        onBack={onClose ?? (() => navigate(-1))}
      />

      <PageBody className="px-4 pb-6 lg:px-8 lg:py-8">
        <div className="lg:grid lg:grid-cols-[1.35fr_1fr] lg:items-start lg:gap-x-8 lg:gap-y-6">
          {/* 1 — gallery */}
          <section className="lg:col-start-1 lg:row-start-1">
            <AdPhotoGallery key={listing.id} photos={photos} title={listing.title} onSwipeAd={onSwipeAd} />
          </section>

          {/* 2 — title, price, overview */}
          <section
            className={`mt-2 lg:col-start-2 lg:row-start-1 lg:mt-0 ${CARD}`}
          >
            {path && (
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
                {path}
              </p>
            )}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="break-words text-[20px] font-extrabold leading-tight text-ink lg:text-[22px]">
                  {listing.title}
                </h1>
                <p className="text-[14px] font-medium leading-5 tabular-nums text-muted lg:text-[15px]">
                  ${Number(listing.price ?? 0).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={onToggleSave}
                disabled={savePending}
                aria-pressed={saved}
                aria-label={saved ? "Remove from saved" : "Save this ad"}
                className={`grid size-10 shrink-0 place-items-center rounded-full shadow-card transition-transform active:scale-90 ${
                  saved ? "bg-brand-soft text-brand" : "bg-canvas text-muted"
                }`}
              >
                <Heart
                  className={`size-[18px] ${saved ? "fill-current" : ""}`}
                  strokeWidth={2.2}
                />
              </button>
            </div>

            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
              {mapHref && (
                <a
                  href={mapHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${locationLabel || "ad location"} in Google Maps (opens externally)`}
                  className="flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 font-semibold transition-colors hover:bg-brand-soft hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <MapPin aria-hidden="true" className="size-3.5" />
                  {locationLabel || "View location"}
                </a>
              )}
              <span>
                {postedLabel}
                {liveViewCount != null &&
                  ` — Viewed ${liveViewCount.toLocaleString("en-US")} times`}
              </span>
            </p>

            {rows.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                  Overview
                </h2>
                <dl className="grid grid-cols-2">
                  {rows.map((d, index) => (
                    <div
                      key={d.key}
                      className={`flex min-w-0 items-baseline justify-between gap-2 border-b border-line py-3 ${
                        index === rows.length - 1 && rows.length % 2 !== 0
                          ? "col-span-2"
                          : index % 2 === 0
                            ? "border-r pr-3"
                            : "pl-3"
                      }`}
                    >
                      <dt className="min-w-0 max-w-[50%] break-words text-[12px] font-medium text-muted lg:text-[13px]">
                        {d.label}
                      </dt>
                      <dd className="min-w-0 flex-1 break-words text-right text-[13px] font-bold text-ink lg:text-[14px]">
                        {d.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </section>

          {/* 3 — description */}
          <section
            className={`mt-4 lg:col-start-1 lg:row-start-2 lg:mt-0 ${CARD}`}
          >
            <h2 className="text-[18px] font-extrabold text-ink">Description</h2>
            <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink/75">
              {listing.description
                .split("\n")
                .filter((p) => p.trim())
                .map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
            </div>
          </section>

          {/* 4 — contact, then who you would be contacting. */}
          <div className="lg:col-start-2 lg:row-start-2 lg:space-y-6">
            <section className={`mt-4 lg:mt-0 ${CARD}`}>
              <h2 className="text-[18px] font-extrabold text-ink">
                Contact
              </h2>
              {channels.length > 0 ? (
                <>
                  {channels.map((c) => (
                    <ContactRow
                      key={c.id}
                      channel={c.channel}
                      icon={c.icon}
                      masked={c.masked}
                      value={c.value}
                      href={c.href}
                      actionLabel={c.actionLabel}
                      revealed={c.revealed}
                      onReveal={reveal(c.id)}
                    />
                  ))}

                  <p className="mt-3 text-[13px] leading-snug text-muted">
                    {notes}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-[15px] leading-relaxed text-ink/75">
                  This seller has published neither a phone number nor an email
                  address. There is no messaging on Vezlist, so this ad has no
                  way to be answered — their other ads may.
                </p>
              )}
            </section>

            <section className={`mt-4 lg:mt-0 ${CARD}`}>
              <h2 className="text-[18px] font-extrabold text-ink">Advertiser</h2>

              <Link
                href={`/seller/${listing.ownerId}`}
                className="group mt-3 flex items-center gap-3 rounded-2xl bg-canvas p-3 transition-colors hover:bg-brand-soft"
              >
                <span className="relative shrink-0">
                  <MediaImage
                    src={seller?.avatarUrl}
                    alt={sellerName}
                    width={48}
                    height={48}
                    className="size-12 rounded-2xl object-cover"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-bold text-ink group-hover:text-brand">
                    {sellerName}
                  </span>
                  <span className="block text-[12px] text-muted">
                    {seller?.memberSince
                      ? `Member since ${new Date(seller.memberSince).getFullYear()} · `
                      : ""}
                    View profile
                  </span>
                </span>
                {seller?.verified && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                    <ShieldCheck className="size-3.5" />
                    Verified
                  </span>
                )}
              </Link>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3.5">
                <button
                  type="button"
                  onClick={() => setReporting(true)}
                  className="flex items-center gap-1.5 text-[13.5px] font-semibold text-muted transition-colors hover:text-ink"
                >
                  <Flag className="size-4" strokeWidth={2.2} />
                  {reported ? "Reported" : "Report ad"}
                </button>
              </div>
            </section>
          </div>
        </div>
      </PageBody>

      <ReportDialog
        open={reporting}
        targetType="listing"
        targetId={id}
        targetLabel={listing.title}
        onClose={() => setReporting(false)}
      />

    </>
  );
}
