"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  Eye,
  Heart,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
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
import VerificationRequestModal from "../components/create/VerificationRequestModal";
import { useToast } from "../context/ToastContext";
import { useAccount } from "../context/AccountContext";
import { useAuth } from "../context/AuthContext";
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
  submitListing,
  updateListing,
} from "../lib/api/listings.js";
import {
  dataUriToBlob,
  deleteMedia,
  uploadListingImage,
} from "../lib/api/media.js";
import { appeal as appealListing, ownerStatus } from "../lib/api/moderation.js";
import {
  currentVerification,
  requestVerification,
} from "../lib/api/verification.js";

/**
 * The tabs this screen offers, and which backend `ListingStatus` values file
 * under each one. Unsubmitted drafts are separate from private ads awaiting
 * verification, so a partially completed regular post never claims staff review.
 */
const TABS = [
  { value: "active", label: "Active", statuses: ["ACTIVE"] },
  { value: "pending", label: "In review", statuses: ["PENDING_REVIEW"] },
  { value: "drafts", label: "Drafts", statuses: ["DRAFT"] },
  {
    value: "attention",
    label: "Needs attention",
    statuses: ["REJECTED", "REMOVED"],
  },
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
  DRAFT: "Draft",
  PENDING_REVIEW: "In review",
  REJECTED: "Rejected",
  REMOVED: "Removed",
  EXPIRED: "Expired",
};

/** Only a draft or a rejected listing can change photos or be resubmitted — the backend refuses anything else. */
const RESUBMIT_STATUSES = new Set(["DRAFT", "REJECTED"]);
const EDITABLE_STATUSES = new Set(["DRAFT", "REJECTED", "ACTIVE", "EXPIRED"]);

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
  if (listing.status !== "ACTIVE")
    return <span className={className}>{children}</span>;
  return (
    <Link
      href={`/ad/${listing.id}`}
      className={`${className} hover:text-brand`}
    >
      {children}
    </Link>
  );
}

export default function MyAds() {
  const { user } = useAuth();
  return <MyAdsContent key={`${SITE_SCOPE}:${user?.id ?? "signed-out"}`} authenticated={Boolean(user?.id)} />;
}

function MyAdsContent({ authenticated }) {
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
  const [appealError, setAppealError] = useState(null);
  const appealLock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const previews = useRef([]);
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [verification, setVerification] = useState(null);
  const [requestingVerification, setRequestingVerification] = useState(null);
  const loadVersion = useRef(0);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!mounted.current || appealLock.current) return;
    const version = ++loadVersion.current;
    setError(null);
    try {
      const rows = await ownedListings(SITE_SCOPE);
      if (version !== loadVersion.current) return;
      setListings(rows);
      const needsAttention = rows.filter((r) =>
        ["ACTIVE", "EXPIRED", "REJECTED", "REMOVED"].includes(r.status),
      );
      const statuses = await Promise.all(
        needsAttention.map((r) =>
          ownerStatus(r.id, SITE_SCOPE).catch(() => ({ loadError: true })),
        ),
      );
      const byId = {};
      needsAttention.forEach((r, i) => {
        if (statuses[i]) byId[r.id] = statuses[i];
      });
      if (version === loadVersion.current) setModeration(byId);
    } catch (err) {
      if (version === loadVersion.current && !silent) setError(err);
    }
  }, []);

  const canManage = authenticated && can("ad.manage");
  useEffect(() => {
    if (!canManage) return undefined;
    load();
    const refresh = () => { if (document.visibilityState !== "hidden") load({ silent: true }); };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      loadVersion.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
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

  async function continueVerification(listing) {
    if (requestingVerification) return;
    setRequestingVerification(listing.id);
    try {
      let request;
      try {
        request = await currentVerification(listing.id);
      } catch (error) {
        if (error?.status !== 404) throw error;
      }
      if (!request || request.status === "REJECTED") {
        request = await requestVerification(listing.id);
      }
      setVerification({
        listingId: listing.id,
        request,
        publicationPending:
          listing.status === "PENDING_REVIEW" && listing.verificationRequested,
      });
    } catch (error) {
      toast(
        error instanceof ApiError
          ? error.message
          : "Couldn't start verification. Your ad stays private; try again.",
      );
    } finally {
      setRequestingVerification(null);
    }
  }

  function openAppeal(listing) {
    if (appealLock.current || !moderation[listing.id]?.appealAllowed) return;
    setAppealMessage("");
    setAppealError(null);
    setAppealing(listing);
  }

  async function submitAppeal() {
    if (!appealing || !appealMessage.trim() || appealLock.current) return;
    const target = appealing;
    appealLock.current = true;
    loadVersion.current++;
    setAppealSubmitting(true);
    setAppealError(null);
    try {
      await appealListing(target.id, {
        site: SITE_SCOPE,
        message: appealMessage.trim(),
      });
      if (!mounted.current) return;
      // The receipt can refer to an appeal another tab has already submitted
      // or decided. Read its current owner-visible outcome before announcing it.
      const latest = await ownerStatus(target.id, SITE_SCOPE).catch(() => null);
      if (!mounted.current) return;
      setModeration((current) => ({
        ...current,
        [target.id]: latest ?? { ...current[target.id], appealAllowed: false, appealStatus: "PENDING" },
      }));
      if (latest?.status && latest.status !== target.status) {
        setListings((current) => current?.map((row) => row.id === target.id ? { ...row, status: latest.status } : row));
        setTab(tabFor(latest.status) ?? "attention");
      }
      toast(latest?.appealStatus === "APPROVED" ? "Your appeal was approved."
        : latest?.appealStatus === "REJECTED" ? "Your appeal was rejected."
          : latest?.appealStatus === "STALE" ? "This appeal has been superseded. Check your ad's current status."
            : "Appeal submitted for review");
      setAppealing(null);
    } catch (err) {
      if (!mounted.current) return;
      setAppealError(err instanceof ApiError ? err.message : "Couldn't submit the appeal. Please try again.");
    } finally {
      if (mounted.current) {
        appealLock.current = false;
        setAppealSubmitting(false);
      }
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
    if (refused.length > 1)
      messages.push(`${refused.length - 1} more skipped.`);
    if (overflow) messages.push(`Only ${MAX_IMAGES} photos per ad.`);
    if (messages.length)
      setErrors((e) => ({ ...e, images: messages.join(" ") }));
  }

  function removeImage(id) {
    const gone = draft.images.find((i) => i.id === id);
    if (gone?.pending) URL.revokeObjectURL(gone.url);
    patch({ images: draft.images.filter((i) => i.id !== id) });
  }

  async function saveEdit() {
    if (saving || addingPhotos) return;
    const found = EDIT_STEPS.filter((id) => id !== "photos" || RESUBMIT_STATUSES.has(editing.status)).reduce(
      (all, id) => ({ ...all, ...validateStep(id, draft) }),
      {},
    );
    if (Object.keys(found).length) return setErrors(found);

    setSaving(true);
    try {
      const request = toListingWriteRequest(draft, {
        site: SITE_SCOPE,
      });

      let listing = await updateListing(editing.id, request);

      // Photos only ever change here for a draft/rejected listing — the
      // backend refuses image edits on anything else, so `draft.images`
      // for an active/pending/expired ad is exactly what it opened on.
      const originalIds = new Set(RESUBMIT_STATUSES.has(editing.status)
        ? (editing.media ?? []).map((m) => m.id) : []);
      const keptOrNew = draft.images;
      const removed = [...originalIds].filter(
        (id) => !keptOrNew.some((i) => i.id === id),
      );
      const added = RESUBMIT_STATUSES.has(editing.status) ? keptOrNew.filter((i) => i.pending) : [];

      for (const mediaId of removed) {
        await deleteMedia(editing.id, mediaId);
      }
      for (const image of added) {
        const blob = dataUriToBlob(image.url);
        await uploadListingImage(editing.id, blob, image.name || "photo.jpg");
      }

      if (RESUBMIT_STATUSES.has(editing.status)) {
        listing = await submitListing(editing.id, crypto.randomUUID(), {
          requestVerification: editing.verificationRequested === true,
        });
      }

      setListings((rows) =>
        rows.map((r) => (r.id === listing.id ? { ...listing, currentPosition: r.currentPosition } : r)),
      );
      setSaving(false);
      closeEdit();
      setTab(tabFor(listing.status) ?? "active");
      toast(
        listing.status === "ACTIVE"
          ? "Your ad is live — changes saved"
          : listing.status === "PENDING_REVIEW"
            ? listing.verificationRequested
              ? "Your ad stays private until verification is approved"
              : "Your ad is in review — check My Ads for updates"
            : "Changes saved",
      );
      if (
        listing.status === "PENDING_REVIEW" &&
        listing.verificationRequested
      ) {
        await continueVerification(listing);
      }
    } catch (err) {
      setSaving(false);
      toast(
        err instanceof ApiError ? err.message : "Couldn't save your changes",
      );
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
            body={
              error instanceof ApiError
                ? error.message
                : "Something went wrong."
            }
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
          <div className="mb-4 flex flex-wrap gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line lg:max-w-xl">
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

          {rows.some((row) => row.currentPosition != null) && (
            <p className="mb-3 text-xs text-muted">
              {SITE_SCOPE === "PERSONALS"
                ? "Ad rank is across all Personals ads, in every location and subcategory. "
                : "Ad rank follows posting time in the same board, category and location. "}
              Newer ads rank first; views do not affect it. Updates every 30 seconds and when you return.
            </p>
          )}
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
                          width={64}
                          height={64}
                          className="size-16 rounded-xl object-cover"
                        />
                      </AdLink>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <AdLink
                            listing={row}
                            className="line-clamp-2 text-[14px] font-bold leading-tight text-ink"
                          >
                            {row.title}
                          </AdLink>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone[row.status] ?? "bg-canvas text-muted"}`}
                          >
                            {row.status === "PENDING_REVIEW" &&
                            row.verificationRequested
                              ? "Verification pending"
                              : (statusLabel[row.status] ?? row.status)}
                          </span>
                        </div>

                        {row.currentPosition != null && (
                          <p className="mt-1 text-xs text-muted">
                            Ad rank{" "}
                            <span className="font-bold text-brand">#{row.currentPosition}</span>{" "}
                            {SITE_SCOPE === "PERSONALS" ? "across Personals" : <>in {row.categoryLabel} / {row.locationLabel}</>}
                          </p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                          <span className="flex items-center gap-1">
                            <Eye className="size-4" />
                            {row.viewCount.toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="size-4" />
                            {row.saveCount}
                          </span>
                          {row.status === "ACTIVE" && row.expiresAt && (
                            <span>
                              Expires in {daysUntil(row.expiresAt)} days
                            </span>
                          )}
                        </div>

                        {row.status === "REJECTED" &&
                          row.verificationRequested &&
                          !row.verified && (
                            <p className="mt-2 text-[13px] text-muted">
                              This ad is private. Edit and resubmit to try
                              verification again.
                            </p>
                          )}
                        {mod?.loadError && (
                          <p role="alert" className="mt-2 text-sm text-danger">
                            Could not load moderation status.{" "}
                            <button type="button" className="font-semibold underline" onClick={() => load({ silent: true })}>Retry status</button>
                          </p>
                        )}
                        {mod?.appealStatus && mod.appealStatus !== "NONE" && (
                          <p className="mt-2 rounded-xl bg-brand-soft px-2.5 py-2 text-sm text-ink">
                            {mod.appealStatus === "PENDING"
                              ? "Appeal pending review. Your ad remains private until approved."
                              : mod.appealStatus === "APPROVED"
                                ? "Your appeal was approved."
                                : mod.appealStatus === "REJECTED"
                                  ? "Your appeal was rejected. See the moderation reason below."
                                  : "This appeal was superseded by changes to your ad. Check its current status above."}
                          </p>
                        )}
                        {mod?.publicReason && (
                          <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-red-50 px-2.5 py-1.5 text-[12.5px] leading-snug text-red-700">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                            {mod.publicReason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex gap-2 border-t border-line pt-2">
                      {row.status === "ACTIVE" && (
                        <Link href={`/ad/${row.id}`} aria-label={`View ${row.title}`}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-soft py-2 text-sm font-semibold text-brand">
                          <Eye className="size-4" /> View
                        </Link>
                      )}
                      {row.status === "PENDING_REVIEW" &&
                        row.verificationRequested && (
                          <button
                            type="button"
                            onClick={() => continueVerification(row)}
                            disabled={Boolean(requestingVerification)}
                            aria-label={`Continue verification for ${row.title}`}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line px-2 py-2.5 text-[14px] font-semibold text-ink transition-colors hover:bg-canvas disabled:opacity-60"
                          >
                            <BadgeCheck className="size-4" />
                            {requestingVerification === row.id
                              ? "Loading..."
                              : "Continue verification"}
                          </button>
                        )}
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
          onClose={() => { if (!saving) closeEdit(); }}
          size="max-w-2xl"
          footer={
            editing && (
              <div className="flex items-center gap-3">
                <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted">
                  {!RESUBMIT_STATUSES.has(editing.status)
                    ? "Updates keep the original posting position and expiry. Published photos remain unchanged."
                    : editing.verificationRequested
                    ? "Saving keeps this ad private until verification is approved."
                    : "Saving publishes this regular ad after its photos finish processing."}
                </p>
                <Button
                  onClick={saveEdit}
                  disabled={saving || addingPhotos}
                  className="shrink-0"
                >
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
                if (id === "photos" && !RESUBMIT_STATUSES.has(editing.status)) {
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
                      <StepDetails
                        draft={draft}
                        errors={errors}
                        onPatch={patch}
                      />
                    )}
                    {id === "contact" && (
                      <StepContact
                        draft={draft}
                        errors={errors}
                        onPatch={patch}
                      />
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
          onClose={() => { if (!appealLock.current) setAppealing(null); }}
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
          {appealError && <p id="appeal-error" role="alert" className="mb-3 text-sm text-danger">{appealError}</p>}
          <label className="block text-[14px] font-semibold text-ink">
            Tell a moderator why this should be reconsidered
            <textarea
              value={appealMessage}
              disabled={appealSubmitting}
              aria-describedby={appealError ? "appeal-error" : undefined}
              onChange={(e) => setAppealMessage(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="Explain what should change about this decision..."
              className="mt-2 w-full rounded-xl border border-line px-4 py-3 text-[14px] text-ink outline-none focus:border-brand"
            />
          </label>
        </Modal>

        <VerificationRequestModal
          open={Boolean(verification)}
          listingId={verification?.listingId}
          initial={verification?.request}
          publicationPending={verification?.publicationPending}
          onClose={() => {
            setVerification(null);
            load();
          }}
        />

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
