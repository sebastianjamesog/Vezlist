"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Eye,
  Heart,
  Megaphone,
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
import { useToast } from "../context/ToastContext";
import { useAccount } from "../context/AccountContext";
import { useListings } from "../context/ListingsContext";
import { MAX_IMAGES, STEPS, validateStep } from "../lib/adDraft";
import { byStatus, countOf, draftFrom } from "../lib/listings";
import { adStatuses, boostOptions } from "../data/mock";

const statusTone = {
  active: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  expired: "bg-canvas text-muted",
};

/**
 * Editing is not the wizard, and does not pretend to be.
 *
 * The wizard asks one question per screen because a first-time poster does not
 * know what the next question is. Somebody opening Edit came to change one
 * thing they can already name, so the three steps that hold content are stacked
 * on one sheet and Save validates all of them at once — the review step is left
 * out because the sheet itself is the review. The step components are the
 * create flow's own, unchanged: a second form for the same fields is two forms
 * to keep in step, and the one that gets forgotten is this one.
 */
const EDIT_STEPS = ["photos", "details", "contact"];

/** What saving actually does to the ad, which depends on where it stands. */
const EDIT_NOTE = {
  active: "Saving sends this ad back for review before it goes live again.",
  pending:
    "This ad is already in review — the changes go into the queue with it.",
  expired:
    "Saving keeps the changes. Renew is what puts the ad back on the board.",
};

/**
 * The card's link to the ad itself — or a plain wrapper, when there is nothing
 * to link to. Only ads that came out of the mock have a body on the detail
 * page; an ad posted through the wizard has none and will not until there is a
 * backend behind it, and a link onto the not-found screen is worse than a title
 * that is only a title.
 */
function AdLink({ ad, className, children }) {
  if (!ad.adId) return <span className={className}>{children}</span>;
  return (
    <Link href={`/ad/${ad.adId}`} className={`${className} hover:text-brand`}>
      {children}
    </Link>
  );
}

export default function MyAds() {
  const toast = useToast();
  const { affords, credits, spendCredits } = useAccount();
  const { ads, save, renew, remove, promote } = useListings();
  const [tab, setTab] = useState("active");
  const [pendingDelete, setPendingDelete] = useState(null);
  // The ad the promote sheet is about, and the tier picked inside it. Two bits
  // of state rather than one object because the tier survives re-picking while
  // the sheet is open, and the row is what closing it throws away.
  const [promoting, setPromoting] = useState(null);
  const [tierId, setTierId] = useState(null);
  // The ad being edited, the draft the steps are writing into, and whether the
  // photos are still being read. `draft` is null whenever `editing` is.
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const previews = useRef([]);

  const rows = byStatus(ads, tab);
  const tier = boostOptions.find((o) => o.id === tierId) ?? null;
  const canAffordTier = Boolean(tier) && affords(tier.credits);

  // Object URLs leak until they are revoked, and leaving the screen mid-edit is
  // the easiest way to do that. The store never keeps one — see the store's
  // photo note — so dropping them here costs nothing that was saved.
  function releasePreviews() {
    previews.current.forEach((url) => URL.revokeObjectURL(url));
    previews.current = [];
  }

  useEffect(() => releasePreviews, []);

  function confirmDelete() {
    remove(pendingDelete.id);
    setPendingDelete(null);
    toast("Ad deleted");
  }

  /**
   * A run that ended, bought again. One tap, because that is the whole point of
   * the button: an expired ad had only Edit, Promote and Delete on it, and
   * promoting an ad that is not on the board is spending credits on nothing.
   *
   * It goes back through review rather than straight up, which is the same rule
   * publishing and editing follow — anything that puts words back in front of
   * readers passes a moderator first. Renewing costs nothing today; a credit
   * price for it is a product decision, and the wallet is where it would live.
   */
  function confirmRenew(row) {
    renew(row.id);
    toast("Reposted — it's in review and back up once it's approved");
  }

  /**
   * Opening the sheet preselects the tier the balance can actually pay for —
   * the recommended one when it is within reach, otherwise the cheapest that
   * is. Opening on a tier the confirm button is already refusing to spend
   * teaches people the screen is broken before they have read the options.
   */
  function openPromote(row) {
    const affordable = boostOptions.filter((o) => affords(o.credits));
    const preferred =
      affordable.find((o) => o.best) ?? affordable[0] ?? boostOptions[0];
    setTierId(preferred.id);
    setPromoting(row);
  }

  /**
   * Spend first, mark promoted second. The optimistic order — badge on the
   * card, then charge — is how an ad ends up wearing a promotion nobody paid
   * for when the wallet says no, and the wallet is the thing that owns the
   * answer: spendCredits refuses rather than overdrawing, and hands back the
   * reason so this can say something better than "something went wrong".
   */
  function confirmPromote() {
    if (!promoting || !tier) return;

    const result = spendCredits({
      credits: tier.credits,
      label: `Promoted “${promoting.title}”`,
    });

    if (!result.ok) {
      // The sheet stays open: the top-up link is in it, and closing the screen
      // someone is halfway through is not a helpful answer to "not enough".
      toast(
        result.reason === "funds"
          ? `Short by ${tier.credits - result.balance} credits — top up in your wallet`
          : "This account cannot spend credits",
      );
      return;
    }

    promote(promoting.id, tier);
    setPromoting(null);
    toast(
      `${tier.label} is live for ${tier.days} days — ${result.balance} credits left`,
    );
  }

  /* ---- editing ---- */

  function openEdit(row) {
    setDraft(draftFrom(row));
    setErrors({});
    setEditing(row);
  }

  function closeEdit() {
    releasePreviews();
    setEditing(null);
    setDraft(null);
    setErrors({});
  }

  // The same patch the wizard uses: writing a field clears the error on it, so
  // a message never outlives the thing it was complaining about.
  function patch(next) {
    setDraft((d) => ({ ...d, ...next }));
    setErrors((e) => {
      const cleared = { ...e };
      Object.keys(next).forEach((k) => delete cleared[k]);
      return cleared;
    });
  }

  function addImages(files) {
    const room = MAX_IMAGES - draft.images.length;
    const picked = files.slice(0, Math.max(room, 0));
    const added = picked.map((file) => {
      const url = URL.createObjectURL(file);
      previews.current.push(url);
      return {
        id: `${file.name}-${previews.current.length}`,
        name: file.name,
        url,
      };
    });
    patch({ images: [...draft.images, ...added] });
    if (files.length > room) {
      setErrors((e) => ({
        ...e,
        images: `Only ${MAX_IMAGES} photos per ad — extras were skipped.`,
      }));
    }
  }

  function removeImage(id) {
    const gone = draft.images.find((i) => i.id === id);
    // Only previews added in this sheet are ours to revoke; the ad's existing
    // photos are stored URLs and revoking one is a no-op.
    if (gone) URL.revokeObjectURL(gone.url);
    previews.current = previews.current.filter((u) => u !== gone?.url);
    patch({ images: draft.images.filter((i) => i.id !== id) });
  }

  /**
   * Every step at once, because they are all on screen at once. The wizard can
   * validate one step at a time — it only ever shows one — but a sheet that
   * accepted Save and then silently kept a title of two characters would be the
   * stub this replaced with extra steps.
   */
  async function saveEdit() {
    const found = EDIT_STEPS.reduce(
      (all, id) => ({ ...all, ...validateStep(id, draft) }),
      {},
    );
    if (Object.keys(found).length) return setErrors(found);

    const wasLive = editing.status === "active";
    setSaving(true);
    // Awaited: the photos have to be read out of the tab before the sheet
    // closes and revokes them, and the toast should describe a write that
    // happened rather than one that was started.
    await save(editing.id, draft);
    setSaving(false);
    closeEdit();
    toast(
      wasLive ? "Saved — back in review before it goes live" : "Changes saved",
    );
  }

  return (
    // A browsing account has no ads to manage, but it can still land here from
    // a bookmark or a link someone sent it. The gate lives inside the screen
    // rather than in the two route files so both apps get it from one place,
    // and it offers the switch instead of redirecting — see RequireCapability.
    <RequireCapability capability="ad.manage" title="My Ads">
      {/* One fragment, not four siblings: RequireCapability renders its children
          straight through, and an unkeyed array of elements is not what a
          component should be handing back. */}
      <>
        <SubPageBar
          title="My Ads"
          subtitle={`${ads.length} listings`}
          fallback="/profile"
        />

        <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
          <div className="mb-4 flex gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line lg:max-w-md">
            {adStatuses.map((s) => (
              <button
                key={s.value}
                onClick={() => setTab(s.value)}
                aria-pressed={tab === s.value}
                className={`flex-1 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors ${
                  tab === s.value
                    ? "bg-surface text-ink shadow-card"
                    : "text-muted hover:text-ink"
                }`}
              >
                {s.label} ({countOf(ads, s.value)})
              </button>
            ))}
          </div>

          {rows.length ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {rows.map((row) => (
                <article
                  key={row.id}
                  className="rounded-card bg-surface p-3 shadow-card lg:p-4"
                >
                  <div className="flex gap-3">
                    <AdLink ad={row} className="shrink-0">
                      <MediaImage
                        src={row.photos[0]}
                        alt=""
                        width={72}
                        height={72}
                        className="size-[72px] rounded-xl object-cover"
                      />
                    </AdLink>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <AdLink
                          ad={row}
                          className="text-[16px] font-bold leading-tight text-ink"
                        >
                          {row.title}
                        </AdLink>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone[row.status]}`}
                        >
                          {
                            adStatuses.find((s) => s.value === row.status)
                              ?.label
                          }
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                        <span className="flex items-center gap-1">
                          <Eye className="size-4" />
                          {row.views.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="size-4" />
                          {row.saves}
                        </span>
                        {row.status === "active" && (
                          <span>Expires in {row.expiresInDays} days</span>
                        )}
                      </div>

                      {row.boost && (
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-bold text-brand">
                          <Megaphone className="size-3.5" strokeWidth={2.6} />
                          {row.boost.label} · {row.boostedUntilDays} days left
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2 border-t border-line pt-3">
                    <button
                      onClick={() => openEdit(row)}
                      aria-label={`Edit ${row.title}`}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-[14px] font-semibold text-ink transition-colors hover:bg-canvas"
                    >
                      <Pencil className="size-4" />
                      Edit
                    </button>

                    {/* An expired ad is not on the board, so promoting it buys
                      nothing. Renew takes that slot: the one thing an ad whose
                      run has ended actually needs. */}
                    {row.status === "expired" ? (
                      <button
                        onClick={() => confirmRenew(row)}
                        aria-label={`Renew ${row.title}`}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-soft py-2.5 text-[14px] font-semibold text-brand transition-colors hover:bg-brand hover:text-on-brand"
                      >
                        <RotateCcw className="size-4" />
                        Renew
                      </button>
                    ) : row.boost ? (
                      /* A promoted ad has nothing left to buy for the rest of
                         its run, so the button becomes the receipt. Leaving it
                         live and refusing the second spend would charge for the
                         same days twice or explain why it will not — both worse
                         than not offering it. */
                      <p className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-soft py-2.5 text-[14px] font-semibold text-brand">
                        <Check className="size-4" strokeWidth={2.8} />
                        Promoted · {row.boostedUntilDays}d
                      </p>
                    ) : (
                      <button
                        onClick={() => openPromote(row)}
                        aria-label={`Promote ${row.title}`}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-soft py-2.5 text-[14px] font-semibold text-brand transition-colors hover:bg-brand hover:text-on-brand"
                      >
                        <Megaphone className="size-4" />
                        Promote
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
              ))}
            </div>
          ) : (
            <EmptyState
              icon="Megaphone"
              title={`No ${adStatuses.find((s) => s.value === tab)?.label.toLowerCase()} ads`}
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
                  {EDIT_NOTE[editing.status]}
                </p>
                <Button
                  onClick={saveEdit}
                  disabled={saving}
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
          open={Boolean(promoting)}
          title="Promote this ad"
          subtitle={promoting?.title}
          onClose={() => setPromoting(null)}
          size="max-w-lg"
          footer={
            promoting && (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink tabular-nums">
                    Balance {credits.toLocaleString()} credits
                  </p>
                  <Link
                    href="/profile/wallet"
                    className="text-[13px] font-bold text-brand hover:underline"
                  >
                    Top up
                  </Link>
                </div>
                <Button
                  onClick={confirmPromote}
                  disabled={!canAffordTier}
                  className="shrink-0"
                >
                  {tier
                    ? canAffordTier
                      ? `Spend ${tier.credits} credits`
                      : "Not enough credits"
                    : "Pick a tier"}
                </Button>
              </div>
            )
          }
        >
          <ul className="space-y-2.5">
            {boostOptions.map((option) => {
              const affordable = affords(option.credits);
              const selected = option.id === tierId;
              return (
                <li key={option.id}>
                  <button
                    onClick={() => setTierId(option.id)}
                    disabled={!affordable}
                    aria-pressed={selected}
                    className={`w-full rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      selected
                        ? "border-brand bg-brand-soft"
                        : "border-line bg-surface hover:border-ink/25"
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <span className="text-[16px] font-extrabold text-ink">
                          {option.label}
                        </span>
                        {option.best && (
                          <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-brand">
                            Best value
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[15px] font-extrabold tabular-nums text-brand">
                        {option.credits} cr
                      </span>
                    </span>

                    <span className="mt-1 block text-[13px] leading-snug text-muted">
                      {option.days} days · {option.blurb}
                    </span>

                    {/* The reason rides on the option itself. A greyed-out row
                      that only makes sense once you have compared it against a
                      balance printed somewhere else is a puzzle, not a price. */}
                    {!affordable && (
                      <span className="mt-1.5 block text-[12.5px] font-semibold text-danger">
                        {option.credits - credits} credits short
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
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
