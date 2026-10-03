"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Video, MapPin, Radio } from "lucide-react";
import SubPageBar from "@vezlist/shared/components/layout/SubPageBar.jsx";
import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import EmptyState from "@vezlist/shared/components/ui/EmptyState.jsx";
import Button from "@vezlist/shared/components/ui/Button.jsx";
import MediaImage from "@vezlist/shared/components/media/MediaImage.jsx";
import { listLiveCreators } from "@vezlist/shared/lib/api/live.js";

function startedLabel(startedAt, now) {
  const seconds = Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 1000),
  );
  if (!Number.isFinite(seconds)) return "Live now";
  if (seconds < 60) return "Just started";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
}

function LiveCard({ creator, now }) {
  return (
    <Link
      href={`/live/${creator.id}`}
      className="group relative block aspect-[5/4] min-w-0 overflow-hidden rounded-[22px] bg-[#16243a] text-white shadow-[0_8px_24px_rgba(18,43,76,.13)] transition-transform hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:aspect-[1.15]"
    >
      {creator.imageUrl ? (
        <MediaImage
          discreet
          fill
          src={creator.imageUrl}
          alt=""
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_35%,#685c87,#16243a_72%)]">
          <Radio className="size-14 text-white/45" aria-hidden="true" />
        </span>
      )}
      <span
        className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/25"
        aria-hidden="true"
      />
      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-[#ff2854] px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide">
        <span className="size-2 rounded-full bg-white" />
        {creator.status === "RECONNECTING" ? "Reconnecting" : "Live"}
      </span>
      <span className="absolute bottom-0 left-0 right-0 p-4">
        <span className="block line-clamp-2 text-lg font-extrabold leading-tight sm:text-xl">
          {creator.title}
        </span>
        <span className="mt-3 flex items-center gap-2">
          <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-white/70 bg-[#4770a5] text-sm font-bold">
            {creator.avatarUrl ? (
              <MediaImage
                discreet
                fill
                src={creator.avatarUrl}
                alt=""
                sizes="36px"
                className="object-cover"
              />
            ) : (
              creator.creatorName?.charAt(0)
            )}
          </span>
          <span className="min-w-0 truncate text-sm font-semibold">
            {creator.creatorName}
          </span>
        </span>
        <span className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-white/80 sm:text-sm">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{creator.location}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">
            {startedLabel(creator.startedAt, now)}
          </span>
        </span>
      </span>
    </Link>
  );
}

export default function LiveDirectory() {
  const [directory, setDirectory] = useState(null);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      setDirectory(await listLiveCreators());
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15_000);
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [refresh]);

  const creators = (directory?.items ?? []).filter((session) =>
    ["LIVE", "RECONNECTING"].includes(session.status),
  );

  return (
    <>
      <SubPageBar
        title="Live now"
        subtitle={
          directory
            ? `${directory.total} ${directory.total === 1 ? "creator" : "creators"} online`
            : "Checking who is live"
        }
      />
      <PageBody className="px-4 pb-8 pt-4 lg:px-8 lg:pt-6">
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-blue-100 bg-[#edf6ff] p-3 text-sm text-[#284b83]">
          <Video className="mt-0.5 size-5 shrink-0" />
          <p>
            Watch creators live for free. Sign in to join the chat, and tap a
            card to open its live video session.
          </p>
        </div>
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-800"
          >
            Could not refresh Live Now.{" "}
            <button
              type="button"
              onClick={refresh}
              className="font-bold underline"
            >
              Retry
            </button>
          </div>
        )}
        {!directory && !error ? (
          <p role="status" className="text-sm text-muted">
            Loading live creators…
          </p>
        ) : creators.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
            {creators.map((creator) => (
              <LiveCard key={creator.id} creator={creator} now={now} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="Radio"
            title="Nobody is live right now"
            body="Check back soon to find creators broadcasting live."
            action={<Button to="/">Back to browsing</Button>}
          />
        )}
        {directory && directory.total > creators.length && (
          <p className="mt-4 text-center text-sm text-muted">
            Showing the latest {creators.length} active creators.
          </p>
        )}
      </PageBody>
    </>
  );
}
