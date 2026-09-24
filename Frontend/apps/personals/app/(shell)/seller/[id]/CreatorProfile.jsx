"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BadgeCheck, Eye, Flag, Radio, UserRoundX } from "lucide-react";
import SubPageBar from "@vezlist/shared/components/layout/SubPageBar.jsx";
import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import EmptyState from "@vezlist/shared/components/ui/EmptyState.jsx";
import Button from "@vezlist/shared/components/ui/Button.jsx";
import ConfirmDialog from "@vezlist/shared/components/ui/ConfirmDialog.jsx";
import ReportDialog from "@vezlist/shared/components/ReportDialog.jsx";
import MediaImage from "@vezlist/shared/components/media/MediaImage.jsx";
import { useReports } from "@vezlist/shared/context/ReportsContext.jsx";
import { useToast } from "@vezlist/shared/context/ToastContext.jsx";
import { compactCount, timeAgo } from "@vezlist/shared/lib/format.js";
import { getSellerProfile } from "@vezlist/shared/lib/api/sellers.js";
import { SITE_SCOPE, ApiError } from "@vezlist/shared/lib/api/client.js";
import { FEED_PATH } from "@vezlist/shared/lib/sites.js";
import { liveStreamFor } from "@vezlist/shared/lib/live.js";
import CreatorAvatar from "../../../CreatorAvatar.jsx";

/** The server caps a profile page at 50 posts. */
const POST_LIMIT = 50;

/**
 * A Personals creator's profile — GET /api/v1/sellers/{id}: who they are,
 * how their posts are doing (post count, total views, total likes), and
 * every live post as a three-up grid. The Marketplace keeps the shared
 * list-style `SellerProfile`; a creator board is looked at, not read.
 */

function Stat({ value, label }) {
  return (
    <div className="flex-1 text-center">
      <p className="text-[18px] font-extrabold tabular-nums leading-none text-ink lg:text-[20px]">
        {compactCount(value)}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
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
        <MediaImage
          discreet
          fill
          src={stream.cover}
          alt=""
          sizes="56px"
          className="object-cover"
        />
        <span className="absolute inset-0 grid place-items-center bg-black/30">
          <Radio className="size-5 text-white" strokeWidth={2.4} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white motion-reduce:animate-none" />
            Live now
          </span>
          <span className="flex items-center gap-0.5 text-[11px] font-semibold tabular-nums text-muted">
            <Eye className="size-3" strokeWidth={2.4} />
            {compactCount(stream.viewers)} watching
          </span>
        </span>
        <span className="mt-1 block truncate text-[14px] font-bold text-ink">
          {stream.title}
        </span>
        <span className="block truncate text-[12px] text-muted">
          Started {timeAgo(stream.startedMsAgo).toLowerCase()}
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-red-500 px-3.5 py-2 text-[13px] font-bold text-white transition-colors group-hover:bg-red-600">
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
  const live = blocked ? null : liveStreamFor(seller.displayName);
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
        <section className="overflow-hidden rounded-card bg-surface shadow-card">
          <div className="brand-gradient h-20 lg:h-24" aria-hidden="true" />

          <div className="-mt-10 flex flex-col items-center px-5 pb-5 text-center lg:-mt-12">
            {live ? (
              <Link
                href={`/live/${live.id}`}
                aria-label={`${seller.displayName} is live — watch now`}
                className="relative rounded-full bg-gradient-to-tr from-red-600 via-red-500 to-rose-400 p-[3px] ring-4 ring-surface transition-transform hover:scale-[1.03]"
              >
                <span className="block rounded-full bg-surface p-[3px]">
                  <CreatorAvatar
                    name={seller.displayName}
                    src={seller.avatarUrl}
                    size={74}
                  />
                </span>
                <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-white ring-2 ring-surface">
                  <span className="size-1.5 animate-pulse rounded-full bg-white motion-reduce:animate-none" />
                  Live
                </span>
              </Link>
            ) : (
              <CreatorAvatar
                name={seller.displayName}
                src={seller.avatarUrl}
                size={80}
                className="ring-4 ring-surface"
              />
            )}
            <h2 className="mt-2.5 flex items-center gap-1.5 text-[20px] font-bold leading-tight text-ink">
              {seller.displayName}
              {seller.verified && (
                <BadgeCheck
                  className="size-5 text-sky-500"
                  strokeWidth={2.4}
                  aria-label="Verified"
                />
              )}
            </h2>
            {since && (
              <p className="mt-0.5 text-[13px] text-muted">
                On Vezlist since {since}
              </p>
            )}

            <div className="mt-4 flex w-full max-w-sm divide-x divide-line rounded-2xl bg-canvas py-3">
              <Stat value={activeListingCount} label="Posts" />
              <Stat value={viewCount} label="Views" />
              <Stat value={likeCount} label="Likes" />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setReporting(true)}
                className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-[13px] font-semibold text-muted transition-colors hover:text-ink"
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
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  blocked
                    ? "border-brand text-brand"
                    : "border-line text-muted hover:text-danger"
                }`}
              >
                <UserRoundX className="size-3.5" strokeWidth={2.2} />
                {blocked ? "Unblock" : "Block"}
              </button>
            </div>
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
                title="No live posts"
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
