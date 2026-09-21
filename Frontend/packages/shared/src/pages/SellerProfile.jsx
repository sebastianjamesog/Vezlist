"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Flag, MapPin, ShieldCheck, UserRoundX } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import ListingCard from "../components/cards/ListingCard";
import ReportDialog from "../components/ReportDialog";
import MediaImage from "../components/media/MediaImage.jsx";
import { useReports } from "../context/ReportsContext";
import { useToast } from "../context/ToastContext";
import { getSellerProfile } from "../lib/api/sellers.js";
import { SITE_SCOPE, ApiError } from "../lib/api/client.js";
import { FEED_PATH } from "../lib/sites";

/** A `DiscoveryListingResponse` row shaped the way `ListingCard` expects one. */
function toCardListing(row) {
  return {
    id: row.id,
    title: row.title,
    business: row.businessName,
    category: row.categoryLabel,
    location: row.locationLabel,
    price: row.price,
    verified: row.verified,
    postedMsAgo: row.publishedAt
      ? Date.now() - new Date(row.publishedAt).getTime()
      : null,
    image: row.imageUrl,
  };
}

function ProfileSkeleton() {
  return (
    <>
      <SubPageBar title="Seller" />
      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        <div className="h-32 animate-pulse rounded-card bg-surface shadow-card" />
        <div className="mt-6 grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[122px] animate-pulse rounded-2xl bg-surface shadow-card"
            />
          ))}
        </div>
      </PageBody>
    </>
  );
}

/**
 * Who is behind an ad, and the two things a reader can do about them —
 * backed by GET /api/v1/sellers/{id} (cc.vezlist.sellers.web.SellerController),
 * the redacted public profile: `id, displayName, avatarUrl, memberSince,
 * verified, responseTime`, plus that seller's own active listings. No
 * contact info, no bio, no roles — the server already strips those, so
 * this page has nothing extra to hide.
 */
export default function SellerProfile() {
  const { id } = useParams();
  const { isBlocked, block, unblock, reportOf } = useReports();
  const toast = useToast();

  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    setNotFound(false);
    getSellerProfile(id, { site: SITE_SCOPE, limit: 24 })
      .then(setPage)
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
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

  if (loading) return <ProfileSkeleton />;

  if (notFound || (!page && !error)) {
    return (
      <>
        <SubPageBar title="Seller" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[18px] font-bold text-ink">
            That seller doesn't exist.
          </p>
          <Link
            href={FEED_PATH}
            className="text-[15px] font-semibold text-brand"
          >
            Back to listings
          </Link>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <SubPageBar title="Seller" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[18px] font-bold text-ink">
            Couldn't load this profile.
          </p>
          <p className="text-[14px] text-muted">
            {error.message || "Something went wrong."}
          </p>
          <Button onClick={load}>Retry</Button>
        </div>
      </>
    );
  }

  const { seller, items } = page;
  const theirAds = items.map(toCardListing);
  const blocked = isBlocked(seller.id);
  const reported = reportOf("user", seller.id);

  return (
    <>
      <SubPageBar
        title={seller.displayName}
        subtitle={
          seller.memberSince
            ? `Member since ${new Date(seller.memberSince).getFullYear()}`
            : undefined
        }
      />

      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        <section className="rounded-card bg-surface p-5 shadow-card lg:p-6">
          <div className="flex items-center gap-4">
            <span className="relative size-20 shrink-0 lg:size-24">
              <MediaImage
                fill
                src={seller.avatarUrl}
                alt={seller.displayName}
                sizes="(min-width: 1024px) 96px, 80px"
                className="rounded-full object-cover"
              />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[22px] font-bold leading-tight text-ink">
                  {seller.displayName}
                </h2>
                {seller.verified && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[12px] font-semibold text-amber-700">
                    <ShieldCheck className="size-3.5" />
                    Verified
                  </span>
                )}
              </div>
              <p className="mt-1 text-[14px] text-muted">
                {theirAds.length} {theirAds.length === 1 ? "ad" : "ads"} on the
                board
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setReporting(true)}
              className="flex items-center gap-1.5 text-[14px] font-semibold text-muted transition-colors hover:text-ink"
            >
              <Flag className="size-4" strokeWidth={2.2} />
              {reported ? "Reported" : "Report seller"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (blocked) {
                  unblock(seller.id);
                  toast(`${seller.displayName} unblocked`);
                } else {
                  setConfirmBlock(true);
                }
              }}
              className={`flex items-center gap-1.5 text-[14px] font-semibold transition-colors ${
                blocked ? "text-brand" : "text-muted hover:text-danger"
              }`}
            >
              <UserRoundX className="size-4" strokeWidth={2.2} />
              {blocked ? "Unblock" : "Block seller"}
            </button>
          </div>
        </section>

        {blocked ? (
          <div className="mt-6">
            <EmptyState
              icon="Lock"
              title={`You blocked ${seller.displayName}`}
              body="Their ads are hidden from your feed. Unblock above to see them again."
            />
          </div>
        ) : (
          <>
            <h2 className="mb-3 mt-6 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Ads by {seller.displayName}
            </h2>
            {theirAds.length ? (
              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
                {theirAds.map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon="Megaphone"
                title="No live ads"
                body="This seller has nothing posted right now."
              />
            )}
          </>
        )}
      </PageBody>

      <ReportDialog
        open={reporting}
        targetType="user"
        targetId={seller.id}
        targetLabel={seller.displayName}
        onClose={() => setReporting(false)}
      />

      <ConfirmDialog
        open={confirmBlock}
        title={`Block ${seller.displayName}?`}
        body="Their ads stop appearing in your feed on this device. It takes effect straight away and you can undo it from this page or from Account Settings. Blocking is not a report — if something here is against the rules, report it too."
        confirmLabel="Block"
        destructive
        onConfirm={() => {
          setConfirmBlock(false);
          block(seller.id, seller.displayName);
          toast(`${seller.displayName} blocked — their ads are hidden`);
        }}
        onClose={() => setConfirmBlock(false)}
      />
    </>
  );
}
