"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminHeader from "../components/admin/AdminHeader";
import DataTable from "../components/admin/DataTable";
import StatusBadge from "../components/admin/StatusBadge";
import EmptyState from "../components/ui/EmptyState";
import SearchBar from "../components/ui/SearchBar";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useToast } from "../context/ToastContext";
import { useQueryParam, useSiteScope } from "../lib/adminScope";
import { ApiError } from "../lib/api/client.js";
import { browseListings, removeListing } from "../lib/api/adminListings.js";
import { downloadCsv } from "../lib/csv";

/**
 * The admin-wide listings browse, over `GET /api/v1/admin/listings` —
 * every listing regardless of owner, not the moderation review queue (that's
 * `Reports`/`Appeals`, over the case-based staff API).
 *
 * The backend's summary row (`AdminListingSummaryResponse`) does not carry
 * `verified`/`boosted`/view counts the old mock invented — there is no such
 * concept on the server, so those columns and filters are gone rather than
 * faked. The one write this screen (and `AdminListingController`) actually
 * offers is `remove`, and only from `ACTIVE` — the backend answers 409
 * otherwise, shown inline rather than crashing.
 */

const STATUSES = [
  { value: "all", label: "All" },
  { value: "PENDING_REVIEW", label: "In review" },
  { value: "ACTIVE", label: "Active" },
  { value: "REJECTED", label: "Rejected" },
  { value: "REMOVED", label: "Removed" },
  { value: "EXPIRED", label: "Expired" },
];

const SITE_TO_SCOPE = { marketplace: "MARKETPLACE", personals: "PERSONALS" };

const money = (n) => (n > 0 ? `$${Number(n).toLocaleString()}` : "—");

const dateLabel = (iso) => (iso ? new Date(iso).toLocaleDateString() : "—");

const EXPORT_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "title", label: "Title" },
  { key: "site", label: "Site" },
  { key: "status", label: "Status" },
  { key: "businessName", label: "Seller" },
  { key: "ownerEmail", label: "Owner email" },
  { key: "categoryLabel", label: "Category" },
  { key: "price", label: "Price" },
  { key: "createdAt", label: "Created" },
];

export default function Listings() {
  const { can } = useAdminAuth();
  const toast = useToast();
  const router = useRouter();

  const [site] = useSiteScope();
  const [status, setStatus] = useQueryParam("status", "all");
  const [category, setCategory] = useQueryParam("cat", "all");
  const [query, setQuery] = useQueryParam("q", "");

  const [rows, setRows] = useState(null); // null while loading
  const [error, setError] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const [selected, setSelected] = useState([]);
  const [removing, setRemoving] = useState(null); // { row } | { batch: true }
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const request = useRef(0);

  const siteScope = SITE_TO_SCOPE[site];

  const load = useCallback(async () => {
    const version = ++request.current;
    setError(null);
    setRows(null);
    setLoadingMore(false);
    setSelected([]);
    try {
      const page = await browseListings({
        site: siteScope,
        status: status === "all" ? undefined : status,
        query: query.trim() || undefined,
        limit: 50,
      });
      if (version !== request.current) return;
      setRows(page.items);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setTotalCount(page.totalCount);
    } catch (err) {
      if (version === request.current) setError(err);
    }
  }, [siteScope, status, query]);

  // Debounced: a search box firing one request per keystroke is not what
  // "search" should cost against a real API.
  useEffect(() => {
    request.current += 1;
    const t = setTimeout(load, query ? 300 : 0);
    return () => { clearTimeout(t); request.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteScope, status, query]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const version = request.current;
    setLoadingMore(true);
    try {
      const page = await browseListings({
        site: siteScope,
        status: status === "all" ? undefined : status,
        query: query.trim() || undefined,
        cursor,
        limit: 50,
      });
      if (version !== request.current) return;
      setRows((prev) => [...(prev ?? []), ...page.items]);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch {
      if (version === request.current) toast("Couldn't load more listings");
    } finally {
      setLoadingMore(false);
    }
  }

  // Category has no server-side filter on this endpoint — narrowed against
  // whatever page is already loaded, not the whole table.
  const visible = useMemo(() => {
    if (!rows) return [];
    if (category === "all") return rows;
    return rows.filter((r) => r.categoryId === category);
  }, [rows, category]);

  const categoryOptions = useMemo(() => {
    const seen = new Map();
    (rows ?? []).forEach((r) => {
      if (r.categoryId && !seen.has(r.categoryId)) seen.set(r.categoryId, r.categoryLabel);
    });
    return [...seen.entries()];
  }, [rows]);

  const visibleIds = new Set(visible.map((r) => r.id));
  const batchIds = selected.filter((id) => visibleIds.has(id));
  const batchRows = visible.filter((r) => batchIds.includes(r.id));
  const removableBatch = batchRows.filter((r) => r.status === "ACTIVE");

  function openRemove(target) {
    setReason("");
    setActionError(null);
    setRemoving(target);
  }

  async function confirmRemove() {
    if (submitting || !removing || !reason.trim()) return;
    setSubmitting(true);
    try { await removeTargets(); } finally { setSubmitting(false); }
  }

  async function removeTargets() {
    setActionError(null);
    const targets = removing.batch ? removableBatch : [removing.row];

    // A single removal that fails stays open with the real reason (a 409
    // race — someone else already acted on it — reads very differently from
    // "something went wrong"); a batch reports its tally instead, since
    // stopping the whole modal on one conflict would strand the rest.
    if (targets.length === 1) {
      try {
        await removeListing(targets[0].id, reason.trim());
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : "Couldn't remove this ad.");
        return;
      }
      setRemoving(null);
      setReason("");
      toast("Ad removed");
      load();
      return;
    }

    let failed = 0;
    for (const row of targets) {
      try {
        await removeListing(row.id, reason.trim());
      } catch {
        failed += 1;
      }
    }
    setRemoving(null);
    setReason("");
    load();
    toast(
      failed
        ? `Removed ${targets.length - failed} of ${targets.length} — ${failed} failed`
        : `Removed ${targets.length} ads`,
    );
  }

  const columns = [
    {
      key: "title",
      label: "Ad",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-bold text-ink">{row.title}</p>
          <p className="truncate text-[12.5px] text-muted">
            {row.businessName} · {row.ownerEmail}
          </p>
        </div>
      ),
    },
    {
      key: "site",
      label: "Site",
      width: 120,
      render: (row) => <StatusBadge status={row.site?.toLowerCase()} />,
    },
    {
      key: "categoryLabel",
      label: "Category",
      width: 150,
      render: (row) => <span className="text-muted">{row.categoryLabel}</span>,
    },
    {
      key: "price",
      label: "Price",
      width: 100,
      render: (row) => money(row.price),
    },
    {
      key: "status",
      label: "Status",
      width: 130,
      render: (row) => <StatusBadge status={row.status?.toLowerCase()} />,
    },
    {
      key: "createdAt",
      label: "Created",
      width: 120,
      render: (row) => <span className="text-muted">{dateLabel(row.createdAt)}</span>,
    },
    {
      key: "actions",
      label: "",
      width: 100,
      sortable: false,
      render: (row) =>
        can("listing.delete") && row.status === "ACTIVE" ? (
          <Button
            size="sm"
            variant="danger"
            onClick={(e) => {
              e.stopPropagation();
              openRemove({ row });
            }}
          >
            Remove
          </Button>
        ) : null,
    },
  ];

  if (error) {
    return (
      <>
        <AdminHeader title="Listings" />
        <EmptyState
          icon="ShieldAlert"
          title="Couldn't load listings"
          body={error instanceof ApiError ? error.message : "Something went wrong."}
          action={<Button onClick={load}>Try again</Button>}
        />
      </>
    );
  }

  return (
    <>
      <AdminHeader
        title="Listings"
        subtitle={
          rows
            ? `${visible.length} of ${totalCount} ad${totalCount === 1 ? "" : "s"}${hasMore ? " (use Load more for additional ads)" : ""}`
            : "Loading…"
        }
        actions={
          <div className="flex flex-wrap gap-2">
          <Button to={site === "all" ? "/reviews" : `/reviews?site=${site}`} size="sm" variant="outline">Review queue</Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!visible.length}
            onClick={() => downloadCsv("vezlist-listings.csv", EXPORT_COLUMNS, visible)}
          >
            Export CSV
          </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search title or seller..."
          className="lg:max-w-md"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Chips options={STATUSES} value={status} onChange={setStatus} label="Status" />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
            className="h-9 rounded-xl border border-line bg-surface px-3 text-[13px] font-semibold text-ink outline-none"
          >
            <option value="all">All loaded categories</option>
            {categoryOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {batchIds.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-card bg-brand-soft px-4 py-3">
          <p className="mr-auto text-[14px] font-bold text-brand">
            {batchIds.length} selected
          </p>
          {can("listing.delete") && (
            <Button
              size="sm"
              variant="danger"
              disabled={!removableBatch.length}
              onClick={() => openRemove({ batch: true })}
            >
              Remove {removableBatch.length ? `(${removableBatch.length} active)` : ""}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}

      {rows === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-card bg-canvas shadow-card" />
          ))}
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={visible}
            selectable
            selected={selected}
            onSelectedChange={setSelected}
            onRowClick={(row) => router.push(`/listings/${row.id}`)}
            empty={{
              icon: "SearchX",
              title: "No ads match",
              body: "Loosen a filter, or clear the search.",
            }}
          />
          {hasMore && (
            <div className="mt-3 flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}

      <Modal
        open={Boolean(removing)}
        title={removing?.batch ? `Remove ${removableBatch.length} ads` : "Remove this ad"}
        subtitle="Only active ads can be removed. The reason is recorded on the audit log."
        size="max-w-md"
        onClose={() => !submitting && setRemoving(null)}
        footer={
          <div className="flex gap-3">
            <Button variant="outline" size="lg" className="flex-1" disabled={submitting} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              disabled={!reason.trim() || submitting}
              onClick={confirmRemove}
            >
              Remove
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

/** A one-of-many filter, rendered as chips rather than a second select. */
function Chips({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-colors ${
            value === o.value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
