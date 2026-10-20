"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import AdminHeader from "../components/admin/AdminHeader";
import DataTable from "../components/admin/DataTable";
import StatusBadge from "../components/admin/StatusBadge";
import {
  TableHeaderSkeleton,
  TableRowSkeleton,
} from "../components/ui/Skeleton";
import SearchBar from "../components/ui/SearchBar";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useToast } from "../context/ToastContext";
import { useQueryParam } from "../lib/adminScope";
import { downloadCsv } from "../lib/csv";
import * as adminUsersApi from "../lib/api/adminUsers";
import { ApiError } from "../lib/api/client";

/**
 * Every account the platform knows about, from `GET /api/v1/admin/users`.
 * Suspend/reinstate are the only mutations the backend exposes here — no
 * verify, no credit adjustment, no bulk actions — so this screen offers
 * exactly those two and nothing the API can't back up.
 */

const EXPORT_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "displayName", label: "Name" },
  { key: "email", label: "Email" },
  { key: "roles", label: "Roles", value: (row) => row.roles.join(", ") },
  { key: "listingCount", label: "Listings" },
  {
    key: "createdAt",
    label: "Joined",
    value: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
  {
    key: "enabled",
    label: "Status",
    value: (row) => (row.enabled ? "Active" : "Suspended"),
  },
];

function messageFor(error) {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Check your connection and try again.";
}

export default function Users() {
  const { can } = useAdminAuth();
  const toast = useToast();
  const router = useRouter();
  // In the URL, so a search is a link a moderator can hand off.
  const [query, setQuery] = useQueryParam("q", "");
  const [typed, setTyped] = useState(query);

  const generation = useRef(0);
  const [page, setPage] = useState(null); // AdminUserPageResponse, or null while loading
  const [error, setError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [suspending, setSuspending] = useState(null); // the row being suspended
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reinstating, setReinstating] = useState(null); // the row being reinstated

  // Debounce the query going into the URL/request; the input itself stays
  // instant so typing never stutters.
  useEffect(() => {
    const t = setTimeout(() => setQuery(typed), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  function load() {
    const version = ++generation.current;
    setLoadingMore(false);
    setError(null);
    setPage(null);
    adminUsersApi
      .listAdminUsers({ query, limit: 25 })
      .then((result) => {
        if (version === generation.current) setPage(result);
      })
      .catch((err) => {
        if (version === generation.current) setError(messageFor(err));
      });
  }

  useEffect(() => {
    load();
    return () => {
      generation.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function loadMore() {
    if (!page?.hasMore || loadingMore) return;
    const version = generation.current;
    setLoadingMore(true);
    adminUsersApi
      .listAdminUsers({ query, cursor: page.nextCursor, limit: 25 })
      .then((next) =>
        setPage((prev) =>
          version === generation.current && prev
            ? {
                ...next,
                items: [...prev.items, ...next.items],
              }
            : prev,
        ),
      )
      .catch((err) => toast(messageFor(err)))
      .finally(() => {
        if (version === generation.current) setLoadingMore(false);
      });
  }

  function patchRow(updated) {
    setPage((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((u) =>
              u.id === updated.id ? { ...u, ...updated } : u,
            ),
          }
        : prev,
    );
  }

  async function confirmSuspend() {
    if (!reason.trim() || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const updated = await adminUsersApi.suspendAdminUser(
        suspending.id,
        reason.trim(),
      );
      patchRow(updated);
      toast(`${suspending.displayName} suspended`);
      setSuspending(null);
      setReason("");
    } catch (err) {
      setActionError(messageFor(err));
    } finally {
      setSaving(false);
    }
  }

  async function confirmReinstate() {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await adminUsersApi.reinstateAdminUser(reinstating.id);
      patchRow(updated);
      toast(`${reinstating.displayName} reinstated`);
      setReinstating(null);
    } catch (err) {
      toast(messageFor(err));
    } finally {
      setSaving(false);
    }
  }

  const rows = page?.items ?? [];

  const columns = [
    {
      key: "displayName",
      label: "Account",
      render: (row) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate font-bold text-ink">
            {row.displayName}
            {row.emailVerified && (
              <BadgeCheck
                className="size-4 shrink-0 text-brand"
                strokeWidth={2.6}
                aria-label="Email verified"
              />
            )}
          </p>
          <p className="truncate text-[12.5px] text-muted">{row.email}</p>
        </div>
      ),
    },
    {
      key: "roles",
      label: "Roles",
      width: 160,
      sortable: false,
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.roles.map((r) => (
            <span
              key={r}
              className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold uppercase text-muted"
            >
              {(r === "ADMIN" || r === "MODERATOR") && (
                <ShieldCheck className="size-3" strokeWidth={2.6} />
              )}
              {r}
            </span>
          ))}
        </div>
      ),
    },
    { key: "listingCount", label: "Listings", width: 90 },
    {
      key: "createdAt",
      label: "Joined",
      width: 110,
      value: (row) => row.createdAt,
      render: (row) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      key: "enabled",
      label: "Status",
      width: 110,
      render: (row) => (
        <StatusBadge status={row.enabled ? "active" : "suspended"} />
      ),
    },
    {
      key: "actions",
      label: "",
      width: 130,
      sortable: false,
      render: (row) =>
        can("user.moderate") && (
          <div className="flex justify-end">
            {row.enabled ? (
              <Button
                size="sm"
                variant="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  setActionError(null);
                  setReason("");
                  setSuspending(row);
                }}
              >
                Suspend
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setReinstating(row);
                }}
              >
                Reinstate
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
        subtitle={
          page
            ? `${page.totalCount} account${page.totalCount === 1 ? "" : "s"} match this search`
            : undefined
        }
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

      <div className="mb-4">
        <SearchBar
          value={typed}
          onChange={setTyped}
          placeholder="Search name or email..."
          className="lg:max-w-md"
        />
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-16 text-center shadow-card">
          <p className="text-[15px] font-semibold text-ink">
            Couldn't load users
          </p>
          <p className="max-w-xs text-[13px] text-muted">{error}</p>
          <Button onClick={load}>Try again</Button>
        </div>
      ) : page === null ? (
        <div className="overflow-hidden rounded-card bg-surface shadow-card">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <TableHeaderSkeleton columns={columns.length} />
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={columns.length} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            onRowClick={(row) => router.push(`/users/${row.id}`)}
            empty={{
              icon: "User",
              title: "No accounts match",
              body: "Try another search.",
            }}
          />
          {page.hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}

      <Modal
        open={Boolean(suspending)}
        title={`Suspend ${suspending?.displayName ?? ""}?`}
        subtitle="They lose the ability to sign in or post while suspended. Reinstating undoes it."
        size="max-w-md"
        onClose={() => !saving && setSuspending(null)}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              disabled={saving}
              onClick={() => setSuspending(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              disabled={!reason.trim() || saving}
              onClick={confirmSuspend}
            >
              {saving ? "Suspending..." : "Suspend"}
            </Button>
          </div>
        }
      >
        <Field label="Reason" hint="Required" error={actionError}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
            maxLength={200}
            placeholder="Asked a buyer to pay by gift card."
            className={`${FIELD} ${border(Boolean(actionError))} resize-none`}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(reinstating)}
        title={`Reinstate ${reinstating?.displayName ?? ""}?`}
        body="They can sign in and post again immediately."
        confirmLabel={saving ? "Reinstating..." : "Reinstate"}
        onClose={() => !saving && setReinstating(null)}
        onConfirm={confirmReinstate}
      />
    </>
  );
}
