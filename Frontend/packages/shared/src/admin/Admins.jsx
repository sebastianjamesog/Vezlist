"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import DataTable from "../components/admin/DataTable";
import {
  TableHeaderSkeleton,
  TableRowSkeleton,
} from "../components/ui/Skeleton";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import { useAdminAuth } from "../context/AdminAuthContext";
import { PERMISSIONS, ROLE_LIST, can } from "../lib/adminRoles";
import * as adminUsersApi from "../lib/api/adminUsers";
import { ApiError } from "../lib/api/client";

/**
 * Who can get into the console: every account with a MODERATOR or ADMIN
 * role, drawn from `GET /api/v1/admin/users?staffOnly=true` — there is no dedicated "admins" endpoint, and the backend
 * has no way to grant or revoke a role from here, so this is a read-only
 * roster rather than the old mock's add/edit/remove screen.
 */

const STAFF_ROLES = new Set(["MODERATOR", "ADMIN"]);

function messageFor(error) {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Check your connection and try again.";
}

/** Load all staff pages without scanning ordinary member accounts. */
async function fetchStaff() {
  let cursor;
  const staff = [];
  const seen = new Set();
  while (true) {
    const page = await adminUsersApi.listAdminUsers({
      cursor,
      limit: 100,
      staffOnly: true,
    });
    for (const u of page.items) {
      if (u.roles.some((r) => STAFF_ROLES.has(r))) staff.push(u);
    }
    if (!page.hasMore) break;
    if (!page.nextCursor || seen.has(page.nextCursor))
      throw new Error("Could not continue loading staff accounts.");
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  return staff;
}

export default function Admins() {
  const { admin } = useAdminAuth();
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState(null);

  const allowed = can(admin?.role, "admins.manage");

  function load() {
    setError(null);
    setStaff(null);
    fetchStaff()
      .then(setStaff)
      .catch((err) => setError(messageFor(err)));
  }

  useEffect(() => {
    if (allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  if (!allowed) {
    return (
      <>
        <AdminHeader title="Admins" />
        <EmptyState
          icon="Lock"
          title="Owners only"
          body="Your role can use the console but not decide who else can. Ask an owner if you need someone added."
        />
      </>
    );
  }

  const columns = [
    {
      key: "displayName",
      label: "Admin",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-bold text-ink">{row.displayName}</p>
          <p className="truncate text-[12.5px] text-muted">{row.email}</p>
        </div>
      ),
    },
    {
      key: "roles",
      label: "Role",
      width: 160,
      sortable: false,
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.roles
            .filter((r) => STAFF_ROLES.has(r))
            .map((r) => (
              <span
                key={r}
                className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[12px] font-semibold text-brand"
              >
                <ShieldCheck className="size-3.5" strokeWidth={2.6} />
                {r}
              </span>
            ))}
        </div>
      ),
    },
    {
      key: "createdAt",
      label: "Since",
      width: 110,
      value: (row) => row.createdAt,
      render: (row) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      key: "enabled",
      label: "Status",
      width: 100,
      render: (row) => (
        <span
          className={`text-[13px] font-semibold ${row.enabled ? "text-emerald-700" : "text-red-700"}`}
        >
          {row.enabled ? "Active" : "Suspended"}
        </span>
      ),
    },
  ];

  return (
    <>
      <AdminHeader
        title="Admins"
        subtitle={
          staff
            ? `${staff.length} account${staff.length === 1 ? "" : "s"} hold a staff role`
            : undefined
        }
      />

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-16 text-center shadow-card">
          <p className="text-[15px] font-semibold text-ink">
            Couldn't load admins
          </p>
          <p className="max-w-xs text-[13px] text-muted">{error}</p>
          <Button onClick={load}>Try again</Button>
        </div>
      ) : staff === null ? (
        <div className="overflow-hidden rounded-card bg-surface shadow-card">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <TableHeaderSkeleton columns={columns.length} />
            </thead>
            <tbody>
              {Array.from({ length: 3 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={columns.length} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={staff}
          empty={{
            icon: "User",
            title: "No staff accounts",
            body: "Nobody holds a MODERATOR or ADMIN role yet.",
          }}
        />
      )}

      <section className={`${CARD} mt-4`}>
        <h2 className="mb-1 flex items-center gap-2 text-[17px] font-extrabold text-ink">
          <ShieldCheck className="size-5 text-brand" strokeWidth={2.4} />
          What each role may do
        </h2>
        <p className="mb-3 text-[13px] leading-relaxed text-muted">
          This console's own permission model, layered on top of the backend's
          MODERATOR/ADMIN roles above — checked here to grey out a button and
          again wherever that button's action is sent.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="pb-2 font-bold text-muted">
                  Permission
                </th>
                {ROLE_LIST.map((r) => (
                  <th
                    key={r.id}
                    scope="col"
                    className="pb-2 text-center font-bold text-muted"
                  >
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(PERMISSIONS).map((permission) => (
                <tr
                  key={permission}
                  className="border-b border-line last:border-0"
                >
                  <td className="py-1.5 text-ink">{permission}</td>
                  {ROLE_LIST.map((r) => (
                    <td key={r.id} className="py-1.5 text-center">
                      {can(r.id, permission) ? (
                        <span
                          className="font-bold text-emerald-600"
                          aria-label="yes"
                        >
                          ✓
                        </span>
                      ) : (
                        <span className="text-muted" aria-label="no">
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
