"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import StatusBadge from "../components/admin/StatusBadge";
import { Skeleton, SkeletonGroup } from "../components/ui/Skeleton";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import EmptyState from "../components/ui/EmptyState";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useToast } from "../context/ToastContext";
import * as adminUsersApi from "../lib/api/adminUsers";
import { ApiError } from "../lib/api/client";

function messageFor(error) {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Check your connection and try again.";
}

/** One account: identity, role, listing counts, and the suspend/reinstate control. */
export default function UserDetail() {
  const { id } = useParams();
  const generation = useRef(0);
  const { can } = useAdminAuth();
  const toast = useToast();

  const [user, setUser] = useState(null); // AdminUserDetailResponse, or null while loading
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const [suspending, setSuspending] = useState(false);
  const [reinstating, setReinstating] = useState(false);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState(null);
  const [saving, setSaving] = useState(false);

  function load() {
    const version = ++generation.current;
    setError(null);
    setNotFound(false);
    setUser(null);
    adminUsersApi
      .getAdminUser(id)
      .then((result) => {
        if (version === generation.current) setUser(result);
      })
      .catch((err) => {
        if (version !== generation.current) return;
        if (err instanceof ApiError && err.code === "ADMIN_USER_NOT_FOUND") {
          setNotFound(true);
        } else {
          setError(messageFor(err));
        }
      });
  }

  useEffect(() => {
    load();
    return () => {
      generation.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function confirmSuspend() {
    if (!reason.trim() || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const updated = await adminUsersApi.suspendAdminUser(id, reason.trim());
      setUser(updated);
      toast(`${updated.displayName} suspended`);
      setSuspending(false);
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
      const updated = await adminUsersApi.reinstateAdminUser(id);
      setUser(updated);
      toast(`${updated.displayName} reinstated`);
      setReinstating(false);
    } catch (err) {
      toast(messageFor(err));
      setReinstating(false);
    } finally {
      setSaving(false);
    }
  }

  if (notFound) {
    return (
      <>
        <AdminHeader title="Account" back="/users" backLabel="All users" />
        <EmptyState
          icon="SearchX"
          title="No such account"
          body="It was removed, or the link is stale."
          action={
            <Button to="/users" size="sm">
              Back to users
            </Button>
          }
        />
      </>
    );
  }

  if (error) {
    return (
      <>
        <AdminHeader title="Account" back="/users" backLabel="All users" />
        <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-16 text-center shadow-card">
          <p className="text-[15px] font-semibold text-ink">
            Couldn't load this account
          </p>
          <p className="max-w-xs text-[13px] text-muted">{error}</p>
          <Button onClick={load}>Try again</Button>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <AdminHeader title="Account" back="/users" backLabel="All users" />
        <SkeletonGroup
          label="Loading account"
          className="grid gap-4 lg:grid-cols-3"
        >
          <section className={CARD}>
            <Skeleton className="h-[18px] w-2/3 rounded" />
            <Skeleton className="mt-2 h-[13px] w-1/2 rounded" />
            <Skeleton className="mt-4 h-[60px] w-full rounded-xl" />
          </section>
          <section className={`${CARD} lg:col-span-2`}>
            <Skeleton className="h-[60px] w-full rounded-xl" />
          </section>
        </SkeletonGroup>
      </>
    );
  }

  const suspended = !user.enabled;

  return (
    <>
      <AdminHeader
        title={user.displayName}
        subtitle={`${user.email} · joined ${new Date(user.createdAt).toLocaleDateString()}`}
        back="/users"
        backLabel="All users"
        actions={
          can("user.moderate") && (
            <Button
              size="sm"
              variant={suspended ? "outline" : "danger"}
              onClick={() => {
                if (suspended) {
                  setReinstating(true);
                } else {
                  setActionError(null);
                  setReason("");
                  setSuspending(true);
                }
              }}
            >
              {suspended ? "Reinstate account" : "Suspend account"}
            </Button>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={CARD}>
          <div className="flex items-center gap-3">
            <span className="grid size-16 shrink-0 place-items-center rounded-full bg-brand-soft text-[22px] font-extrabold text-brand">
              {user.displayName?.[0]?.toUpperCase() ?? "?"}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[18px] font-extrabold text-ink">
                {user.displayName}
                {user.emailVerified && (
                  <BadgeCheck
                    className="size-5 shrink-0 text-brand"
                    strokeWidth={2.6}
                    aria-label="Email verified"
                  />
                )}
              </p>
              <p className="truncate text-[13px] text-muted">{user.email}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge status={suspended ? "suspended" : "active"} />
            {!user.emailVerified && (
              <StatusBadge status="pending" label="Email unverified" />
            )}
            {user.roles
              .filter((r) => r !== "USER")
              .map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-[12px] font-semibold text-muted"
                >
                  <ShieldCheck className="size-3.5" strokeWidth={2.6} />
                  {r}
                </span>
              ))}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2">
            <Tally label="Listings" value={user.listingCount} />
            <Tally label="Active listings" value={user.activeListingCount} />
          </dl>

          {suspended && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-[14px] font-bold text-ink">
                Suspension reason
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {user.suspensionReason || "No reason recorded."}
              </p>
              {user.suspendedAt && (
                <p className="mt-1 text-[12px] text-muted">
                  Since {new Date(user.suspendedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </section>

        <section className={`${CARD} lg:col-span-2`}>
          <h2 className="mb-2 text-[17px] font-extrabold text-ink">Account</h2>
          <dl className="grid grid-cols-2 gap-4 text-[14px]">
            <div>
              <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                Roles
              </dt>
              <dd className="mt-1 text-ink">{user.roles.join(", ")}</dd>
            </div>
            <div>
              <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                Email verified
              </dt>
              <dd className="mt-1 text-ink">
                {user.emailVerified ? "Yes" : "No"}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                Joined
              </dt>
              <dd className="mt-1 text-ink">
                {new Date(user.createdAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                Status
              </dt>
              <dd className="mt-1 text-ink">
                {suspended ? "Suspended" : "Active"}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <Modal
        open={suspending}
        title={`Suspend ${user.displayName}?`}
        subtitle="They lose the ability to sign in or post while suspended. Reinstating undoes it."
        size="max-w-md"
        onClose={() => !saving && setSuspending(false)}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              disabled={saving}
              onClick={() => setSuspending(false)}
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
        open={reinstating}
        title={`Reinstate ${user.displayName}?`}
        body="They can sign in and post again immediately."
        confirmLabel={saving ? "Reinstating..." : "Reinstate"}
        onClose={() => !saving && setReinstating(false)}
        onConfirm={confirmReinstate}
      />
    </>
  );
}

function Tally({ label, value }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2.5 text-center">
      <dt className="text-[12px] font-semibold text-muted">{label}</dt>
      <dd className="text-[20px] font-extrabold text-ink">{value}</dd>
    </div>
  );
}
