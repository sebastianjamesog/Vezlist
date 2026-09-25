"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { BadgeCheck, Eye, Flag, Heart, MapPin, Send, X } from "lucide-react";
import { Navigate, useNavigate } from "@vezlist/shared/lib/nav.jsx";
import { compactCount, timeAgo } from "@vezlist/shared/lib/format.js";
import ReportDialog from "@vezlist/shared/components/ReportDialog.jsx";
import { useReports } from "@vezlist/shared/context/ReportsContext.jsx";
import { allLiveStreams } from "@vezlist/shared/data/mock.js";
import MediaImage from "@vezlist/shared/components/media/MediaImage.jsx";

/** How often the viewer count re-reads, and how far it can move in one step. */
const TICK_MS = 4000;
const DRIFT = 9;
/** A floating heart's lifetime, matched to the CSS animation below. */
const HEART_MS = 1800;

/**
 * The live player. There is no media server behind it: the cover is a still,
 * the viewer count drifts on a timer and the chat is a seed you append to.
 * Everything a real one would do to the *screen* it does — the parts that need
 * a backend are the two marked below and nothing else.
 */
export default function LiveViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const stream = allLiveStreams.find((s) => s.id === id);

  const [viewers, setViewers] = useState(stream?.viewers ?? 0);
  const [chat, setChat] = useState(stream?.chat ?? []);
  const [draft, setDraft] = useState("");
  const [following, setFollowing] = useState(false);
  const [hearts, setHearts] = useState([]);
  const [reporting, setReporting] = useState(false);
  const { reportOf } = useReports();
  const chatEnd = useRef(null);
  // Keys only have to be unique within this mount, so a counter beats a
  // timestamp — two hearts in the same millisecond would collide.
  const nextKey = useRef(0);

  // A live audience is never still. Random walk rather than a climb, floored so
  // a long watch can't drift it to zero.
  useEffect(() => {
    if (!stream) return;
    const timer = setInterval(() => {
      setViewers((v) =>
        Math.max(1, v + Math.round((Math.random() - 0.45) * DRIFT)),
      );
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [stream]);

  // New messages land at the bottom, so the bottom is where the scroll stays.
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [chat.length]);

  // A deep link to a broadcast that has ended has nothing to show.
  if (!stream) return <Navigate to="/live" replace />;

  const reported = reportOf("stream", stream.id);

  function close() {
    if (window.history.length > 1) navigate(-1);
    else navigate("/live", { replace: true });
  }

  function send(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    // Backend: this is the message that would go to the room.
    setChat((c) => [
      ...c,
      { id: `me-${nextKey.current++}`, name: "You", text, own: true },
    ]);
    setDraft("");
  }

  function react() {
    // Backend: and this is the reaction. Locally it is one heart, drifting on
    // its own offset so a burst of taps does not draw one thick column.
    const key = nextKey.current++;
    setHearts((h) => [...h, { key, offset: Math.random() * 28 - 14 }]);
    setTimeout(
      () => setHearts((h) => h.filter((x) => x.key !== key)),
      HEART_MS,
    );
  }

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-black lg:max-w-none">
      {/* The stand-in for the video. `discreet` so discreet mode withholds a
          live broadcast's cover exactly like it withholds everything else. */}
      <MediaImage
        discreet
        fill
        preload
        src={stream.cover}
        alt=""
        sizes="(min-width: 1024px) 430px, 100vw"
        className="object-cover"
      />
      {/* Dark at both ends and nearly clear through the middle: the chrome sits
          top and bottom, the picture is what's between them. A plain two-stop
          gradient greys out the whole broadcast to make the caption legible. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(0_0_0/0.7)_0%,rgb(0_0_0/0.12)_22%,rgb(0_0_0/0.12)_42%,rgb(0_0_0/0.85)_78%,rgb(0_0_0/0.96)_100%)]"
      />

      {/* ---- Top: who, how many, and the way out --------------------------- */}
      <header className="relative z-10 flex items-start gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-black/45 py-1.5 pl-1.5 pr-3 backdrop-blur-sm">
          <MediaImage
            discreet
            src={stream.avatar}
            alt=""
            width={32}
            height={32}
            className="size-8 shrink-0 rounded-full object-cover ring-2 ring-red-500"
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1">
              <span className="truncate text-[13px] font-bold text-white">
                {stream.host}
              </span>
              {stream.verified && (
                <BadgeCheck
                  className="size-3.5 shrink-0 text-emerald-400"
                  strokeWidth={2.6}
                />
              )}
            </span>
            <span className="flex items-center gap-1 text-[10px] font-medium text-white/60">
              <MapPin className="size-2.5 shrink-0" strokeWidth={2.4} />
              <span className="truncate">{stream.location}</span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => setFollowing((f) => !f)}
            aria-pressed={following}
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
              following
                ? "bg-white/15 text-white"
                : "brand-gradient text-on-brand"
            }`}
          >
            {following ? "Following" : "Follow"}
          </button>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={close}
            aria-label="Close the broadcast"
            className="grid size-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-transform active:scale-95"
          >
            <X className="size-5" strokeWidth={2.6} />
          </button>
          <span className="flex items-center gap-1 rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" />
            Live
          </span>
          <span className="flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white backdrop-blur-sm">
            <Eye className="size-3" strokeWidth={2.4} />
            {compactCount(viewers)}
          </span>
          {/*
            Reporting a broadcast (#4). Under the close button rather than in
            the chrome at the bottom, because the bottom is where the two
            things you came to do live and this is the thing you do when
            something has gone wrong.

            It is an icon and not a labelled button on purpose: a broadcast is
            watched full-screen and every pixel of chrome is over somebody's
            face, so this earns the same footprint as Close and no more. The
            label is on the dialog it opens.
          */}
          <button
            type="button"
            onClick={() => setReporting(true)}
            aria-label={
              reported ? "You reported this broadcast" : "Report this broadcast"
            }
            className={`grid size-9 place-items-center rounded-full bg-black/45 backdrop-blur-sm transition-transform active:scale-95 ${
              reported ? "text-red-400" : "text-white/70"
            }`}
          >
            <Flag className="size-[18px]" strokeWidth={2.4} />
          </button>
        </div>
      </header>

      <div className="relative z-10 flex-1" />

      {/* ---- Bottom: the title, the room, and the two things you can do ---- */}
      <div className="relative z-10 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p className="text-[15px] font-bold leading-tight text-white drop-shadow">
          {stream.title}
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-white/55">
          Started {timeAgo(stream.startedMsAgo).toLowerCase()}
        </p>

        {/* The room scrolls on its own and is capped short: a live chat that
            takes half the screen covers the thing you came to watch. */}
        <div className="no-scrollbar mt-2 max-h-[34vh] space-y-1.5 overflow-y-auto">
          {chat.map((m) => (
            <p key={m.id} className="text-[12px] leading-snug text-white/85">
              <span
                className={`font-bold ${m.own ? "text-brand-strong" : "text-white"}`}
              >
                {m.name}
              </span>{" "}
              {m.text}
            </p>
          ))}
          <span ref={chatEnd} />
        </div>

        <form onSubmit={send} className="mt-2.5 flex items-center gap-2">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-white/10 px-4 backdrop-blur-sm focus-within:bg-white/15">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Say something…"
              maxLength={200}
              aria-label="Send a message"
              className="w-full bg-transparent text-[14px] font-medium text-white outline-none placeholder:text-white/45"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={!draft.trim()}
              className="shrink-0 text-white transition-opacity disabled:opacity-35"
            >
              <Send className="size-[18px]" strokeWidth={2.2} />
            </button>
          </label>

          <div className="relative shrink-0">
            {/* Hearts rise out of the button and are dropped on a timer, so a
                long session never accumulates dead nodes. */}
            {hearts.map((h) => (
              <span
                key={h.key}
                aria-hidden="true"
                className="pointer-events-none absolute bottom-full left-1/2 text-brand"
                style={{
                  animation: `live-heart ${HEART_MS}ms ease-out forwards`,
                  ["--heart-x"]: `${h.offset}px`,
                }}
              >
                <Heart className="size-5 fill-current" strokeWidth={0} />
              </span>
            ))}
            <button
              type="button"
              onClick={react}
              aria-label="Send a heart"
              className="grid size-11 place-items-center rounded-full bg-white/10 text-brand backdrop-blur-sm transition-transform active:scale-90"
            >
              <Heart className="size-5 fill-current" strokeWidth={0} />
            </button>
          </div>
        </form>
      </div>

      {/* Inside the player's own positioned box, so the dialog's mobile
          `absolute inset-0` lands over the broadcast rather than over the
          document. */}
      <ReportDialog
        open={reporting}
        targetType="stream"
        targetId={stream.id}
        targetLabel={`${stream.host} — ${stream.title}`}
        onClose={() => setReporting(false)}
      />
    </div>
  );
}
