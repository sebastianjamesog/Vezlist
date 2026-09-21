"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ImageIcon, Palette, Send, Trash2, Type, X } from "lucide-react";
import { useDialogFocus } from "../../lib/useDialogFocus";
import { useToast } from "../../context/ToastContext";
import { useStatus } from "../../context/StatusContext";
import {
  describeSize,
  downscaleToDataUri,
  validatePhotoFile,
} from "../../lib/media";
import {
  DEFAULT_STORY_BACKGROUND,
  STORY_BACKGROUNDS,
  backgroundCss,
} from "../../lib/storyBackgrounds";
import {
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_POSITION,
  STORY_TEXT_COLORS,
  clampTextPosition,
} from "../../lib/storyText";

/**
 * The story composer.
 *
 * ── Shape: the canvas is the app ──────────────────────────────────────────
 *
 * This is deliberately built the way Instagram, WhatsApp and Snapchat all
 * build the same screen, because they have converged on it and the
 * convergence is not an accident: the story fills the screen edge to edge,
 * every control floats on top of it, and there is no form. Two earlier passes
 * at this file did have a form — a small preview above a stack of labelled
 * fields — and both were worse for the same reason. You cannot judge where a
 * word will land by looking at a thumbnail of where it will land, and a
 * labelled field for "Text on the story" is a longer way of saying what a
 * caret blinking on the story already says.
 *
 * ── One tool at a time ────────────────────────────────────────────────────
 *
 * `tool` is the whole interaction model: nothing, `"text"`, or
 * `"background"`. Only one strip of controls is ever on screen, which is what
 * keeps the picture visible while you work on it. Tapping the canvas with no
 * tool open starts typing, the way it does everywhere else — the toolbar
 * button is the discoverable path, the tap is the fast one.
 *
 * ── What is not here ──────────────────────────────────────────────────────
 *
 * No separate caption field. The words on the story are the story; a second
 * box asking for a line to print underneath it is a form growing back. Older
 * updates in `mock.js` still carry a `caption` and the player still draws it,
 * so nothing has been taken away from what already exists — this composer
 * simply does not add more of it.
 *
 * Position and colour live in `lib/storyText.js`, backgrounds in
 * `lib/storyBackgrounds.js`, and the photo goes through `lib/media.js` — the
 * same validate-then-downscale path `StepPhotos` uses, which is what strips
 * the GPS tag off a phone photo before it is stored. That matters at least as
 * much here as on an ad: a story is posted from wherever you are standing.
 */

const MAX_TEXT = 120;

export default function StoryComposer({ onClose }) {
  const toast = useToast();
  const { postStory } = useStatus();
  // Always open: the shell mounts this only while it is showing (see
  // `AppLayout`), which is also what guarantees a fresh draft each time.
  const ref = useDialogFocus(true, onClose);
  const fileInput = useRef(null);
  const canvas = useRef(null);
  const textarea = useRef(null);

  const [image, setImage] = useState(null);
  const [background, setBackground] = useState(DEFAULT_STORY_BACKGROUND);
  const [text, setText] = useState("");
  const [color, setColor] = useState(DEFAULT_TEXT_COLOR);
  const [position, setPosition] = useState(DEFAULT_TEXT_POSITION);
  const [tool, setTool] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [moved, setMoved] = useState(false);

  const swatch =
    STORY_TEXT_COLORS.find((c) => c.id === color) ?? STORY_TEXT_COLORS[0];
  const editing = tool === "text";
  const empty = !image && !text.trim();

  // Opening the text tool should put the caret in the words, not leave you to
  // find them. Focus has to wait for the textarea to exist, which is why this
  // is an effect and not part of the click that set the tool.
  useEffect(() => {
    if (editing) textarea.current?.focus();
  }, [editing]);

  async function pick(event) {
    const file = event.target.files?.[0];
    // Always clear the input: picking the same file twice in a row is a no-op
    // otherwise, because `value` has not changed.
    event.target.value = "";
    if (!file) return;

    const problem = validatePhotoFile(file);
    if (problem) {
      toast(problem);
      return;
    }

    setBusy(true);
    try {
      setImage(await downscaleToDataUri(file));
    } catch {
      toast(`Couldn't read that photo (${describeSize(file.size)})`);
    } finally {
      setBusy(false);
    }
  }

  /** Turn a pointer position into a percentage of the canvas. */
  function moveTo(event) {
    const box = canvas.current?.getBoundingClientRect();
    if (!box) return;
    setPosition(
      clampTextPosition(
        ((event.clientX - box.left) / box.width) * 100,
        ((event.clientY - box.top) / box.height) * 100,
      ),
    );
  }

  function startDrag(event) {
    // Pointer capture keeps the drag alive once the finger leaves the words
    // and travels over the picture — without it the first quick drag ends the
    // moment the pointer crosses the element's own edge.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    setMoved(true);
    moveTo(event);
  }

  /** Arrow keys nudge; Shift makes the step a jump. */
  function nudge(event) {
    const step = event.shiftKey ? 10 : 2;
    const by = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    }[event.key];
    if (!by) return;
    event.preventDefault();
    setMoved(true);
    setPosition((p) => clampTextPosition(p.x + by[0], p.y + by[1]));
  }

  function share() {
    if (empty) {
      toast("Add a photo or some words first");
      return;
    }

    postStory({
      // Unique within this device's own story, which is the only place it is
      // ever looked up. `Date.now()` is read in a handler, never during a
      // render — a rendered timestamp is a hydration mismatch.
      id: `me-${Date.now()}`,
      image,
      background: image ? null : background,
      text: text.trim(),
      color,
      x: position.x,
      y: position.y,
      caption: "",
      postedAt: Date.now(),
    });

    onClose();
    toast("Added to your story — it clears after 24 hours");
  }

  /** A floating round control. Every button in the chrome is one of these. */
  const chip =
    "grid size-10 shrink-0 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md transition-transform active:scale-90";

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-[1000] bg-black lg:fixed lg:grid lg:place-items-center lg:bg-black/70 lg:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New story"
        tabIndex={-1}
        className="relative size-full overflow-hidden outline-none lg:aspect-[9/16] lg:h-[min(860px,94vh)] lg:w-auto lg:rounded-3xl lg:shadow-2xl"
      >
        {/* ---- The story itself, edge to edge -------------------------- */}
        <div
          ref={canvas}
          onPointerMove={(e) => dragging && moveTo(e)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          // Tapping bare canvas starts typing, the way it does in every other
          // story editor. It is the fast path; the Aa button is the one you
          // can find without being told.
          onClick={(e) => {
            if (e.target === e.currentTarget && !editing) setTool("text");
          }}
          style={
            image ? undefined : { backgroundImage: backgroundCss(background) }
          }
          className="absolute inset-0 bg-cover bg-center"
        >
          {image && (
            // A plain <img>: this is a data URI the browser already holds in
            // memory, so there is nothing for next/image to optimise and no
            // remote host to allow-list.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
          )}

          {/* While typing, the words are a transparent textarea sitting where
              they will end up, so what you type is literally what you get. */}
          {editing ? (
            <textarea
              ref={textarea}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
              onBlur={() => setTool(null)}
              rows={2}
              placeholder="Type something"
              aria-label="Text on the story"
              style={{ color: swatch.css, textShadow: swatch.shadow }}
              className="absolute inset-x-6 top-1/2 -translate-y-1/2 resize-none bg-transparent text-center text-[30px] font-extrabold leading-tight outline-none placeholder:text-white/50"
            />
          ) : (
            text.trim() && (
              <button
                type="button"
                onPointerDown={startDrag}
                onPointerUp={() => setDragging(false)}
                onKeyDown={nudge}
                onDoubleClick={() => setTool("text")}
                aria-label={`Text: ${text}. At ${Math.round(position.x)}% across and ${Math.round(position.y)}% down. Drag or use the arrow keys to move it; double-click to edit.`}
                style={{
                  left: `${position.x}%`,
                  top: `${position.y}%`,
                  color: swatch.css,
                  // The shadow travels with the colour: a dark glow under
                  // black letters does nothing, which is exactly when
                  // legibility matters most.
                  textShadow: swatch.shadow,
                }}
                className={`absolute z-10 max-w-[84%] -translate-x-1/2 -translate-y-1/2 touch-none whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-center text-[30px] font-extrabold leading-tight outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  dragging
                    ? "cursor-grabbing ring-2 ring-white/60"
                    : "cursor-grab"
                }`}
              >
                {text}
              </button>
            )
          )}

          {/* One hint, until the words have been moved once. A hint that
              outlives its lesson is clutter printed on the picture. */}
          {!editing && text.trim() && !moved && (
            <span className="pointer-events-none absolute inset-x-0 bottom-28 flex justify-center">
              <span className="rounded-full bg-black/55 px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur-md">
                Drag the text anywhere
              </span>
            </span>
          )}

          {!editing && empty && (
            <p className="pointer-events-none absolute inset-x-10 top-1/2 -translate-y-1/2 text-center text-[15px] font-semibold text-white/70">
              Tap to type, or add a photo
            </p>
          )}
        </div>

        {/* ---- Top chrome ---------------------------------------------- */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            onClick={editing ? () => setTool(null) : onClose}
            aria-label={editing ? "Done editing text" : "Close"}
            className={chip}
          >
            {editing ? (
              <Check className="size-5" strokeWidth={2.6} />
            ) : (
              <X className="size-5" strokeWidth={2.4} />
            )}
          </button>

          {/* The tools hide while typing: the keyboard is up, the colour
              strip is the only choice that matters, and a row of icons over
              a half-typed sentence is noise. */}
          {!editing && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTool("text")}
                aria-label="Add text"
                className={chip}
              >
                <Type className="size-5" strokeWidth={2.6} />
              </button>

              {!image && (
                <button
                  onClick={() =>
                    setTool((t) => (t === "background" ? null : "background"))
                  }
                  aria-label="Background colour"
                  aria-pressed={tool === "background"}
                  className={`${chip} ${tool === "background" ? "ring-2 ring-white" : ""}`}
                >
                  <Palette className="size-5" strokeWidth={2.4} />
                </button>
              )}

              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                onChange={pick}
                className="hidden"
              />
              <button
                onClick={() => fileInput.current?.click()}
                disabled={busy}
                aria-label={image ? "Replace photo" : "Add a photo"}
                className={`${chip} disabled:opacity-50`}
              >
                <ImageIcon className="size-5" strokeWidth={2.4} />
              </button>

              {image && (
                <button
                  onClick={() => setImage(null)}
                  aria-label="Remove photo"
                  className={chip}
                >
                  <Trash2 className="size-[18px]" strokeWidth={2.4} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ---- Colour strip, while typing ------------------------------ */}
        {editing && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {STORY_TEXT_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                // The textarea must not lose focus — and therefore must not
                // close the tool — when a colour is tapped.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setColor(c.id)}
                aria-label={`${c.label} text`}
                aria-pressed={c.id === color}
                style={{ backgroundColor: c.css }}
                className={`size-8 shrink-0 rounded-full border-2 border-white/70 transition-transform active:scale-90 ${
                  c.id === color ? "scale-125 ring-2 ring-white" : ""
                }`}
              />
            ))}
          </div>
        )}

        {/* ---- Background strip ---------------------------------------- */}
        {tool === "background" && !editing && (
          <div className="absolute inset-x-0 bottom-24 flex items-center justify-center gap-3 px-4">
            {STORY_BACKGROUNDS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBackground(b.id)}
                aria-label={`${b.label} background`}
                aria-pressed={b.id === background}
                style={{ backgroundImage: b.css }}
                className={`size-9 shrink-0 rounded-full border-2 border-white/70 bg-cover transition-transform active:scale-90 ${
                  b.id === background ? "scale-125 ring-2 ring-white" : ""
                }`}
              />
            ))}
          </div>
        )}

        {/* ---- Share ---------------------------------------------------- */}
        {!editing && (
          <div className="absolute inset-x-0 bottom-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              onClick={share}
              disabled={busy || empty}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-[16px] font-extrabold text-ink shadow-lift transition-transform active:scale-[0.98] disabled:opacity-45"
            >
              <Send className="size-[18px]" strokeWidth={2.6} />
              {busy ? "Reading photo…" : "Share to your story"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
