"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import AdminHeader from "../components/admin/AdminHeader";
import DataTable from "../components/admin/DataTable";
import StatusBadge from "../components/admin/StatusBadge";
import SearchBar from "../components/ui/SearchBar";
import Button from "../components/ui/Button";
import MediaImage from "../components/media/MediaImage.jsx";
import { useAdminData } from "../context/AdminDataContext";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useToast } from "../context/ToastContext";
import { inScope, useQueryParam, useSiteScope } from "../lib/adminScope";
import { listingsFor } from "../lib/adminStore";
import { downloadCsv } from "../lib/csv";

/**
 * Sellers, personals profiles and account holders in one table, because a
 * moderator suspending someone does not first ask which of the three they are.
 * `kind` is a column, the same way `site` is.
 */

const EXPORT_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "kind", label: "Type" },
  { key: "site", label: "Site" },
  { key: "status", label: "Status" },
  { key: "verified", label: "Verified" },
  { key: "location", label: "Location" },
  { key: "joined", label: "Joined" },
  { key: "credits", label: "Credits" },
];

const KINDS = [
  { value: "all", label: "Everyone" },
  { value: "seller", label: "Sellers" },
  { value: "person", label: "Personals" },
  { value: "member", label: "Members" },
];

export default function Users() {
  const { state, dispatch } = useAdminData();
  const { can } = useAdminAuth();
  const toast = useToast();
  const router = useRouter();
  const [site] = useSiteScope();
  const [kind, setKind] = useQueryParam("kind");
  // In the URL alongside the type filter, so a filtered view is a link.
  const [query, setQuery] = useQueryParam("q", "");
  const [selected, setSelected] = useState([]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.users.filter((u) => {
      if (!inScope(u, site)) return false;
      if (kind !== "all" && u.kind !== kind) return false;
      if (!needle) return true;
      return (
        u.name.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle)
      );
    });
  }, [state.users, site, kind, query]);

  // The selection survives a filter change, so act only on what is still
  // visible — otherwise "suspend 12" quietly suspends someone off-screen.
  const visible = new Set(rows.map((r) => r.id));
  const batch = selected.filter((id) => visible.has(id));

  function bulk(type, verb) {
    batch.forEach((id) => dispatch({ type, id }));
    toast(`${batch.length} account${batch.length === 1 ? "" : "s"} ${verb}`);
    setSelected([]);
  }

  const columns = [
    {
      key: "name",
      label: "Account",
      render: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <MediaImage
            src={row.avatar}
            alt=""
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-full object-cover"
          />
          <div className="min-w-0">
            <p className="flex items-center gap-1 truncate font-bold text-ink">
              {row.name}
              {row.verified && (
                <BadgeCheck
                  className="size-4 shrink-0 text-brand"
                  strokeWidth={2.6}
                  aria-label="Verified"
                />
              )}
            </p>
            <p className="truncate text-[12.5px] text-muted">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "kind",
      label: "Type",
      width: 110,
      render: (row) => (
        <span className="capitalize text-muted">{row.kind}</span>
      ),
    },
    {
      key: "site",
      label: "Site",
      width: 120,
      render: (row) => <StatusBadge status={row.site} />,
    },
    { key: "location", label: "Location", width: 170 },
    {
      key: "ads",
      label: "Live ads",
      width: 100,
      value: (row) => listingsFor(state, row).length,
      render: (row) => listingsFor(state, row).length,
    },
    { key: "joined", label: "Joined", width: 90 },
    {
      key: "status",
      label: "Status",
      width: 120,
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "actions",
      label: "",
      width: 190,
      sortable: false,
      render: (row) => (
        <div className="flex justify-end gap-2">
          {can("user.verify") && !row.verified && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: "verifyUser", id: row.id });
                toast(`${row.name} verified`);
              }}
            >
              Verify
            </Button>
          )}
          {can("user.moderate") && (
            <Button
              size="sm"
              variant={row.status === "suspended" ? "outline" : "danger"}
              onClick={(e) => {
                e.stopPropagation();
                const suspend = row.status !== "suspended";
                dispatch({
                  type: suspend ? "suspendUser" : "unsuspendUser",
                  id: row.id,
                });
                toast(
                  suspend ? `${row.name} suspended` : `${row.name} restored`,
                );
              }}
            >
              {row.status === "suspended" ? "Restore" : "Suspend"}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <AdminHeader
        title="Users"
        subtitle={`${rows.length} account${rows.length === 1 ? "" : "s"} in this view`}
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv("vezlist-users.csv", EXPORT_COLUMNS, rows)
            }
          >
            Export CSV
          </Button>
        }
      />

      {batch.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-card bg-brand-soft px-4 py-3">
          <p className="mr-auto text-[14px] font-bold text-brand">
            {batch.length} selected
          </p>
          {can("user.verify") && (
            <Button size="sm" onClick={() => bulk("verifyUser", "verified")}>
              Verify
            </Button>
          )}
          {can("user.moderate") && (
            <>
              <Button
                size="sm"
                variant="danger"
                onClick={() => bulk("suspendUser", "suspended")}
              >
                Suspend
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulk("unsuspendUser", "restored")}
              >
                Restore
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search name or email..."
          className="lg:max-w-md lg:flex-1"
        />
        <div
          role="group"
          aria-label="Account type"
          className="flex w-fit gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line"
        >
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={kind === k.value}
              onClick={() => setKind(k.value)}
              className={`rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                kind === k.value
                  ? "bg-surface text-ink shadow-card"
                  : "text-muted hover:text-ink"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        onRowClick={(row) => router.push(`/users/${row.id}`)}
        empty={{
          icon: "User",
          title: "No accounts match",
          body: "Try another search, or widen the type filter.",
        }}
      />
    </>
  );
}
