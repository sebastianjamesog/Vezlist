"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import StatCard from "../components/admin/StatCard";
import StatusBadge from "../components/admin/StatusBadge";
import { Skeleton } from "../components/ui/Skeleton";
import Button from "../components/ui/Button";
import { useAdminAuth } from "../context/AdminAuthContext";
import { ALL_SITES, useSiteScope } from "../lib/adminScope";
import * as adminAnalyticsApi from "../lib/api/adminAnalytics.js";
import * as adminAuditApi from "../lib/api/adminAudit.js";
import { ApiError } from "../lib/api/client";

/**
 * What a moderator needs before they have decided what to do: how big the
 * queues are and what the last few admins did.
 *
 * Over `GET /api/v1/admin/analytics/summary` (one call per board — the
 * backend has no "both sites" summary, so scope `all` fetches marketplace
 * and personals and adds them) and the first page of
 * `GET /api/v1/admin/audit`. Every number on this screen traces back to one
 * of those two responses; nothing here is invented to fill a tile that has
 * no backing endpoint (billing, live, tickets — none of those have a real
 * source yet, so they're off this screen rather than shown with fabricated
 * counts).
 */

const SITE_SCOPE = { marketplace: "MARKETPLACE", personals: "PERSONALS" };

function backendSites(site) {
  return site === ALL_SITES
    ? Object.values(SITE_SCOPE)
    : [SITE_SCOPE[site] ?? String(site).toUpperCase()];
}

/**
 * Adds one or two AdminAnalyticsSummaryResponse into a single tally.
 *
 * Only the listing-derived fields are summed across sites. `totalUsers` and
 * `suspendedUsers` come back identical on both calls — accounts are shared
 * identity across both boards, not partitioned by site — so summing those
 * would double-count every user when the scope is "both sites". They're
 * read once, off whichever summary is first.
 */
function combineSummaries(summaries) {
  const combined = {
    totalUsers: summaries[0]?.totalUsers ?? 0,
    suspendedUsers: summaries[0]?.suspendedUsers ?? 0,
    totalListings: 0,
    listingsByStatus: {},
    newListingsLast7Days: 0,
    newListingsLast30Days: 0,
    activeReportsCount: 0,
    openModerationCasesCount: 0,
  };
  for (const s of summaries) {
    combined.totalListings += s.totalListings;
    combined.newListingsLast7Days += s.newListingsLast7Days;
    combined.newListingsLast30Days += s.newListingsLast30Days;
    combined.activeReportsCount += s.activeReportsCount;
    combined.openModerationCasesCount += s.openModerationCasesCount;
    for (const [status, count] of Object.entries(s.listingsByStatus ?? {})) {
      combined.listingsByStatus[status] =
        (combined.listingsByStatus[status] ?? 0) + count;
    }
  }
  return combined;
}

function statusEntries(map) {
  return Object.entries(map ?? {})
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value);
}

function messageFor(error) {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Check your connection and try again.";
}

export default function Dashboard() {
  const { admin } = useAdminAuth();
  const [site] = useSiteScope();

  const request = useRef(0);
  const [summary, setSummary] = useState(null);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    const version = ++request.current;
    setError(null);
    setSummary(null);
    setAudit(null);
    Promise.all([
      Promise.all(
        backendSites(site).map((s) => adminAnalyticsApi.analyticsSummary(s)),
      ),
      adminAuditApi.auditFeed({ limit: 7 }),
      adminAnalyticsApi.queueCounts(site === ALL_SITES ? undefined : SITE_SCOPE[site]),
    ])
      .then(([summaries, auditPage, queues]) => {
        if (version !== request.current) return;
        setSummary({ ...combineSummaries(summaries), openAppealsCount: queues.openAppeals });
        setAudit(auditPage.items ?? []);
      })
      .catch((err) => { if (version === request.current) setError(messageFor(err)); });
  }, [site]);

  useEffect(() => {
    load();
    return () => { request.current++; };
  }, [load]);

  const scopeLabel = site === ALL_SITES ? "both sites" : site;
  const scoped = (path) => site === ALL_SITES ? path : `${path}${path.includes("?") ? "&" : "?"}site=${encodeURIComponent(site)}`;
  const pending = summary?.listingsByStatus?.PENDING_REVIEW ?? 0;

  return (
    <>
      <AdminHeader
        title={`Good to see you, ${admin?.name?.split(" ")[0] ?? "there"}.`}
        subtitle={
          summary
            ? `${pending} ad${pending === 1 ? "" : "s"} waiting on a decision across ${scopeLabel}.`
            : error
              ? undefined
              : `Loading the numbers for ${scopeLabel}…`
        }
        actions={
          <Button to={scoped("/listings?status=PENDING_REVIEW")} size="sm">
            Open the queue
          </Button>
        }
      />

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-16 text-center shadow-card">
          <p className="text-[15px] font-semibold text-ink">
            Couldn&rsquo;t load the dashboard
          </p>
          <p className="max-w-xs text-[13px] text-muted">{error}</p>
          <Button onClick={load}>Try again</Button>
        </div>
      ) : summary === null || audit === null ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <StatCard
              label="In review"
              value={pending}
              icon="Megaphone"
              tone="amber"
              deltaLabel="ads awaiting a moderator"
              to={scoped("/listings?status=PENDING_REVIEW")}
            />
            <StatCard
              label="Open reports"
              value={summary.activeReportsCount}
              icon="ShieldCheck"
              tone="rose"
              deltaLabel="raised by members"
              to={scoped("/reports")}
            />
            <StatCard
              label="Open appeals"
              value={summary.openAppealsCount}
              icon="ClipboardCheck"
              tone="blue"
              deltaLabel="awaiting a decision"
              to={scoped("/appeals")}
            />
            <StatCard
              label="New listings, 7d"
              value={summary.newListingsLast7Days}
              icon="CalendarDays"
              tone="green"
              deltaLabel={`${summary.newListingsLast30Days} in the last 30 days`}
              to={scoped("/listings")}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <section className={`${CARD} lg:col-span-2`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[17px] font-extrabold text-ink">
                    Listings by status
                  </h2>
                  <p className="text-[13px] text-muted">
                    {summary.totalListings} listings across {scopeLabel}
                  </p>
                </div>
                <Link
                  href={scoped("/listings")}
                  className="shrink-0 text-[13px] font-bold text-brand hover:underline"
                >
                  Open listings
                </Link>
              </div>

              {statusEntries(summary.listingsByStatus).length ? (
                <ul className="flex flex-col gap-2.5">
                  {statusEntries(summary.listingsByStatus).map((s) => (
                    <li
                      key={s.key}
                      className="flex items-center justify-between gap-3"
                    >
                      <StatusBadge status={s.key} />
                      <span className="text-[14px] font-bold text-ink [font-variant-numeric:tabular-nums]">
                        {s.value}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-[14px] text-muted">
                  No listings recorded for {scopeLabel} yet.
                </p>
              )}
            </section>

            <div className="flex flex-col gap-4">
              <section className={CARD}>
                <h2 className="text-[17px] font-extrabold text-ink">
                  Accounts
                </h2>
                <p className="text-[13px] text-muted">Shared across both sites</p>
                <p className="mt-2 text-[28px] font-extrabold leading-none text-ink">
                  {summary.totalUsers}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  {summary.suspendedUsers} suspended
                </p>
                <Link
                  href="/users"
                  className="mt-3 inline-block text-[13px] font-bold text-brand hover:underline"
                >
                  User detail
                </Link>
              </section>

              <section className={CARD}>
                <h2 className="text-[17px] font-extrabold text-ink">
                  Recent activity
                </h2>
                <p className="mb-2 text-[13px] text-muted">
                  Every admin action, newest first.
                </p>
                {audit.length ? (
                  <ul className="divide-y divide-line">
                    {audit.map((entry) => (
                      <li key={entry.id} className="py-2">
                        <p className="text-[13.5px] leading-snug text-ink">
                          <span className="font-bold">
                            {entry.actorName ?? "Unknown"}
                          </span>{" "}
                          <span className="text-muted">{entry.action}</span>{" "}
                          <span className="font-semibold">
                            {entry.targetId ?? ""}
                          </span>
                        </p>
                        {entry.details && (
                          <p className="truncate text-[12.5px] text-muted">
                            {entry.details}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted">
                    Nothing recorded yet.
                  </p>
                )}
                <Link
                  href="/audit"
                  className="mt-3 inline-block text-[13px] font-bold text-brand hover:underline"
                >
                  Full audit log
                </Link>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading the dashboard</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-card bg-surface p-4 shadow-card lg:p-5">
            <Skeleton className="h-[13px] w-2/3 rounded" />
            <Skeleton className="mt-2 h-[28px] w-1/2 rounded" />
            <Skeleton className="mt-3 h-[13px] w-3/4 rounded" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className={`${CARD} lg:col-span-2`}>
          <Skeleton className="h-[17px] w-1/3 rounded" />
          <div className="mt-4 flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[24px] w-full rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className={CARD}>
            <Skeleton className="h-[17px] w-1/2 rounded" />
            <Skeleton className="mt-3 h-[28px] w-1/3 rounded" />
          </div>
          <div className={CARD}>
            <Skeleton className="h-[17px] w-2/3 rounded" />
            <div className="mt-3 flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[14px] w-full rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
