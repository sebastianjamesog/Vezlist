"use client";

import Link from "next/link";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import StatCard from "../components/admin/StatCard";
import Sparkline from "../components/admin/Sparkline";
import StatusBadge from "../components/admin/StatusBadge";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import MediaImage from "../components/media/MediaImage.jsx";
import { useAdminData } from "../context/AdminDataContext";
import { useAdminAuth } from "../context/AdminAuthContext";
import { counts, isPending, revenueSeries } from "../lib/adminStore";
import { ALL_SITES, inScope, useSiteScope } from "../lib/adminScope";
import { timeAgo } from "../lib/format";

/**
 * What a moderator needs before they have decided what to do: how big the
 * queue is, what the last person did, and whether the money moved.
 *
 * Every tile is a link. A count with no way through to the rows behind it is
 * a number to worry about rather than a number to act on.
 */
export default function Dashboard() {
  const { state } = useAdminData();
  const { admin } = useAdminAuth();
  const [site] = useSiteScope();

  const scoped = state.listings.filter((l) => inScope(l, site));
  const tallies = counts(state, site);

  const queue = scoped.filter(isPending).slice(0, 6);
  const revenue = revenueSeries(state);
  const scopeLabel = site === ALL_SITES ? "both sites" : site;

  return (
    <>
      <AdminHeader
        title={`Good to see you, ${admin?.name?.split(" ")[0] ?? "there"}.`}
        subtitle={`${tallies.pending} ad${tallies.pending === 1 ? "" : "s"} waiting on a decision across ${scopeLabel}.`}
        actions={
          <Button to="/listings?status=pending" size="sm">
            Open the queue
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          label="In review"
          value={tallies.pending}
          icon="Megaphone"
          tone="amber"
          deltaLabel="ads awaiting a moderator"
          to="/listings?status=pending"
        />
        <StatCard
          label="Open reports"
          value={tallies.openReports}
          icon="ShieldCheck"
          tone="rose"
          deltaLabel="raised by members"
          to="/reports"
        />
        <StatCard
          label="Open tickets"
          value={tallies.openTickets}
          icon="LifeBuoy"
          tone="blue"
          deltaLabel="waiting on support"
          to="/tickets"
        />
        <StatCard
          label="Live now"
          value={tallies.liveNow}
          icon="Radio"
          tone="purple"
          deltaLabel="broadcasts running"
          to="/live"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className={`${CARD} lg:col-span-2`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-extrabold text-ink">
                Waiting on review
              </h2>
              <p className="text-[13px] text-muted">
                Oldest first is the queue; this is the top of it.
              </p>
            </div>
            <Link
              href="/listings?status=pending"
              className="shrink-0 text-[13px] font-bold text-brand hover:underline"
            >
              See all
            </Link>
          </div>

          {queue.length ? (
            <ul className="divide-y divide-line">
              {queue.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/listings/${row.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-canvas"
                  >
                    <MediaImage
                      src={row.image}
                      alt=""
                      width={48}
                      height={48}
                      className="size-12 shrink-0 rounded-xl object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-ink">
                        {row.title}
                      </span>
                      <span className="block truncate text-[12.5px] text-muted">
                        {row.business} · {row.location}
                      </span>
                    </span>
                    <StatusBadge status={row.site} />
                    <span className="hidden shrink-0 text-[12.5px] text-muted sm:block">
                      {timeAgo(row.postedMsAgo)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon="ClipboardCheck"
              title="The queue is clear"
              body="Nothing is waiting on a decision right now."
            />
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section className={CARD}>
            <h2 className="text-[17px] font-extrabold text-ink">Revenue</h2>
            <p className="text-[13px] text-muted">
              Credits and boosts, 8 weeks
            </p>
            <p className="mt-2 text-[28px] font-extrabold leading-none text-ink">
              ${revenue.at(-1)}
            </p>
            <Sparkline values={revenue} className="mt-3 w-full" height={56} />
            <Link
              href="/billing"
              className="mt-3 inline-block text-[13px] font-bold text-brand hover:underline"
            >
              Billing detail
            </Link>
          </section>

          <section className={CARD}>
            <h2 className="text-[17px] font-extrabold text-ink">
              Recent activity
            </h2>
            <p className="mb-2 text-[13px] text-muted">
              Every write in the console, newest first.
            </p>
            <ul className="divide-y divide-line">
              {state.audit.slice(0, 7).map((entry) => (
                <li key={entry.id} className="py-2">
                  <p className="text-[13.5px] leading-snug text-ink">
                    <span className="font-bold">{entry.actor}</span>{" "}
                    <span className="text-muted">{entry.action}</span>{" "}
                    <span className="font-semibold">{entry.entityId}</span>
                  </p>
                  {entry.note && (
                    <p className="truncate text-[12.5px] text-muted">
                      {entry.note}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
