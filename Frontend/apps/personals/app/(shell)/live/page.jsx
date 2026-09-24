import Link from "next/link";
import { Eye } from "lucide-react";
import SubPageBar from "@vezlist/shared/components/layout/SubPageBar.jsx";
import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import EmptyState from "@vezlist/shared/components/ui/EmptyState.jsx";
import { compactCount, timeAgo } from "@vezlist/shared/lib/format.js";
import { liveStreams } from "@vezlist/shared/data/mock.js";
import MediaImage from "@vezlist/shared/components/media/MediaImage.jsx";

export const metadata = {
  title: "Live now",
  description: "Watch broadcasts happening right now on Vezlist Personals.",
};

/** The red dot that means "this is happening", not "this happened". */
function LivePill() {
  return (
    <span className="flex items-center gap-0.5 rounded bg-red-500 px-1 py-px text-[8px] font-extrabold uppercase tracking-[0.06em] text-white">
      <span className="size-1 rounded-full bg-white" />
      Live
    </span>
  );
}

/**
 * A broadcast tile. The cover is the whole card — a live grid is looked at
 * rather than read, so the text sits on the image under a scrim instead of in
 * a row beneath it. Three fit across a phone, so the overlay keeps to one
 * title line and one host line; the location lives on the stream page.
 */
function StreamTile({ stream }) {
  return (
    <Link
      href={`/live/${stream.id}`}
      aria-label={`${stream.title} — ${stream.host}, ${stream.location}`}
      className="group relative block overflow-hidden rounded-lg transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden">
        <MediaImage
          discreet
          fill
          src={stream.cover}
          alt=""
          sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, 33vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      {/* One scrim, dark at the bottom where the text is and lighter at the top
          where the two pills sit, so both stay legible over any cover. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/45"
      />

      <span className="absolute left-1.5 top-1.5">
        <LivePill />
      </span>
      <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded bg-black/55 px-1 py-px text-[8px] font-bold tabular-nums text-white backdrop-blur-sm">
        <Eye className="size-2.5" strokeWidth={2.4} />
        {compactCount(stream.viewers)}
      </span>

      <div className="absolute inset-x-0 bottom-0 p-1.5 lg:p-2">
        <p className="truncate text-[10px] font-bold leading-tight text-white lg:text-xs">
          {stream.title}
        </p>
        <p className="mt-0.5 truncate text-[8px] font-medium text-white/70 lg:text-[10px]">
          {stream.host}
          <span aria-hidden="true"> · </span>
          {timeAgo(stream.startedMsAgo)}
        </p>
      </div>
    </Link>
  );
}

/**
 * Everyone broadcasting right now, newest first — a live list sorted by
 * anything else is asking you to scroll past the thing you came for.
 */
export default function Live() {
  const streams = [...liveStreams].sort(
    (a, b) => a.startedMsAgo - b.startedMsAgo,
  );
  const watching = streams.reduce((n, s) => n + s.viewers, 0);

  return (
    <>
      <SubPageBar
        title="Live now"
        subtitle={
          streams.length
            ? `${streams.length} broadcasting · ${compactCount(watching)} watching`
            : "Nobody is on air"
        }
      />

      <PageBody className="px-4 pb-8 lg:px-8">
        {streams.length ? (
          <div className="rounded-card bg-surface p-2.5 shadow-card lg:p-4">
            <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-4 lg:gap-3 xl:grid-cols-5">
              {streams.map((s) => (
                <StreamTile key={s.id} stream={s} />
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            icon="Radio"
            title="Nobody is live"
            body="Check the status tray — the newest updates are there instead."
          />
        )}
      </PageBody>
    </>
  );
}
