"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, MapPin, Radio } from "lucide-react";
import SubPageBar from "@vezlist/shared/components/layout/SubPageBar.jsx";
import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import EmptyState from "@vezlist/shared/components/ui/EmptyState.jsx";
import Button from "@vezlist/shared/components/ui/Button.jsx";
import MediaImage from "@vezlist/shared/components/media/MediaImage.jsx";
import { compactCount } from "@vezlist/shared/lib/format.js";
import { listLiveCreators } from "@vezlist/shared/lib/api/live.js";

const PHOTO_GRID =
  "grid grid-cols-3 gap-1.5 lg:grid-cols-4 lg:gap-3 xl:grid-cols-5";

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

function LiveCard({ creator, now, index }) {
  const viewers =
    Number.isInteger(creator.viewerCount) && creator.viewerCount >= 0
      ? creator.viewerCount
      : null;
  return (
    <Link
      href={`/live/${encodeURIComponent(creator.id)}`}
      aria-label={`${creator.creatorName || "Creator"}: ${creator.title || "Live session"}. Watch live`}
      className="group relative block aspect-[4/5] min-w-0 overflow-hidden rounded-lg bg-slate-800 text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
    >
      {creator.imageUrl || creator.avatarUrl ? (
        <MediaImage
          discreet
          fill
          src={creator.imageUrl || creator.avatarUrl}
          alt=""
          sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, 33vw"
          loading={index < 3 ? "eager" : "lazy"}
          className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-105"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center bg-slate-700">
          <Radio className="size-8 text-white/70" aria-hidden="true" />
        </span>
      )}
      <span
        className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/10 to-transparent"
        aria-hidden="true"
      />
      <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-rose-600 px-1 py-0.5 text-[9px] font-extrabold leading-none lg:text-[11px]">
        <span className="size-1.5 rounded-full bg-white" aria-hidden="true" />
        {creator.status === "RECONNECTING" ? "Reconnecting" : "LIVE"}
      </span>
      <span className="absolute inset-x-0 bottom-0 p-1.5 lg:p-2">
        <span
          data-no-translate
          className="block truncate text-[10px] font-bold leading-4 lg:text-xs"
        >
          {creator.creatorName || "Creator"}
        </span>
        {creator.title && (
          <span className="block truncate text-[9px] leading-3 text-white/95 lg:text-[11px] lg:leading-4">
            {creator.title}
          </span>
        )}
        {creator.location && (
          <span className="mt-0.5 flex min-w-0 items-center gap-0.5 text-[9px] leading-3 text-white/95 lg:text-[11px] lg:leading-4">
            <MapPin
              className="size-2.5 shrink-0 lg:size-3"
              aria-hidden="true"
            />
            <span className="truncate">{creator.location}</span>
          </span>
        )}
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[9px] leading-3 text-white/95 lg:text-[11px] lg:leading-4">
          {viewers !== null && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 tabular-nums"
              aria-label={`${viewers} watching`}
            >
              <Eye className="size-2.5 shrink-0 lg:size-3" aria-hidden="true" />
              {compactCount(viewers)}
            </span>
          )}
          <span className="truncate">
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

  const requestVersion = useRef(0);
  const pending = useRef(null);
  const clockOffset = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    try {
      // Directory supports a limit, not Browse's category/location filters.
      const page = await listLiveCreators(30, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (version !== requestVersion.current) return;
      const serverNow = Date.parse(
        page.serverTime ?? page.items?.[0]?.serverTime,
      );
      clockOffset.current = Number.isFinite(serverNow)
        ? serverNow - Date.now()
        : 0;
      setDirectory(page);
      setNow(Date.now() + clockOffset.current);
      setError(null);
    } catch (caught) {
      if (version === requestVersion.current && !controller.signal.aborted)
        setError(caught);
    }
  }, []);

  useEffect(() => {
    refresh();
    const visibleRefresh = () => {
      if (document.visibilityState !== "hidden") refresh();
    };
    const timer = setInterval(visibleRefresh, 15_000);
    const clock = setInterval(
      () => setNow(Date.now() + clockOffset.current),
      30_000,
    );
    window.addEventListener("focus", visibleRefresh);
    document.addEventListener("visibilitychange", visibleRefresh);
    return () => {
      ++requestVersion.current;
      pending.current?.abort();
      clearInterval(timer);
      clearInterval(clock);
      window.removeEventListener("focus", visibleRefresh);
      document.removeEventListener("visibilitychange", visibleRefresh);
    };
  }, [refresh]);

  useEffect(() => {
    const deadline = Math.min(
      ...(directory?.items ?? [])
        .map((item) => Date.parse(item.endsAt))
        .filter((time) => time > now),
    );
    if (!Number.isFinite(deadline)) return undefined;
    const timer = setTimeout(
      () => setNow(Date.now() + clockOffset.current),
      Math.min(deadline - now + 20, 2_147_483_647),
    );
    return () => clearTimeout(timer);
  }, [directory, now]);

  const loaded = directory?.items ?? [];
  const creators = loaded.filter(
    (session) =>
      ["LIVE", "RECONNECTING"].includes(session.status) &&
      !(Date.parse(session.endsAt) <= now),
  );
  const total = Math.max(
    creators.length,
    (directory?.total ?? 0) - (loaded.length - creators.length),
  );

  return (
    <>
      <SubPageBar
        title="Live now"
        subtitle={
          directory
            ? `${total} ${total === 1 ? "creator" : "creators"} online`
            : "Checking who is live"
        }
      />
      <PageBody className="px-4 pb-8 lg:px-8">
        <p className="mb-3 text-xs text-muted">
          Watch live for free. Sign in to join the chat.
        </p>
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-800"
          >
            Could not refresh Live Now.{" "}
            <button
              type="button"
              onClick={refresh}
              className="font-bold underline focus-visible:outline-2 focus-visible:outline-brand"
            >
              Retry
            </button>
          </div>
        )}
        {!directory && !error ? (
          <div role="status" aria-label="Loading live creators">
            <span className="sr-only">Loading live creators...</span>
            <div className={PHOTO_GRID} aria-hidden="true">
              {Array.from({ length: 12 }, (_, index) => (
                <div
                  key={index}
                  className="aspect-[4/5] rounded-lg bg-line motion-safe:animate-pulse"
                />
              ))}
            </div>
          </div>
        ) : creators.length ? (
          <div className={PHOTO_GRID}>
            {creators.map((creator, index) => (
              <LiveCard
                key={creator.id}
                creator={creator}
                now={now}
                index={index}
              />
            ))}
          </div>
        ) : !error ? (
          <EmptyState
            icon="Radio"
            title="Nobody is live right now"
            body="Check back soon to find creators broadcasting live."
            action={<Button to="/">Back to browsing</Button>}
          />
        ) : null}
        {directory && total > creators.length && (
          <p className="mt-4 text-center text-sm text-muted">
            Showing the latest {creators.length} active creators.
          </p>
        )}
      </PageBody>
    </>
  );
}
