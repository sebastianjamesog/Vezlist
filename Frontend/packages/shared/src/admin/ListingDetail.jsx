"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Eye, Heart, MapPin, Tag } from "lucide-react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import StatusBadge from "../components/admin/StatusBadge";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import EmptyState from "../components/ui/EmptyState";
import Field, { FIELD, border } from "../components/create/Field";
import MediaImage from "../components/media/MediaImage.jsx";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useToast } from "../context/ToastContext";
import { ApiError } from "../lib/api/client.js";
import { adminListingDetail, removeListing } from "../lib/api/adminListings.js";
import { MARKETPLACE_URL, PERSONALS_URL } from "../lib/sites";

/**
 * One ad, over `GET /api/v1/admin/listings/{id}`.
 *
 * The old mock offered a whole moderation panel here (approve/reject,
 * verify, boost, expire, per-photo delete, a local decision-history log) —
 * none of that has a backend counterpart on this screen. Approve/reject
 * belongs to a moderation *case*, not a listing id, and lives in
 * `Reports`/`Appeals` (the staff review queue); verify/boost/expire have no
 * admin endpoint at all. What is real here is the listing itself and the one
 * write `AdminListingController` actually offers: remove, only from `ACTIVE`.
 */
export default function ListingDetail() {
  const { id } = useParams();
  const { can } = useAdminAuth();
  const toast = useToast();

  const [data, setData] = useState(null); // { listing, ownerId, ownerName, ownerEmail }
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setNotFound(false);
    setData(null);
    try {
      const detail = await adminListingDetail(id);
      setData(detail);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError(err);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (notFound) {
    return (
      <>
        <AdminHeader title="Listing" back="/listings" backLabel="All listings" />
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

  if (error) {
    return (
      <>
        <AdminHeader title="Listing" back="/listings" backLabel="All listings" />
        <EmptyState
          icon="ShieldAlert"
          title="Couldn't load this ad"
          body={error instanceof ApiError ? error.message : "Something went wrong."}
          action={<Button onClick={load}>Try again</Button>}
        />
      </>
    );
  }

  if (!data) {
    return (
      <>
        <AdminHeader title="Listing" back="/listings" backLabel="All listings" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-64 animate-pulse rounded-card bg-canvas shadow-card lg:col-span-2" />
          <div className="h-40 animate-pulse rounded-card bg-canvas shadow-card" />
        </div>
      </>
    );
  }

  const { listing: row, ownerId, ownerName, ownerEmail } = data;
  const publicUrl =
    (row.site === "PERSONALS" ? PERSONALS_URL : MARKETPLACE_URL) + `/ad/${row.id}`;

  function openRemove() {
    setReason("");
    setActionError(null);
    setRemoving(true);
  }

  async function confirmRemove() {
    setSubmitting(true);
    setActionError(null);
    try {
      const updated = await removeListing(row.id, reason.trim());
      setData(updated);
      setRemoving(false);
      setReason("");
      toast("Ad removed");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't remove this ad.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <AdminHeader
        title={row.title}
        subtitle={`${row.businessName} · ${row.locationLabel}, ${row.provinceLabel}`}
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
            {can("listing.delete") && row.status === "ACTIVE" && (
              <Button size="sm" variant="danger" onClick={openRemove}>
                Remove
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <section className={CARD}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={row.status?.toLowerCase()} />
              <StatusBadge status={row.site?.toLowerCase()} />
            </div>

            {row.media?.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {row.media.map((m, i) => (
                  <figure key={m.id} className="relative aspect-square">
                    <MediaImage
                      fill
                      src={m.url}
                      alt={`Photo ${i + 1}`}
                      sizes="(min-width: 640px) 16vw, 33vw"
                      className="rounded-xl object-cover"
                    />
                  </figure>
                ))}
              </div>
            ) : (
              <p className="text-[13.5px] text-muted">No photos on this ad.</p>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                icon={Tag}
                label="Price"
                value={row.price > 0 ? `$${Number(row.price).toLocaleString()}` : "Free"}
              />
              <Stat icon={Eye} label="Views" value={row.viewCount.toLocaleString()} />
              <Stat icon={Heart} label="Saves" value={row.saveCount.toLocaleString()} />
              <Stat icon={MapPin} label="Province" value={row.provinceLabel} />
            </dl>

            {row.description && (
              <div className="mt-4">
                <h2 className="mb-1 text-[15px] font-extrabold text-ink">Description</h2>
                <p className="whitespace-pre-line text-[14px] leading-relaxed text-muted">
                  {row.description}
                </p>
              </div>
            )}
          </section>

          <section className={CARD}>
            <h2 className="mb-2 text-[17px] font-extrabold text-ink">Contact</h2>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-[12px] font-semibold text-muted">Email</dt>
                <dd className="text-[14px] text-ink">{row.contactEmail}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold text-muted">Phone</dt>
                <dd className="text-[14px] text-ink">{row.contactPhone}</dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className={CARD}>
            <h2 className="mb-3 text-[17px] font-extrabold text-ink">Seller</h2>
            {ownerId ? (
              <Link
                href={`/users/${ownerId}`}
                className="-mx-2 flex flex-col rounded-xl px-2 py-2 hover:bg-canvas"
              >
                <span className="truncate text-[15px] font-bold text-ink">{ownerName}</span>
                <span className="truncate text-[13px] text-muted">{ownerEmail}</span>
              </Link>
            ) : (
              <p className="text-[14px] text-muted">Owner account not found.</p>
            )}
          </section>

          <section className={CARD}>
            <h2 className="mb-1 text-[17px] font-extrabold text-ink">Timeline</h2>
            <dl className="flex flex-col gap-1.5 text-[13.5px]">
              <Row label="Created" value={dateLabel(row.createdAt)} />
              <Row label="Submitted" value={dateLabel(row.submittedAt)} />
              <Row label="Published" value={dateLabel(row.publishedAt)} />
              <Row label="Expires" value={dateLabel(row.expiresAt)} />
            </dl>
            {row.status !== "ACTIVE" && can("listing.delete") && (
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                Only active ads can be removed from here. Pending, reported and
                appealed ads are handled from the moderation queues.
              </p>
            )}
            {!can("listing.delete") && (
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                Your role can read this ad but not act on it.
              </p>
            )}
          </section>
        </div>
      </div>

      <Modal
        open={removing}
        title="Remove this ad"
        subtitle="Legal only while the ad is active. The reason is recorded on the audit log."
        size="max-w-md"
        onClose={() => setRemoving(false)}
        footer={
          <div className="flex gap-3">
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setRemoving(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              disabled={!reason.trim() || submitting}
              onClick={confirmRemove}
            >
              {submitting ? "Removing…" : "Remove"}
            </Button>
          </div>
        }
      >
        {actionError && (
          <p className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] font-medium text-danger">
            {actionError}
          </p>
        )}
        <Field label="Reason" hint="Required, shown in the audit log">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            autoFocus
            maxLength={80}
            placeholder="Contact details in the photos."
            className={`${FIELD} ${border(false)} resize-none`}
          />
        </Field>
      </Modal>
    </>
  );
}

function dateLabel(iso) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}

function Stat({ icon: Glyph, label, value }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
        <Glyph className="size-3.5" strokeWidth={2.6} aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[15px] font-bold text-ink">{value}</dd>
    </div>
  );
}
