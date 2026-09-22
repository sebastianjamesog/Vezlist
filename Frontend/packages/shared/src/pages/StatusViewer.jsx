"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Navigate, useNavigate } from "../lib/nav";
import { useParams } from "next/navigation";
import { ChevronLeft, RotateCcw, Trash2, X } from "lucide-react";
import { useStatus } from "../context/StatusContext";
import {
  REACTION_EMOJIS,
  findActiveStory,
  groupStatuses,
  statusTime,
} from "../lib/status";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import MediaImage from "../components/media/MediaImage.jsx";
import { backgroundCss } from "../lib/storyBackgrounds";
import { textColorOf, textPositionOf } from "../lib/storyText";

const SLIDE_MS = 5000;

/**
 * A row of reactions under someone else's update, and the honest limit next
 * to it: this device's tap, played back to this device, and nothing more.
 * There is no server, so there is nowhere for it to travel to and no count
 * to show — the same reasoning `lib/listings.js` gives for not building a
 * "contact volume" tile off reader-side reveal counts (#25).
 *
 * Reacting is also as far as a viewer can go here on purpose. Below the row
 * is `ReplyNotice`, not a text field — see there for why.
 */
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
            className={`grid size-10 shrink-0 place-items-center rounded-full text-[18px] transition-transform active:scale-90 ${
              reaction === emoji
                ? "bg-white text-black"
                : "bg-white/15 text-white hover:bg-white/25"
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] leading-snug text-white/55">
        {reaction
          ? `Only you can see this — Vezlist has no way to send it to ${name}.`
          : `Your reaction stays on this device — it never reaches ${name}.`}
      </p>
    </div>
  );
}

/**
 * What sits where a reply box would be, if this were a product with
 * messaging in it.
 *
 * It is not, and none is planned: issue #2 was closed not-planned, and the
 * only two places anybody types at anybody else on Vezlist are the Live
 * stream chat and a Support ticket (see `lib/listings.js`'s contact-reveal
 * section for the same accounting). So this says that plainly instead of a
 * text field that would either silently do nothing or promise a reply that
 * has nowhere to be delivered.
 */
export function ReplyNotice() {
  return (
    <p className="pointer-events-auto mt-3 text-center text-[12px] leading-snug text-white/60">
      Can&rsquo;t reply here — Vezlist has no messaging. Story chat with{" "}
      <Link href="/live" className="underline underline-offset-2">
        Live
      </Link>{" "}
      or a{" "}
      <Link href="/support" className="underline underline-offset-2">
        Support ticket
      </Link>{" "}
      are the only two places anyone types at anyone.
    </p>
  );
}

/**
 * The poster's half of "who watched this" — built honestly, which here means
 * mostly saying what it cannot do.
 *
 * `StatusContext`'s `seen` list is this device's own record of which
 * *other* people's stories it has opened; it was never a roster anyone
 * else can read, and nothing about posting your own story changes that.
 * With no server, no device — including this one, watching its own story
 * play back — can learn who was on the other end of somebody else's screen.
 * A real viewer list needs an account and a backend to record opens against,
 * which is the same reason `revealCount` in `lib/listings.js` has no
 * dashboard tile yet: the honest number is smaller than the useful one, and
 * a screen that rounds the difference off is worse than one that says so.
 */
export function ViewerNote() {
  return (
    <div className="pointer-events-auto mx-auto max-w-[280px] rounded-2xl bg-white/10 px-4 py-3 text-center backdrop-blur">
      <p className="text-[13px] font-bold text-white">Viewers</p>
      <p className="mt-1 text-[12px] leading-snug text-white/70">
        Vezlist can&rsquo;t show who&rsquo;s seen this yet — that needs an
        account and a server to record it. This device only ever knows what it
        has watched and reacted to itself, never who is watching on the other
        end.
      </p>
    </div>
  );
}

/** Full-screen status player: segmented progress, tap to move, auto-advance. */
export default function StatusViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    seen,
    ready,
    markSeen,
    react,
    reactionFor: reactionForId,
    // The merged list, not the raw seed: a story this device posted has to be
    // rollable in the player it was posted for.
    stories,
    myStoryReady,
    // Only this device's own posts are deletable — see `deletable` below.
    myUpdates,
    removeStory,
  } = useStatus();
  // An expired story and one that never existed are the same answer here —
  // see `findActiveStory` in `lib/status.js`. Nothing in this file reads
  // `Date.now()`: whether a story is still active is a pure function of the
  // fixed `msAgo` it already carries, so this resolves the same way on the
  // server and on the client that hydrates it.
  const story = findActiveStory(stories, id);
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  // The delete confirmation, which freezes the slide the same way a press
  // does: a story that advances underneath an open dialog would leave the
  // dialog asking about an update the reader is no longer looking at.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const paused = held || confirmDelete;

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
  const close = useCallback(() => {
    if (story) markSeen(story.id);
    // Advancing between stories replaces, so one step back is the opener. A
    // deep link has no opener — Next has no per-entry history key, so the
    // stack depth is the tell — and falls back to the board.
    if (window.history.length > 1) navigate(-1);
    // The /status list page it used to fall back to has been removed; the
    // rail on the board is where the stories live now.
    else navigate("/", { replace: true });
  }, [story, markSeen, navigate]);

  /**
   * Past the last update, roll into the next story the way Instagram does.
   * Memoized (and fed to the auto-advance effect below as a dependency)
   * rather than left a plain function: a plain function is a new identity
   * every render, and adding *that* to the timer effect's deps would restart
   * the 5s countdown on every unrelated re-render of this component instead
   * of only when the story actually changes underneath it.
   */
  const nextStory = useCallback(() => {
    if (story) markSeen(story.id);
    if (nextId) navigate(`/status/${nextId}`, { replace: true });
    else close();
  }, [story, nextId, markSeen, navigate, close]);

  function prevStory() {
    if (prevId) navigate(`/status/${prevId}`, { replace: true });
  }

  useEffect(() => {
    // Press-and-hold freezes the slide, the way every status player does.
    if (!total || paused) return;
    const timer = setTimeout(() => {
      if (slide + 1 < total) setIndex(slide + 1);
      else nextStory();
    }, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [slide, total, paused, nextStory]);

  useEffect(() => {
    const onKey = (e) => {
      // While the dialog is up it owns the keyboard: Escape dismisses it (its
      // own handler does that) and the arrows must not walk the story along
      // behind it.
      if (confirmDelete) return;
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

  // A story id that no longer resolves lands on the board, which is where the
  // rail is — the list page it used to fall back to has been removed.
  //
  // The `myStoryReady` check in front of it is not a nicety. Updates posted
  // on this device live in localStorage, which `usePersistedObject` only
  // reads one tick after hydration — so on a cold load of /status/me the own
  // story is legitimately empty for one render. Redirecting on that render
  // sent a poster who had just posted straight back to the board, and the
  // story looked like it had never saved. Only the *redirect* waits; a story
  // that already has updates still renders on the first pass.
  if (!story || !total) {
    if (!myStoryReady) return <div className="min-h-dvh bg-black" />;
    return <Navigate to="/" replace />;
  }

  const update = story.updates[slide];

  /**
   * Whether this update can be taken down from here.
   *
   * `story.own` alone would be the wrong question. `removeStory` writes to
   * the localStorage delta and nothing else, so it can only remove what this
   * device put there — and the own story is a merge of that delta with
   * whatever `mock.js` seeds into it. The seed is empty today, which makes
   * the two answers identical today; asking `myUpdates` instead means a bin
   * never appears over a fixture on the day somebody seeds one, rather than
   * appearing and silently doing nothing.
   */
  const deletable = story.own && myUpdates.some((u) => u.id === update.id);

  function confirmRemove() {
    removeStory(update.id);
    setConfirmDelete(false);
    // No navigation here on purpose. Removing the last update leaves the
    // story with none, and the guard above — which already handles a story
    // that has aged out mid-view — takes it from there. Removing any other
    // one leaves `index` past the end for a render, which `slide` clamps.
  }

  return (
    <div className="flex min-h-dvh justify-center bg-black">
      <div className="relative flex w-full max-w-[430px] flex-col lg:max-w-[520px]">
        {/* A story is a photo, words on a colour, or words over a photo —
            the composer allows all three, so the player has to draw all
            three. An update with no `image` is not a broken one; it is a
            text story, and it gets the gradient it was composed on rather
            than a black hole where a picture failed to load. */}
        {update.image ? (
          <MediaImage
            key={update.id}
            fill
            preload
            src={update.image}
            alt={update.caption || `${story.name}'s story`}
            sizes="(min-width: 1024px) 520px, 100vw"
            className="object-cover"
          />
        ) : (
          <div
            key={update.id}
            aria-hidden="true"
            className="absolute inset-0"
            style={{ backgroundImage: backgroundCss(update.background) }}
          />
        )}

        {/* The words that are part of the picture, as opposed to the caption
            below. Drawn at the percentage the composer stored, so a story
            whose text was dragged into a corner opens with it in that
            corner — see `lib/storyText.js` for why the position is a
            percentage and not a pixel offset.

            `pointer-events-none` so it never steals the tap that advances
            the story: text is most of the middle of a text story, and the
            middle is the zone that moves you forward. */}
        {update.text && (
          <p
            style={{
              left: `${textPositionOf(update).x}%`,
              top: `${textPositionOf(update).y}%`,
              color: textColorOf(update).css,
              textShadow: textColorOf(update).shadow,
            }}
            className="pointer-events-none absolute z-[1] max-w-[86%] -translate-x-1/2 -translate-y-1/2 text-balance px-2 text-center text-[26px] font-extrabold leading-tight"
          >
            {update.text}
          </p>
        )}
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
                            animationPlayState: paused ? "paused" : "running",
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

            <MediaImage
              src={story.avatar}
              alt=""
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-full object-cover ring-2 ring-white/60"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold text-white">
                {story.name}
              </span>
              <span className="block text-[12px] text-white/70">
                {/* `mine` carries no `msAgo` — there is nothing to have
                    aged. See `ViewerNote` below for the rest of what an
                    account with no server behind it cannot say about its
                    own story. */}
                {story.own ? "Your story" : statusTime(story.msAgo)} ·{" "}
                {slide + 1} of {total}
              </span>
            </span>

            {deletable && (
              <button
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete this update"
                title="Delete"
                className="pointer-events-auto grid size-9 shrink-0 place-items-center rounded-full text-white transition-colors hover:bg-white/15"
              >
                <Trash2 className="size-[18px]" strokeWidth={2.2} />
              </button>
            )}

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
              aria-label="Close story"
              className="pointer-events-auto hidden size-9 shrink-0 place-items-center rounded-full text-white transition-colors hover:bg-white/15 lg:grid"
            >
              <X className="size-5" strokeWidth={2.4} />
            </button>
          </div>
        </header>

        {/* `pointer-events-none` on the footer itself, the same trick the
            header above uses: a tap on the caption or the empty space
            between the reaction row and the reply notice still falls
            through to the prev/next zones behind it, and only the buttons
            and links inside — each opted back in with `pointer-events-auto`
            — catch their own taps. */}
        <footer className="pointer-events-none relative mt-auto px-6 pb-10">
          {update.caption && (
            <p className="mb-4 text-center text-[15px] font-medium leading-relaxed text-white">
              {update.caption}
            </p>
          )}

          {/* A poster's own story gets the honest viewer note; anyone
              else's gets the reaction row and, where a reply box would
              normally sit, the notice that there is nowhere for one to go.
              Never both — reacting to your own update is not a real
              action, and a viewer never sees the "who watched this" panel
              because they are not the one who could ask it. */}
          {story.own ? (
            <ViewerNote />
          ) : (
            <>
              <ReactionBar
                name={story.name}
                reaction={reactionForId(story.id, update.id)}
                onReact={(emoji) => react(story.id, update.id, emoji)}
              />
              <ReplyNotice />
            </>
          )}
        </footer>

        {/* Outside the header and footer, which are both
            `pointer-events-none` shells — a dialog inside either would open
            with its own buttons unclickable. */}
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this update?"
          body="It comes off your story on this device straight away. There is no undo, and nothing else to take it off — with no server behind the story, this device's copy is the only copy."
          confirmLabel="Delete"
          destructive
          onConfirm={confirmRemove}
          onClose={() => setConfirmDelete(false)}
        />
      </div>
    </div>
  );
}
