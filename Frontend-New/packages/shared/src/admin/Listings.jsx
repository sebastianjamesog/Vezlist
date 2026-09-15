"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminHeader from "../components/admin/AdminHeader";
import DataTable from "../components/admin/DataTable";
import StatusBadge from "../components/admin/StatusBadge";
import SearchBar from "../components/ui/SearchBar";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import Field, { FIELD, border } from "../components/create/Field";
import MediaImage from "../components/media/MediaImage.jsx";
import { useAdminData } from "../context/AdminDataContext";
import { useToast } from "../context/ToastContext";
import { inScope, useQueryParam, useSiteScope } from "../lib/adminScope";
import { timeAgo } from "../lib/format";
import { downloadCsv } from "../lib/csv";

/**
 * The moderation queue. It is why the console exists, so it ships first and
 * gets the most affordances.
 *
 * Every filter lives in the URL. `?status=pending&site=personals` is a view a
 * second moderator can be sent, and a filter held in React state is not.
 */

const STATUSES = [
  { value: "all", label: "All" },
  { value: "pending", label: "In review" },
  { value: "active", label: "Active" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
];

const FLAGS = [
  { value: "all", label: "Any" },
  { value: "verified", label: "Verified" },
  { value: "boosted", label: "Boosted" },
];

const money = (n) => (n > 0 ? `$${n.toLocaleString()}` : "—");

/**
 * What goes in the export.
 *
 * Deliberately not the on-screen columns: a spreadsheet wants the id and the
 * raw numbers, not the thumbnail and the badge markup that make the table
 * readable.
 */
const EXPORT_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "title", label: "Title" },
  { key: "site", label: "Site" },
  { key: "status", label: "Status" },
  { key: "business", label: "Seller" },
  { key: "category", label: "Category" },
  { key: "location", label: "Area" },
  { key: "price", label: "Price" },
  { key: "views", label: "Views" },
  { key: "saves", label: "Saves" },
  { key: "verified", label: "Verified" },
  { key: "boosted", label: "Boosted" },
  { key: "rejectionReason", label: "Rejection reason" },
];

export default function Listings() {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const router = useRouter();

  const [site] = useSiteScope();
  const [status, setStatus] = useQueryParam("status");
  const [category, setCategory] = useQueryParam("cat");
  const [flag, setFlag] = useQueryParam("flag");
  // The search goes in the URL with the rest of them. A link that carries the
  // status and the site but drops the words you typed is half a queue view.
  const [query, setQuery] = useQueryParam("q", "");

  const [selected, setSelected] = useState([]);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");

  // Same clock `Tickets` runs, on the setting the "Review target" field in
  // Settings already writes: a listing still in review past that many hours
  // is the one about to become the ad nobody remembers submitting.
  const slaMs = (state.settings.reviewSlaHours ?? 2) * 3_600_000;
  const isOverdue = (row) =>
    row.status === "pending" && row.postedMsAgo > slaMs;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.listings.filter((l) => {
      if (!inScope(l, site)) return false;
      if (status !== "all" && l.status !== status) return false;
      if (category !== "all" && l.categoryId !== category) return false;
      if (flag === "verified" && !l.verified) return false;
      if (flag === "boosted" && !l.boosted) return false;
      if (!needle) return true;
      return (
        l.title.toLowerCase().includes(needle) ||
        l.business.toLowerCase().includes(needle) ||
        l.location.toLowerCase().includes(needle)
      );
    });
  }, [state.listings, site, status, category, flag, query]);

  // Bulk actions act on the selection, and the selection can outlive a filter
  // change — so approve only what is still on screen.
  const visible = new Set(rows.map((r) => r.id));
  const batch = selected.filter((id) => visible.has(id));

  function approveBatch() {
    batch.forEach((id) => dispatch({ type: "approve", id }));
    toast(`Approved ${batch.length} ad${batch.length === 1 ? "" : "s"}`);
    setSelected([]);
  }

  function confirmReject() {
    const ids = rejecting === "batch" ? batch : [rejecting];
    ids.forEach((id) => dispatch({ type: "reject", id, reason }));
    toast(`Rejected ${ids.length} ad${ids.length === 1 ? "" : "s"}`);
    setRejecting(null);
    setReason("");
    setSelected([]);
  }

  const columns = [
    {
      key: "title",
      label: "Ad",
      render: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <MediaImage
            src={row.image}
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0">
            <p className="truncate font-bold text-ink">{row.title}</p>
            <p className="truncate text-[12.5px] text-muted">
              {row.business} · {row.location}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "site",
      label: "Site",
      width: 120,
      render: (row) => <StatusBadge status={row.site} />,
    },
    {
      key: "category",
      label: "Category",
      width: 150,
      render: (row) => (
        <span className="text-muted">
          {row.personalsCategory ?? row.category}
        </span>
      ),
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
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={row.status} />
          {row.boosted && <StatusBadge status="boosted" />}
          {isOverdue(row) && <StatusBadge status="rejected" label="Overdue" />}
        </div>
      ),
    },
    {
      key: "views",
      label: "Views",
      width: 90,
      render: (row) => row.views.toLocaleString(),
    },
    {
      key: "postedMsAgo",
      label: "Posted",
      width: 120,
      render: (row) => (
        <span className="text-muted">{timeAgo(row.postedMsAgo)}</span>
      ),
    },
  ];

  return (
    <>
      <AdminHeader
        title="Listings"
        subtitle={`${rows.length} of ${state.listings.length} ads across both sites`}
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv("vezlist-listings.csv", EXPORT_COLUMNS, rows)
            }
          >
            Export CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search title, seller or area..."
          className="lg:max-w-md"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Chips
            options={STATUSES}
            value={status}
            onChange={setStatus}
            label="Status"
          />
          <Chips options={FLAGS} value={flag} onChange={setFlag} label="Flag" />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
            className="h-9 rounded-xl border border-line bg-surface px-3 text-[13px] font-semibold text-ink outline-none"
          >
            <option value="all">All categories</option>
            {state.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
            {/* Personals posts carry a categoryId the marketplace taxonomy
                does not list, so it is offered on its own. */}
            <option value="personals">Personals</option>
          </select>
        </div>
      </div>

      {batch.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-card bg-brand-soft px-4 py-3">
          <p className="mr-auto text-[14px] font-bold text-brand">
            {batch.length} selected
          </p>
          <Button size="sm" onClick={approveBatch}>
            Approve
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => setRejecting("batch")}
          >
            Reject
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        onRowClick={(row) => router.push(`/listings/${row.id}`)}
        initialSort={{ key: "postedMsAgo", dir: "desc" }}
        empty={{
          icon: "SearchX",
          title: "No ads match",
          body: "Loosen a filter, or clear the search.",
        }}
      />

      <Modal
        open={Boolean(rejecting)}
        title="Reject this ad"
        subtitle="The reason is what the seller and the audit log both see, so write it for them."
        size="max-w-md"
        onClose={() => setRejecting(null)}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setRejecting(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              disabled={!reason.trim()}
              onClick={confirmReject}
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
    </>
  );
}

/** A one-of-many filter, rendered as chips rather than a second select. */
function Chips({ options, value, onChange, label }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-colors ${
            value === o.value
              ? "bg-surface text-ink shadow-card"
              : "text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
