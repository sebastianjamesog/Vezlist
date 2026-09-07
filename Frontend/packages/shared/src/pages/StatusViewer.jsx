"use client";

import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "../lib/nav";
import { useParams } from "next/navigation";
import { ChevronLeft, RotateCcw, X } from "lucide-react";
import { useStatus } from "../context/StatusContext";
import { groupStatuses, statusTime } from "../lib/status";
import { stories } from "../data/mock";

const SLIDE_MS = 5000;

/** Full-screen status player: segmented progress, tap to move, auto-advance. */
export default function StatusViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { seen, ready, markSeen } = useStatus();
  const story = stories.find((s) => s.id === id);
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);

  // The queue is frozen the first time the seen-list is readable: watching one
  // marks it seen, and re-deriving from `seen` mid-session would reshuffle the
  // rest under you. It waits for `ready` because localStorage only lands a tick
  // after hydration, and a queue built before then ignores what you've watched.
  const [queue, setQueue] = useState([]);
  if (ready && !queue.length) {
    const { mine, recent, viewed } = groupStatuses(stories, seen);
    const all = mine?.updates.length
      ? [mine, ...recent, ...viewed]
      : [...recent, ...viewed];
    setQueue(all.map((s) => s.id));
  }

  const total = story?.updates.length ?? 0;
  const at = queue.indexOf(id);
  const nextId = at >= 0 ? (queue[at + 1] ?? null) : null;
  const prevId = at > 0 ? queue[at - 1] : null;

  // Rolling into the next story restarts at its first update. Adjusting during
  // render rather than in an effect: an effect would paint one frame of the new
  // story at the old index first.
  const [playing, setPlaying] = useState(id);
  if (id !== playing) {
    setPlaying(id);
    setIndex(0);
  }
  const slide = Math.min(index, Math.max(total - 1, 0));

  /** Leave the player for wherever it was opened from. */
  function close() {
    if (story) markSeen(story.id);
    // Advancing between stories replaces, so one step back is the opener. A
    // deep link has no opener — Next has no per-entry history key, so the
    // stack depth is the tell — and falls back to the list.
    if (window.history.length > 1) navigate(-1);
    else navigate("/status", { replace: true });
  }

  /** Past the last update, roll into the next story the way Instagram does. */
  function nextStory() {
    if (story) markSeen(story.id);
    if (nextId) navigate(`/status/${nextId}`, { replace: true });
    else close();
  }

  function prevStory() {
    if (prevId) navigate(`/status/${prevId}`, { replace: true });
  }

  useEffect(() => {
    // Press-and-hold freezes the slide, the way every status player does.
    if (!total || held) return;
    const timer = setTimeout(() => {
      if (slide + 1 < total) setIndex(slide + 1);
      else nextStory();
    }, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [slide, total, held, id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") forward();
      if (e.key === "ArrowLeft") back();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // Declared before the early return so the key handler above can reach them.
  function back() {
    if (slide > 0) setIndex(slide - 1);
    else if (prevId) prevStory();
  }

  function forward() {
    if (slide + 1 < total) setIndex(slide + 1);
    else nextStory();
  }

  if (!story || !total) return <Navigate to="/status" replace />;

  const update = story.updates[slide];

  return (
    <div className="flex min-h-dvh justify-center bg-black">
      <div className="relative flex w-full max-w-[430px] flex-col lg:max-w-[520px]">
        <img
          key={update.id}
          src={update.image}
          alt={update.caption || `${story.name}'s status`}
          className="absolute inset-0 size-full object-cover"
        />
        <span className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 to-transparent" />
        <span className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 to-transparent" />

        {/* Tap zones sit under the chrome but over the photo. */}
        <button
          onClick={back}
          onPointerDown={() => setHeld(true)}
          onPointerUp={() => setHeld(false)}
          onPointerLeave={() => setHeld(false)}
          aria-label="Previous update"
          className="absolute inset-y-0 left-0 w-1/3 cursor-default"
        />
        <button
          onClick={forward}
          onPointerDown={() => setHeld(true)}
          onPointerUp={() => setHeld(false)}
          onPointerLeave={() => setHeld(false)}
          aria-label="Next update"
          className="absolute inset-y-0 right-0 w-2/3 cursor-default"
        />

        <header className="pointer-events-none relative px-3 pt-3">
          <div className="flex gap-1">
            {story.updates.map((u, i) => (
              <span
                key={u.id}
                className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35"
              >
                <span
                  className="block h-full rounded-full bg-white"
                  style={
                    i < slide
                      ? { width: "100%" }
                      : i === slide
                        ? {
                            animation: `status-fill ${SLIDE_MS}ms linear forwards`,
                            animationPlayState: held ? "paused" : "running",
                          }
                        : { width: "0%" }
                  }
                />
              </span>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={close}
              aria-label="Close"
              className="pointer-events-auto -ml-1 grid size-9 shrink-0 place-items-center rounded-full text-white transition-colors hover:bg-white/15 lg:hidden"
            >
              <ChevronLeft className="size-6" strokeWidth={2.4} />
            </button>

            <img
              src={story.avatar}
              alt=""
              className="size-10 shrink-0 rounded-full object-cover ring-2 ring-white/60"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold text-white">
                {story.name}
              </span>
              <span className="block text-[12px] text-white/70">
                {statusTime(story.msAgo)} · {slide + 1} of {total}
              </span>
            </span>

            <button
              onClick={() => setIndex(0)}
              aria-label="Replay from the first update"
              title="Replay"
              className="pointer-events-auto grid size-9 shrink-0 place-items-center rounded-full text-white transition-colors hover:bg-white/15"
            >
              <RotateCcw className="size-[18px]" strokeWidth={2.2} />
            </button>

            <button
              onClick={close}
              aria-label="Close status"
              className="pointer-events-auto hidden size-9 shrink-0 place-items-center rounded-full text-white transition-colors hover:bg-white/15 lg:grid"
            >
              <X className="size-5" strokeWidth={2.4} />
            </button>
          </div>
        </header>

        {update.caption && (
          <footer className="relative mt-auto px-6 pb-10">
            <p className="text-center text-[15px] font-medium leading-relaxed text-white">
              {update.caption}
            </p>
          </footer>
        )}
      </div>
    </div>
  );
}
