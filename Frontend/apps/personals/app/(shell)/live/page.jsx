import Link from "next/link";
import { Eye, MapPin } from "lucide-react";
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
    <span className="flex items-center gap-1 rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-white">
      <span className="size-1.5 rounded-full bg-white" />
      Live
    </span>
  );
}

/**
 * A broadcast tile. The cover is the whole card — a live grid is looked at
 * rather than read, so the text sits on the image under a scrim instead of in
 * a row beneath it, and two of them fit across a phone.
 */
function StreamTile({ stream }) {
  return (
    <Link
      href={`/live/${stream.id}`}
      className="group relative block overflow-hidden rounded-2xl shadow-card ring-1 ring-line transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden">
        <MediaImage
          discreet
          fill
          src={stream.cover}
          alt=""
          sizes="(min-width: 1024px) 25vw, 50vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      {/* One scrim, dark at the bottom where the text is and lighter at the top
          where the two pills sit, so both stay legible over any cover. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/45"
      />

      <span className="absolute left-2 top-2">
        <LivePill />
      </span>
      <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white backdrop-blur-sm">
        <Eye className="size-3" strokeWidth={2.4} />
        {compactCount(stream.viewers)}
      </span>

      <div className="absolute inset-x-0 bottom-0 p-2.5">
        <p className="line-clamp-2 text-[13px] font-bold leading-tight text-white">
          {stream.title}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <MediaImage
            discreet
            src={stream.avatar}
            alt=""
            width={20}
            height={20}
            className="size-5 shrink-0 rounded-full object-cover ring-1 ring-white/40"
          />
          <span className="truncate text-[11px] font-semibold text-white/85">
            {stream.host}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1 text-[10px] font-medium text-white/60">
          <MapPin className="size-3 shrink-0" strokeWidth={2.2} />
          <span className="truncate">{stream.location}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{timeAgo(stream.startedMsAgo)}</span>
        </div>
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
          <div className="grid grid-cols-2 gap-2.5 pt-1 lg:grid-cols-4 lg:gap-4">
            {streams.map((s) => (
              <StreamTile key={s.id} stream={s} />
            ))}
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
