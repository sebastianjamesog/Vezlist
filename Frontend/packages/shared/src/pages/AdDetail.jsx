"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useNavigate } from "../lib/nav";
import { useParams } from "next/navigation";
import {
  BadgeCheck,
  Flag,
  Heart,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User,
  UserRoundX,
} from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { useShell } from "../components/layout/AppLayout";
import PageBody from "../components/layout/PageBody";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
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
import PhotoMark from "../components/media/PhotoMark.jsx";
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

const CALL =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl brand-gradient h-[52px] px-6 text-[16px] font-semibold text-on-brand shadow-pop transition-all duration-150 hover:brightness-110 active:scale-[0.98] active:brightness-95";

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
function DetailSkeleton({ onBack, openPost }) {
  return (
    <>
      <TopBar variant="detail" onBack={onBack} onPostAd={openPost} />
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

/**
 * A backend `ListingResponse.attributes` map, rendered the way the old mock
 * body's `specs`/`details` were: a plain label/value list. There is no
 * split between "four highlight tiles" and "a ten-row table" any more — the
 * server has no notion of which attributes deserve a coloured chip — so
 * every attribute renders the same way, which is the table shape rather
 * than the tiles.
 */
function attributesToRows(attributes) {
  if (!attributes) return [];
  return Object.entries(attributes)
    .filter(([, v]) => v != null && v !== "")
    .map(([label, value]) => ({ label, value }));
}

export default function AdDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { openPost } = useShell();
  const toast = useToast();
  const { isBlocked, block, unblock, reportOf } = useReports();
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

  const [active, setActive] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  const [toggles] = usePersistedObject(SETTINGS_TOGGLES_KEY);
  const [reveals, setReveals] = usePersistedObject(REVEALS_KEY);

  function load() {
    setLoading(true);
    setError(null);
    setNotFound(false);
    getListingDetail(id, SITE_SCOPE)
      .then((row) => {
        setListing(row);
        setActive(0);
        // `limit: 1` rather than 0 — the service rejects anything outside
        // 1-50 — and this page only reads `sellerPage.seller`, not `items`.
        return getSellerProfile(row.ownerId, { site: SITE_SCOPE, limit: 1 }).catch(
          () => null,
        );
      })
      .then((sellerPage) => setSeller(sellerPage?.seller ?? null))
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
          setNotFound(true);
        } else {
          setError(err);
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (id) load();
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
    return <DetailSkeleton onBack={() => navigate(-1)} openPost={openPost} />;
  }

  if (notFound || (!listing && !error)) {
    return (
      <>
        <TopBar
          variant="detail"
          onBack={() => navigate(-1)}
          onPostAd={openPost}
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
          onBack={() => navigate(-1)}
          onPostAd={openPost}
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
    .map((m) => m.url);

  const mailHref = `mailto:${listing.contactEmail}?subject=${encodeURIComponent(listing.title)}`;
  const telHref = `tel:${(listing.contactPhone ?? "").replace(/\s+/g, "")}`;

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

  const lead = channels[0] ?? null;
  const LeadIcon = lead?.icon ?? User;

  const sellerName = seller?.displayName ?? "Vezlist seller";
  const blocked = isBlocked(listing.ownerId);
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
        title={listing.title}
        onBack={() => navigate(-1)}
        onPostAd={openPost}
      />

      <PageBody className="px-4 pb-6 lg:px-8 lg:py-8">
        <div className="lg:grid lg:grid-cols-[1.35fr_1fr] lg:items-start lg:gap-x-8 lg:gap-y-6">
          {/* 1 — gallery */}
          <section className="lg:col-start-1 lg:row-start-1">
            <div className="overflow-hidden rounded-card shadow-card">
              <div className="relative h-96 bg-canvas lg:h-[560px]">
                {photos.length > 0 ? (
                  <>
                    <MediaImage
                      key={photos[active]}
                      discreet
                      fill
                      preload
                      src={photos[active]}
                      alt={listing.title}
                      sizes="(min-width: 1024px) 620px, 100vw"
                      className="object-contain"
                    />
                    <PhotoMark
                      src={photos[active]}
                      className="bottom-2.5 right-3 z-20 text-[13px] lg:text-[15px]"
                    />
                  </>
                ) : (
                  <div className="flex size-full items-center justify-center bg-canvas text-[14px] font-medium text-muted">
                    No photos yet
                  </div>
                )}
              </div>
            </div>

            {photos.length > 1 && (
              <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
                {photos.map((src, i) => (
                  <button
                    key={src}
                    onClick={() => setActive(i)}
                    aria-label={`Photo ${i + 1}`}
                    aria-current={i === active}
                    className={`relative size-16 shrink-0 overflow-hidden rounded-2xl transition-all lg:size-20 ${
                      i === active
                        ? "ring-2 ring-brand ring-offset-2 ring-offset-canvas"
                        : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    <MediaImage
                      discreet
                      fill
                      src={src}
                      alt=""
                      sizes="(min-width: 1024px) 80px, 64px"
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* 2 — title, price, overview */}
          <section
            className={`mt-4 lg:col-start-2 lg:row-start-1 lg:mt-0 ${CARD}`}
          >
            {path && (
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
                {path}
              </p>
            )}
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-[24px] font-extrabold leading-tight text-ink lg:text-[26px]">
                {listing.title}
              </h1>
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

            <p className="mt-2 text-[30px] font-extrabold tabular-nums text-brand">
              ${Number(listing.price ?? 0).toLocaleString()}
            </p>

            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
              <span className="flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 font-semibold">
                <MapPin className="size-3.5" />
                {listing.locationLabel}
              </span>
              <span>
                {postedLabel}
                {liveViewCount != null &&
                  ` — Viewed ${liveViewCount.toLocaleString("en-US")} times`}
              </span>
            </p>

            {rows.length > 0 && (
              <>
                <h2 className="mb-3 mt-6 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                  Overview
                </h2>
                <dl className="divide-y divide-line">
                  {rows.map((d) => (
                    <div
                      key={d.label}
                      className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                    >
                      <dt className="shrink-0 text-[13px] font-semibold text-muted">
                        {d.label}
                      </dt>
                      <dd className="min-w-0 truncate text-right text-[14px] font-bold text-ink">
                        {d.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
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
                Contact the seller
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
              <h2 className="text-[18px] font-extrabold text-ink">Seller</h2>

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
                <button
                  type="button"
                  onClick={() => {
                    if (blocked) {
                      unblock(listing.ownerId);
                      toast(`${sellerName} unblocked`);
                    } else {
                      setConfirmBlock(true);
                    }
                  }}
                  className={`flex items-center gap-1.5 text-[13.5px] font-semibold transition-colors ${
                    blocked ? "text-brand" : "text-muted hover:text-danger"
                  }`}
                >
                  <UserRoundX className="size-4" strokeWidth={2.2} />
                  {blocked ? "Unblock seller" : "Block seller"}
                </button>
              </div>
            </section>
          </div>
        </div>
      </PageBody>

      <div className="glass shrink-0 border-t border-line px-4 pb-nav pt-3 lg:hidden">
        <div className="flex gap-2.5">
          {!lead ? (
            <Link
              href={`/seller/${listing.ownerId}`}
              className="brand-gradient flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl text-[16px] font-bold text-on-brand shadow-pop transition-transform active:scale-[0.98]"
            >
              <User className="size-5" />
              View seller
            </Link>
          ) : lead.revealed ? (
            <a href={lead.href} className={`${CALL} flex-1`}>
              <LeadIcon className="size-5" />
              {lead.actionLabel}
            </a>
          ) : (
            <Button size="lg" className="flex-1" onClick={reveal(lead.id)}>
              <LeadIcon className="size-5" />
              {lead.showLabel}
            </Button>
          )}
        </div>
      </div>

      <ReportDialog
        open={reporting}
        targetType="listing"
        targetId={id}
        targetLabel={listing.title}
        onClose={() => setReporting(false)}
      />

      <ConfirmDialog
        open={confirmBlock}
        title={`Block ${sellerName}?`}
        body="Their ads stop appearing in your feed on this device. It takes effect straight away and you can undo it from their profile or from Account Settings. Blocking is not a report — if this ad is against the rules, report it too."
        confirmLabel="Block"
        destructive
        onConfirm={() => {
          setConfirmBlock(false);
          block(listing.ownerId, sellerName);
          toast(`${sellerName} blocked — their ads are hidden`);
        }}
        onClose={() => setConfirmBlock(false)}
      />
    </>
  );
}
