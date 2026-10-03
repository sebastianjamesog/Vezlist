"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "../lib/nav";
import { useParams } from "next/navigation";
import {
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useStatus } from "../context/StatusContext";
import {
  REACTION_EMOJIS,
  findActiveStory,
  groupStatuses,
  statusTime,
} from "../lib/status";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import MediaImage from "../components/media/MediaImage.jsx";

const SLIDE_MS = 5000;

export function ReactionBar({ name, reaction, onReact }) {
  return (
    <div className="pointer-events-auto">
      <div className="flex items-center justify-center gap-2">
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(emoji)}
            aria-pressed={reaction === emoji}
            aria-label={`React with ${emoji}`}
            className={`grid size-10 shrink-0 place-items-center rounded-full text-lg ${reaction === emoji ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25"}`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] leading-snug text-white/70">
        Your reaction stays on this device. It is not sent to {name}.
      </p>
    </div>
  );
}

export function ReplyNotice() {
  return (
    <p className="mt-3 text-center text-xs text-white/70">
      Replies to stories are not available yet.
    </p>
  );
}

export function ViewerNote() {
  return (
    <div className="mx-auto max-w-[280px] rounded-2xl bg-white/10 px-4 py-3 text-center backdrop-blur">
      <p className="text-sm font-bold text-white">Viewers</p>
      <p className="mt-1 text-xs text-white/70">
        Story viewer analytics are not available yet.
      </p>
    </div>
  );
}

export default function StatusViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    seen,
    ready,
    markSeen,
    react,
    reactionFor,
    stories,
    myStoryReady,
    myUpdates,
    canManage,
    removeStory,
    error,
    refreshStories,
    loadCreatorStories,
  } = useStatus();
  const story =
    findActiveStory(stories, id) ||
    stories.find((item) => item.own && item.ownerId === id);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(id);
  const [queue, setQueue] = useState(null);
  const [held, setHeld] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [muted, setMuted] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [lookup, setLookup] = useState({ id: null, error: "" });
  const [retry, setRetry] = useState(0);
  const [progress, setProgress] = useState(0);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [replay, setReplay] = useState(0);
  const video = useRef(null);
  const total = story?.updates.length || 0;
  const storyId = story?.id;
  const slide = Math.min(index, Math.max(total - 1, 0));
  const update = story?.updates[slide];
  const updateKey = `${id}:${update?.id}:${replay}`;
  const [currentMedia, setCurrentMedia] = useState(updateKey);
  const isVideo = update?.mediaType === "VIDEO" || Boolean(update?.video);
  const paused =
    held ||
    manualPaused ||
    hidden ||
    confirmDelete ||
    deleting ||
    !mediaReady ||
    Boolean(mediaError);

  // Freeze creator ordering while viewing, so marking a creator seen cannot reorder it.
  if (ready && queue === null && stories.length) {
    const { mine, recent, viewed } = groupStatuses(stories, seen);
    setQueue(
      [...(mine?.updates.length ? [mine] : []), ...recent, ...viewed].map(
        (item) => item.id,
      ),
    );
  }
  if (playing !== id) {
    setPlaying(id);
    setIndex(0);
    setConfirmDelete(false);
    setDeleteError("");
  }
  if (currentMedia !== updateKey) {
    setCurrentMedia(updateKey);
    setProgress(0);
    setMediaReady(false);
    setMediaError("");
    setManualPaused(false);
    setHeld(false);
  }
  const position = queue?.indexOf(storyId ?? id) ?? -1;
  const nextId = position >= 0 ? queue[position + 1] : null;
  const previousId = position > 0 ? queue[position - 1] : null;

  useEffect(() => {
    if (id === "me") return;
    let active = true;
    const load = () =>
      loadCreatorStories(id)
        .then(() => {
          if (active) setLookup({ id, error: "" });
        })
        .catch((err) => {
          if (active)
            setLookup({
              id,
              error: err.message || "Could not load this story.",
            });
        });
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [id, retry, loadCreatorStories]);

  useEffect(() => {
    const changed = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);

  const close = useCallback(() => {
    if (storyId) markSeen(storyId);
    if (window.history.length > 1) navigate(-1);
    else navigate("/", { replace: true });
  }, [storyId, markSeen, navigate]);

  const forward = useCallback(() => {
    if (slide + 1 < total) {
      setIndex(slide + 1);
      return;
    }
    if (storyId) markSeen(storyId);
    if (nextId) navigate(`/status/${nextId}`, { replace: true });
    else close();
  }, [slide, total, storyId, markSeen, nextId, navigate, close]);

  const back = useCallback(() => {
    if (slide > 0) setIndex(slide - 1);
    else if (previousId) navigate(`/status/${previousId}`, { replace: true });
  }, [slide, previousId, navigate]);

  useEffect(() => {
    if (!total || isVideo || paused) return;
    const timer = setInterval(
      () => setProgress((value) => Math.min(1, value + 50 / SLIDE_MS)),
      50,
    );
    return () => clearInterval(timer);
  }, [total, isVideo, paused]);

  useEffect(() => {
    if (isVideo || progress < 1 || paused) return;
    const timer = setTimeout(forward, 0);
    return () => clearTimeout(timer);
  }, [isVideo, progress, paused, forward]);

  useEffect(() => {
    if (!isVideo || !video.current) return;
    if (paused) video.current.pause();
    else video.current.play()?.catch(() => setManualPaused(true));
  }, [isVideo, paused, updateKey]);

  useEffect(() => {
    const onKey = (event) => {
      if (
        confirmDelete ||
        deleting ||
        event.target.closest?.("button, input, textarea")
      )
        return;
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") forward();
      if (event.key === "ArrowLeft") back();
      if (event.key === " ") {
        event.preventDefault();
        setManualPaused((value) => !value);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmDelete, deleting, close, forward, back]);

  async function retryLoad() {
    if (id === "me") await refreshStories().catch(() => {});
    else {
      setLookup({ id: null, error: "" });
      setRetry((value) => value + 1);
    }
  }

  async function confirmRemove() {
    if (deleting || !update) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await removeStory(update.id);
      setConfirmDelete(false);
    } catch (err) {
      setDeleteError(
        err.message || "Could not delete your story. Please try again.",
      );
    } finally {
      setDeleting(false);
    }
  }

  if (!story || !total) {
    const loading = id === "me" ? !myStoryReady : lookup.id !== id;
    const loadError = id === "me" ? error : lookup.error;
    return (
      <div className="flex min-h-dvh items-center justify-center bg-black p-6 text-center text-white">
        <div className="max-w-sm">
          {loading ? (
            <p role="status" className="flex items-center justify-center gap-2">
              <LoaderCircle className="size-5 animate-spin" />
              Loading stories…
            </p>
          ) : loadError ? (
            <>
              <p role="alert">
                {typeof loadError === "string"
                  ? loadError
                  : "Could not load stories."}
              </p>
              <button
                onClick={retryLoad}
                className="mt-5 rounded-xl bg-white px-5 py-3 font-semibold text-black"
              >
                Try again
              </button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold">No active stories</h1>
              <p className="mt-3 text-sm text-white/70">
                This creator has no published stories right now. Stories expire
                after 24 hours.
              </p>
            </>
          )}
          <button
            onClick={close}
            className="mx-auto mt-5 block rounded-xl px-5 py-3 text-sm text-white/80"
          >
            Back to browsing
          </button>
        </div>
      </div>
    );
  }

  const deletable =
    canManage && story.own && myUpdates.some((item) => item.id === update.id);
  return (
    <div className="flex min-h-dvh justify-center bg-black">
      <div className="relative flex min-h-dvh w-full max-w-[430px] flex-col overflow-hidden lg:max-w-[520px]">
        {isVideo ? (
          <video
            ref={video}
            key={updateKey}
            src={update.video || update.mediaUrl}
            aria-label={`${story.name}'s video story`}
            playsInline
            muted={muted}
            preload="auto"
            className="absolute inset-0 size-full object-contain"
            onLoadStart={() => setMediaReady(false)}
            onCanPlay={() => setMediaReady(true)}
            onWaiting={() => setMediaReady(false)}
            onTimeUpdate={(event) => {
              const element = event.currentTarget;
              if (Number.isFinite(element.duration) && element.duration > 0)
                setProgress(element.currentTime / element.duration);
            }}
            onEnded={forward}
            onError={() =>
              setMediaError(
                "This video could not be played. Try again or go to the next story.",
              )
            }
          />
        ) : (
          <MediaImage
            key={updateKey}
            fill
            preload
            src={update.image || update.mediaUrl}
            alt={`${story.name}'s story`}
            sizes="(min-width: 1024px) 520px, 100vw"
            className="object-contain"
            onLoad={() => setMediaReady(true)}
            onError={() =>
              setMediaError(
                "This photo could not be loaded. Try again or go to the next story.",
              )
            }
          />
        )}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/80 to-transparent" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-black/85 to-transparent" />
        <button
          onClick={back}
          onPointerDown={() => setHeld(true)}
          onPointerUp={() => setHeld(false)}
          onPointerLeave={() => setHeld(false)}
          onPointerCancel={() => setHeld(false)}
          aria-label="Previous update"
          className="absolute inset-y-0 left-0 w-1/3 cursor-default"
        />
        <button
          onClick={forward}
          onPointerDown={() => setHeld(true)}
          onPointerUp={() => setHeld(false)}
          onPointerLeave={() => setHeld(false)}
          onPointerCancel={() => setHeld(false)}
          aria-label="Next update"
          className="absolute inset-y-0 right-0 w-2/3 cursor-default"
        />
        <header className="pointer-events-none relative px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex gap-1">
            {story.updates.map((item, itemIndex) => (
              <span
                key={item.id}
                className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35"
              >
                <span
                  className="block h-full rounded-full bg-white"
                  style={{
                    width: `${itemIndex < slide ? 100 : itemIndex === slide ? progress * 100 : 0}%`,
                  }}
                />
              </span>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            {story.avatar ? (
              <MediaImage
                src={story.avatar}
                alt=""
                width={36}
                height={36}
                className="size-9 shrink-0 rounded-full object-cover ring-1 ring-white/50"
              />
            ) : (
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">
                {story.name?.slice(0, 1)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-white">
                {story.name}
              </span>
              <span className="block text-[11px] text-white/70">
                {story.own
                  ? "Your story"
                  : statusTime(update.msAgo ?? story.msAgo)}{" "}
                · {slide + 1} of {total}
              </span>
            </span>
            <button
              onClick={() => setManualPaused((value) => !value)}
              aria-label={manualPaused ? "Play story" : "Pause story"}
              className="pointer-events-auto grid size-9 shrink-0 place-items-center rounded-full text-white hover:bg-white/15"
            >
              {manualPaused ? (
                <Play className="size-4" />
              ) : (
                <Pause className="size-4" />
              )}
            </button>
            {isVideo && (
              <button
                onClick={() => setMuted((value) => !value)}
                aria-label={muted ? "Turn sound on" : "Mute video"}
                className="pointer-events-auto grid size-9 shrink-0 place-items-center rounded-full text-white hover:bg-white/15"
              >
                {muted ? (
                  <VolumeX className="size-4" />
                ) : (
                  <Volume2 className="size-4" />
                )}
              </button>
            )}
            {deletable && (
              <button
                onClick={() => {
                  setDeleteError("");
                  setConfirmDelete(true);
                }}
                aria-label="Delete this update"
                className="pointer-events-auto grid size-9 shrink-0 place-items-center rounded-full text-white hover:bg-white/15"
              >
                <Trash2 className="size-4" />
              </button>
            )}
            <button
              onClick={() => {
                setIndex(0);
                setReplay((value) => value + 1);
              }}
              aria-label="Replay from the first update"
              className="pointer-events-auto grid size-9 shrink-0 place-items-center rounded-full text-white hover:bg-white/15"
            >
              <RotateCcw className="size-4" />
            </button>
            <button
              onClick={close}
              aria-label="Close story"
              className="pointer-events-auto grid size-9 shrink-0 place-items-center rounded-full text-white hover:bg-white/15"
            >
              <X className="size-5" />
            </button>
          </div>
        </header>
        {mediaError ? (
          <div className="relative mx-5 my-auto rounded-2xl bg-black/80 p-5 text-center text-white">
            <p role="alert" className="text-sm">
              {mediaError}
            </p>
            <button
              onClick={() => setReplay((value) => value + 1)}
              className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-bold text-black"
            >
              Retry media
            </button>
          </div>
        ) : !mediaReady ? (
          <p
            role="status"
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-white"
          >
            <LoaderCircle className="size-7 animate-spin" />
            <span className="sr-only">Loading story media</span>
          </p>
        ) : null}
        <footer className="pointer-events-none relative mt-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8">
          {story.own ? (
            <ViewerNote />
          ) : (
            <>
              <ReactionBar
                name={story.name}
                reaction={reactionFor(story.id, update.id)}
                onReact={(emoji) => react(story.id, update.id, emoji)}
              />
              <ReplyNotice />
            </>
          )}
        </footer>
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this update?"
          body={
            deleteError ||
            "This will remove your published story for everyone. This cannot be undone."
          }
          confirmLabel={deleting ? "Deleting…" : "Delete"}
          destructive
          onConfirm={confirmRemove}
          onClose={() => {
            if (!deleting) setConfirmDelete(false);
          }}
        />
      </div>
    </div>
  );
}
