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
  EMPTY_DRAFT,
  MAX_IMAGES,
  STEPS,
  validateStep,
} from "../../lib/adDraft";
import StepPhotos from "./StepPhotos";
import StepDetails from "./StepDetails";
import StepContact from "./StepContact";
import StepReview from "./StepReview";
import { useToast } from "../../context/ToastContext";
import { useCatalog } from "../../context/CatalogContext";

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
export default function CreateAdSheet({
  open,
  onClose,
  onPublish,
  initialListing = null,
}) {
  const { categories } = useCatalog();
  const defaultCategory = categories[0] ?? { id: "", label: "" };
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState({
    ...EMPTY_DRAFT,
    category: defaultCategory.label,
    categoryId: defaultCategory.id,
  });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const requestKey = useRef(
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
  );
  const previews = useRef([]);
  const toast = useToast();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!initialListing) return;
    setStep(0);
    setDraft({
      ...EMPTY_DRAFT,
      listingId: initialListing.id,
      listingStatus: initialListing.status,
      images: (initialListing.media ?? [])
        .filter((media) => media.status === "READY" && media.url)
        .sort((left, right) => left.position - right.position)
        .map((media) => ({
          id: media.id,
          mediaId: media.id,
          name: media.fileName,
          url: media.url,
          persisted: true,
        })),
      title: initialListing.title,
      business: initialListing.businessName,
      category: initialListing.categoryLabel,
      categoryId: initialListing.categoryId,
      price: initialListing.price ?? "",
      description: initialListing.description,
      location: initialListing.locationLabel,
      provinceId: initialListing.provinceId,
      locationId: initialListing.locationId,
      email: initialListing.contactEmail,
      phone: initialListing.contactPhone,
    });
    setErrors({});
    setSubmitError("");
    setUploadProgress("");
  }, [initialListing]);

  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  // Category is pre-filled, so it can't count towards "the user typed something".
  const dirty =
    draft.images.length > 0 ||
    Object.entries(draft).some(
      ([k, v]) =>
        ![
          "images",
          "category",
          "categoryId",
          "listingId",
          "listingStatus",
          "removedMediaIds",
        ].includes(k) && v !== "",
    );

  function releasePreviews() {
    previews.current.forEach((url) => URL.revokeObjectURL(url));
    previews.current = [];
  }

  function reset() {
    releasePreviews();
    setStep(0);
    setDraft({
      ...EMPTY_DRAFT,
      category: defaultCategory.label,
      categoryId: defaultCategory.id,
    });
    setErrors({});
    setSubmitError("");
    setUploadProgress("");
    requestKey.current = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
  }

  // The draft outlives a close on purpose: leave, come back, carry on. Object
  // URLs still leak until revoked, so unmount drops them.
  useEffect(() => releasePreviews, []);

  useEffect(() => {
    if (!categories.some((category) => category.id === draft.categoryId)) {
      setDraft((current) => ({
        ...current,
        category: defaultCategory.label,
        categoryId: defaultCategory.id,
      }));
    }
  }, [categories, defaultCategory.id, defaultCategory.label, draft.categoryId]);

  // Navigating away closes the sheet but keeps what was typed.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (open) {
      onClose();
      if (dirty) toast("Draft saved");
    }
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const patch = (next) => {
    setSubmitError("");
    setDraft((d) => ({ ...d, ...next }));
    setErrors((e) => {
      const cleared = { ...e };
      Object.keys(next).forEach((k) => delete cleared[k]);
      return cleared;
    });
  };

  function addImages(files) {
    const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const valid = files.filter(
      (file) => acceptedTypes.has(file.type) && file.size <= 10 * 1024 * 1024,
    );
    const room = MAX_IMAGES - draft.images.length;
    const picked = valid.slice(0, Math.max(room, 0));
    const added = picked.map((file) => {
      const url = URL.createObjectURL(file);
      previews.current.push(url);
      return {
        id:
          globalThis.crypto?.randomUUID?.() ??
          `${file.name}-${previews.current.length}`,
        name: file.name,
        url,
        file,
        persisted: false,
      };
    });
    patch({ images: [...draft.images, ...added] });
    if (valid.length !== files.length) {
      setErrors((e) => ({
        ...e,
        images: "Use JPEG, PNG, or WebP files no larger than 10 MB.",
      }));
    } else if (files.length > room) {
      setErrors((e) => ({
        ...e,
        images: `Only ${MAX_IMAGES} photos per ad — extras were skipped.`,
      }));
    }
  }

  function removeImage(id) {
    const gone = draft.images.find((i) => i.id === id);
    if (gone && !gone.persisted) URL.revokeObjectURL(gone.url);
    previews.current = previews.current.filter((url) => url !== gone?.url);
    patch({
      images: draft.images.filter((image) => image.id !== id),
      removedMediaIds: gone?.mediaId
        ? [...new Set([...draft.removedMediaIds, gone.mediaId])]
        : draft.removedMediaIds,
    });
  }

  function moveImage(id, offset) {
    const from = draft.images.findIndex((image) => image.id === id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= draft.images.length) return;
    const images = [...draft.images];
    const [moved] = images.splice(from, 1);
    images.splice(to, 0, moved);
    patch({ images });
  }

  function makeCover(id) {
    const from = draft.images.findIndex((image) => image.id === id);
    if (from <= 0) return;
    const images = [...draft.images];
    const [cover] = images.splice(from, 1);
    images.unshift(cover);
    patch({ images });
  }

  async function next() {
    const found = validateStep(current.id, draft);
    if (Object.keys(found).length) return setErrors(found);
    if (step < STEPS.length - 1) return setStep(step + 1);
    setSubmitting(true);
    setSubmitError("");
    setUploadProgress("Starting...");
    try {
      await onPublish(draft, requestKey.current, setUploadProgress);
      reset();
    } catch (error) {
      setSubmitError(
        error?.message ?? "The ad could not be submitted. Please try again.",
      );
    } finally {
      setSubmitting(false);
      setUploadProgress("");
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
        onClick={onClose}
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

          <Stepper step={step} onJump={setStep} />
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

          {current.id === "photos" && (
            <StepPhotos
              images={draft.images}
              error={errors.images}
              onAdd={addImages}
              onRemove={removeImage}
              onMove={moveImage}
              onMakeCover={makeCover}
            />
          )}
          {current.id === "details" && (
            <StepDetails draft={draft} errors={errors} onPatch={patch} />
          )}
          {current.id === "contact" && (
            <StepContact draft={draft} errors={errors} onPatch={patch} />
          )}
          {current.id === "review" && (
            <StepReview draft={draft} onEdit={setStep} />
          )}
        </div>

        <footer className="shrink-0 border-t border-line bg-surface px-4 pb-4 pt-3 lg:px-8">
          {submitError && (
            <p
              role="alert"
              className="mb-2 text-center text-[13px] font-medium text-red-600"
            >
              {submitError}
            </p>
          )}
          <button
            onClick={next}
            disabled={submitting}
            className="brand-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] font-bold text-on-brand shadow-pop transition-transform duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
          >
            {last && <Sparkles className="size-5" />}
            {submitting ? uploadProgress || "Submitting…" : current.cta}
            {!last && <ArrowRight className="size-5" strokeWidth={2.5} />}
          </button>
        </footer>
      </div>
    </div>
  );
}
