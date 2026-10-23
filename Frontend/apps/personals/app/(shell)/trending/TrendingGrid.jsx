"use client";

import { useEffect, useState } from "react";
import { useAdPopup } from "@vezlist/shared/components/AdPopup.jsx";
import { openAdClick } from "@vezlist/shared/lib/openAdClick.js";
import Link from "next/link";
import { BadgeCheck, Eye, Heart } from "lucide-react";
import Button from "@vezlist/shared/components/ui/Button.jsx";
import EmptyState from "@vezlist/shared/components/ui/EmptyState.jsx";
import MediaImage from "@vezlist/shared/components/media/MediaImage.jsx";
import { useReports } from "@vezlist/shared/context/ReportsContext.jsx";
import { compactCount } from "@vezlist/shared/lib/format.js";
import { getTrendingSellers } from "@vezlist/shared/lib/api/sellers.js";
import { SITE_SCOPE } from "@vezlist/shared/lib/api/client.js";
import { liveStreamFor } from "@vezlist/shared/lib/live.js";
import { useLiveSessions } from "@vezlist/shared/components/live/useLiveSessions.js";
import CreatorAvatar from "../../CreatorAvatar.jsx";

/**
 * Trending creators — GET /api/v1/sellers/trending, ranked server-side by the
 * views and likes on their live posts. The ranking is the server's; this page
 * only drops creators the visitor has blocked on this device.
 */
const LIMIT = 30;

/** Same shape as the Live now tile: the cover is the card, text on a scrim. */
function CreatorTile({ creator, rank, live, onOpen }) {
  return (
    <Link
      href={
        creator.coverListingId
          ? `/ad/${creator.coverListingId}`
          : `/seller/${creator.id}`
      }
      onClick={
        creator.coverListingId
          ? (event) => openAdClick(event, () => onOpen(creator.coverListingId))
          : undefined
      }
      aria-label={`${creator.displayName}${live?.status === "LIVE" ? " (live now)" : ""} — ${creator.viewCount} views, ${creator.likeCount} likes`}
      className="group relative block overflow-hidden rounded-lg transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-line">
        {creator.coverUrl && (
          <MediaImage
            discreet
            fill
            src={creator.coverUrl}
            alt=""
            sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
      </div>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/30"
      />

      <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1 py-px text-[8px] font-extrabold tabular-nums text-white backdrop-blur-sm">
        #{rank}
      </span>
      {live?.status === "LIVE" && (
        <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded bg-red-500 px-1 py-px text-[8px] font-extrabold uppercase tracking-[0.06em] text-white">
          <span className="size-1 animate-pulse rounded-full bg-white motion-reduce:animate-none" />
          Live
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 p-1.5 lg:p-2">
        <div className="flex items-center gap-1">
          <CreatorAvatar
            name={creator.displayName}
            src={creator.avatarUrl}
            size={16}
            className={
              live?.status === "LIVE"
                ? "ring-2 ring-red-500"
                : "ring-1 ring-white/50"
            }
          />
          <p className="min-w-0 truncate text-[10px] font-bold leading-tight text-white lg:text-xs">
            {creator.displayName}
          </p>
          {creator.verified && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-950/80 px-1 py-0.5 text-[8px] font-bold uppercase text-emerald-200">
              <BadgeCheck className="size-2.5" strokeWidth={2.6} />
              Verified
            </span>
          )}
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-[8px] font-semibold tabular-nums text-white/75 lg:text-[10px]">
          <span className="flex items-center gap-0.5">
            <Eye className="size-2.5" strokeWidth={2.4} />
            {compactCount(creator.viewCount)}
          </span>
          <span className="flex items-center gap-0.5">
            <Heart className="size-2.5" strokeWidth={2.4} />
            {compactCount(creator.likeCount)}
          </span>
        </p>
      </div>
    </Link>
  );
}

function Panel({ children }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-4 lg:gap-3 xl:grid-cols-5">
      {children}
    </div>
  );
}

export default function TrendingGrid() {
  const viewer = useAdPopup();
  const { isBlocked } = useReports();
  const sessions = useLiveSessions();
  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTrendingSellers({ site: SITE_SCOPE, limit: LIMIT })
      .then((rows) => {
        if (!cancelled) setCreators(rows ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  if (loading) {
    return (
      <Panel>
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            className="aspect-[4/5] animate-pulse rounded-lg bg-line"
          />
        ))}
      </Panel>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon="TriangleAlert"
        title="Couldn't load creators"
        body={error.message || "Something went wrong. Please try again."}
        action={
          <Button onClick={() => setReloadToken((t) => t + 1)}>Retry</Button>
        }
      />
    );
  }

  const shown = creators.filter((c) => !isBlocked(c.id));

  if (!shown.length) {
    return (
      <EmptyState
        icon="UsersRound"
        title="No trending creators yet"
        body="No creators with active posts yet. Check back soon."
      />
    );
  }

  return (
    <>
      <Panel>
        {shown.map((c, i) => (
          <CreatorTile
            key={c.id}
            creator={c}
            onOpen={(id) =>
              viewer.open(
                id,
                shown.map((creator) => creator.coverListingId),
                { mode: "vertical" },
              )
            }
            rank={i + 1}
            live={liveStreamFor(c.id, sessions)}
          />
        ))}
      </Panel>
      {viewer.popup}
    </>
  );
}
