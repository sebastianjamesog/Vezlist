"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Eye, Heart, Pencil, RotateCcw, Trash2 } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import EmptyState from "../components/ui/EmptyState";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import RequireCapability from "../components/RequireCapability";
import MediaImage from "../components/media/MediaImage.jsx";
import StepPhotos from "../components/create/StepPhotos";
import StepDetails from "../components/create/StepDetails";
import StepContact from "../components/create/StepContact";
import { useToast } from "../context/ToastContext";
import { useAccount } from "../context/AccountContext";
import {
  MAX_IMAGES,
  STEPS,
  draftFromListing,
  toListingWriteRequest,
  validateStep,
} from "../lib/adDraft";
import { downscaleToDataUri, validatePhotoFile } from "../lib/media";
import { ApiError, SITE_SCOPE } from "../lib/api/client.js";
import {
  deleteListing,
  ownedListings,
  resolveCategoryId,
  resolveLocationId,
  submitListing,
  updateListing,
} from "../lib/api/listings.js";
import {
  dataUriToBlob,
  deleteMedia,
  uploadListingImage,
} from "../lib/api/media.js";
import { appeal as appealListing, ownerStatus } from "../lib/api/moderation.js";

/**
 * The tabs this screen offers, and which backend `ListingStatus` values file
 * under each one. `DRAFT` rides with "In review" rather than getting a tab
 * of its own: every draft this screen can produce (the wizard submits
 * immediately — see `publishDraft`) is created and submitted in the same
 * breath, so the only way to see one here is an edit that hasn't been saved
 * yet, which is exactly the "still being worked on" bucket "In review"
 * already describes to a poster who doesn't know the backend's state names.
 */
const TABS = [
  { value: "active", label: "Active", statuses: ["ACTIVE"] },
  { value: "pending", label: "In review", statuses: ["DRAFT", "PENDING_REVIEW"] },
  { value: "attention", label: "Needs attention", statuses: ["REJECTED", "REMOVED"] },
  { value: "expired", label: "Expired", statuses: ["EXPIRED"] },
];

const statusTone = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  DRAFT: "bg-amber-100 text-amber-700",
  PENDING_REVIEW: "bg-amber-100 text-amber-700",
  REJECTED: "bg-red-100 text-red-700",
  REMOVED: "bg-red-100 text-red-700",
  EXPIRED: "bg-canvas text-muted",
};

const statusLabel = {
  ACTIVE: "Active",
  DRAFT: "In review",
  PENDING_REVIEW: "In review",
  REJECTED: "Rejected",
  REMOVED: "Removed",
  EXPIRED: "Expired",
};

/** Only a draft or a rejected listing can be edited or resubmitted — the backend refuses anything else. */
const EDITABLE_STATUSES = new Set(["DRAFT", "REJECTED"]);

const EDIT_STEPS = ["photos", "details", "contact"];

function tabFor(status) {
  return TABS.find((t) => t.statuses.includes(status))?.value ?? null;
}

function daysUntil(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** The card's link to the ad — only a published (or once-published) listing has a public detail page. */
function AdLink({ listing, className, children }) {
  if (listing.status !== "ACTIVE") return <span className={className}>{children}</span>;
  return (
    <Link href={`/ad/${listing.id}`} className={`${className} hover:text-brand`}>
      {children}
    </Link>
  );
}

export default function MyAds() {
  const toast = useToast();
  const { can } = useAccount();
  const [listings, setListings] = useState(null); // null while loading, [] once loaded
  const [error, setError] = useState(null);
  const [moderation, setModeration] = useState({}); // listingId -> OwnerStatus
  const [tab, setTab] = useState("active");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [appealing, setAppealing] = useState(null);
  const [appealMessage, setAppealMessage] = useState("");
  const [appealSubmitting, setAppealSubmitting] = useState(false);

  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const previews = useRef([]);
  const [addingPhotos, setAddingPhotos] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await ownedListings(SITE_SCOPE);
      setListings(rows);
      const needsAttention = rows.filter((r) =>
        ["REJECTED", "REMOVED"].includes(r.status),
      );
      const statuses = await Promise.all(
        needsAttention.map((r) =>
          ownerStatus(r.id, SITE_SCOPE).catch(() => null),
        ),
      );
      const byId = {};
      needsAttention.forEach((r, i) => {
        if (statuses[i]) byId[r.id] = statuses[i];
      });
      setModeration(byId);
    } catch (err) {
      setError(err);
    }
  }, []);

  const canManage = can("ad.manage");
  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  function releasePreviews() {
    previews.current.forEach((url) => URL.revokeObjectURL(url));
    previews.current = [];
  }

  useEffect(() => releasePreviews, []);

  const rows = (listings ?? []).filter((l) => tabFor(l.status) === tab);
  const countOf = (value) =>
    (listings ?? []).filter((l) => tabFor(l.status) === value).length;

  /* ---- delete ---- */

  async function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteListing(target.id);
      setListings((rows) => rows.filter((r) => r.id !== target.id));
      toast("Ad deleted");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't delete this ad");
    }
  }

  /* ---- moderation / appeal ---- */

  function openAppeal(listing) {
    setAppealMessage("");
    setAppealing(listing);
  }

  async function submitAppeal() {
    if (!appealing || !appealMessage.trim()) return;
    setAppealSubmitting(true);
    try {
      await appealListing(appealing.id, {
        site: SITE_SCOPE,
        message: appealMessage.trim(),
      });
      setModeration((m) => ({
        ...m,
        [appealing.id]: { ...m[appealing.id], appealAllowed: false },
      }));
      toast("Appeal submitted for review");
      setAppealing(null);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't submit the appeal");
    } finally {
      setAppealSubmitting(false);
    }
  }

  /* ---- editing ---- */

  function openEdit(listing) {
    setDraft(draftFromListing(listing));
    setErrors({});
    setEditing(listing);
  }

  function closeEdit() {
    releasePreviews();
    setEditing(null);
    setDraft(null);
    setErrors({});
  }

  function patch(next) {
    setDraft((d) => ({ ...d, ...next }));
    setErrors((e) => {
      const cleared = { ...e };
      Object.keys(next).forEach((k) => delete cleared[k]);
      return cleared;
    });
  }

  /** Same pipeline the create wizard uses — downscaled, EXIF-stripped, watermarked before it ever joins the draft. */
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
        id: `new-${crypto.randomUUID()}`,
        name: file.name,
        url: await downscaleToDataUri(file),
        pending: true,
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
    if (refused.length > 1) messages.push(`${refused.length - 1} more skipped.`);
    if (overflow) messages.push(`Only ${MAX_IMAGES} photos per ad.`);
    if (messages.length) setErrors((e) => ({ ...e, images: messages.join(" ") }));
  }

  function removeImage(id) {
    const gone = draft.images.find((i) => i.id === id);
    if (gone?.pending) URL.revokeObjectURL(gone.url);
    patch({ images: draft.images.filter((i) => i.id !== id) });
  }

  async function saveEdit() {
    const found = EDIT_STEPS.reduce(
      (all, id) => ({ ...all, ...validateStep(id, draft) }),
      {},
    );
    if (Object.keys(found).length) return setErrors(found);

    setSaving(true);
    try {
      const [categoryId, location] = await Promise.all([
        resolveCategoryId(draft.category, SITE_SCOPE),
        resolveLocationId(draft.location),
      ]);
      const request = toListingWriteRequest(draft, {
        site: SITE_SCOPE,
        categoryId,
        provinceId: location.provinceId,
        locationId: location.locationId,
      });

      let listing = await updateListing(editing.id, request);

      // Photos only ever change here for a draft/rejected listing — the
      // backend refuses image edits on anything else, so `draft.images`
      // for an active/pending/expired ad is exactly what it opened on.
      const originalIds = new Set((editing.media ?? []).map((m) => m.id));
      const keptOrNew = draft.images;
      const removed = [...originalIds].filter(
        (id) => !keptOrNew.some((i) => i.id === id),
      );
      const added = keptOrNew.filter((i) => i.pending);

      for (const mediaId of removed) {
        await deleteMedia(editing.id, mediaId).catch(() => {});
      }
      for (const image of added) {
        const blob = dataUriToBlob(image.url);
        await uploadListingImage(editing.id, blob, image.name || "photo.jpg");
      }

      if (EDITABLE_STATUSES.has(editing.status)) {
        listing = await submitListing(editing.id, crypto.randomUUID());
      }

      setListings((rows) => rows.map((r) => (r.id === listing.id ? listing : r)));
      setSaving(false);
      closeEdit();
      toast(
        EDITABLE_STATUSES.has(editing.status)
          ? "Saved — back in review"
          : "Changes saved",
      );
    } catch (err) {
      setSaving(false);
      toast(err instanceof ApiError ? err.message : "Couldn't save your changes");
    }
  }

  /* ---- render ---- */

  if (error) {
    return (
      <RequireCapability capability="ad.manage" title="My Ads">
        <SubPageBar title="My Ads" fallback="/profile" />
        <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
          <EmptyState
            icon="ShieldAlert"
            title="Couldn't load your ads"
            body={error instanceof ApiError ? error.message : "Something went wrong."}
            action={<Button onClick={load}>Try again</Button>}
          />
        </PageBody>
      </RequireCapability>
    );
  }

  if (listings === null) {
    return (
      <RequireCapability capability="ad.manage" title="My Ads">
        <SubPageBar title="My Ads" fallback="/profile" />
        <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-card bg-canvas shadow-card"
              />
            ))}
          </div>
        </PageBody>
      </RequireCapability>
    );
  }

  return (
    <RequireCapability capability="ad.manage" title="My Ads">
      <>
        <SubPageBar
          title="My Ads"
          subtitle={`${listings.length} listings`}
          fallback="/profile"
        />

        <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
          <div className="mb-4 flex gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line lg:max-w-xl">
            {TABS.map((s) => (
              <button
                key={s.value}
                onClick={() => setTab(s.value)}
                aria-pressed={tab === s.value}
                className={`flex-1 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                  tab === s.value
                    ? "bg-surface text-ink shadow-card"
                    : "text-muted hover:text-ink"
                }`}
              >
                {s.label} ({countOf(s.value)})
              </button>
            ))}
          </div>

          {rows.length ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {rows.map((row) => {
                const mod = moderation[row.id];
                const editable = EDITABLE_STATUSES.has(row.status);
                return (
                  <article
                    key={row.id}
                    className="rounded-card bg-surface p-3 shadow-card lg:p-4"
                  >
                    <div className="flex gap-3">
                      <AdLink listing={row} className="shrink-0">
                        <MediaImage
                          src={row.media?.[0]?.url}
                          alt=""
                          width={72}
                          height={72}
                          className="size-[72px] rounded-xl object-cover"
                        />
                      </AdLink>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <AdLink
                            listing={row}
                            className="text-[16px] font-bold leading-tight text-ink"
                          >
                            {row.title}
                          </AdLink>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone[row.status] ?? "bg-canvas text-muted"}`}
                          >
                            {statusLabel[row.status] ?? row.status}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                          <span className="flex items-center gap-1">
                            <Eye className="size-4" />
                            {row.viewCount.toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="size-4" />
                            {row.saveCount}
                          </span>
                          {row.status === "ACTIVE" && row.expiresAt && (
                            <span>Expires in {daysUntil(row.expiresAt)} days</span>
                          )}
                        </div>

                        {mod?.publicReason && (
                          <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-red-50 px-2.5 py-1.5 text-[12.5px] leading-snug text-red-700">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                            {mod.publicReason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex gap-2 border-t border-line pt-3">
                      {editable && (
                        <button
                          onClick={() => openEdit(row)}
                          aria-label={`Edit ${row.title}`}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-[14px] font-semibold text-ink transition-colors hover:bg-canvas"
                        >
                          <Pencil className="size-4" />
                          Edit
                        </button>
                      )}

                      {mod?.appealAllowed && (
                        <button
                          onClick={() => openAppeal(row)}
                          aria-label={`Appeal the decision on ${row.title}`}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-soft py-2.5 text-[14px] font-semibold text-brand transition-colors hover:bg-brand hover:text-on-brand"
                        >
                          <RotateCcw className="size-4" />
                          Appeal
                        </button>
                      )}

                      <button
                        onClick={() => setPendingDelete(row)}
                        aria-label={`Delete ${row.title}`}
                        className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-red-500 transition-colors hover:bg-red-50"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon="Megaphone"
              title={`No ${TABS.find((s) => s.value === tab)?.label.toLowerCase()} ads`}
              body="Ads you post show up here with their views and saves."
            />
          )}
        </PageBody>

        <Modal
          open={Boolean(editing)}
          title="Edit this ad"
          subtitle={editing?.title}
          onClose={closeEdit}
          size="max-w-2xl"
          footer={
            editing && (
              <div className="flex items-center gap-3">
                <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted">
                  {EDITABLE_STATUSES.has(editing.status)
                    ? "Saving sends this ad back for review."
                    : "Changes saved."}
                </p>
                <Button onClick={saveEdit} disabled={saving} className="shrink-0">
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            )
          }
        >
          {draft && (
            <div className="space-y-6">
              {EDIT_STEPS.map((id) => {
                const step = STEPS.find((s) => s.id === id);
                if (id === "photos" && !EDITABLE_STATUSES.has(editing.status)) {
                  return null;
                }
                return (
                  <section
                    key={id}
                    className="border-t border-line pt-5 first:border-0 first:pt-0"
                  >
                    <h3 className="text-[17px] font-bold leading-tight text-ink">
                      {step.heading}
                    </h3>
                    <p className="mb-3 mt-1 text-[13.5px] leading-snug text-muted">
                      {step.sub}
                    </p>

                    {id === "photos" && (
                      <StepPhotos
                        images={draft.images}
                        error={errors.images}
                        busy={addingPhotos}
                        onAdd={addImages}
                        onRemove={removeImage}
                      />
                    )}
                    {id === "details" && (
                      <StepDetails draft={draft} errors={errors} onPatch={patch} />
                    )}
                    {id === "contact" && (
                      <StepContact draft={draft} errors={errors} onPatch={patch} />
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </Modal>

        <Modal
          open={Boolean(appealing)}
          title="Appeal this decision"
          subtitle={appealing?.title}
          onClose={() => setAppealing(null)}
          size="max-w-lg"
          footer={
            appealing && (
              <Button
                onClick={submitAppeal}
                disabled={!appealMessage.trim() || appealSubmitting}
                className="w-full"
              >
                {appealSubmitting ? "Submitting…" : "Submit appeal"}
              </Button>
            )
          }
        >
          <label className="block text-[14px] font-semibold text-ink">
            Tell a moderator why this should be reconsidered
            <textarea
              value={appealMessage}
              onChange={(e) => setAppealMessage(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="Explain what should change about this decision..."
              className="mt-2 w-full rounded-xl border border-line px-4 py-3 text-[14px] text-ink outline-none focus:border-brand"
            />
          </label>
        </Modal>

        <ConfirmDialog
          open={Boolean(pendingDelete)}
          title="Delete this ad?"
          body={
            pendingDelete
              ? `“${pendingDelete.title}” will be removed permanently.`
              : ""
          }
          confirmLabel="Delete"
          destructive
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      </>
    </RequireCapability>
  );
}
