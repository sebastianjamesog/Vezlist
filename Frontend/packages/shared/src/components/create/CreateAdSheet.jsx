"use client";

import { useEffect, useRef, useState } from "react";
import { useLocation } from "../../lib/nav";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  DRAFT_KEY,
  EMPTY_DRAFT,
  MAX_IMAGES,
  STEPS,
  isDraftWorthSaving,
  normaliseDraft,
  reorderImages,
  validateStep,
} from "../../lib/adDraft";
import { downscaleToDataUri, validatePhotoFile } from "../../lib/media";
import { usePersistedObject } from "../../lib/persisted";
import StepPhotos from "./StepPhotos";
import StepDetails from "./StepDetails";
import StepContact from "./StepContact";
import StepReview from "./StepReview";
import { useToast } from "../../context/ToastContext";
import { useAccount } from "../../context/AccountContext";

/** Story-style progress: one segment per step, filled behind you, live on you. */
function Stepper({ step, onJump }) {
  return (
    <ol className="flex items-end gap-1.5 px-3 pb-3 pt-1">
      {STEPS.map((s, i) => {
        const done = i < step;
        const here = i === step;
        return (
          <li key={s.id} className="min-w-0 flex-1">
            <button
              onClick={() => done && onJump(i)}
              disabled={!done}
              aria-current={here ? "step" : undefined}
              aria-label={`Step ${i + 1}, ${s.short}${done ? " — done, tap to edit" : ""}`}
              className="block w-full text-left disabled:cursor-default"
            >
              <span
                className={`block h-1 rounded-full transition-colors duration-300 ${
                  done || here ? "bg-brand" : "bg-line"
                }`}
              />
              <span
                className={`mt-1.5 flex items-center gap-1 truncate text-[11px] font-semibold transition-colors ${
                  here ? "text-brand" : done ? "text-ink" : "text-muted"
                }`}
              >
                {done && (
                  <Check className="size-3 shrink-0" strokeWidth={3.5} />
                )}
                {s.short}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Instagram-style creation: one job per screen, a story-segment stepper, and a
 * single primary action. Nothing advances until that step validates.
 */
export default function CreateAdSheet({ open, onClose, onPublish }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [errors, setErrors] = useState({});
  // True while a just-picked photo is being downscaled and stripped of EXIF
  // (see `lib/media.js`) — a `<input disabled>`/`aria-live` state in
  // `StepPhotos`, not a spinner of its own, because the work is normally a
  // couple hundred milliseconds and a modal spinner for that would flicker
  // more than it informs.
  const [addingPhotos, setAddingPhotos] = useState(false);
  // Off by default, and never persisted with the rest of the draft: this is
  // a one-time instruction to `handlePublish` for the ad about to be
  // created, not a field of the ad itself — the code and photo it leads to
  // don't exist until a real listing does, so there is nothing here worth
  // restoring across a reload.
  const [wantVerification, setWantVerification] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const publishLock = useRef(false);
  const idSeq = useRef(0);
  const toast = useToast();
  const { can } = useAccount();
  const { pathname } = useLocation();

  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const dirty = isDraftWorthSaving(draft);

  /* --------------------------------------------------------- persistence */
  /**
   * The draft that used to live only in the `useState` above and vanish on
   * reload. Every image on it is already a stripped-and-downscaled data URI
   * by the time it lands here (`addImages` below), so — unlike
   * `ListingsContext`'s equivalent write — there is no async conversion to
   * do on the way into storage: the draft is simply serialisable as-is.
   */
  const [storedDraft, setStoredDraft, draftLoaded] =
    usePersistedObject(DRAFT_KEY);
  // One-shot, the same pattern `ListingsContext` uses for its own rehydrate:
  // `draftLoaded` is false on the server and on the first client render —
  // there is nothing to read yet — and flips true one tick later with
  // whatever localStorage actually holds. Read exactly once after that, then
  // never again, or a later effect on `storedDraft` would watch its own
  // write below and restore forever.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!draftLoaded || restored) return;
    const found = normaliseDraft(storedDraft);
    if (found && isDraftWorthSaving(found)) setDraft(found);
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftLoaded, restored, storedDraft]);

  // ...and written back on every change afterwards, exactly the way
  // `ListingsContext` persists a published ad — never before `restored`,
  // which is what stops this from overwriting a saved draft with the empty
  // one this component always starts on, one render before the effect above
  // gets to replace it.
  useEffect(() => {
    if (!restored) return;
    setStoredDraft(isDraftWorthSaving(draft) ? draft : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, restored]);

  function reset() {
    setStep(0);
    setDraft({ ...EMPTY_DRAFT });
    setErrors({});
    setWantVerification(false);
    // The write-back effect above clears storage on its own the next time it
    // sees this draft (`isDraftWorthSaving` is false for a fresh one), but
    // discard and publish both mean "gone now" — a reload between this line
    // and that render should not still offer the draft back.
    setStoredDraft(null);
  }

  // Navigating away closes the sheet but keeps what was typed. This is keyed
  // on `pathname` alone, on purpose: it should fire only when the route
  // changes, not whenever `dirty`/`open`/`toast`/`onClose` themselves change
  // (adding them as deps would fire this on every keystroke that flips
  // `dirty`, or the instant `open` turns true, immediately closing the sheet
  // it was just asked to show). The values it reads are still current, not
  // stale, because the ref below is refreshed by an unconditional effect that
  // runs after every render — including the one that changed `pathname` —
  // so by the time this effect's callback runs it is reading this render's
  // values, just indirectly.
  const first = useRef(true);
  const latest = useRef({ open, dirty, toast, onClose });
  useEffect(() => {
    latest.current = { open, dirty, toast, onClose };
  });
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const { open, dirty, toast, onClose } = latest.current;
    if (open) {
      onClose();
      if (dirty) toast("Draft saved");
    }
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && !publishing && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, publishing]);

  // The shell's `openPost` is still the only thing that sets `open`, and it
  // still refuses a browsing account before it gets here — the tab bar offers
  // Create to everyone now, but offering the button is not the same as opening
  // the form, and the refusal simply moved to the tap. So this stays the belt
  // to that pair of braces: a role that changes while the sheet is up, or a
  // future call site that mounts it with `open` of its own, and the form is
  // gone rather than half-usable. A signed-out visitor is caught by the same
  // line without a second check, because a guest holds the browsing role and a
  // browsing role does not hold `ad.create`. It sits beside the `open` check and not
  // above the hooks because bailing early would change the hook order — the
  // draft-persistence effects above have to run for every render this
  // component ever does, `open` or not, or a draft typed just before closing
  // would never reach its last write.
  if (!open || !can("ad.create")) return null;

  const patch = (next) => {
    setDraft((d) => ({ ...d, ...next }));
    setErrors((e) => {
      const cleared = { ...e };
      Object.keys(next).forEach((k) => delete cleared[k]);
      return cleared;
    });
  };

  /**
   * Every picked file, validated then downscaled and stripped of EXIF/GPS
   * before it ever joins the draft — see `lib/media.js`'s `downscaleToDataUri`
   * for the guarantee and how it was verified. Doing this now rather than at
   * publish (the old design) is what makes draft persistence possible at all:
   * the draft this writes to storage below already holds the same data URIs
   * `publish` would produce, not `blob:` pointers that die with the tab.
   *
   * Async, and each rejection is a message rather than a silent drop — a file
   * that isn't an image, one over `MAX_PHOTO_BYTES`, or one that fails to
   * decode all report why through the same `errors.images` line the "only 6
   * per ad" message already used.
   */
  async function addImages(files) {
    const room = Math.max(MAX_IMAGES - draft.images.length, 0);
    const overflow = files.length > room;
    const candidates = files.slice(0, room);

    const refused = [];
    const toDecode = [];
    for (const file of candidates) {
      const reason = validatePhotoFile(file);
      if (reason) refused.push(reason);
      else toDecode.push(file);
    }

    setAddingPhotos(true);
    const results = await Promise.allSettled(
      toDecode.map(async (file) => ({
        id: `img-${idSeq.current++}`,
        name: file.name,
        url: await downscaleToDataUri(file),
      })),
    );
    setAddingPhotos(false);

    const added = [];
    for (const result of results) {
      if (result.status === "fulfilled") added.push(result.value);
      else refused.push("A photo couldn't be read and was skipped.");
    }
    if (added.length) patch({ images: [...draft.images, ...added] });

    const messages = [];
    if (refused.length) messages.push(refused[0]);
    if (refused.length > 1)
      messages.push(`${refused.length - 1} more skipped.`);
    if (overflow) messages.push(`Only ${MAX_IMAGES} photos per ad.`);
    if (messages.length) {
      setErrors((e) => ({ ...e, images: messages.join(" ") }));
    }
  }

  function reorderImage(id, toIndex) {
    const fromIndex = draft.images.findIndex((i) => i.id === id);
    if (fromIndex === -1) return;
    patch({ images: reorderImages(draft.images, fromIndex, toIndex) });
  }

  function removeImage(id) {
    patch({ images: draft.images.filter((i) => i.id !== id) });
  }

  async function next() {
    if (publishLock.current) return;
    const found = validateStep(current.id, draft);
    if (Object.keys(found).length) return setErrors(found);
    if (step < STEPS.length - 1) return setStep(step + 1);
    publishLock.current = true;
    setPublishing(true);
    setErrors({});
    try {
      await onPublish(draft, { requestVerification: wantVerification });
      reset();
      onClose();
    } catch (error) {
      setErrors({
        publish:
          error?.message ||
          "Couldn't publish your ad. Your draft is saved; please try again.",
      });
    } finally {
      publishLock.current = false;
      setPublishing(false);
    }
  }

  function discard() {
    reset();
    toast("Draft discarded");
  }

  function back() {
    if (step > 0) return setStep(step - 1);
    onClose();
    if (dirty) toast("Draft saved");
  }

  return (
    <div className="absolute inset-0 z-[1000] flex flex-col justify-end pb-nav lg:fixed lg:items-center lg:justify-center lg:p-8 lg:pb-8">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[3px]"
        onClick={() => {
          if (!publishing) onClose();
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create a new ad"
        className="relative flex h-[93%] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl lg:h-[86vh] lg:max-w-2xl lg:rounded-3xl"
      >
        <header className="shrink-0 border-b border-line bg-surface">
          <div className="flex items-center gap-2 px-2 pt-2">
            <button
              onClick={back}
              disabled={publishing}
              aria-label={step === 0 ? "Close" : "Back"}
              className="grid size-10 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-canvas active:scale-95"
            >
              {step === 0 ? (
                <X className="size-5" />
              ) : (
                <ChevronLeft className="size-6" strokeWidth={2.5} />
              )}
            </button>

            <p className="min-w-0 flex-1 truncate text-center text-[16px] font-bold text-ink">
              {current.title}
            </p>

            <div className="flex shrink-0 items-center gap-1">
              {dirty && (
                <button
                  onClick={discard}
                  disabled={publishing}
                  aria-label="Discard this draft"
                  className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-canvas hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
              <span className="grid h-8 place-items-center rounded-full bg-canvas px-3 text-[12px] font-bold tabular-nums text-muted">
                {step + 1}/{STEPS.length}
              </span>
            </div>
          </div>

          <Stepper
            step={step}
            onJump={(index) => {
              if (!publishing) setStep(index);
            }}
          />
        </header>

        <div
          data-step-body
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 lg:px-8"
        >
          <div className="mb-4 shrink-0">
            <h2 className="text-[24px] font-bold leading-tight tracking-tight text-ink">
              {current.heading}
            </h2>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">
              {current.sub}
            </p>
          </div>

          <fieldset disabled={publishing} className="min-w-0">
            {current.id === "photos" && (
              <StepPhotos
                images={draft.images}
                error={errors.images}
                busy={addingPhotos}
                onAdd={addImages}
                onRemove={removeImage}
                onReorder={reorderImage}
              />
            )}
            {current.id === "details" && (
              <StepDetails draft={draft} errors={errors} onPatch={patch} />
            )}
            {current.id === "contact" && (
              <StepContact draft={draft} errors={errors} onPatch={patch} />
            )}
            {current.id === "review" && (
              <StepReview
                draft={draft}
                onEdit={setStep}
                verified={wantVerification}
                onToggleVerified={setWantVerification}
              />
            )}
          </fieldset>
        </div>

        <footer className="shrink-0 border-t border-line bg-surface px-4 pb-4 pt-3 lg:px-8">
          {errors.publish && (
            <p role="alert" className="mb-3 text-[13px] text-red-600">
              {errors.publish}
            </p>
          )}
          <button
            onClick={next}
            disabled={publishing || addingPhotos}
            className="brand-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] font-bold text-on-brand shadow-pop transition-transform duration-150 hover:brightness-110 active:scale-[0.98]"
          >
            {last && <Sparkles className="size-5" />}
            {publishing
              ? "Submitting..."
              : last && wantVerification
                ? "Submit for verification"
                : current.cta}
            {!last && <ArrowRight className="size-5" strokeWidth={2.5} />}
          </button>
        </footer>
      </div>
    </div>
  );
}
