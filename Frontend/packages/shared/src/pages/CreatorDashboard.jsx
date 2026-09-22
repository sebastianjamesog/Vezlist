"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import { useShell } from "../components/layout/AppLayout";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import MediaImage from "../components/media/MediaImage.jsx";
// Both of these live under components/admin/ by history, not by dependency:
// they take props, and everything they reach for (Icon, lib/tones, the tone-*
// utilities in index.css) is shared by all three builds. Copying a tile and a
// path generator into pages/ to keep the folder names tidy would give the
// console and the public dashboard two sparklines to fix every time one of
// them is wrong, which is the reuse this repo already made the call on.
import StatCard from "../components/admin/StatCard";
import Sparkline from "../components/admin/Sparkline";
import { useListings } from "../context/ListingsContext";
import { creatorStats } from "../data/mock";

export default function CreatorDashboard() {
  const { openPost } = useShell();

  // The poster's own ads, off the same store My Ads writes to, so an ad
  // published through the wizard reaches these tiles. Rows arrive already
  // joined — the seed does that once — which is why there is no `.listing`
  // to reach through here any more.
  const { ads: rows } = useListings();

  // Summed off the rows, never seeded. A hardcoded "total views" is a number
  // that keeps claiming the same thing after an ad is deleted, and the first
  // person to notice stops trusting the other three tiles too.
  const totalViews = rows.reduce((n, r) => n + r.views, 0);
  const totalSaves = rows.reduce((n, r) => n + r.saves, 0);
  const activeAds = rows.filter((r) => r.status === "active").length;

  const viewsThisWeek = creatorStats.viewsByDay.reduce((n, v) => n + v, 0);

  // creatorStats ranks by id; the numbers still come off the store rows, so
  // the list cannot disagree with the tiles above it. Ranking is seeded, so
  // only seeded ads appear here — a just-published ad has no week of views to
  // be ranked on, and inventing one is how a dashboard starts lying.
  const topAds = creatorStats.topAdIds
    .map((id) => rows.find((r) => r.adId === id))
    .filter(Boolean);

  return (
    <>
      <SubPageBar
        title="Creator dashboard"
        subtitle="How your ads are doing"
        fallback="/profile"
      />

      <PageBody className="px-4 pb-8 pt-3 lg:px-8 lg:py-6">
        {rows.length ? (
          <>
            {/* One column on mobile — a stat tile squeezed to half a phone
                loses the number before it loses the label — then the full
                three-across once the rail is showing. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                label="Total views"
                value={totalViews.toLocaleString()}
                icon="ChartColumn"
                tone="blue"
                delta={creatorStats.viewsTrend}
                deltaLabel="vs last week"
                to="/profile/ads"
              />
              <StatCard
                label="Total saves"
                value={totalSaves.toLocaleString()}
                icon="Heart"
                tone="rose"
                delta={creatorStats.savesTrend}
                deltaLabel="vs last week"
                to="/profile/ads"
              />
              <StatCard
                label="Active ads"
                value={activeAds}
                icon="Megaphone"
                tone="green"
                deltaLabel={`${rows.length} in total`}
                to="/profile/ads"
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="rounded-card bg-surface p-4 shadow-card lg:p-5">
                <h2 className="text-[17px] font-extrabold text-ink">
                  Views this week
                </h2>
                <p className="text-[13px] text-muted">
                  Impressions across every live ad
                </p>
                <p className="mt-2 text-[28px] font-extrabold leading-none text-ink">
                  {viewsThisWeek.toLocaleString()}
                </p>

                <Sparkline
                  values={creatorStats.viewsByDay}
                  className="mt-3 w-full"
                  height={56}
                />

                {/* The series is seven unlabelled days, so the axis says which
                    end is which rather than inventing weekday names the data
                    does not carry. */}
                <p className="mt-1 flex justify-between text-[12px] font-medium text-muted">
                  <span>7 days ago</span>
                  <span>Today</span>
                </p>
              </section>

              <section className="rounded-card bg-surface p-4 shadow-card lg:p-5">
                <h2 className="text-[17px] font-extrabold text-ink">
                  Top performing ads
                </h2>
                <p className="mb-1 text-[13px] text-muted">
                  Most views over the last seven days
                </p>

                <ul className="divide-y divide-line">
                  {topAds.map((row) => (
                    <li key={row.id}>
                      <Link
                        href={`/ad/${row.adId}`}
                        className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-canvas"
                      >
                        <MediaImage
                          src={row.photos[0]}
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
                            {row.views.toLocaleString()} views · {row.saves}{" "}
                            saves
                          </span>
                        </span>
                        <ChevronRight
                          className="size-5 shrink-0 text-muted"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/profile/ads"
                  className="mt-3 inline-block text-[13px] font-bold text-brand hover:underline"
                >
                  Manage all ads
                </Link>
              </section>
            </div>
          </>
        ) : (
          // A creator with nothing posted has no numbers to read, and four
          // zeroes with a trend arrow on them is worse than no tiles: it reads
          // as a broken screen. The one thing that fixes it is the create
          // sheet, so that is the only thing offered.
          <EmptyState
            icon="ChartNoAxesCombined"
            title="Nothing to measure yet"
            body="Views, saves and active ads show up here once your first ad is live."
            action={<Button onClick={openPost}>Post your first ad</Button>}
          />
        )}
      </PageBody>
    </>
  );
}
