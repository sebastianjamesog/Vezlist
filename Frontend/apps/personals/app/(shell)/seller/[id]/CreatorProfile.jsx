"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BadgeCheck,
  CalendarDays,
  Flag,
  Megaphone,
  Radio,
  UserRoundX,
} from "lucide-react";
import SubPageBar from "@vezlist/shared/components/layout/SubPageBar.jsx";
import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import EmptyState from "@vezlist/shared/components/ui/EmptyState.jsx";
import Button from "@vezlist/shared/components/ui/Button.jsx";
import ConfirmDialog from "@vezlist/shared/components/ui/ConfirmDialog.jsx";
import ReportDialog from "@vezlist/shared/components/ReportDialog.jsx";
import MediaImage from "@vezlist/shared/components/media/MediaImage.jsx";
import { useReports } from "@vezlist/shared/context/ReportsContext.jsx";
import { useToast } from "@vezlist/shared/context/ToastContext.jsx";
import { compactCount } from "@vezlist/shared/lib/format.js";
import { getSellerProfile } from "@vezlist/shared/lib/api/sellers.js";
import { SITE_SCOPE, ApiError } from "@vezlist/shared/lib/api/client.js";
import { FEED_PATH } from "@vezlist/shared/lib/sites.js";
import { liveStreamFor } from "@vezlist/shared/lib/live.js";
import { useLiveSessions } from "@vezlist/shared/components/live/useLiveSessions.js";
import CreatorAvatar from "../../../CreatorAvatar.jsx";

/** The server caps a profile page at 50 posts. */
const POST_LIMIT = 50;

/**
 * A Personals creator's profile — GET /api/v1/sellers/{id}: who they are,
 * how their posts are doing (post count, total views, total likes), and
 * every live post as a three-up grid. The Marketplace keeps the shared
 * list-style `SellerProfile`; a creator board is looked at, not read.
 */

/** A frosted tile on the gradient hero — the same one the Profile tab uses. */
function Stat({ value, label }) {
  return (
    <div className="flex-1 rounded-2xl bg-on-brand/15 px-2 py-2.5 text-center backdrop-blur-sm">
      <p className="text-[20px] font-extrabold tabular-nums leading-none text-on-brand">
        {compactCount(value)}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-on-brand/75">
        {label}
      </p>
    </div>
  );
}

function PostTile({ post }) {
  const price = Number(post.price ?? 0);
  return (
    <Link
      href={`/ad/${post.id}`}
      aria-label={post.title}
      className="group relative block overflow-hidden rounded-lg transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-line">
        {post.imageUrl && (
          <MediaImage
            discreet
            fill
            src={post.imageUrl}
            alt=""
            sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"
      />
      <div className="absolute inset-x-0 bottom-0 p-1.5 lg:p-2">
        {price > 0 && (
          <p className="text-[10px] font-extrabold tabular-nums text-white lg:text-xs">
            ${price.toLocaleString()}
          </p>
        )}
        <p className="truncate text-[9px] font-semibold text-white/85 lg:text-[11px]">
          {post.title}
        </p>
      </div>
    </Link>
  );
}

function PostGrid({ children }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-4 lg:gap-3 xl:grid-cols-5">
      {children}
    </div>
  );
}

/**
 * A creator on air gets the same red language the Live now grid uses: a ring
 * and a pill on the avatar, and a banner that is the way in to the stream.
 */
function LiveBanner({ stream }) {
  return (
    <Link
      href={`/live/${stream.id}`}
      className="group mt-4 flex items-center gap-3 overflow-hidden rounded-card bg-surface p-2.5 shadow-card ring-1 ring-red-500/30 transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
    >
      <span className="relative aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-lg">
        {(stream.imageUrl || stream.avatarUrl) && (
          <MediaImage
            discreet
            fill
            src={stream.imageUrl || stream.avatarUrl}
            alt=""
            sizes="56px"
            className="object-cover"
          />
        )}
        <span className="absolute inset-0 grid place-items-center bg-black/30">
          <Radio className="size-5 text-white" strokeWidth={2.4} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white motion-reduce:animate-none" />
            {stream.status === "RECONNECTING" ? "Reconnecting" : "Live"}
          </span>
        </span>
        <span className="mt-1 block truncate text-[13px] font-bold text-ink">
          {stream.title}
        </span>
        <span className="block truncate text-[11px] text-muted">
          Watch this creator's live session
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-red-500 px-3 py-1.5 text-[12px] font-bold text-white transition-colors group-hover:bg-red-600">
        Watch
      </span>
    </Link>
  );
}

function ProfileSkeleton() {
  return (
    <>
      <SubPageBar title="Creator" />
      <PageBody className="px-4 pb-8 pt-3 lg:px-8 lg:py-6">
        <div className="h-56 animate-pulse rounded-card bg-surface shadow-card" />
        <div className="mt-4 rounded-card bg-surface p-2.5 shadow-card">
          <PostGrid>
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="aspect-[4/5] animate-pulse rounded-lg bg-line"
              />
            ))}
          </PostGrid>
        </div>
      </PageBody>
    </>
  );
}

function Message({ title, body, action }) {
  return (
    <>
      <SubPageBar title="Creator" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[18px] font-bold text-ink">{title}</p>
        {body && <p className="text-[14px] text-muted">{body}</p>}
        {action}
      </div>
    </>
  );
}

export default function CreatorProfile() {
  const { id } = useParams();
  const { isBlocked, block, unblock, reportOf } = useReports();
  const toast = useToast();
  const sessions = useLiveSessions();

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
    getSellerProfile(id, { site: SITE_SCOPE, limit: POST_LIMIT })
      .then(setPage)
      .catch((err) => {
        if (
          err instanceof ApiError &&
          (err.status === 404 || err.status === 400)
        ) {
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
      <Message
        title="That creator doesn't exist."
        action={
          <Link
            href={FEED_PATH}
            className="text-[15px] font-semibold text-brand"
          >
            Back to the board
          </Link>
        }
      />
    );
  }

  if (error) {
    return (
      <Message
        title="Couldn't load this profile."
        body={error.message || "Something went wrong."}
        action={<Button onClick={load}>Retry</Button>}
      />
    );
  }

  const { seller, items, activeListingCount, viewCount, likeCount } = page;
  const blocked = isBlocked(seller.id);
  const reported = reportOf("user", seller.id);
  const live = blocked ? null : liveStreamFor(seller.id, sessions);
  // Profile-photo upload is future work, so most creators have no avatar yet:
  // stand in their first post's photo rather than bare initials — unless
  // they're blocked, when their posts are hidden and so is this.
  const avatarSrc =
    seller.avatarUrl ??
    (blocked ? null : items.find((post) => post.imageUrl)?.imageUrl);
  const since = seller.memberSince
    ? new Date(seller.memberSince).getFullYear()
    : null;

  return (
    <>
      <SubPageBar
        title={seller.displayName}
        subtitle={since ? `Member since ${since}` : undefined}
      />

      <PageBody className="px-4 pb-8 pt-3 lg:px-8 lg:py-6">
        {/* Gradient hero, the same card the Profile tab gives your own
            account: identity on the left, numbers in frosted tiles below. */}
        <section
          aria-label={`${seller.displayName}'s profile`}
          className="brand-gradient relative overflow-hidden rounded-card p-5 shadow-lift lg:p-6"
        >
          <span
            aria-hidden="true"
            className="absolute -right-10 -top-10 size-40 rounded-full bg-on-brand/15 blur-2xl"
          />

          <div className="relative flex items-center gap-4">
            <span className="relative shrink-0">
              <CreatorAvatar
                name={seller.displayName}
                src={avatarSrc}
                size={80}
                rounded="rounded-3xl"
                discreet
                className="ring-4 ring-on-brand/30"
              />
              {seller.verified && (
                <span className="absolute -bottom-1.5 -right-1.5 grid size-7 place-items-center rounded-full bg-surface shadow-card">
                  <BadgeCheck
                    className="size-5 text-brand"
                    strokeWidth={2.4}
                    aria-label="Verified"
                  />
                </span>
              )}
            </span>

            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 truncate text-[24px] font-extrabold leading-tight text-on-brand">
                <span className="truncate">{seller.displayName}</span>
              </h2>
              <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-on-brand/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-on-brand">
                <Megaphone className="size-3.5" strokeWidth={2.6} />
                Creator
              </p>
              {since && (
                <p className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-on-brand/80">
                  <CalendarDays
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  On Vezlist since {since}
                </p>
              )}
            </div>
          </div>

          <div className="relative mt-5 flex gap-2">
            <Stat value={activeListingCount} label="Posts" />
            <Stat value={viewCount} label="Views" />
            <Stat value={likeCount} label="Likes" />
          </div>

          <div className="relative mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReporting(true)}
              className="flex items-center gap-1.5 rounded-full bg-on-brand/15 px-3.5 py-1.5 text-[13px] font-semibold text-on-brand transition-colors hover:bg-on-brand/25"
            >
              <Flag className="size-3.5" strokeWidth={2.2} />
              {reported ? "Reported" : "Report"}
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
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                blocked
                  ? "bg-surface text-brand"
                  : "bg-on-brand/15 text-on-brand hover:bg-on-brand/25"
              }`}
            >
              <UserRoundX className="size-3.5" strokeWidth={2.2} />
              {blocked ? "Unblock" : "Block"}
            </button>
          </div>
        </section>

        {live && <LiveBanner stream={live} />}

        {blocked ? (
          <div className="mt-6">
            <EmptyState
              icon="Lock"
              title={`You blocked ${seller.displayName}`}
              body="Their posts are hidden from your feed. Unblock above to see them again."
            />
          </div>
        ) : (
          <section className="mt-4">
            <h3 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Posts · {activeListingCount}
            </h3>
            {items.length ? (
              <div className="rounded-card bg-surface p-2.5 shadow-card lg:p-4">
                <PostGrid>
                  {items.map((post) => (
                    <PostTile key={post.id} post={post} />
                  ))}
                </PostGrid>
              </div>
            ) : (
              <EmptyState
                icon="Megaphone"
                title="No posts yet"
                body="This creator has nothing posted right now."
              />
            )}
          </section>
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
        body="Their posts stop appearing in your feed on this device. It takes effect straight away and you can undo it from this page or from Account Settings. Blocking is not a report — if something here is against the rules, report it too."
        confirmLabel="Block"
        destructive
        onConfirm={() => {
          setConfirmBlock(false);
          block(seller.id, seller.displayName);
          toast(`${seller.displayName} blocked — their posts are hidden`);
        }}
        onClose={() => setConfirmBlock(false)}
      />
    </>
  );
}
