"use client";

import { useCallback, useEffect, useState } from "react";
import AdminHeader from "../components/admin/AdminHeader";
import StatCard from "../components/admin/StatCard";
import StatusBadge from "../components/admin/StatusBadge";
import { ChartCard, RankedBars } from "../components/admin/Charts";
import Button from "../components/ui/Button";
import { Skeleton } from "../components/ui/Skeleton";
import { ALL_SITES, useSiteScope } from "../lib/adminScope";
import { downloadCsv } from "../lib/csv";
import * as adminAnalyticsApi from "../lib/api/adminAnalytics.js";
import * as adminAuditApi from "../lib/api/adminAudit.js";
import { ApiError } from "../lib/api/client";

/**
 * What the console knows, counted — for real, off
 * `GET /api/v1/admin/analytics/summary` (one call per board; there's no
 * "both sites" endpoint, so scope `all` fetches marketplace and personals
 * and combines them) and a sample of `GET /api/v1/admin/audit` for
 * moderator throughput.
 *
 * The old mock version charted a weekly posting trend and a category
 * breakdown; neither has a backend field to draw from (the summary gives
 * totals and 7/30-day counts, not a per-week series, and there's no
 * per-category listing count endpoint), so those two charts are gone rather
 * than kept and fed fabricated numbers. What's here is exactly what the two
 * real endpoints return.
 */

const SITE_KEY = { marketplace: "MARKETPLACE", personals: "PERSONALS" };
const THROUGHPUT_SAMPLE = 100;

const EXPORT_COLUMNS = [
  { key: "metric", label: "Metric" },
  { key: "key", label: "Bucket" },
  { key: "value", label: "Value" },
];

function statusEntries(map) {
  return Object.entries(map ?? {})
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value);
}

/** Same double-count caveat as Dashboard.jsx: users aren't site-partitioned. */
function combine(summaries) {
  const combined = {
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

/** Counts per actor over the most recent audit entries fetched. */
function throughput(entries) {
  const counts = new Map();
  for (const e of entries) {
    const name = e.actorName ?? "Unknown";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

function messageFor(error) {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Check your connection and try again.";
}

export default function Analytics() {
  const [site] = useSiteScope();

  // Both boards' summaries are always fetched, whatever the scope: the
  // accounts-by-site breakdown is inherently a comparison of the two, and
  // the scoped headline numbers are cheap to derive from the same pair.
  const [bySite, setBySite] = useState(null);
  const [auditSample, setAuditSample] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    setBySite(null);
    setAuditSample(null);
    Promise.all([
      adminAnalyticsApi.analyticsSummary("MARKETPLACE"),
      adminAnalyticsApi.analyticsSummary("PERSONALS"),
      adminAuditApi.auditFeed({ limit: THROUGHPUT_SAMPLE }),
    ])
      .then(([marketplace, personals, auditPage]) => {
        setBySite({ MARKETPLACE: marketplace, PERSONALS: personals });
        setAuditSample(auditPage.items ?? []);
      })
      .catch((err) => setError(messageFor(err)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loading = bySite === null || auditSample === null;

  const scopedSummaries = bySite
    ? site === ALL_SITES
      ? [bySite.MARKETPLACE, bySite.PERSONALS]
      : [bySite[SITE_KEY[site] ?? String(site).toUpperCase()]].filter(Boolean)
    : null;
  const summary = scopedSummaries?.length ? combine(scopedSummaries) : null;

  const status = summary ? statusEntries(summary.listingsByStatus) : [];
  const moderators = auditSample ? throughput(auditSample) : [];
  const accountsBySite = bySite
    ? [
        { key: "Marketplace", value: bySite.MARKETPLACE.totalUsers },
        { key: "Personals", value: bySite.PERSONALS.totalUsers },
      ]
    : [];
  const totalUsers = bySite?.MARKETPLACE.totalUsers ?? 0;

  const exportRows = summary
    ? [
        ...status.map((r) => ({ metric: "Listings by status", ...r })),
        ...moderators.map((r) => ({ metric: "Moderator throughput", ...r })),
        ...accountsBySite.map((r) => ({ metric: "Accounts by site", ...r })),
      ]
    : [];

  const scopeLabel = site === ALL_SITES ? "both sites" : site;

  return (
    <>
      <AdminHeader
        title="Analytics"
        subtitle={
          summary
            ? `${summary.totalListings} listings and ${totalUsers} accounts in scope`
            : error
              ? undefined
              : `Loading the numbers for ${scopeLabel}…`
        }
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={!exportRows.length}
            onClick={() =>
              downloadCsv("vezlist-analytics.csv", EXPORT_COLUMNS, exportRows)
            }
          >
            Export CSV
          </Button>
        }
      />

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-16 text-center shadow-card">
          <p className="text-[15px] font-semibold text-ink">
            Couldn&rsquo;t load analytics
          </p>
          <p className="max-w-xs text-[13px] text-muted">{error}</p>
          <Button onClick={load}>Try again</Button>
        </div>
      ) : loading ? (
        <AnalyticsSkeleton />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <StatCard
              label="Total listings"
              value={summary.totalListings}
              icon="Megaphone"
              tone="green"
              deltaLabel={`across ${scopeLabel}`}
            />
            <StatCard
              label="New, 7 days"
              value={summary.newListingsLast7Days}
              icon="CalendarDays"
              tone="blue"
              deltaLabel={`${summary.newListingsLast30Days} in 30 days`}
            />
            <StatCard
              label="Accounts"
              value={totalUsers}
              icon="User"
              tone="indigo"
              deltaLabel={accountsBySite
                .map((s) => `${s.value} ${s.key.slice(0, 6)}`)
                .join(" · ")}
            />
            <StatCard
              label="Open moderation cases"
              value={summary.openModerationCasesCount}
              icon="ShieldCheck"
              tone="rose"
              deltaLabel={`${summary.activeReportsCount} active reports`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Listings by status"
              subtitle={`Where every listing in ${scopeLabel} sits right now`}
              table={status}
            >
              {status.length ? (
                <ul className="flex flex-col gap-2.5">
                  {status.map((s) => (
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
                <p className="text-[14px] text-muted">Nothing listed yet.</p>
              )}
            </ChartCard>

            <ChartCard
              title="Moderator throughput"
              subtitle={`Most recent ${THROUGHPUT_SAMPLE} audit entries, by admin`}
              table={moderators}
            >
              <RankedBars data={moderators} valueLabel="actions" />
            </ChartCard>

            <ChartCard
              title="Accounts by site"
              subtitle="Where accounts have posted at least once"
              table={accountsBySite}
            >
              <RankedBars data={accountsBySite} valueLabel="accounts" />
            </ChartCard>
          </div>

          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            Counted from the live API. Moderator throughput reflects the most
            recent {THROUGHPUT_SAMPLE} audit entries — older activity isn&rsquo;t
            in this sample, so it&rsquo;s recent work rather than all-time.
          </p>
        </>
      )}
    </>
  );
}

function AnalyticsSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading analytics</span>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-card bg-surface p-4 shadow-card lg:p-5">
            <Skeleton className="h-[13px] w-2/3 rounded" />
            <Skeleton className="mt-2 h-[28px] w-1/2 rounded" />
            <Skeleton className="mt-3 h-[13px] w-3/4 rounded" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-card bg-surface p-4 shadow-card lg:p-5">
            <Skeleton className="h-[16px] w-1/3 rounded" />
            <div className="mt-4 flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-[20px] w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
