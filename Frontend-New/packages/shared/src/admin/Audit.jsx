"use client";

import { useMemo } from "react";
import AdminHeader from "../components/admin/AdminHeader";
import DataTable from "../components/admin/DataTable";
import StatusBadge from "../components/admin/StatusBadge";
import SearchBar from "../components/ui/SearchBar";
import Button from "../components/ui/Button";
import { useAdminData } from "../context/AdminDataContext";
import { useQueryParam } from "../lib/adminScope";
import { statementDate } from "../lib/format";
import { downloadCsv } from "../lib/csv";

/**
 * The full audit trail — every write the console has made, newest first.
 *
 * The dashboard shows the top 7 of `state.audit` as a "what just happened"
 * glance; this is the screen that glance links out to when the question is
 * "show me everything Priya did to this ad" rather than "what happened
 * lately". Filters live in the URL, the same rule every other list screen
 * follows: a filtered view here is a link a second admin can be sent.
 *
 * Not scoped to a site — an audit entry has no `site` of its own (a reset or
 * a settings change belongs to neither board), so unlike Listings or Users
 * this table is not cut in half by the top bar's switcher.
 */

const EXPORT_COLUMNS = [
  { key: "at", label: "Date", value: (r) => statementDate(r.at) },
  { key: "actor", label: "Actor" },
  { key: "action", label: "Action" },
  { key: "entity", label: "Entity" },
  { key: "entityId", label: "Entity ID" },
  { key: "note", label: "Note" },
];

export default function Audit() {
  const { state } = useAdminData();

  const [actor, setActor] = useQueryParam("actor", "all");
  const [action, setAction] = useQueryParam("action", "all");
  const [entity, setEntity] = useQueryParam("entity", "all");
  // Plain `YYYY-MM-DD` strings straight out of `<input type="date">` — parsed
  // against UTC midnight so a filter typed once means the same day whatever
  // time zone the browser making the request happens to sit in.
  const [from, setFrom] = useQueryParam("from", "");
  const [to, setTo] = useQueryParam("to", "");
  const [query, setQuery] = useQueryParam("q", "");

  // Options are derived from the data rather than hard-coded: a new action or
  // entity added to the reducer shows up here on its own, the same way a new
  // category shows up in Listings' filter without this screen changing.
  const actors = useMemo(
    () => [...new Set(state.audit.map((a) => a.actor))].sort(),
    [state.audit],
  );
  const actions = useMemo(
    () => [...new Set(state.audit.map((a) => a.action))].sort(),
    [state.audit],
  );
  const entities = useMemo(
    () => [...new Set(state.audit.map((a) => a.entity))].sort(),
    [state.audit],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const fromMs = from ? Date.parse(`${from}T00:00:00.000Z`) : null;
    // Inclusive of the whole day picked, not just its first millisecond.
    const toMs = to ? Date.parse(`${to}T23:59:59.999Z`) : null;

    return state.audit.filter((entry) => {
      if (actor !== "all" && entry.actor !== actor) return false;
      if (action !== "all" && entry.action !== action) return false;
      if (entity !== "all" && entry.entity !== entity) return false;
      if (fromMs !== null && entry.at < fromMs) return false;
      if (toMs !== null && entry.at > toMs) return false;
      if (!needle) return true;
      return (
        entry.actor.toLowerCase().includes(needle) ||
        entry.action.toLowerCase().includes(needle) ||
        String(entry.entityId ?? "")
          .toLowerCase()
          .includes(needle) ||
        (entry.note ?? "").toLowerCase().includes(needle)
      );
    });
  }, [state.audit, actor, action, entity, from, to, query]);

  const columns = [
    {
      key: "at",
      label: "When",
      width: 140,
      render: (row) => (
        <span className="text-muted">{statementDate(row.at)}</span>
      ),
    },
    {
      key: "actor",
      label: "Actor",
      width: 160,
      render: (row) => <span className="font-bold text-ink">{row.actor}</span>,
    },
    {
      key: "action",
      label: "Action",
      width: 150,
    },
    {
      key: "entity",
      label: "Entity",
      width: 130,
      render: (row) => <StatusBadge status={row.entity} />,
    },
    {
      key: "entityId",
      label: "Entity ID",
      width: 140,
      render: (row) => (
        <span className="font-mono text-[12.5px] text-muted">
          {row.entityId ?? ""}
        </span>
      ),
    },
    {
      key: "note",
      label: "Note",
      render: (row) => (
        <span className="line-clamp-2 text-muted">{row.note}</span>
      ),
    },
  ];

  return (
    <>
      <AdminHeader
        title="Audit log"
        subtitle={`${rows.length} of ${state.audit.length} entries`}
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv("vezlist-audit.csv", EXPORT_COLUMNS, rows)
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
          placeholder="Search actor, action, entity or note..."
          className="lg:max-w-md"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Select
            label="Actor"
            value={actor}
            onChange={setActor}
            options={actors}
          />
          <Select
            label="Action"
            value={action}
            onChange={setAction}
            options={actions}
          />
          <Select
            label="Entity"
            value={entity}
            onChange={setEntity}
            options={entities}
          />
          <DateField label="From" value={from} onChange={setFrom} />
          <DateField label="To" value={to} onChange={setTo} />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        initialSort={{ key: "at", dir: "desc" }}
        empty={{
          icon: "Clock",
          title: "No entries match",
          body: "Loosen a filter, or clear the search.",
        }}
      />
    </>
  );
}

/** One filter dropdown, options built from whatever the data actually holds. */
function Select({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="h-9 rounded-xl border border-line bg-surface px-3 text-[13px] font-semibold text-ink outline-none"
    >
      <option value="all">{`All ${label.toLowerCase()}s`}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function DateField({ label, value, onChange }) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13px] font-semibold text-ink">
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} date`}
        className="bg-transparent text-[13px] font-medium text-ink outline-none"
      />
    </label>
  );
}
