"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import StatusBadge from "../components/admin/StatusBadge";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import EmptyState from "../components/ui/EmptyState";
import Field, { FIELD, border } from "../components/create/Field";
import MediaImage from "../components/media/MediaImage.jsx";
import { useAdminData } from "../context/AdminDataContext";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useToast } from "../context/ToastContext";
import { auditFor, listingsFor } from "../lib/adminStore";
import { timeAgo } from "../lib/format";

/** One account, its ads, its tickets, and everything done to it. */
export default function UserDetail() {
  const { id } = useParams();
  const { state, dispatch } = useAdminData();
  const { can } = useAdminAuth();
  const toast = useToast();
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState("");

  const user = state.users.find((u) => u.id === id);

  if (!user) {
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

  const ads = listingsFor(state, user);
  // Tickets carry a requester name and no id — the mock has no join key here,
  // so this is the one place a name still has to do the work.
  const tickets = state.tickets.filter((t) => t.requester === user.name);
  const trail = auditFor(state, "user", user.id);
  const reports = state.reports.filter(
    (r) => r.targetType === "user" && r.targetId === user.id,
  );
  const suspended = user.status === "suspended";

  return (
    <>
      <AdminHeader
        title={user.name}
        subtitle={`${user.email} · joined ${user.joined}`}
        back="/users"
        backLabel="All users"
        actions={
          <>
            {!user.verified && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  dispatch({ type: "verifyUser", id: user.id });
                  toast("Account verified");
                }}
              >
                Verify
              </Button>
            )}
            <Button
              size="sm"
              variant={suspended ? "outline" : "danger"}
              onClick={() => {
                if (suspended) {
                  dispatch({ type: "unsuspendUser", id: user.id });
                  toast("Account restored");
                } else {
                  setSuspending(true);
                }
              }}
            >
              {suspended ? "Restore account" : "Suspend account"}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={CARD}>
          <div className="flex items-center gap-3">
            <MediaImage
              src={user.avatar}
              alt=""
              width={64}
              height={64}
              className="size-16 shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[18px] font-extrabold text-ink">
                {user.name}
                {user.verified && (
                  <BadgeCheck
                    className="size-5 shrink-0 text-brand"
                    strokeWidth={2.6}
                    aria-label="Verified"
                  />
                )}
              </p>
              <p className="truncate text-[13px] text-muted">{user.location}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge status={user.status} />
            <StatusBadge status={user.site} />
            <StatusBadge status={user.kind} label={user.kind} />
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-2">
            <Tally label="Ads" value={ads.length} />
            <Tally label="Tickets" value={tickets.length} />
            <Tally label="Reports" value={reports.length} />
          </dl>

          {/* Credits buy boosts, so a goodwill adjustment is a support action
              rather than a billing one — but it moves money, so it is gated
              on the billing permission all the same. */}
          <div className="mt-4 border-t border-line pt-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[14px] font-bold text-ink">Credits</p>
              <p className="text-[20px] font-extrabold text-ink">
                {user.credits ?? 0}
              </p>
            </div>
            {can("billing.manage") ? (
              <div className="mt-2 flex gap-2">
                {[-50, -10, 10, 50].map((delta) => (
                  <Button
                    key={delta}
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    disabled={delta < 0 && (user.credits ?? 0) === 0}
                    onClick={() => {
                      dispatch({ type: "adjustCredits", id: user.id, delta });
                      toast(
                        `${delta > 0 ? "Added" : "Removed"} ${Math.abs(delta)} credits`,
                      );
                    }}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[13px] text-muted">
                Owners can adjust this balance.
              </p>
            )}
          </div>
        </section>

        <section className={`${CARD} lg:col-span-2`}>
          <h2 className="mb-2 text-[17px] font-extrabold text-ink">
            Their listings
          </h2>
          {ads.length ? (
            <ul className="divide-y divide-line">
              {ads.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/listings/${row.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-canvas"
                  >
                    <MediaImage
                      src={row.image}
                      alt=""
                      width={44}
                      height={44}
                      className="size-11 shrink-0 rounded-xl object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-ink">
                        {row.title}
                      </span>
                      <span className="block truncate text-[12.5px] text-muted">
                        {row.category} · {timeAgo(row.postedMsAgo)}
                      </span>
                    </span>
                    <StatusBadge status={row.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-muted">
              No ads on this account. Personals profiles in the mock data are
              not all posters.
            </p>
          )}
        </section>

        <section className={`${CARD} lg:col-span-2`}>
          <h2 className="mb-2 text-[17px] font-extrabold text-ink">
            Support tickets
          </h2>
          {tickets.length ? (
            <ul className="divide-y divide-line">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/tickets/${t.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-canvas"
                  >
                    <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">
                      {t.subject}
                    </span>
                    <span className="shrink-0 text-[12.5px] text-muted">
                      {t.messages.length} messages
                    </span>
                    <StatusBadge status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-muted">Nothing raised.</p>
          )}
        </section>

        <section className={CARD}>
          <h2 className="mb-2 text-[17px] font-extrabold text-ink">
            Account history
          </h2>
          {trail.length ? (
            <ul className="divide-y divide-line">
              {trail.map((entry) => (
                <li key={entry.id} className="py-2">
                  <p className="text-[13.5px] font-semibold text-ink">
                    {entry.action}
                  </p>
                  <p className="text-[12.5px] text-muted">
                    {entry.note} · {entry.actor}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-muted">
              Nothing done to this account from the console yet.
            </p>
          )}
        </section>
      </div>

      <Modal
        open={suspending}
        title={`Suspend ${user.name}?`}
        subtitle="Their live ads come down with the account. Restoring the account does not put them back."
        size="max-w-md"
        onClose={() => setSuspending(false)}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setSuspending(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              disabled={!reason.trim()}
              onClick={() => {
                dispatch({ type: "suspendUser", id: user.id, reason });
                toast(`${user.name} suspended`);
                setSuspending(false);
                setReason("");
              }}
            >
              Suspend
            </Button>
          </div>
        }
      >
        <Field label="Reason" hint="Required">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Asked a buyer to pay by gift card."
            className={`${FIELD} ${border(false)} resize-none`}
          />
        </Field>
      </Modal>
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
