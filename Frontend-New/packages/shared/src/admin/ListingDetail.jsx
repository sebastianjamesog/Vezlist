"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BadgeCheck, Eye, Heart, MapPin, Tag, Trash2 } from "lucide-react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import StatusBadge from "../components/admin/StatusBadge";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import EmptyState from "../components/ui/EmptyState";
import Field, { FIELD, border } from "../components/create/Field";
import MediaImage from "../components/media/MediaImage.jsx";
import { useAdminData } from "../context/AdminDataContext";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useToast } from "../context/ToastContext";
import { useNavigate } from "../lib/nav";
import { auditFor } from "../lib/adminStore";
import { timeAgo } from "../lib/format";
import { MARKETPLACE_URL, PERSONALS_URL } from "../lib/sites";

/**
 * One ad, everything a moderator needs to decide about it, and the record of
 * what was decided before.
 *
 * Photos and body copy are on the row, folded in at seed time — this screen
 * reads the store and nothing else, like every other one.
 */
export default function ListingDetail() {
  const { id } = useParams();
  const { state, dispatch } = useAdminData();
  const { can } = useAdminAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(null);

  const row = state.listings.find((l) => l.id === id);

  if (!row) {
    return (
      <>
        <AdminHeader
          title="Listing"
          back="/listings"
          backLabel="All listings"
        />
        <EmptyState
          icon="SearchX"
          title="That ad is gone"
          body="It was deleted, or the link is stale."
          action={
            <Button to="/listings" size="sm">
              Back to listings
            </Button>
          }
        />
      </>
    );
  }

  // By id, not by display name — three accounts in this data share a name.
  const seller = state.users.find((u) => u.id === row.ownerId);
  const trail = auditFor(state, "listing", row.id);
  const publicUrl =
    (row.site === "personals" ? PERSONALS_URL : MARKETPLACE_URL) +
    `/ad/${row.adId}`;

  function act(action, message) {
    dispatch({ ...action, id: row.id });
    toast(message);
  }

  return (
    <>
      <AdminHeader
        title={row.title}
        subtitle={`${row.business} · ${row.location}`}
        back="/listings"
        backLabel="All listings"
        actions={
          <>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-xl border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink hover:border-ink/25"
            >
              View on site ↗
            </a>
            {can("listing.moderate") && row.status !== "active" && (
              <Button
                size="sm"
                onClick={() => act({ type: "approve" }, "Ad approved")}
              >
                Approve
              </Button>
            )}
            {can("listing.moderate") && row.status !== "rejected" && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => setRejecting(true)}
              >
                Reject
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <section className={CARD}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={row.status} />
              <StatusBadge status={row.site} />
              {row.verified && <StatusBadge status="verified" />}
              {row.boosted && <StatusBadge status="boosted" />}
            </div>

            {row.rejectionReason && (
              <p className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] font-medium text-danger">
                Rejected: {row.rejectionReason}
              </p>
            )}

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {row.photos.map((src, i) => (
                <figure key={src} className="group relative aspect-square">
                  <MediaImage
                    fill
                    src={src}
                    alt={`Photo ${i + 1}`}
                    sizes="(min-width: 640px) 16vw, 33vw"
                    className="rounded-xl object-cover"
                  />
                  {/* A photo is often the only thing wrong with an ad, so it
                      comes off on its own rather than taking the ad with it.
                      The last one stays — an ad with no photos is not an ad. */}
                  {can("listing.edit") && row.photos.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() => {
                        dispatch({
                          type: "removePhoto",
                          id: row.id,
                          photo: src,
                        });
                        toast("Photo removed");
                      }}
                      className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-lg bg-black/60 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" strokeWidth={2.4} />
                    </button>
                  )}
                </figure>
              ))}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                icon={Tag}
                label="Price"
                value={
                  row.price > 0 ? `$${row.price.toLocaleString()}` : "Free"
                }
              />
              <Stat
                icon={Eye}
                label="Views"
                value={row.views.toLocaleString()}
              />
              <Stat
                icon={Heart}
                label="Saves"
                value={row.saves.toLocaleString()}
              />
              <Stat icon={MapPin} label="Province" value={row.province} />
            </dl>

            {row.description.length > 0 && (
              <div className="mt-4">
                <h2 className="mb-1 text-[15px] font-extrabold text-ink">
                  Description
                </h2>
                {/* The mock stores a body as an array of paragraphs, not one
                    string — rendering it raw would run them together. */}
                <div className="flex flex-col gap-2">
                  {row.description.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-[14px] leading-relaxed text-muted"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className={CARD}>
            <h2 className="mb-2 text-[17px] font-extrabold text-ink">
              Decision history
            </h2>
            {trail.length ? (
              <ul className="divide-y divide-line">
                {trail.map((entry) => (
                  <li key={entry.id} className="flex gap-3 py-2.5">
                    <span className="w-28 shrink-0 text-[12.5px] font-semibold text-muted">
                      {entry.action}
                    </span>
                    <span className="min-w-0 flex-1 text-[13.5px] text-ink">
                      {entry.note || "—"}
                    </span>
                    <span className="shrink-0 text-[12.5px] text-muted">
                      {entry.actor}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-muted">
                Nobody has touched this ad from the console yet.
              </p>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className={CARD}>
            <h2 className="mb-3 text-[17px] font-extrabold text-ink">Seller</h2>
            {seller ? (
              <Link
                href={`/users/${seller.id}`}
                className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-canvas"
              >
                <MediaImage
                  src={seller.avatar}
                  alt=""
                  width={44}
                  height={44}
                  className="size-11 shrink-0 rounded-full object-cover"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 truncate text-[15px] font-bold text-ink">
                    {seller.name}
                    {seller.verified && (
                      <BadgeCheck
                        className="size-4 shrink-0 text-brand"
                        strokeWidth={2.6}
                      />
                    )}
                  </span>
                  <span className="block truncate text-[13px] text-muted">
                    {seller.email}
                  </span>
                </span>
              </Link>
            ) : (
              <p className="text-[14px] text-muted">
                {row.business} — no account row in the mock data.
              </p>
            )}
          </section>

          <section className={CARD}>
            <h2 className="mb-1 text-[17px] font-extrabold text-ink">
              Moderation
            </h2>
            <p className="mb-3 text-[13px] text-muted">
              Posted {timeAgo(row.postedMsAgo)} · expires in {row.expiresInDays}{" "}
              days
            </p>
            <div className="flex flex-col gap-2">
              {can("listing.edit") && (
                <Button
                  variant="outline"
                  onClick={() => setEditing({ ...row })}
                >
                  Edit details
                </Button>
              )}
              {can("listing.moderate") && (
                <Button
                  variant="outline"
                  onClick={() =>
                    act(
                      { type: "toggleVerified" },
                      row.verified ? "Verification removed" : "Ad verified",
                    )
                  }
                >
                  {row.verified ? "Remove verified badge" : "Mark as verified"}
                </Button>
              )}
              {can("listing.boost") && (
                <Button
                  variant="outline"
                  onClick={() =>
                    act(
                      { type: "setBoost", on: !row.boosted },
                      row.boosted ? "Boost stopped" : "Boost started",
                    )
                  }
                >
                  {row.boosted ? "Stop boost" : "Start boost"}
                </Button>
              )}
              {can("listing.moderate") && row.status !== "expired" && (
                <Button
                  variant="outline"
                  onClick={() => act({ type: "expire" }, "Ad expired")}
                >
                  Expire now
                </Button>
              )}
              {/* Deleting is owner-only: approving is reversible and rejecting
                  is a conversation, but this is neither. */}
              {can("listing.delete") && (
                <Button variant="danger" onClick={() => setDeleting(true)}>
                  Delete ad
                </Button>
              )}
              {!can("listing.moderate") && (
                <p className="text-[13px] leading-relaxed text-muted">
                  Your role can read this ad but not act on it.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={rejecting}
        title="Reject this ad"
        subtitle="The reason is what the seller and the audit log both see, so write it for them."
        size="max-w-md"
        onClose={() => setRejecting(false)}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setRejecting(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              disabled={!reason.trim()}
              onClick={() => {
                act({ type: "reject", reason }, "Ad rejected");
                setRejecting(false);
                setReason("");
              }}
            >
              Reject
            </Button>
          </div>
        }
      >
        <Field label="Reason" hint="Required">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Contact details in the photos."
            className={`${FIELD} ${border(false)} resize-none`}
          />
        </Field>
      </Modal>

      <Modal
        open={Boolean(editing)}
        title="Edit ad details"
        subtitle="Correcting an ad is usually kinder than rejecting it. The seller sees the change; the audit log records which fields moved."
        size="max-w-md"
        onClose={() => setEditing(null)}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={!editing?.title.trim()}
              onClick={() => {
                const category = state.categories.find(
                  (c) => c.id === editing.categoryId,
                );
                dispatch({
                  type: "editListing",
                  id: row.id,
                  fields: {
                    title: editing.title.trim(),
                    price: Math.max(0, Number(editing.price) || 0),
                    categoryId: editing.categoryId,
                    // Keep the display label in step with the id it came from.
                    category: category?.label ?? editing.category,
                    location: editing.location,
                  },
                });
                toast("Ad updated");
                setEditing(null);
              }}
            >
              Save
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Title">
              <input
                value={editing.title}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
                autoFocus
                className={`${FIELD} ${border(false)}`}
              />
            </Field>
            <Field label="Price (CAD)" hint="0 for free or not applicable">
              <input
                type="number"
                min={0}
                value={editing.price}
                onChange={(e) =>
                  setEditing({ ...editing, price: e.target.value })
                }
                className={`${FIELD} ${border(false)}`}
              />
            </Field>
            <Field label="Category">
              <select
                value={editing.categoryId}
                onChange={(e) =>
                  setEditing({ ...editing, categoryId: e.target.value })
                }
                className={`${FIELD} ${border(false)}`}
              >
                {row.site === "personals" ? (
                  <option value="personals">Personals</option>
                ) : (
                  state.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))
                )}
              </select>
            </Field>
            <Field label="Area">
              <select
                value={editing.location}
                onChange={(e) =>
                  setEditing({ ...editing, location: e.target.value })
                }
                className={`${FIELD} ${border(false)}`}
              >
                {state.provinces
                  .flatMap((p) => p.areas)
                  .map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting}
        title="Delete this ad?"
        body="It leaves the board and any report pointing at it is closed. This cannot be undone from the console."
        confirmLabel="Delete"
        destructive
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          dispatch({ type: "deleteListing", id: row.id });
          toast("Ad deleted");
          navigate("/listings", { replace: true });
        }}
      />
    </>
  );
}

function Stat({ icon: Glyph, label, value }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
        <Glyph className="size-3.5" strokeWidth={2.6} aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[15px] font-bold text-ink">
        {value}
      </dd>
    </div>
  );
}
