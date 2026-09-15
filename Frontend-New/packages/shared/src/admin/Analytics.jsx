"use client";

import AdminHeader from "../components/admin/AdminHeader";
import StatCard from "../components/admin/StatCard";
import {
  ChartCard,
  ColumnChart,
  RankedBars,
  StatusBar,
} from "../components/admin/Charts";
import Button from "../components/ui/Button";
import { useAdminData } from "../context/AdminDataContext";
import { ALL_SITES, useQueryParam, useSiteScope } from "../lib/adminScope";
import { downloadCsv } from "../lib/csv";
import {
  categoryBreakdown,
  counts,
  moderatorThroughput,
  postingSeries,
  revenueSeries,
  statusBreakdown,
  usersBySite,
} from "../lib/adminStore";

/**
 * What every chart's own accessible table (`ChartCard`'s `table` prop)
 * already reduces its data to — `[{key, value}]` — flattened into one sheet
 * so the export is exactly the four breakdowns a reader can already see, not
 * a re-query of the store.
 */
const EXPORT_COLUMNS = [
  { key: "metric", label: "Metric" },
  { key: "key", label: "Bucket" },
  { key: "value", label: "Value" },
];

/**
 * What the console knows, counted.
 *
 * Everything here is derived from the store — nothing is invented to make a
 * line go up. Where the mock has no time dimension (accounts carry no signup
 * date) there is a number rather than a trend, because a fabricated series
 * reads as data and a stat tile does not.
 */

const RANGES = [
  { value: "8", label: "8 weeks" },
  { value: "12", label: "12 weeks" },
  { value: "26", label: "26 weeks" },
];

export default function Analytics() {
  const { state } = useAdminData();
  const [site] = useSiteScope();
  const [range, setRange] = useQueryParam("weeks", "8");

  const weeks = Number(range) || 8;
  const tallies = counts(state, site);
  const posting = postingSeries(state, site, weeks);
  const status = statusBreakdown(state, site);
  const categories = categoryBreakdown(state, site);
  const moderators = moderatorThroughput(state);
  const bySite = usersBySite(state);
  const revenue = revenueSeries(state);

  const scoped = state.listings.filter(
    (l) => site === ALL_SITES || l.site === site,
  );
  // Bucket 0 is the oldest week; the last bucket is this one.
  const postingData = posting.map((value, i) => ({
    key: i === posting.length - 1 ? "now" : `-${posting.length - 1 - i}w`,
    value,
  }));

  const thisWeek = posting.at(-1) ?? 0;
  const lastWeek = posting.at(-2) ?? 0;
  const delta = lastWeek
    ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
    : null;

  const exportRows = [
    ...postingData.map((r) => ({ metric: "Listings posted", ...r })),
    ...status.map((r) => ({ metric: "Queue by status", ...r })),
    ...categories.map((r) => ({ metric: "Top categories", ...r })),
    ...moderators.map((r) => ({ metric: "Moderator throughput", ...r })),
  ];

  return (
    <>
      <AdminHeader
        title="Analytics"
        subtitle={`${scoped.length} listings and ${state.users.length} accounts in scope`}
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

      {/* One filter row, above everything it scopes. The site switcher in the
          top bar is the other half of this slice, and both live in the URL. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-muted">Range</span>
        <div
          role="group"
          aria-label="Time range"
          className="flex gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line"
        >
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={range === r.value}
              onClick={() => setRange(r.value)}
              className={`rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                range === r.value
                  ? "bg-surface text-ink shadow-card"
                  : "text-muted hover:text-ink"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          label="Live listings"
          value={tallies.active}
          icon="Megaphone"
          tone="green"
          deltaLabel="currently on the boards"
        />
        <StatCard
          label="Posted this week"
          value={thisWeek}
          icon="CalendarDays"
          tone="blue"
          delta={delta ?? undefined}
          deltaLabel={delta === null ? "no prior week" : "vs last week"}
        />
        <StatCard
          label="Accounts"
          value={state.users.length}
          icon="User"
          tone="indigo"
          deltaLabel={bySite
            .map((s) => `${s.value} ${s.key.slice(0, 6)}`)
            .join(" · ")}
        />
        <StatCard
          label="Revenue, 8 weeks"
          value={`$${revenue.at(-1)}`}
          series={revenue}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Listings posted"
          subtitle={`Per week, oldest first · last ${weeks} weeks`}
          table={postingData}
        >
          <ColumnChart data={postingData} valueLabel="listings" />
        </ChartCard>

        <ChartCard
          title="Queue by status"
          subtitle="Where every listing in scope sits right now"
          table={status}
        >
          <StatusBar data={status} />
        </ChartCard>

        <ChartCard
          title="Top categories"
          subtitle="Listings per category, biggest first"
          table={categories}
        >
          <RankedBars data={categories} valueLabel="listings" />
        </ChartCard>

        <ChartCard
          title="Moderator throughput"
          subtitle="Actions recorded in the audit log, by admin"
          table={moderators}
        >
          <RankedBars data={moderators} valueLabel="actions" />
        </ChartCard>
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-muted">
        Counted from the console&rsquo;s own store. Throughput reflects the
        audit log, which caps at 200 entries — older activity has already been
        dropped, so this is recent work rather than all-time.
      </p>
    </>
  );
}
