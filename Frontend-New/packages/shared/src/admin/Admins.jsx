"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import DataTable from "../components/admin/DataTable";
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
import { PERMISSIONS, ROLE_LIST, can } from "../lib/adminRoles";

/**
 * Who can get into the console, and what each of them may do.
 *
 * Owner-only, and gated twice: this screen refuses to render its controls for
 * anyone else, and the reducer refuses the actions regardless of what the
 * screen offers.
 */

const EMPTY = { name: "", email: "", role: "support" };

export default function Admins() {
  const { state, dispatch } = useAdminData();
  const { admin } = useAdminAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);

  const allowed = can(admin?.role, "admins.manage");
  const owners = state.admins.filter((a) => a.role === "owner");

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

  function save() {
    const clash = state.admins.find(
      (a) =>
        a.email === editing.email.trim().toLowerCase() && a.id !== editing.id,
    );
    if (clash) {
      toast("That email already has an account");
      return;
    }
    dispatch({ type: "upsertAdmin", admin: editing });
    toast(editing.id ? "Admin updated" : "Admin added");
    setEditing(null);
  }

  const columns = [
    {
      key: "name",
      label: "Admin",
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
            <p className="truncate font-bold text-ink">
              {row.name}
              {row.id === admin?.id && (
                <span className="ml-1.5 text-[12px] font-semibold text-muted">
                  you
                </span>
              )}
            </p>
            <p className="truncate text-[12.5px] text-muted">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      label: "Role",
      width: 140,
      render: (row) => (
        <StatusBadge
          status={row.role === "owner" ? "verified" : "marketplace"}
          label={ROLE_LIST.find((r) => r.id === row.role)?.label ?? row.role}
        />
      ),
    },
    { key: "joined", label: "Since", width: 100 },
    {
      key: "actions",
      label: "",
      width: 170,
      sortable: false,
      render: (row) => {
        // The last owner cannot be removed, and nobody can remove themselves —
        // both roads end with a console nobody can administer.
        const lastOwner = row.role === "owner" && owners.length <= 1;
        const isMe = row.id === admin?.id;
        return (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setEditing({ ...row });
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={lastOwner || isMe}
              title={
                lastOwner
                  ? "The last owner cannot be removed"
                  : isMe
                    ? "You cannot remove yourself"
                    : undefined
              }
              onClick={(e) => {
                e.stopPropagation();
                setRemoving(row);
              }}
            >
              Remove
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <AdminHeader
        title="Admins"
        subtitle={`${state.admins.length} people can sign in to this console`}
        actions={
          <Button size="sm" onClick={() => setEditing({ ...EMPTY })}>
            Add admin
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={state.admins}
        empty={{ icon: "User", title: "No admins" }}
      />

      <section className={`${CARD} mt-4`}>
        <h2 className="mb-1 flex items-center gap-2 text-[17px] font-extrabold text-ink">
          <ShieldCheck className="size-5 text-brand" strokeWidth={2.4} />
          What each role may do
        </h2>
        <p className="mb-3 text-[13px] leading-relaxed text-muted">
          Checked here and again in the reducer. Hiding a button stops the
          button, not the action behind it — so both ends enforce this.
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

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? "Edit admin" : "Add an admin"}
        subtitle="They sign in with this email. Any eight-character password is accepted — there is no server checking it."
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
              disabled={!editing?.name.trim() || !editing?.email.trim()}
              onClick={save}
            >
              Save
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <input
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
                autoFocus
                placeholder="Dana Whitfield"
                className={`${FIELD} ${border(false)}`}
              />
            </Field>
            <Field label="Work email">
              <input
                type="email"
                value={editing.email}
                onChange={(e) =>
                  setEditing({ ...editing, email: e.target.value })
                }
                placeholder="dana@vezlist.cc"
                className={`${FIELD} ${border(false)}`}
              />
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-[14px] font-bold text-ink">
                Role
              </legend>
              <div className="flex flex-col gap-2">
                {ROLE_LIST.map((r) => (
                  <label
                    key={r.id}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                      editing.role === r.id
                        ? "border-brand bg-brand-soft"
                        : "border-line hover:bg-canvas"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      checked={editing.role === r.id}
                      onChange={() => setEditing({ ...editing, role: r.id })}
                      className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-bold text-ink">
                        {r.label}
                      </span>
                      <span className="block text-[12.5px] leading-snug text-muted">
                        {r.blurb}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        title={`Remove ${removing?.name}?`}
        body="They lose access to the console immediately. Any tickets assigned to them go back to the unassigned pile."
        confirmLabel="Remove"
        destructive
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          dispatch({ type: "removeAdmin", id: removing.id });
          toast(`${removing.name} removed`);
          setRemoving(null);
        }}
      />
    </>
  );
}
